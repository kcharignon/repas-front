// Le sélecteur de produits (DRV-306, variante P2) : la liste que l'agent affiche lui-même dans la zone de l'écran « chooser ». L'enseigne
// refuse d'être affichée dans un cadre (décision G1) : l'utilisateur choisit donc dans cette liste, nourrie par la recherche de l'agent.
// Tout s'affiche par `textContent` (un libellé de l'enseigne n'est jamais du HTML). Les photos (DRV-633, `photo.ts`) sont les seules images : chargées à la
// demande, depuis les serveurs de l'enseigne comme le fait sa page.
// DRV-643 : la liste montre TOUS les produits de la recherche, mais par lots. Un premier lot s'affiche ; la suite est ajoutée (jamais la liste refaite)
// quand une sentinelle placée sous la dernière fiche approche de la zone visible. Seules les fiches affichées ont une photo : une fiche pas encore
// ajoutée ne demande rien à l'enseigne.
import type { PhotoRetailer, RetailerNames } from '../retailers/names'
import { append, clear, h } from './dom'
import { photoFrame } from './photo'
import {
  DEFAULT_SORT,
  referenceUnit,
  SORT_KEYS,
  sortItems,
  touch,
  type SortKey,
  type SortState,
} from './sort'
import { S } from './strings'
import type { UnavailableReason } from './types'

/** Un produit proposé, déjà prêt à l'affichage (les calculs sont faits par l'appelant). */
export interface PickerItem {
  id: string
  name: string
  /** La seconde ligne du libellé (« 1 kg »), s'il y en a une. */
  label2: string | null
  /** Contenu, prix, prix à l'unité de mesure : affichés sur une ligne, séparés par un point médian. */
  details: readonly string[]
  /** La promotion, s'il y en a une. */
  promo: string | null
  /** L'adresse de la photo (DRV-633), `null` s'il n'y en a pas. Revérifiée à l'affichage : une adresse refusée ne montre rien. */
  photo?: string | null | undefined
  /** « 800 g demandés, 500 g par produit : 2 », ou « contenu inconnu ». */
  explain: string
  /**
   * `out` : le site dit « Plus en stock » ou « Bientôt disponible » (DRV-635) : une étiquette que le panier peut démentir, le produit se choisit quand même ;
   * `refused` : l'utilisateur ne veut jamais ce produit, il ne se choisit pas.
   */
  state: 'ok' | 'out' | 'refused'
  /** Le rayon du site du produit (DRV-647), pour le filtre ; `null` ou absent : le produit n'apparaît que sous « Tous ». */
  aisle?: number | null
  /** Le prix, en centimes (DRV-743), pour le tri « Prix » ; `null` ou absent : le produit passe en dernier. */
  price?: number | null
  /** Le prix à l'unité de mesure, en centimes (DRV-743), pour le tri « Prix au kilo » ; `null` ou absent : le produit passe en dernier. */
  perMeasure?: { cents: number; unit: 'kg' | 'l' | 'piece' } | null
}

/** L'identifiant d'un groupe de la rangée : un nombre (rayon ou famille des produits) ou la clé de filtre d'un rayon du site (`sIdValeurUrl`). */
export type AisleId = number | string

/** Un groupe de la rangée de filtres (DRV-647) : son identifiant, son libellé à afficher (déjà replié par l'appelant), son nombre de produits, ses enfants. */
export interface AisleChip {
  id: AisleId
  label: string
  count: number
  /** Les enfants d'un rayon du site (0.36.0) : une seconde rangée quand ce rayon est choisi. */
  children?: readonly AisleChip[]
}

/**
 * La rangée de filtres (DRV-647) : les groupes, du plus fourni au moins fourni, et celui qui est choisi (`null` : « Tous »). `remote` (0.36.0) : ce sont les
 * rayons du site (sa facette « Rayons ») ; toucher l'un d'eux charge ses produits par `PickerHooks.loadAisle` (une requête, ou le cache de l'appelant).
 */
export interface AisleRow {
  chips: readonly AisleChip[]
  selected: AisleId | null
  remote?: boolean
}

/** Ce que rend le chargement d'un rayon du site : ses produits, ou la rangée de repli (les familles, sans message), ou une phrase d'erreur. */
export type AisleLoad =
  { items: readonly PickerItem[] } | { fallback: AisleRow; notice?: string } | { notice: string }

const NO_ROW: AisleRow = { chips: [], selected: null }

export interface PickerProps {
  /** L'enseigne de la page, pour les phrases qui la nomment et la liste blanche de ses photos. */
  retailer: PhotoRetailer
  /** « 800 g » : la quantité demandée par la liste. */
  need: string | null
  /** Le libellé du produit que l'utilisateur veut remplacer. */
  replaces: string | null
  /**
   * Les produits mémorisés que la phase A n'a pas mis au panier : chacun a sa case « Ne plus proposer », décochée. `reason` (DRV-635) dit pourquoi :
   * en rupture (« Ces produits ne sont plus disponibles »), introuvable (« Je ne retrouve pas … ») ou refusé par le panier ; absente, en rupture.
   */
  gone: readonly { id: string; label: string; reason?: UnavailableReason }[]
  /** La recherche préremplie dans « Chercher autre chose » (DRV-635), sans être lancée : la forme la plus simple d'un produit introuvable. */
  prefill?: string | null
  /** Les identifiants dont la case est cochée. */
  checked: ReadonlySet<string>
  /** La recherche dont la liste montre les produits : celle qui a répondu. */
  query: string
  /** Le nom cherché d'abord quand c'est une de ses formes qui a répondu (ticket D), pour le dire ; `null` si la recherche est celle du nom. */
  asked?: string | null
  items: readonly PickerItem[]
  /** Un message à montrer au-dessus de la liste (le site ne répond pas, le panier a refusé…). */
  notice: string | null
  /** La rangée de filtres par rayon (DRV-647) ; absente ou de moins de deux rayons, rien ne s'affiche. */
  aisles?: AisleRow
  /** Le tri choisi plus tôt dans cet envoi (DRV-743) ; absent : l'ordre du site. */
  sort?: SortState
}

export interface PickerHooks {
  /** Le geste de la fiche : `PRIMARY` (« Choisir », le produit devient l'habituel) ou `ONCE` (« Pas mon habituel », cette fois seulement). */
  choose: (id: string, placement: 'PRIMARY' | 'ONCE') => void
  search: (query: string) => void
  never: (id: string, on: boolean) => void
  /** Le rayon choisi dans la rangée a changé (DRV-647), `null` : « Tous ». Aucune requête : la liste se filtre d'elle-même. */
  aisle?: (id: number | null) => void
  /** Les produits d'un rayon du site ou d'un de ses enfants (DRV-647, 0.36.0) : une requête filtrée, ou le cache. */
  loadAisle?: (id: AisleId) => Promise<AisleLoad>
  /** Le tri a changé (DRV-743) : l'appelant le garde pour les articles suivants. Aucune requête : la liste se range d'elle-même. */
  sort?: (state: SortState) => void
}

export interface Picker {
  /** Remplace les résultats. */
  results: (
    query: string,
    items: readonly PickerItem[],
    notice: string | null,
    asked?: string | null,
    aisles?: AisleRow,
  ) => void
  /**
   * Remplace la rangée SANS toucher à la liste (DRV-647, 0.37.0 : la rangée des rayons du site, une fois la forme du filtre validée) ; sans effet si un groupe
   * est déjà chargé (l'appelant ne la remplace pas après un toucher de la personne : pas de clignotement).
   */
  replaceAisles: (row: AisleRow) => void
  /** Occupé : plus rien ne se touche et `message` est annoncé ; `null` rend la main. */
  busy: (message: string | null) => void
  /** Cesse d'observer le défilement (l'écran quitte la scène). */
  dispose: () => void
}

const OFF = 'data-off'

/** Le nombre de fiches ajoutées à chaque fois : de quoi remplir un écran de téléphone, assez peu pour que l'ajout ne se voie pas. */
export const BATCH_SIZE = 8

/** La suite est ajoutée un peu AVANT que la sentinelle entre à l'écran (environ trois fiches), pour que le défilement ne bute jamais sur la fin. */
const AHEAD_PX = 400

function row(
  item: PickerItem,
  index: number,
  choose: PickerHooks['choose'],
  waiting: boolean,
  retailer: PhotoRetailer,
): HTMLElement {
  const nameId = `produit-${index}`
  // Un produit « Plus en stock » reste à choisir : le panier tranche (DRV-635). Seul un produit écarté par l'utilisateur est grisé.
  const off = item.state === 'refused'
  const hint = {
    ok: item.explain,
    // Un produit absent : le nombre à mettre au panier n'a pas de sens, la fiche dit seulement qu'il n'est plus en stock (DRV-644).
    out: S.picker.outHint,
    refused: S.picker.refusedHint,
  }[item.state]
  // Deux gestes par fiche (0.41.0, une intention = un clic) : « Choisir » retient le produit, « Pas mon habituel » le prend cette fois seulement.
  // Le nom accessible commence par le texte visible et nomme le produit (« Choisir : Farine de blé 1 kg »), sans dépendre de la fiche voisine.
  const buttons = off
    ? [
        h('button', {
          text: S.picker.refused,
          disabled: true,
          attrs: { type: 'button', 'aria-describedby': nameId, [OFF]: '1' },
        }),
      ]
    : [
        h('button', {
          text: S.picker.choose,
          class: 'primary',
          disabled: waiting,
          attrs: { type: 'button', 'aria-label': S.picker.chooseNamed(item.name) },
          on: { click: () => choose(item.id, 'PRIMARY') },
        }),
        h('button', {
          text: S.picker.notUsual,
          class: 'secondary',
          disabled: waiting,
          attrs: { type: 'button', 'aria-label': S.picker.notUsualNamed(item.name) },
          on: { click: () => choose(item.id, 'ONCE') },
        }),
      ]
  return h(
    'li',
    { class: off ? 'candidate off' : 'candidate' },
    h(
      'div',
      { class: 'media' },
      photoFrame(item.photo, item.name, retailer.photos),
      h(
        'div',
        { class: 'text' },
        h('p', { class: 'name', text: item.name, attrs: { id: nameId } }),
        item.label2 ? h('p', { class: 'hint', text: item.label2 }) : null,
        item.details.length > 0 ? h('p', { text: item.details.join(' · ') }) : null,
        item.promo ? h('p', { text: item.promo }) : null,
        h('p', { class: 'hint', text: hint }),
      ),
    ),
    h('div', { class: 'pick' }, ...buttons),
  )
}

/**
 * Les phrases de la section des produits écartés (DRV-635) : les produits en rupture se disent ensemble (« Ces produits ne sont plus disponibles »),
 * chaque produit introuvable ou refusé par le panier a sa phrase, qui le nomme. Seule la rupture dit « plus disponible ».
 */
function goneSentences(gone: PickerProps['gone'], retailer: RetailerNames): HTMLElement[] {
  const out = gone.filter((product) => (product.reason ?? 'OUT_OF_STOCK') === 'OUT_OF_STOCK')
  return [
    ...(out.length > 0
      ? [h('p', { text: S.picker.gone(out.map((product) => product.label).join(', ')) })]
      : []),
    ...gone.flatMap((product) =>
      product.reason === 'NOT_FOUND'
        ? [h('p', { text: S.picker.notFound(product.label) })]
        : product.reason === 'CART_REFUSED'
          ? [h('p', { text: S.picker.cartRefused(retailer, product.label) })]
          : [],
    ),
  ]
}

/** Remplit `zone` ; rend de quoi mettre la liste à jour et la rendre inactive pendant une requête. */
export function renderPicker(zone: HTMLElement, props: PickerProps, hooks: PickerHooks): Picker {
  const input = h('input', {
    value: props.prefill ?? props.query,
    attrs: { id: 'chercher', type: 'search', maxlength: '255', autocomplete: 'off' },
  })
  // Pas un deuxième bouton principal (DRV-624) : le geste de l'écran est « Choisir ».
  const go = h('button', {
    text: S.picker.searchButton,
    class: 'secondary',
    attrs: { type: 'submit' },
  })
  const form = h(
    'form',
    {
      class: 'search',
      attrs: { role: 'search', novalidate: '' },
      on: {
        submit: (event) => {
          event.preventDefault()
          const query = input.value.trim()
          if (query !== '') hooks.search(query)
        },
      },
    },
    h('label', { text: S.picker.searchLabel, attrs: { for: 'chercher' } }),
    input,
    go,
  )
  const status = h('p', { class: 'hint', attrs: { role: 'status' } })
  const note = h('p', { class: 'notice', hidden: true, attrs: { role: 'alert' } })
  const list = h('ul', { class: 'candidates', attrs: { 'aria-label': S.picker.list } })
  // La rangée de filtres par rayon (DRV-647) : « Tous » puis les rayons présents ; un toucher filtre la liste déjà reçue, sans requête.
  const shelf = h('div', {
    class: 'aisles',
    hidden: true,
    attrs: { role: 'group', 'aria-label': S.picker.aisles },
  })
  // La seconde rangée (DRV-647, 0.36.0) : les enfants du rayon du site choisi.
  const subShelf = h('div', { class: 'aisles sub', hidden: true, attrs: { role: 'group' } })

  const gone =
    props.gone.length === 0
      ? null
      : h(
          'section',
          { class: 'gone' },
          ...goneSentences(props.gone, props.retailer),
          ...props.gone.map((product, index) => {
            const box = h('input', {
              attrs: { type: 'checkbox', id: `jamais-${index}` },
              on: {
                change: (event) =>
                  hooks.never(product.id, (event.target as HTMLInputElement).checked),
              },
            })
            box.checked = props.checked.has(product.id)
            return h('label', { class: 'check' }, box, S.picker.never(product.label))
          }),
        )

  // La sentinelle : un élément sans hauteur sous la liste ; quand elle approche de la zone visible, le lot suivant s'ajoute.
  const more = h('div', { class: 'more', hidden: true, attrs: { 'aria-hidden': 'true' } })
  // Les résultats peu pertinents (DRV-757) : au bout de la liste, « Chercher autre chose » ramène au champ de recherche, sans remonter à la main
  const elsewhere = h('button', {
    text: S.picker.searchLabel,
    class: 'secondary',
    attrs: { type: 'button' },
    on: {
      click: () => {
        form.scrollIntoView({ block: 'center' })
        input.focus()
      },
    },
  })
  let all: readonly PickerItem[] = []
  /** Les produits que la liste montre : tous, ou ceux du rayon choisi. */
  let visible: readonly PickerItem[] = []
  let current: AisleRow = NO_ROW
  /** Les produits du rayon du site (ou de son enfant) chargés par le crochet, `null` : la liste de la recherche. */
  let remoteItems: readonly PickerItem[] | null = null
  /** L'enfant choisi du rayon du site, `null` : le rayon entier. */
  let child: AisleId | null = null
  /** Le numéro du dernier chargement : une réponse plus ancienne est ignorée. */
  let tickets = 0
  let shown = 0
  let waiting = false
  // Trier (DRV-743) : l'ordre d'AFFICHAGE de la liste (aucune requête, aucun produit de plus ou de moins). Quatre boutons dont le bouton actif est enfoncé
  // (`aria-pressed`) et porte la flèche du sens ; ils ne sont jamais refaits, pour que le focus reste sur le bouton touché.
  let sorting: SortState = props.sort ?? DEFAULT_SORT
  const sortHelp = h('p', { class: 'hint', attrs: { 'aria-live': 'polite' } })
  const sortButtons = SORT_KEYS.map((key) =>
    h('button', {
      class: 'chip',
      attrs: { type: 'button', 'aria-pressed': 'false', 'data-sort': key },
      on: { click: () => touchSort(key) },
    }),
  )
  const sortBlock = h(
    'div',
    { class: 'sorting', hidden: true, attrs: { role: 'group', 'aria-label': S.picker.sort.title } },
    h('p', { class: 'title', text: S.picker.sort.title, attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'chips' }, ...sortButtons),
    sortHelp,
  )
  const watcher =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) showMore()
          },
          { rootMargin: `0px 0px ${AHEAD_PX}px 0px` },
        )
      : null
  /** Sans `IntersectionObserver` : la sentinelle est-elle à moins de `AHEAD_PX` du bas de la fenêtre ? */
  const near = () => more.getBoundingClientRect().top <= window.innerHeight + AHEAD_PX
  const scrolled = () => {
    if (!zone.isConnected) return
    while (!more.hidden && near()) showMore()
  }
  /** Ajoute le lot suivant À LA SUITE de la liste : les fiches déjà là ne sont pas touchées. */
  function showMore(): void {
    const end = Math.min(shown + BATCH_SIZE, visible.length)
    if (end > shown) {
      const batch = visible
        .slice(shown, end)
        .map((item, offset) => row(item, shown + offset, hooks.choose, waiting, props.retailer))
      shown = end
      append(list, ...batch)
    }
    more.hidden = shown >= visible.length
    if (watcher === null) return
    watcher.unobserve(more)
    // Observer de nouveau redonne l'état tout de suite : si la sentinelle est encore près de l'écran (écran haut), le lot suivant suit.
    if (!more.hidden) watcher.observe(more)
  }
  // Sans observateur, c'est l'événement de défilement de l'arbre qui porte la liste (il ne remonte pas : écoute en capture).
  const root = watcher === null ? zone.getRootNode() : null
  root?.addEventListener('scroll', scrolled, true)

  /** Refait la liste depuis le début : les produits du rayon du site chargé, ou ceux du groupe local choisi, ou tous, dans l'ordre du tri choisi. */
  function fill(): void {
    clear(list)
    const base =
      remoteItems !== null
        ? remoteItems
        : current.remote === true || current.selected === null
          ? all
          : all.filter((item) => item.aisle === current.selected)
    visible = sortItems(base, sorting)
    refreshSort(referenceUnit(base))
    shown = 0
    showMore()
  }
  /** Le texte, l'état et l'aide des boutons de tri, d'après le tri choisi (le « prix au kilo » dit le litre ou la pièce quand la liste se mesure ainsi). */
  function refreshSort(unit: 'kg' | 'l' | 'piece'): void {
    const text = S.picker.sort
    const labelOf = (key: SortKey): string =>
      key === 'relevance'
        ? text.relevance
        : key === 'price'
          ? text.price
          : key === 'unitPrice'
            ? text.unitPrice(unit)
            : text.name
    for (const button of sortButtons) {
      const key = button.dataset.sort as SortKey
      const label = labelOf(key)
      // L'ordre du site n'a pas de sens à inverser : pas de flèche.
      const arrowed = sorting.key === key && key !== 'relevance'
      button.textContent = arrowed ? text.active(label, sorting.direction) : label
      button.setAttribute('aria-pressed', sorting.key === key ? 'true' : 'false')
      if (arrowed) {
        button.setAttribute(
          'aria-label',
          text.activeNamed(button.textContent ?? label, sorting.direction, key === 'name'),
        )
      } else button.removeAttribute('aria-label')
    }
    sortHelp.textContent =
      sorting.key === 'relevance'
        ? text.help.relevance
        : sorting.key === 'price'
          ? text.help.price(sorting.direction)
          : sorting.key === 'unitPrice'
            ? text.help.unitPrice(sorting.direction, unit)
            : text.help.name(sorting.direction)
  }
  /** Le toucher d'un bouton de tri : un autre tri, ou l'autre sens du tri actif ; la liste se range d'elle-même et l'appelant garde le choix. */
  function touchSort(key: SortKey): void {
    const next = touch(sorting, key)
    if (next.key === sorting.key && next.direction === sorting.direction) return
    sorting = next
    fill()
    hooks.sort?.(sorting)
  }
  const same = (a: AisleId | null, b: AisleId | null) =>
    a !== null && b !== null && String(a) === String(b)
  /** Les boutons choisis sont enfoncés (`aria-pressed`), les autres non : « Tous » quand rien n'est choisi, le rayon, l'enfant. */
  function press(): void {
    for (const button of shelf.querySelectorAll<HTMLElement>('button')) {
      const id = button.dataset.aisle ?? null
      button.setAttribute(
        'aria-pressed',
        (id === null ? current.selected === null : same(id, current.selected)) ? 'true' : 'false',
      )
    }
    for (const button of subShelf.querySelectorAll<HTMLElement>('button')) {
      button.setAttribute(
        'aria-pressed',
        same(button.dataset.aisle ?? null, child) ? 'true' : 'false',
      )
    }
  }
  const chipButton = (id: AisleId | null, text: string, onClick: () => void) =>
    h('button', {
      text,
      class: 'chip',
      disabled: waiting,
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        ...(id !== null && { 'data-aisle': String(id) }),
      },
      on: { click: onClick },
    })
  /**
   * Charge les produits d'un rayon du site (DRV-647, 0.36.0) par le crochet de l'appelant : « Je cherche… » pendant la requête ; une réponse périmée (un autre
   * toucher entre-temps) est ignorée ; un repli remplace la rangée par celle des familles (sans message) ; une erreur se dit en une phrase et revient à « Tous ».
   */
  function load(id: AisleId): void {
    const loader = hooks.loadAisle
    if (loader === undefined) return
    const ticket = ++tickets
    busy(S.picker.searchingAisle)
    loader(id).then(
      (answer) => {
        if (ticket !== tickets) return
        busy(null)
        if ('items' in answer) {
          remoteItems = answer.items
          note.hidden = true
        } else if ('fallback' in answer) {
          current = answer.fallback
          remoteItems = null
          child = null
          drawShelf()
          // Une phrase seulement quand un rayon touché n'a pas rendu ses produits (0.38.0) ; un repli à la validation reste muet.
          if (answer.notice !== undefined) {
            note.textContent = answer.notice
            note.hidden = false
          }
        } else {
          current = { ...current, selected: null }
          remoteItems = null
          child = null
          note.textContent = answer.notice
          note.hidden = false
        }
        drawSubShelf()
        press()
        fill()
      },
      () => {
        if (ticket === tickets) busy(null)
      },
    )
  }
  /** Le toucher d'un groupe de la rangée : local, la liste se filtre d'elle-même ; rayon du site, une requête (ou le cache de l'appelant). */
  function choose(id: AisleId | null): void {
    // Retoucher le groupe choisi, ou « Tous », revient à la liste complète, sans requête.
    const next = id === null || same(current.selected, id) ? null : id
    if (next === null && current.selected === null) return
    current = { ...current, selected: next }
    child = null
    hooks.aisle?.(typeof next === 'number' || next === null ? next : null)
    if (current.remote === true && next !== null) {
      drawSubShelf()
      press()
      load(next)
      return
    }
    remoteItems = null
    tickets++
    drawSubShelf()
    press()
    fill()
  }
  /** Le toucher d'un enfant du rayon choisi : ses produits ; le retoucher revient au rayon. */
  function chooseChild(id: AisleId): void {
    const parent = current.selected
    if (parent === null) return
    child = same(child, id) ? null : id
    press()
    load(child ?? parent)
  }
  /** Redessine la rangée : rien sous deux groupes ; sinon « Tous » et chaque groupe. */
  function drawShelf(): void {
    clear(shelf)
    // Une rangée nouvelle (autres résultats, repli sur les familles) repart du début : « Tous » se voit.
    shelf.scrollLeft = 0
    shelf.hidden = current.chips.length < 2
    if (shelf.hidden) return
    append(
      shelf,
      chipButton(null, S.picker.allAisles(all.length), () => choose(null)),
      ...current.chips.map(({ id, label, count }) =>
        chipButton(id, S.picker.aisleChip(label, count), () => choose(id)),
      ),
    )
  }
  /** La seconde rangée : les enfants lisibles du rayon du site choisi (« Légumes », « Jus de fruits et légumes frais »), rien sinon. */
  function drawSubShelf(): void {
    clear(subShelf)
    const selected = current.chips.find((chip) => same(chip.id, current.selected))
    const children = current.remote === true ? (selected?.children ?? []) : []
    subShelf.hidden = children.length === 0
    if (subShelf.hidden || selected === undefined) return
    subShelf.setAttribute('aria-label', S.picker.subAisles(selected.label))
    append(
      subShelf,
      ...children.map(({ id, label, count }) =>
        chipButton(id, S.picker.aisleChip(label, count), () => chooseChild(id)),
      ),
    )
  }

  let lastStatus = ''
  const results: Picker['results'] = (query, items, notice, asked = null, aisles = NO_ROW) => {
    all = items
    // Un seul produit, ou aucun : rien à trier. Le tri choisi reste appliqué aux résultats d'une nouvelle recherche (DRV-743).
    sortBlock.hidden = items.length < 2
    tickets++
    remoteItems = null
    child = null
    // Un groupe choisi qui n'est pas dans ces résultats ne filtre rien : « Tous ». Un rayon du site n'est jamais choisi d'avance.
    const present =
      aisles.remote !== true &&
      aisles.chips.length >= 2 &&
      aisles.chips.some(({ id }) => same(id, aisles.selected))
    current = { ...aisles, selected: present ? aisles.selected : null }
    drawShelf()
    drawSubShelf()
    press()
    fill()
    lastStatus =
      items.length === 0
        ? S.picker.none(query)
        : asked === null
          ? S.picker.results(query)
          : S.picker.resultsInstead(query, asked)
    status.textContent = lastStatus
    note.textContent = notice ?? ''
    note.hidden = notice === null
  }
  function busy(message: string | null): void {
    const on = message !== null
    input.disabled = on
    go.disabled = on
    waiting = on
    for (const button of list.querySelectorAll('button')) {
      button.disabled = on || button.hasAttribute(OFF)
    }
    for (const button of shelf.querySelectorAll('button')) button.disabled = on
    for (const button of subShelf.querySelectorAll('button')) button.disabled = on
    for (const button of sortButtons) button.disabled = on
    status.textContent = on ? message : lastStatus
  }

  results(props.query, props.items, props.notice, props.asked, props.aisles)
  append(
    zone,
    h(
      'div',
      { class: 'picker' },
      props.need === null ? null : h('p', { text: S.picker.need(props.need) }),
      props.replaces === null ? null : h('p', { text: S.picker.replaces(props.replaces) }),
      sortBlock,
      gone,
      form,
      status,
      shelf,
      subShelf,
      note,
      list,
      more,
      elsewhere,
    ),
  )
  return {
    results,
    replaceAisles: (row) => {
      if (remoteItems !== null) return
      // Un groupe choisi d'avance (le rayon appris) est levé : la liste revient entière, une seule fois.
      const filtered = current.selected !== null
      current = { ...row, selected: null }
      child = null
      drawShelf()
      drawSubShelf()
      press()
      if (filtered) fill()
    },
    busy,
    dispose: () => {
      watcher?.disconnect()
      root?.removeEventListener('scroll', scrolled, true)
    },
  }
}

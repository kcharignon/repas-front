// Le sélecteur de produits (DRV-306, variante P2) : la liste que l'agent affiche lui-même dans la zone de l'écran « chooser ». L'enseigne
// refuse d'être affichée dans un cadre (décision G1) : l'utilisateur choisit donc dans cette liste, nourrie par la recherche de l'agent.
// Tout s'affiche par `textContent` (un libellé de l'enseigne n'est jamais du HTML). Les photos (DRV-633, `photo.ts`) sont les seules images : 12 au plus,
// chargées à la demande, depuis les serveurs de l'enseigne comme le fait sa page.
import { append, clear, h } from './dom'
import { photoFrame } from './photo'
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
}

export interface PickerProps {
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
}

export interface PickerHooks {
  choose: (id: string) => void
  search: (query: string) => void
  never: (id: string, on: boolean) => void
}

export interface Picker {
  /** Remplace les résultats. */
  results: (
    query: string,
    items: readonly PickerItem[],
    notice: string | null,
    asked?: string | null,
  ) => void
  /** Occupé : plus rien ne se touche et `message` est annoncé ; `null` rend la main. */
  busy: (message: string | null) => void
}

const OFF = 'data-off'

/** Les photos ne sont montrées que pour les premiers produits de la liste : pas de rafale d'images vers l'enseigne. */
export const MAX_PHOTOS = 12

function row(item: PickerItem, index: number, choose: PickerHooks['choose']): HTMLElement {
  const nameId = `produit-${index}`
  // Un produit « Plus en stock » reste à choisir : le panier tranche (DRV-635). Seul un produit écarté par l'utilisateur est grisé.
  const off = item.state === 'refused'
  const hint = {
    ok: item.explain,
    out: `${S.picker.outHint} ${item.explain}`,
    refused: S.picker.refusedHint,
  }[item.state]
  const button = h('button', {
    text: off ? S.picker.refused : S.picker.choose,
    class: off ? '' : 'primary',
    disabled: off,
    attrs: { type: 'button', 'aria-describedby': nameId, ...(off && { [OFF]: '1' }) },
    on: { click: () => choose(item.id) },
  })
  return h(
    'li',
    { class: off ? 'candidate off' : 'candidate' },
    h(
      'div',
      { class: 'media' },
      index < MAX_PHOTOS ? photoFrame(item.photo, item.name) : null,
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
    button,
  )
}

/**
 * Les phrases de la section des produits écartés (DRV-635) : les produits en rupture se disent ensemble (« Ces produits ne sont plus disponibles »),
 * chaque produit introuvable ou refusé par le panier a sa phrase, qui le nomme. Seule la rupture dit « plus disponible ».
 */
function goneSentences(gone: PickerProps['gone']): HTMLElement[] {
  const out = gone.filter((product) => (product.reason ?? 'OUT_OF_STOCK') === 'OUT_OF_STOCK')
  return [
    ...(out.length > 0
      ? [h('p', { text: S.picker.gone(out.map((product) => product.label).join(', ')) })]
      : []),
    ...gone.flatMap((product) =>
      product.reason === 'NOT_FOUND'
        ? [h('p', { text: S.picker.notFound(product.label) })]
        : product.reason === 'CART_REFUSED'
          ? [h('p', { text: S.picker.cartRefused(product.label) })]
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

  const gone =
    props.gone.length === 0
      ? null
      : h(
          'section',
          { class: 'gone' },
          ...goneSentences(props.gone),
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

  const results: Picker['results'] = (query, items, notice, asked = null) => {
    clear(list)
    append(list, ...items.map((item, index) => row(item, index, hooks.choose)))
    status.textContent =
      items.length === 0
        ? S.picker.none(query)
        : asked === null
          ? S.picker.results(query)
          : S.picker.resultsInstead(query, asked)
    note.textContent = notice ?? ''
    note.hidden = notice === null
  }
  const busy: Picker['busy'] = (message) => {
    const on = message !== null
    input.disabled = on
    go.disabled = on
    for (const button of list.querySelectorAll('button')) {
      button.disabled = on || button.hasAttribute(OFF)
    }
    if (on) status.textContent = message
  }

  results(props.query, props.items, props.notice, props.asked)
  append(
    zone,
    h(
      'div',
      { class: 'picker' },
      props.need === null ? null : h('p', { text: S.picker.need(props.need) }),
      props.replaces === null ? null : h('p', { text: S.picker.replaces(props.replaces) }),
      gone,
      form,
      status,
      note,
      list,
    ),
  )
  return { results, busy }
}

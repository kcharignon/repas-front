// Le sélecteur de produits (DRV-306, variante P2) : la liste que l'agent affiche lui-même dans la zone de l'écran « chooser ». L'enseigne
// refuse d'être affichée dans un cadre (décision G1) : l'utilisateur choisit donc dans cette liste, nourrie par la recherche de l'agent.
// Tout s'affiche par `textContent` (un libellé de l'enseigne n'est jamais du HTML) ; aucune image n'est chargée.
import { append, clear, h } from './dom'
import { S } from './strings'

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
  /** « 800 g demandés, 500 g par produit : 2 », ou « contenu inconnu ». */
  explain: string
  /** `out` : plus en stock ; `refused` : l'utilisateur ne veut jamais ce produit. Ni l'un ni l'autre ne se choisit. */
  state: 'ok' | 'out' | 'refused'
}

export interface PickerProps {
  /** « 800 g » : la quantité demandée par la liste. */
  need: string | null
  /** Le libellé du produit que l'utilisateur veut remplacer. */
  replaces: string | null
  /** Les produits mémorisés devenus indisponibles : chacun a sa case « Ne plus jamais prendre ». */
  gone: readonly { id: string; label: string }[]
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

function row(item: PickerItem, index: number, choose: PickerHooks['choose']): HTMLElement {
  const nameId = `produit-${index}`
  const off = item.state !== 'ok'
  const hint = { ok: item.explain, out: S.picker.outHint, refused: S.picker.refusedHint }[
    item.state
  ]
  const button = h('button', {
    text: { ok: S.picker.choose, out: S.picker.out, refused: S.picker.refused }[item.state],
    class: off ? '' : 'primary',
    disabled: off,
    attrs: { type: 'button', 'aria-describedby': nameId, ...(off && { [OFF]: '1' }) },
    on: { click: () => choose(item.id) },
  })
  return h(
    'li',
    { class: off ? 'candidate off' : 'candidate' },
    h('p', { class: 'name', text: item.name, attrs: { id: nameId } }),
    item.label2 ? h('p', { class: 'hint', text: item.label2 }) : null,
    item.details.length > 0 ? h('p', { text: item.details.join(' · ') }) : null,
    item.promo ? h('p', { text: item.promo }) : null,
    h('p', { class: 'hint', text: hint }),
    button,
  )
}

/** Remplit `zone` ; rend de quoi mettre la liste à jour et la rendre inactive pendant une requête. */
export function renderPicker(zone: HTMLElement, props: PickerProps, hooks: PickerHooks): Picker {
  const input = h('input', {
    value: props.query,
    attrs: { id: 'chercher', type: 'search', maxlength: '255', autocomplete: 'off' },
  })
  const go = h('button', {
    text: S.picker.searchButton,
    class: 'primary',
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
          h('p', { text: S.picker.gone(props.gone.map((product) => product.label).join(', ')) }),
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

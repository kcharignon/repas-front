// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 2 : recherche sur l'hôte courant, lecture du JSON embarqué.
import { DEFAULT_QUERY } from '../config'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, labelled, resultsPanel } from '../ui/widgets'
import { needStore, search, searchReport } from './common'

export const recherche: Essai = {
  id: 2,
  title: 'Recherche sur le site',
  summary: 'Une recherche sur le site : produits, prix, stock, EAN.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const query = h('input', {
      value: ctx.state.lastQuery ?? DEFAULT_QUERY,
      attrs: { type: 'text', autocomplete: 'off', enterkeyhint: 'search' },
    })
    const go = button(
      'Chercher',
      () => {
        const store = needStore(ctx, panel)
        const text = query.value.trim()
        if (!store || text === '') {
          if (store) panel.set(['Écris un mot à chercher.'])
          return
        }
        go.disabled = true
        panel.set([`Recherche de « ${text} »…`])
        void search(ctx, store, text)
          .then((outcome) => panel.set(searchReport(text, outcome)))
          .finally(() => {
            go.disabled = false
          })
      },
      'primary',
    )
    append(
      ctx.main,
      hint('Une seule requête, comme la recherche du site.'),
      labelled('Mot à chercher', query),
      h('div', { class: 'row' }, go),
      hint('Sert aux essais 3, 3b, 10 et 12.'),
      panel.el,
    )
  },
}

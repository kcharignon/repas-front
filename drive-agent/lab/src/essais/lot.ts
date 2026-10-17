// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 11 : lot de 30 recherches d'ingrédients, avec les 3 premiers libellés de chacune, pour juger la qualité de la recherche.
import { BATCH_MAX, DEFAULT_INGREDIENTS } from '../config'
import { runSeries } from '../http'
import type { Product } from '../parse'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, labelled, resultsPanel } from '../ui/widgets'
import { needStore, search } from './common'

/** Un nom par ligne, sans lignes vides ; 30 au plus. */
export function parseBatch(text: string): { names: string[]; truncated: number } {
  const all = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return { names: all.slice(0, BATCH_MAX), truncated: Math.max(0, all.length - BATCH_MAX) }
}

export function firstLabels(products: readonly Product[], count = 3): string[] {
  return products.slice(0, count).map((product, i) => {
    const second = product.label2 ? ` (${product.label2})` : ''
    return `   ${i + 1}) ${product.label1 ?? product.id}${second}`
  })
}

interface Row {
  name: string
  lines: string[]
}

export const lot: Essai = {
  id: 11,
  title: 'Lot de 30 recherches',
  summary: "30 recherches d'ingrédients, 3 premiers produits.",
  render(ctx) {
    const panel = resultsPanel(ctx)
    const names = h('textarea', {
      value: DEFAULT_INGREDIENTS.join('\n'),
      attrs: { rows: '10', spellcheck: 'false', autocapitalize: 'off' },
    })
    let cancel = false
    const stop = button('Arrêter', () => {
      cancel = true
    })
    stop.disabled = true
    const go = button(
      'Lancer le lot',
      () => {
        const store = needStore(ctx, panel)
        if (!store) return
        const batch = parseBatch(names.value)
        if (batch.names.length === 0) {
          panel.set(['Écris au moins un nom, un par ligne.'])
          return
        }
        cancel = false
        go.disabled = true
        stop.disabled = false
        panel.set([
          `Lot de ${batch.names.length} recherche(s), en série. Arrêt au premier 403/429.`,
        ])
        if (batch.truncated > 0) {
          panel.add(
            `Attention : seuls les ${batch.names.length} premiers noms sont traités (${batch.truncated} ignoré(s)).`,
          )
        }
        void runSeries<string, Row>(
          batch.names,
          async (name) => {
            const { reply, parsed } = await search(ctx, store, name, false)
            if (reply.error !== null) {
              return {
                result: { name, lines: [`   échec : ${reply.error}`] },
                blocked: false,
                failed: true,
              }
            }
            if (reply.status !== 200) {
              return {
                result: { name, lines: [`   HTTP ${reply.status}`] },
                blocked: reply.blocked,
              }
            }
            const labels = firstLabels(parsed.products)
            return {
              result: { name, lines: labels.length > 0 ? labels : ['   (aucun produit reconnu)'] },
              blocked: false,
            }
          },
          {
            sleep: ctx.env.sleep,
            random: ctx.env.random,
            cancelled: () => cancel,
            onResult: (row, index) => panel.add(`${index + 1}. ${row.name}`, ...row.lines),
          },
        )
          .then((outcome) => {
            const done = outcome.results.length
            const reason: Record<typeof outcome.stoppedBy, string> = {
              fin: 'lot terminé',
              blocage: 'arrêt : blocage 403 ou 429',
              'erreur réseau': 'arrêt : erreur réseau',
              annulation: 'arrêt demandé',
            }
            panel.add(
              '',
              `Conclusion : ${done} recherche(s) faite(s) sur ${batch.names.length} (${reason[outcome.stoppedBy]}).`,
            )
          })
          .finally(() => {
            go.disabled = false
            stop.disabled = true
          })
      },
      'primary',
    )
    append(
      ctx.main,
      hint('Environ 35 s. Un nom par ligne (30 au plus). Copie le résultat à la fin.'),
      labelled('Ingrédients à chercher (un par ligne, 30 au plus)', names),
      h('div', { class: 'row' }, go, stop),
      panel.el,
    )
  },
}

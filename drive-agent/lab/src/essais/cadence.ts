// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 4 : cinq recherches de suite avec la cadence du chantier ; arrêt à la première réponse 403 ou 429.
import { CADENCE_BASE_MS, CADENCE_JITTER_MS, CADENCE_QUERIES } from '../config'
import { runSeries, type SeriesOutcome } from '../http'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, resultsPanel } from '../ui/widgets'
import { describeReply, needStore, search } from './common'

interface Step {
  query: string
  status: number
  line: string
}

/** Ligne de conclusion : combien de réponses avant un éventuel blocage. */
export function cadenceConclusion(outcome: SeriesOutcome<Step>, total: number): string {
  const { results, stoppedBy } = outcome
  const last = results[results.length - 1]
  switch (stoppedBy) {
    case 'fin':
      return `Conclusion : ${results.length} réponses reçues sur ${total}, aucun blocage.`
    case 'blocage':
      return `Conclusion : blocage (HTTP ${last?.status}) à la requête ${results.length} ; ${results.length - 1} réponse(s) reçue(s) avant le blocage.`
    case 'erreur réseau':
      return `Conclusion : arrêt sur une erreur réseau à la requête ${results.length} ; ${results.length - 1} réponse(s) reçue(s) avant.`
    default:
      return `Conclusion : arrêt demandé après ${results.length} réponse(s).`
  }
}

export const cadence: Essai = {
  id: 4,
  title: 'Cadence : 5 recherches de suite',
  summary: '5 recherches de suite : combien avant un blocage ?',
  render(ctx) {
    const panel = resultsPanel(ctx)
    let cancel = false
    const stop = button('Arrêter', () => {
      cancel = true
    })
    stop.disabled = true
    const go = button(
      'Lancer les 5 recherches',
      () => {
        const store = needStore(ctx, panel)
        if (!store) return
        cancel = false
        go.disabled = true
        stop.disabled = false
        panel.set([
          `Cadence : ${CADENCE_BASE_MS} ms + gigue jusqu'à ${CADENCE_JITTER_MS} ms, en série, arrêt au premier 403/429.`,
          `Mots : ${CADENCE_QUERIES.join(', ')}`,
        ])
        void runSeries<string, Step>(
          CADENCE_QUERIES,
          async (query) => {
            const outcome = await search(ctx, store, query, false)
            const { reply, parsed } = outcome
            const found = reply.status === 200 ? ` · ${parsed.products.length} produit(s)` : ''
            return {
              result: {
                query,
                status: reply.status,
                line: `« ${query} » : ${describeReply(reply)}${found}`,
              },
              blocked: reply.blocked,
              failed: reply.status === 0,
            }
          },
          {
            sleep: (ms) => {
              panel.add(`   pause de ${ms} ms`)
              return ctx.env.sleep(ms)
            },
            random: ctx.env.random,
            cancelled: () => cancel,
            onResult: (result, index) =>
              panel.add(`${index + 1}/${CADENCE_QUERIES.length} ${result.line}`),
          },
        )
          .then((outcome) => panel.add('', cadenceConclusion(outcome, CADENCE_QUERIES.length)))
          .finally(() => {
            go.disabled = false
            stop.disabled = true
          })
      },
      'primary',
    )
    append(
      ctx.main,
      hint('Environ 8 secondes. Ne touche à rien.'),
      h('div', { class: 'row' }, go, stop),
      panel.el,
    )
  },
}

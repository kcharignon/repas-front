// Le mode diagnostic (DRV-308) : depuis l'écran d'accueil, un auto-test lisible de l'agent et du site, en lecture seule, et un rapport
// texte à copier pour le support. Rien n'est écrit dans le panier ; une seule recherche part, à la cadence de l'adaptateur.
import type { Ui } from '../ui'
import { runChecks, type CheckResult, type ChecksDeps } from './checks'
import { reportOf, rowsOf, summaryOf } from './report'

export { CHECK_IDS, hostFamily, runChecks, storeTail, TEST_TERM } from './checks'
export type { CheckId, CheckResult, ChecksDeps, PageFacts } from './checks'
export { badgeOf, dateOf, pageLines, reportOf, rowsOf, summaryOf } from './report'
export { attemptsText, NONSENSE_TERM, probeLines } from './probes'
export type { ProbedSearch, ProbeFacts } from './probes'

export interface DiagnosticDeps extends ChecksDeps {
  ui: Ui
  now: () => number
  /** Copie le texte dans le presse-papiers ; `false` si le navigateur refuse. */
  copy: (text: string) => Promise<boolean>
}

/** Affiche l'écran du diagnostic, joue les contrôles et rend la main quand l'utilisateur ferme l'écran. */
export async function showDiagnostic(deps: DiagnosticDeps): Promise<void> {
  const collected: CheckResult[] = []
  await deps.ui.show('diagnostic', {
    copy: deps.copy,
    start: (view) => {
      view.update(rowsOf(collected))
      void runChecks(deps, (result) => {
        collected.push(result)
        view.update(rowsOf(collected))
      }).then(({ results, page, probes, stats }) => {
        view.finish(
          summaryOf(results),
          reportOf(deps.agentVersion, deps.now(), page, results, probes, stats),
        )
      })
    },
  })
}

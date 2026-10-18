// Le test automatique de la variante de débogage (DRV-318) : l'agent joue la suite d'étapes sans autre geste de l'utilisateur et rend un
// seul rapport texte à l'application, qui le copie et le propose au partage. Voir `run.ts` (les étapes et leurs garde-fous) et
// `report.ts` (le texte).
import { LIMITS, type SelftestResultMessage } from '../../protocol'
import type { Ui } from '../ui'
import { S } from '../ui'
import { isOk, reportOf } from './report'
import { PROGRESS_TOTAL, runSelftest, type RunDeps } from './run'

export {
  compareCart,
  LOT_WORDS,
  MAX_PRODUCTS,
  MAX_TEST_QUANTITY,
  PASSAGE_WORDS,
  pickCandidate,
  runSelftest,
  safeLabel,
} from './run'
export { failureText, isOk, reportOf, seconds, stepStatuses } from './report'
export type * from './types'

export interface SelftestDeps extends RunDeps {
  ui: Ui
  /** Rend le rapport à l'application (le pont ; le test automatique n'existe pas sans lui). */
  send: (message: SelftestResultMessage) => void
}

/** Affiche la progression, joue le test, envoie le rapport à l'application, puis retire l'interface de la page. */
export async function showSelftest(deps: SelftestDeps): Promise<void> {
  let stopRequested = false
  void deps.ui
    .show('progress', {
      title: S.selftest.title,
      total: PROGRESS_TOTAL,
      done: 0,
      current: S.selftest.starting,
      log: [],
    })
    .then(() => {
      stopRequested = true
    })
  try {
    const data = await runSelftest(deps, {
      stopped: () => stopRequested,
      step: (done, current) => deps.ui.update({ done, current, entry: current }),
    })
    deps.send({
      v: 1,
      type: 'selftest-result',
      ok: isOk(data),
      agentVersion: deps.agentVersion,
      report: reportOf(data).slice(0, LIMITS.selftestReport),
    })
    deps.ui.update({ done: PROGRESS_TOTAL, entry: S.selftest.reportReady })
  } finally {
    // Quoi qu'il arrive, l'écran de l'agent ne reste pas par-dessus la page.
    deps.ui.close()
  }
}

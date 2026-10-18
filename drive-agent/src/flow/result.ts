// Le résultat d'un passage : les issues des lignes dans l'ordre du plan, l'issue globale, et les nombres de l'écran de fin.
import {
  PROTOCOL_VERSION,
  type ErrorCode,
  type Outcome,
  type PlanMessage,
  type ResultLine,
  type ResultMessage,
  type SetupMessage,
} from '../../protocol'
import { own } from '../own'
import type { EndProps } from '../ui'
import { ERROR_TEXTS } from '../ui'
import type { RunState } from './run-state'

/** L'issue globale d'un passage et, s'il y en a un, le code qui l'a interrompu. */
export interface Ending {
  outcome: Outcome
  code?: ErrorCode
}

/** Les issues finales, dans l'ordre du plan ; une ligne qui attend encore un choix devient `UNAVAILABLE`. */
export function resultLines(plan: PlanMessage, state: RunState): ResultLine[] {
  const lines: ResultLine[] = []
  for (const { ingredientSlug } of plan.lines) {
    const done = own(state.done, ingredientSlug)
    const waiting = own(state.waiting, ingredientSlug)
    if (done) lines.push(done)
    else if (waiting) {
      lines.push({
        ingredientSlug,
        outcome: 'UNAVAILABLE',
        ...(waiting.length > 0 && { unavailableIds: waiting }),
      })
    }
  }
  return lines
}

/** `completed` seulement sans erreur et sans ligne `FAILED` ni `UNAVAILABLE` ; `partial` sinon ; l'arrêt de l'utilisateur est `aborted`. */
export function endingOf(
  lines: readonly ResultLine[],
  stoppedByUser: boolean,
  code: ErrorCode | null,
): Ending {
  if (code === 'BLOCKED') return { outcome: 'partial', code }
  if (code !== null) return { outcome: 'error', code }
  if (stoppedByUser) return { outcome: 'aborted' }
  const incomplete = lines.some(
    (line) => line.outcome === 'FAILED' || line.outcome === 'UNAVAILABLE',
  )
  return { outcome: incomplete ? 'partial' : 'completed' }
}

export function buildResult(
  plan: Pick<PlanMessage | SetupMessage, 'runId' | 'store'>,
  lines: ResultLine[],
  ending: Ending,
  agentVersion: string,
): ResultMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'result',
    runId: plan.runId,
    agentVersion,
    outcome: ending.outcome,
    ...(plan.store && { store: { id: plan.store.id } }),
    ...(ending.code && { error: { code: ending.code, message: ERROR_TEXTS[ending.code].title } }),
    lines,
  }
}

/** Les nombres de l'écran de fin. */
export function endProps(lines: readonly ResultLine[], ending: Ending): EndProps {
  const count = (outcome: ResultLine['outcome']) =>
    lines.filter((line) => line.outcome === outcome).length
  return {
    outcome: ending.outcome,
    ...(ending.code && { error: ending.code }),
    added: count('ADDED'),
    chosen: count('CHOSEN'),
    haveAtHome: count('HAVE_AT_HOME'),
    skipped: count('SKIPPED'),
    unavailable: count('UNAVAILABLE'),
    failed: count('FAILED'),
  }
}

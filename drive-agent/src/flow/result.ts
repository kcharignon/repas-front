// Le résultat d'un passage : les issues des lignes dans l'ordre du plan, l'issue globale, et les nombres de l'écran de fin.
import {
  PROTOCOL_VERSION,
  type ErrorCode,
  type Outcome,
  type PlanMessage,
  type ResultLine,
  type ResultMessage,
  type ResultStats,
  type SetupMessage,
} from '../../protocol'
import { own } from '../own'
import type { LeclercCause } from '../leclerc'
import type { EndProps } from '../ui'
import { ERROR_TEXTS } from '../ui'
import type { RunState } from './run-state'

/** Une ligne dont le nombre de produits a été recalculé en direct, avec le nom de l'ingrédient pour l'écran de fin. */
type EndChange = NonNullable<EndProps['changes']>[number]

/**
 * Les lignes dont le contenu lu en direct a changé le nombre de produits (DRV-613), dans l'ordre du plan, une seule fois chacune. Ce
 * qui vient de l'état de reprise (le stockage est partagé avec la page) n'est cru que pour une ligne du plan.
 */
export function changesOf(plan: PlanMessage, state: RunState): EndChange[] {
  return plan.lines.flatMap(({ ingredientSlug, name }) => {
    const found = state.changes.find((change) => change.ingredientSlug === ingredientSlug)
    return found ? [{ name, planned: found.planned, live: found.live }] : []
  })
}

/** Ce que l'écran de fin dit des quantités déjà au panier (ticket M) : celles qui sont conservées, et celles qu'on n'a pas pu lire. */
export interface Carts {
  kept: { name: string; wanted: number; inCart: number }[]
  unreadable: { name: string; atLeast: number | null }[]
}

/**
 * Les lignes dont la quantité déjà au panier est à dire à la fin, dans l'ordre du plan, une seule fois chacune : `kept` (le panier avait plus
 * que le plan, rien n'a été réduit) et `unreadable` (la recherche ne donnait pas la quantité ; `atLeast` est le plancher connu, `null` s'il n'y
 * en avait pas). Comme pour `changesOf`, ce qui vient de l'état de reprise n'est cru que pour une ligne du plan.
 */
export function cartsOf(plan: PlanMessage, state: RunState): Carts {
  const carts: Carts = { kept: [], unreadable: [] }
  for (const { ingredientSlug, name } of plan.lines) {
    const found = state.carts.find((cart) => cart.ingredientSlug === ingredientSlug)
    if (found?.kind === 'KEPT')
      carts.kept.push({ name, wanted: found.wanted, inCart: found.inCart })
    else if (found) carts.unreadable.push({ name, atLeast: found.inCart })
  }
  return carts
}

/** L'issue globale d'un passage et, s'il y en a un, le code qui l'a interrompu. */
export interface Ending {
  outcome: Outcome
  code?: ErrorCode
  /** Quelle vérification a échoué (ticket A) : un code fixe, ajouté au message du résultat. */
  cause?: LeclercCause
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
  cause: LeclercCause | null = null,
): Ending {
  const why = cause === null ? {} : { cause }
  if (code === 'BLOCKED') return { outcome: 'partial', code, ...why }
  if (code !== null) return { outcome: 'error', code, ...why }
  if (stoppedByUser) return { outcome: 'aborted' }
  const incomplete = lines.some(
    (line) => line.outcome === 'FAILED' || line.outcome === 'UNAVAILABLE',
  )
  return { outcome: incomplete ? 'partial' : 'completed' }
}

/**
 * Le message du résultat : le titre de l'erreur et, entre parenthèses, la cause précise (ticket A), par exemple
 * « Le site a changé (SEARCH_NO_STATE) ». Un code fixe : jamais un morceau de page ni le message d'une exception.
 */
export function errorMessage(ending: Ending): string {
  const title = ending.code ? ERROR_TEXTS[ending.code].title : ''
  return ending.cause ? `${title} (${ending.cause})` : title
}

/**
 * Le message du résultat. `stats` : les compteurs de requêtes du passage (ticket L) ; ils ne partent que si au moins une requête est partie (une
 * annulation au récapitulatif n'a rien à compter).
 */
export function buildResult(
  plan: Pick<PlanMessage | SetupMessage, 'runId' | 'store'>,
  lines: ResultLine[],
  ending: Ending,
  agentVersion: string,
  stats?: ResultStats,
): ResultMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'result',
    runId: plan.runId,
    agentVersion,
    outcome: ending.outcome,
    ...(plan.store && { store: { id: plan.store.id } }),
    ...(ending.code && { error: { code: ending.code, message: errorMessage(ending) } }),
    ...(stats && stats.requests > 0 && { stats }),
    lines,
  }
}

/** Les nombres de l'écran de fin. */
export function endProps(
  lines: readonly ResultLine[],
  ending: Ending,
  changes: readonly EndChange[] = [],
  carts: Carts = { kept: [], unreadable: [] },
  slow = false,
): EndProps {
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
    ...(changes.length > 0 && { changes }),
    ...(carts.kept.length > 0 && { kept: carts.kept }),
    ...(carts.unreadable.length > 0 && { unreadable: carts.unreadable }),
    ...(slow && { slow: true as const }),
  }
}

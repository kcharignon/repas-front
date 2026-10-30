// Le rapport du diagnostic (DRV-308) : un texte à copier et à coller, sans aucune donnée personnelle (pas de cookie, d'identifiant de
// compte, d'adresse, de nom, de numéro de magasin entier ni de contenu de page). Il ne se construit qu'à partir des résultats des
// contrôles, qui ne portent que des nombres et des phrases fixes.
import type { DiagnosticRow } from '../ui'
import { S } from '../ui'
import { causeText, type RequestStats } from '../retailers'
import { CHECK_IDS, type CheckId, type CheckResult, type PageFacts } from './checks'
import { probeLines, type ProbeFacts } from './probes'

const T = S.diagnostic

/** « OK », « KO BLOCKED », « NON TESTÉ » : ce qu'on lit devant chaque contrôle. */
export function badgeOf(result: CheckResult): string {
  if (result.status === 'OK') return T.badge.OK
  if (result.status === 'NOT_TESTED') return T.badge.NOT_TESTED
  return result.code ? `${T.badge.KO} ${result.code}` : T.badge.KO
}

/** Les lignes de l'écran : un contrôle sans résultat attend encore. */
export function rowsOf(results: readonly CheckResult[]): DiagnosticRow[] {
  const byId = new Map<CheckId, CheckResult>(results.map((result) => [result.id, result]))
  return CHECK_IDS.map((id) => {
    const result = byId.get(id)
    if (!result) return { label: T.check[id], badge: T.badge.wait, detail: null, tone: 'wait' }
    const detail = [result.detail, result.cause && causeText(result.cause)]
      .filter(Boolean)
      .join(' ; ')
    return {
      label: T.check[id],
      badge: badgeOf(result),
      detail: detail === '' ? null : detail,
      tone: result.status === 'OK' ? 'ok' : result.status === 'KO' ? 'ko' : 'skip',
    }
  })
}

export function summaryOf(results: readonly CheckResult[]): string {
  const count = (status: CheckResult['status']) =>
    results.filter((result) => result.status === status).length
  return T.finished(count('OK'), count('KO'), count('NOT_TESTED'))
}

/** « 2026-10-18 14:03 UTC » : à la minute, en temps universel. */
export function dateOf(now: number): string {
  return `${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** L'hôte, le magasin et, s'il est connu, ce que la page montre de la connexion (signes de visiteur ou de client : des noms seulement). */
export function pageLines(page: PageFacts): string[] {
  return [
    T.text.host(page.host),
    T.text.store(page.store),
    ...(page.session === undefined ? [] : [`Connexion : ${page.session}`]),
  ]
}

export function reportOf(
  agentVersion: string,
  now: number,
  page: PageFacts | null,
  results: readonly CheckResult[],
  probes?: ProbeFacts | null,
  stats?: RequestStats | null,
): string {
  const sondes = probeLines(probes)
  const lines = [
    T.text.title,
    T.text.agent(agentVersion),
    T.text.date(dateOf(now)),
    ...(page ? pageLines(page) : []),
    '',
    ...(sondes.length > 0 ? [...sondes, ''] : []),
    ...(stats ? [T.text.requests(stats), ''] : []),
    ...rowsOf(results).map(
      (row) => `[${row.badge}] ${row.label}${row.detail === null ? '' : ` : ${row.detail}`}`,
    ),
    '',
    T.text.noWrite,
    T.privacy,
  ]
  return lines.join('\n')
}

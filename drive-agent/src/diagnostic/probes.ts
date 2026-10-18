// Les sondes du site réel dans le diagnostic (ticket B de l'audit du 2026-10-18). Ce fichier met en phrases ce que l'adaptateur a relevé
// (`leclerc/probe.ts`) : des FORMES (motifs d'adresse), des NOMS (clés, en-têtes, signes), des NOMBRES (codes HTTP, produits, longueurs) et des
// mots fixes. Jamais une valeur du site : un libellé, un cookie, un numéro de magasin, une ville, une adresse. Les phrases sont dans `ui/strings.ts`.
import type {
  ArrivalFacts,
  AttemptFacts,
  LeclercCause,
  LeclercErrorCode,
  SearchFacts,
} from '../leclerc'
import { S } from '../ui'

/** Le mot qu'aucun produit ne porte : la forme de la réponse d'une recherche sans résultat (hypothèse H2 de l'audit). */
export const NONSENSE_TERM = 'zzqxkw'

/** Une recherche sondée : ce que l'adaptateur a retenu de la réponse, ou l'erreur quand aucune réponse n'est venue. */
export interface ProbedSearch {
  term: string
  /** `null` : aucune réponse (réseau coupé, page non prise en charge) ou recherche non faite. */
  facts: SearchFacts | null
  fault: { code: LeclercErrorCode; cause: LeclercCause | null; status: number | null } | null
  /** Vrai : la recherche n'a pas été faite (blocage, page non prise en charge). */
  skipped: boolean
}

export interface ProbeFacts {
  arrival: ArrivalFacts | null
  /** Le mot courant du contrôle « recherche » : le même relevé, et les variantes de requête si la première a échoué. */
  common: ProbedSearch | null
  /** Le mot absurde : la forme d'une réponse sans résultat. */
  nonsense: ProbedSearch | null
}

const P = S.diagnostic.probe

/** « BLOCKED, HTTP 403 » ou « CONTRACT_CHANGED (HTTP_400) » : le code d'erreur, sa cause et le code HTTP s'il y en a un. */
function faultText(fault: {
  code: LeclercErrorCode
  cause: LeclercCause | null
  status?: number | null
}): string {
  const named = fault.cause === null ? fault.code : `${fault.code} (${fault.cause})`
  return fault.status == null ? named : `${named}, HTTP ${fault.status}`
}

/** Le suffixe de ville de l'adresse de la page, lu dans son motif (`/magasin-N-N-V/…` : oui, `/magasin-N-N/…` : non). */
function cityOf(address: string): string {
  if (/^\/magasin-N-N-V(\/|$)/.test(address)) return S.diagnostic.probe.yes
  if (/^\/magasin-N-N(\/|$)/.test(address)) return S.diagnostic.probe.no
  return S.diagnostic.probe.notApplicable
}

const yesNo = (value: boolean | null) => (value === null ? P.unknown : value ? P.yes : P.no)

export function attemptsText(attempts: readonly AttemptFacts[]): string {
  return attempts.map((attempt) => `${attempt.variant}=${attempt.status ?? P.noReply}`).join(' ')
}

function searchLines(search: ProbedSearch): string[] {
  const { term, facts, fault, skipped } = search
  if (skipped) return [P.searchSkipped(term)]
  if (facts === null) {
    return [P.searchNoReply(term, fault ? faultText(fault) : null)]
  }
  const lines: string[] = [
    P.searchReply(term, {
      status: facts.status,
      mime: facts.mime,
      length: facts.length,
      redirected: facts.redirected,
      variant: facts.variant,
    }),
    P.requested(facts.requested, facts.address, facts.variant),
  ]
  const result =
    facts.outcome === 'PRODUCTS'
      ? P.outcomeProducts(facts.products ?? 0)
      : facts.outcome === 'EMPTY'
        ? P.outcomeEmpty
        : P.outcomeFailed(facts.fault ? faultText(facts.fault) : P.unknown)
  lines.push(P.outcome(term, result))
  if (
    facts.attempts.some((attempt) => attempt.status !== 200 && attempt.status !== null) ||
    facts.attempts.length > 1
  ) {
    lines.push(P.attempts(term, attemptsText(facts.attempts)))
    for (const attempt of facts.attempts) lines.push(P.attempt(attempt))
  }
  if (facts.phrases.length > 0) lines.push(P.phrases(facts.phrases.join(', ')))
  return lines
}

/** Les lignes des sondes du rapport (vide si rien n'a été relevé). */
export function probeLines(probes: ProbeFacts | null | undefined): string[] {
  if (!probes) return []
  const lines: string[] = []
  const { arrival, common, nonsense } = probes
  if (arrival) {
    lines.push(P.address(arrival.address))
    lines.push(P.city(cityOf(arrival.address)))
    lines.push(P.searchBase(arrival.searchBase ?? null))
    if (arrival.cookies)
      lines.push(P.cookies(arrival.cookies.count, yesNo(arrival.cookies.antiBot)))
    lines.push(P.arrival(arrival.redirects, arrival.status))
    lines.push(
      P.delivery(P.inPage, yesNo(arrival.delivery.read), yesNo(arrival.delivery.sameAsAddress)),
    )
  }
  if (common) lines.push(...searchLines(common))
  if (nonsense) {
    lines.push(...searchLines(nonsense))
    const facts = nonsense.facts
    if (facts) {
      lines.push(
        P.delivery(
          P.inReply(nonsense.term),
          yesNo(facts.delivery.read),
          yesNo(facts.delivery.sameAsAddress),
        ),
      )
      lines.push(P.session(nonsense.term, facts.session))
      lines.push(
        P.keys(nonsense.term, {
          total: facts.keys.total,
          present: facts.keys.present,
          absent: facts.keys.absent,
          session: facts.keys.session,
        }),
      )
      lines.push(P.headers(nonsense.term, facts.headers))
    }
  }
  return lines.length === 0 ? [] : [P.title, ...lines.map((line) => ` - ${line}`)]
}

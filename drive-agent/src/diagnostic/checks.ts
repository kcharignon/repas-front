// Les contrôles du diagnostic (DRV-308) : tous en lecture seule, un seul appel au site (une recherche, à la cadence de l'adaptateur).
// Chaque contrôle rend `OK`, `KO` (avec le code d'erreur quand il y en a un) ou `NOT_TESTED`. Un détail ne contient que des nombres et
// des phrases fixes : jamais un cookie, un identifiant, une adresse ni un morceau de page.
import {
  type ArrivalFacts,
  describeSession,
  isMobileHost,
  LeclercError,
  type LeclercCause,
  type LeclercErrorCode,
  type RequestStats,
  type RetailerAdapter,
} from '../leclerc'
import { S } from '../ui'
import type { StorageLike, WakeLockLike } from '../flow'
import { attemptsText, NONSENSE_TERM, type ProbedSearch, type ProbeFacts } from './probes'

export const CHECK_IDS = [
  'agent',
  'page',
  'origin',
  'session',
  'wakeLock',
  'search',
  'content',
  'frame',
] as const
export type CheckId = (typeof CHECK_IDS)[number]

export interface CheckResult {
  id: CheckId
  status: 'OK' | 'KO' | 'NOT_TESTED'
  /** Le code d'erreur d'un contrôle en échec, quand le site ou la page en est la cause. */
  code?: LeclercErrorCode
  /** Quelle vérification a échoué (ticket A) : un code fixe, montré avec son libellé. */
  cause?: LeclercCause
  detail?: string
}

/** Le mot d'essai : courant, présent dans tous les rayons. */
export const TEST_TERM = 'sel'

export interface ChecksDeps {
  adapter: RetailerAdapter
  agentVersion: string
  storage: StorageLike | null
  wakeLock: WakeLockLike | null
  /** Vrai : l'origine de Repas est écrite dans l'agent ; faux : le marqueur n'est pas remplacé ; `null` : le pont n'en a pas besoin. */
  originReplaced: boolean | null
}

/** Ce que le rapport montre de la page : jamais le numéro de magasin entier ni un hôte qui ne soit pas de la forme connue. */
export interface PageFacts {
  host: string
  store: string
  /** Ce que la page montre de la connexion de l'utilisateur (ticket G) : un état et les noms des signes lus. */
  session?: string
}

const HOST = /^(fd\d{1,3})-courses\.leclercdrive\.fr$/

/** `fd9` pour `fd9-courses.leclercdrive.fr`, un texte fixe pour le site mobile (ticket J) et pour tout autre hôte. */
export function hostFamily(host: string): string {
  const family = HOST.exec(host.toLowerCase())?.[1]
  if (family !== undefined) return family
  return isMobileHost(host) ? S.diagnostic.detail.hostMobile : S.diagnostic.detail.hostOther
}

/** Ce que l'adaptateur a compté entre deux relevés (ticket L) : le diagnostic ne dit que ses propres requêtes ; la pause la plus longue est celle du relevé final. */
function statsSince(before: RequestStats, after: RequestStats): RequestStats {
  return {
    requests: after.requests - before.requests,
    errors: after.errors - before.errors,
    blocks: after.blocks - before.blocks,
    timeouts: after.timeouts - before.timeouts,
    slow: after.slow - before.slow,
    peakPauseMs: after.peakPauseMs,
  }
}

/** Les trois derniers chiffres au plus : un numéro court est caché en entier. */
export function storeTail(id: string): string {
  return id.length > 3 ? `…${id.slice(-3)}` : '…'
}

const ok = (id: CheckId, detail?: string): CheckResult => ({
  id,
  status: 'OK',
  ...(detail !== undefined && { detail }),
})
const ko = (
  id: CheckId,
  detail?: string,
  code?: LeclercErrorCode,
  cause?: LeclercCause | null,
): CheckResult => ({
  id,
  status: 'KO',
  ...(code && { code }),
  ...(cause && { cause }),
  ...(detail !== undefined && { detail }),
})
const skipped = (id: CheckId, detail: string): CheckResult => ({ id, status: 'NOT_TESTED', detail })

/** Une erreur de l'adaptateur a son code et sa cause ; tout autre incident est un site qui ne répond plus comme prévu (cause EXCEPTION). */
const faultOf = (error: unknown): { code: LeclercErrorCode; cause: LeclercCause | null } =>
  error instanceof LeclercError
    ? { code: error.code, cause: error.cause }
    : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }

/** L'erreur d'une recherche avec son code HTTP (un blocage n'a pas de faits de réponse : le code HTTP de l'erreur dit au moins cela). */
const probedFault = (error: unknown): NonNullable<ProbedSearch['fault']> => ({
  ...faultOf(error),
  status: error instanceof LeclercError ? error.status : null,
})

/** Les erreurs après lesquelles chercher encore ne dirait rien de plus : un blocage, une session perdue, une page hors magasin, un site muet, un refus HTTP. */
const STOPS_PROBING = new Set<LeclercErrorCode>([
  'BLOCKED',
  'NOT_LOGGED_IN',
  'UNSUPPORTED_PAGE',
  'NETWORK',
])
const stopsProbing = (fault: ProbedSearch['fault']): boolean =>
  fault !== null && (STOPS_PROBING.has(fault.code) || (fault.cause?.startsWith('HTTP_') ?? false))

/**
 * Les sondes des recherches (ticket B) : ce que la recherche du mot courant a laissé voir ; si sa première requête a échoué, les autres formes de
 * requête sont sondées (recette réelle du 2026-10-18 : HTTP 400) ; puis, si la page répond, la forme d'une réponse sans résultat (mot absurde).
 * Lecture seule, à la cadence normale ; aucune erreur n'en sort.
 */
async function probeSearches(
  adapter: RetailerAdapter,
  arrival: ArrivalFacts | null,
  commonFault: ProbedSearch['fault'],
): Promise<ProbeFacts> {
  const commonFacts = adapter.lastSearchFacts()
  if (commonFacts?.attempts.some((a) => a.status === null || a.status < 200 || a.status >= 300)) {
    await adapter.exploreSearchVariants(TEST_TERM)
  }
  const common: ProbedSearch = {
    term: TEST_TERM,
    facts: commonFacts,
    fault: commonFault,
    skipped: false,
  }
  if (stopsProbing(commonFault)) {
    return {
      arrival,
      common,
      nonsense: { term: NONSENSE_TERM, facts: null, fault: null, skipped: true },
    }
  }
  let nonsenseFault: ProbedSearch['fault'] = null
  try {
    await adapter.searchProducts(NONSENSE_TERM)
  } catch (error) {
    nonsenseFault = probedFault(error)
  }
  const nonsense: ProbedSearch = {
    term: NONSENSE_TERM,
    facts: adapter.lastSearchFacts(),
    fault: nonsenseFault,
    skipped: false,
  }
  return { arrival, common, nonsense }
}

/** Ce que la page montre de la connexion, ou rien si elle ne se laisse pas lire. */
function sessionOf(adapter: RetailerAdapter): string | undefined {
  try {
    return describeSession(adapter.readSession())
  } catch {
    return undefined
  }
}

/** Lit, écrit puis efface une clé d'essai : le stockage de session est-il utilisable ? */
function sessionWorks(storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    storage.setItem('repas:diag', '1')
    const read = storage.getItem('repas:diag') === '1'
    storage.removeItem('repas:diag')
    return read
  } catch {
    return false
  }
}

/** Le produit a-t-il tous les champs que l'agent attend ? */
const complete = (candidate: Awaited<ReturnType<RetailerAdapter['searchProducts']>>[number]) =>
  /^[0-9]{1,12}$/.test(candidate.id) &&
  candidate.label.trim() !== '' &&
  candidate.price !== null &&
  candidate.stock !== null

const D = S.diagnostic.detail

/**
 * Joue les contrôles dans l'ordre et rend chaque résultat dès qu'il est connu (`onResult`), pour que l'écran avance. Aucune exception
 * n'en sort. Le site n'est interrogé qu'une fois ; après un blocage ou une page non prise en charge, il ne l'est pas du tout.
 */
export async function runChecks(
  deps: ChecksDeps,
  onResult: (result: CheckResult) => void,
): Promise<{
  results: CheckResult[]
  page: PageFacts | null
  probes: ProbeFacts
  /** Les requêtes que le diagnostic a envoyées (ticket L) : des nombres, depuis le début des contrôles. */
  stats: RequestStats
}> {
  const results: CheckResult[] = []
  const before = deps.adapter.stats()
  const push = async (result: CheckResult) => {
    results.push(result)
    onResult(result)
    // Laisse l'écran se peindre avant le contrôle suivant.
    await Promise.resolve()
  }

  await push(ok('agent', D.version(deps.agentVersion)))

  let page: PageFacts | null = null
  try {
    const store = deps.adapter.readStore()
    const session = sessionOf(deps.adapter)
    page = {
      host: hostFamily(store.host),
      store: storeTail(store.id),
      ...(session !== undefined && { session }),
    }
    await push(ok('page', D.page(page.host, page.store)))
  } catch (error) {
    const { code, cause } = faultOf(error)
    await push(ko('page', undefined, code, cause))
  }

  let arrival: ArrivalFacts | null = null
  try {
    arrival = deps.adapter.readArrival()
  } catch {
    arrival = null
  }
  let probes: ProbeFacts = { arrival, common: null, nonsense: null }

  await push(
    deps.originReplaced === null
      ? skipped('origin', D.originBridge)
      : deps.originReplaced
        ? ok('origin', D.originOk)
        : ko('origin', D.originMissing, 'UNSUPPORTED_PAGE'),
  )
  await push(sessionWorks(deps.storage) ? ok('session', D.sessionOk) : ko('session', D.sessionKo))
  await push(deps.wakeLock ? ok('wakeLock', D.wakeLockOk) : ko('wakeLock', D.wakeLockKo))

  let commonFault: ProbedSearch['fault'] = null
  if (page === null) {
    await push(skipped('search', D.pageSkipped))
    await push(skipped('content', D.searchFailed))
  } else {
    let found: Awaited<ReturnType<RetailerAdapter['searchProducts']>> | null = null
    try {
      found = await deps.adapter.searchProducts(TEST_TERM)
    } catch (error) {
      commonFault = probedFault(error)
      const { code, cause } = commonFault
      const tried = deps.adapter.lastSearchFacts()?.attempts ?? []
      await push(
        ko(
          'search',
          tried.some((attempt) => attempt.status !== 200)
            ? D.searchAttempts(attemptsText(tried))
            : undefined,
          code,
          cause,
        ),
      )
    }
    if (found === null) {
      await push(skipped('content', D.searchFailed))
    } else {
      const read = found.length
      const whole = found.filter(complete).length
      const variant = deps.adapter.lastSearchFacts()?.variant ?? 'a'
      await push(
        read === 0
          ? ko('search', D.searchEmpty(TEST_TERM), 'CONTRACT_CHANGED', 'SEARCH_COMMON_EMPTY')
          : whole * 2 >= read
            ? ok(
                'search',
                `${D.searchOk(TEST_TERM, read, whole)}${variant === 'a' ? '' : D.searchVariant(variant)}`,
              )
            : ko(
                'search',
                D.searchIncomplete(TEST_TERM, read, whole),
                'CONTRACT_CHANGED',
                'SEARCH_FIELDS_INCOMPLETE',
              ),
      )
      const known = found.filter((candidate) => candidate.content !== null).length
      await push(
        read === 0
          ? skipped('content', D.searchFailed)
          : known * 2 >= read
            ? ok('content', D.contentOk(known, read))
            : ko('content', D.contentKo(known, read), 'CONTRACT_CHANGED', 'CONTENT_UNREADABLE'),
      )
    }
  }

  if (page !== null) probes = await probeSearches(deps.adapter, arrival, commonFault)

  await push(skipped('frame', D.frameSkipped))
  return { results, page, probes, stats: statsSince(before, deps.adapter.stats()) }
}

// Les contrôles du diagnostic (DRV-308) : tous en lecture seule, un seul appel au site (une recherche, à la cadence de l'adaptateur).
// Chaque contrôle rend `OK`, `KO` (avec le code d'erreur quand il y en a un) ou `NOT_TESTED`. Un détail ne contient que des nombres et
// des phrases fixes : jamais un cookie, un identifiant, une adresse ni un morceau de page.
import {
  type ArrivalFacts,
  type FacetExploration,
  describeSession,
  type RetailerInfo,
  RetailerError,
  type RetailerCause,
  type RetailerErrorCode,
  type RequestStats,
  type RetailerAdapter,
} from '../retailers'
import { own } from '../own'
import { S } from '../ui'
import { readLastReasons, readLastRefusals, type StorageLike, type WakeLockLike } from '../flow'
import {
  attemptsText,
  availabilityFacts,
  type AisleLabelFacts,
  type ProductListsReport,
  type AvailabilityFacts,
  NONSENSE_TERM,
  type ProbedSearch,
  type ProbeFacts,
  SHELF_GROUPS,
  SHELF_TERMS,
  faultText,
  shelfFacts,
  shelfIds,
  shelvesRowDetail,
  type ShelfFacts,
} from './probes'

export const CHECK_IDS = [
  'agent',
  'page',
  'origin',
  'session',
  'wakeLock',
  'search',
  'content',
  'shelves',
  'startButton',
  'frame',
] as const
export type CheckId = (typeof CHECK_IDS)[number]

export interface CheckResult {
  id: CheckId
  status: 'OK' | 'KO' | 'NOT_TESTED'
  /** Le code d'erreur d'un contrôle en échec, quand le site ou la page en est la cause. */
  code?: RetailerErrorCode
  /** Quelle vérification a échoué (ticket A) : un code fixe, montré avec son libellé. */
  cause?: RetailerCause
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
  /** L'enseigne de la page : son identifiant, son nom, son domaine et la lecture de ses hôtes. */
  retailer: RetailerInfo
}

/** Ce que le rapport montre de la page : jamais le numéro de magasin entier ni un hôte qui ne soit pas de la forme connue. */
export interface PageFacts {
  /** L'enseigne de la page : le rapport la nomme par son identifiant et son nom, et dit son domaine pour un hôte inconnu. */
  retailer: Pick<RetailerInfo, 'id' | 'name' | 'siteDomain'>
  host: string
  store: string
  /** Ce que la page montre de la connexion de l'utilisateur (ticket G) : un état et les noms des signes lus. */
  session?: string
}

/** La famille d'hôte d'un magasin (`fd9`), un texte fixe pour le site mobile (ticket J) et pour tout autre hôte : la lecture des hôtes est celle de l'enseigne. */
export function hostFamily(host: string, retailer: RetailerInfo): string {
  const family = retailer.hostFamily(host)
  if (family !== null) return family
  return retailer.isMobileHost(host)
    ? S.diagnostic.detail.hostMobile
    : S.diagnostic.detail.hostOther(retailer.siteDomain)
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
  code?: RetailerErrorCode,
  cause?: RetailerCause | null,
): CheckResult => ({
  id,
  status: 'KO',
  ...(code && { code }),
  ...(cause && { cause }),
  ...(detail !== undefined && { detail }),
})
const skipped = (id: CheckId, detail: string): CheckResult => ({ id, status: 'NOT_TESTED', detail })

/** Une erreur de l'adaptateur a son code et sa cause ; tout autre incident est un site qui ne répond plus comme prévu (cause EXCEPTION). */
const faultOf = (error: unknown): { code: RetailerErrorCode; cause: RetailerCause | null } =>
  error instanceof RetailerError
    ? { code: error.code, cause: error.cause }
    : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }

/** L'erreur d'une recherche avec son code HTTP (un blocage n'a pas de faits de réponse : le code HTTP de l'erreur dit au moins cela). */
const probedFault = (error: unknown): NonNullable<ProbedSearch['fault']> => ({
  ...faultOf(error),
  status: error instanceof RetailerError ? error.status : null,
})

/** Les erreurs après lesquelles chercher encore ne dirait rien de plus : un blocage, une session perdue, une page hors magasin, un site muet, un refus HTTP. */
const STOPS_PROBING = new Set<RetailerErrorCode>([
  'BLOCKED',
  'NOT_LOGGED_IN',
  'UNSUPPORTED_PAGE',
  'NETWORK',
])
/** Les codes après lesquels aucune recherche de plus n'a de sens, quelle que soit la cause. */
const HARD_STOPS = new Set<RetailerErrorCode>(['BLOCKED', 'NOT_LOGGED_IN', 'UNSUPPORTED_PAGE'])
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

/**
 * Les rayons et familles que la recherche rend pour trois produits frais (DRV-646) : trois recherches ordinaires, en série, à la cadence normale.
 * La page ne porte aucun indice de pagination connu : « page suivante » de la première reste inconnue. Un blocage, une session perdue ou un refus
 * arrête la série (« recherche non faite » pour les mots restants). Aucune erreur n'en sort.
 */
async function probeShelves(adapter: RetailerAdapter): Promise<{
  shelves: ShelfFacts[]
  reply: Exclude<ProbeFacts['reply'], undefined>
  aisleLabels: AisleLabelFacts[]
  facets: FacetExploration | null
  productLists: { term: string; report: ProductListsReport }[]
}> {
  const shelves: ShelfFacts[] = []
  let reply: Exclude<ProbeFacts['reply'], undefined> = null
  const aisleLabels: AisleLabelFacts[] = []
  let facets: FacetExploration | null = null
  const productLists: { term: string; report: ProductListsReport }[] = []
  let stopped = false
  const none = (term: string, fault?: string): ShelfFacts => ({
    term,
    products: null,
    aisles: [],
    families: [],
    noAisle: 0,
    noFamily: 0,
    ...(fault !== undefined && { fault }),
  })
  for (const [index, term] of SHELF_TERMS.entries()) {
    if (stopped) {
      shelves.push(none(term))
      continue
    }
    try {
      const found = await adapter.searchProducts(term)
      shelves.push({
        ...shelfFacts(term, found),
        ...(index === 0 && { nextPage: null, ...shelfIds(found) }),
      })
      // La structure de la première réponse (DRV-647) : des noms de clés, lus dans la réponse déjà reçue, sans requête de plus.
      // Les listes de produits de la réponse (DRV-647, 0.38.0) : « tomate » et « courgette », lues dans la réponse reçue, sans requête.
      if (term === 'tomate' || term === 'courgette') {
        try {
          const report = adapter.describeProductLists()
          if (report !== null) productLists.push({ term, report })
        } catch {
          // Une réponse qui ne se lit pas : pas de ligne.
        }
      }
      if (index === 0) {
        reply = replyOf(adapter, term)
        // La facette « Rayons » et la forme du filtre (DRV-647, 0.35.0) : lues dans la réponse reçue ; au plus UNE recherche filtrée, si sa forme est sûre.
        facets = await facetsOf(adapter, term, found)
      }
      // Les libellés et des produits échantillons (DRV-647) : « tomate » (12 paires rayon-famille), « courgette » (6), sans requête de plus.
      const samples = own(SAMPLE_COUNTS, term)
      if (samples !== undefined) {
        const labels = labelsOf(adapter, term, found, samples)
        if (labels !== null) aisleLabels.push(labels)
      }
    } catch (error) {
      const fault = probedFault(error)
      stopped = stopsProbing(fault)
      shelves.push(none(term, faultText(fault)))
    }
  }
  return { shelves, reply, aisleLabels, facets, productLists }
}

/** Le relevé de la facette « Rayons » d'une recherche (DRV-647), ou `null` s'il ne se fait pas ; aucune erreur n'en sort. */
async function facetsOf(
  adapter: RetailerAdapter,
  term: string,
  found: Awaited<ReturnType<RetailerAdapter['searchProducts']>>,
): Promise<FacetExploration | null> {
  try {
    return await adapter.exploreFacets(term, found)
  } catch {
    return null
  }
}

/** Combien de produits échantillons le diagnostic montre par recherche d'essai (DRV-647) ; un mot absent n'en montre pas. */
const SAMPLE_COUNTS: Readonly<Record<string, number>> = { tomate: 12, courgette: 6 }

/** Le niveau et le libellé des groupes les plus fournis d'une recherche (DRV-647) : ce que l'écran de choix montrerait, et des produits échantillons. */
function labelsOf(
  adapter: RetailerAdapter,
  term: string,
  found: Awaited<ReturnType<RetailerAdapter['searchProducts']>>,
  samples: number,
): AisleLabelFacts | null {
  try {
    const grouping = adapter.aisleChoices(found)
    return {
      term,
      products: found.length,
      grouping: { ...grouping, choices: grouping.choices.slice(0, SHELF_GROUPS) },
      samples: adapter.aisleSamples(found, samples),
    }
  } catch {
    return null
  }
}

/** La structure de la dernière réponse de recherche, ou `null` si elle ne se lit pas (DRV-647). */
function replyOf(adapter: RetailerAdapter, term: string): Exclude<ProbeFacts['reply'], undefined> {
  try {
    const facts = adapter.describeLastReply()
    return facts === null ? null : { term, facts }
  } catch {
    return null
  }
}

/** Le menu des rayons de la page en cours (DRV-647), sans requête ; `null` si le DOM ne se laisse pas lire. */
function menuOf(adapter: RetailerAdapter): Exclude<ProbeFacts['aisleMenu'], undefined> {
  try {
    return adapter.readAisleMenu()
  } catch {
    return null
  }
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
 * « Bouton de démarrage trouvé » (0.39.0) : l'agent appuie lui-même sur « Commencer mes courses » ; ce contrôle dit s'il le trouve dans la page.
 * Lecture seule, sans clic. `OK` : le bouton se touche (ou c'est un lien) ; `KO` : la page parle de « Commencer mes courses » mais l'agent n'en
 * trouve pas l'élément à toucher ; `NON TESTÉ` : la page n'a pas cette fenêtre (une page de magasin ordinaire).
 */
function startButtonCheck(arrival: ArrivalFacts | null): CheckResult {
  const entry = arrival?.entry
  if (entry === undefined || !entry.start.present) return skipped('startButton', D.startButtonNone)
  if (entry.clickable) return ok('startButton', D.startButtonOk)
  if (entry.start.shape !== null) return ok('startButton', D.startButtonLink)
  return ko('startButton', D.startButtonKo)
}

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
      retailer: {
        id: deps.retailer.id,
        name: deps.retailer.name,
        siteDomain: deps.retailer.siteDomain,
      },
      host: hostFamily(store.host, deps.retailer),
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

  // Le menu des rayons de la page (DRV-647), lu avant toute recherche : le DOM de la page telle qu'elle est arrivée.
  const aisleMenu = menuOf(deps.adapter)
  let commonFault: ProbedSearch['fault'] = null
  let commonReply: Exclude<ProbeFacts['reply'], undefined> = null
  let availability: AvailabilityFacts | null = null
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
      commonReply = replyOf(deps.adapter, TEST_TERM)
      availability = availabilityFacts(found)
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
  // Les rayons vus par trois recherches de produits frais (DRV-646), si le site répond encore.
  // Les variantes de requête et le mot absurde sont des sondes voulues : leurs échecs HTTP n'empêchent pas les rayons ; seuls un blocage, une session
  // perdue, une page hors magasin ou une recherche courante en échec les empêchent (le motif est écrit, jamais passé sous silence).
  const nonsenseFault = probes.nonsense?.fault ?? null
  const shelvesSkip =
    page === null
      ? D.pageSkipped
      : stopsProbing(commonFault)
        ? D.shelvesCommonFailed(faultText(commonFault as NonNullable<typeof commonFault>))
        : nonsenseFault !== null && HARD_STOPS.has(nonsenseFault.code)
          ? D.shelvesStopped(faultText(nonsenseFault))
          : null
  const measured = shelvesSkip === null ? await probeShelves(deps.adapter) : undefined
  const shelves = measured?.shelves
  // La disponibilité de l'échantillon et les raisons du dernier envoi (DRV-635) : des nombres et des mots fixes, jamais un libellé.
  probes = {
    ...probes,
    availability,
    ...(shelves && { shelves }),
    ...(shelvesSkip !== null && { shelvesSkipped: shelvesSkip }),
    // D'où viennent les libellés de rayons (DRV-647) : le menu de la page, la structure de la réponse « tomate » (à défaut celle de « sel »).
    aisleMenu,
    reply: measured?.reply ?? commonReply,
    aisleLabels: measured?.aisleLabels ?? [],
    facets: measured?.facets ?? null,
    productLists: measured?.productLists ?? [],
    lastPass: readLastReasons(deps.storage),
    lastRefusals: readLastRefusals(deps.storage),
  }

  if (shelves === undefined) await push(skipped('shelves', shelvesSkip ?? D.pageSkipped))
  else {
    const detail = shelvesRowDetail(shelves, aisleMenu)
    const seen = shelves.some((shelf) => shelf.aisles.length > 0)
    await push(seen ? ok('shelves', detail) : skipped('shelves', detail))
  }
  await push(startButtonCheck(arrival))
  await push(skipped('frame', D.frameSkipped))
  return { results, page, probes, stats: statsSince(before, deps.adapter.stats()) }
}

// Les sondes du site réel dans le diagnostic (ticket B de l'audit du 2026-10-18). Ce fichier met en phrases ce que l'adaptateur a relevé
// (`leclerc/probe.ts`) : des FORMES (motifs d'adresse), des NOMS (clés, en-têtes, signes), des NOMBRES (codes HTTP, produits, longueurs) et des
// mots fixes. Jamais une valeur du site : un libellé, un cookie, un numéro de magasin, une ville, une adresse. Les phrases sont dans `ui/strings.ts`.
// Seule exception (DRV-647, étape 0) : le libellé d'un lien de RAYON du menu de la page, texte du catalogue public, nettoyé, borné et écarté s'il
// ressemble à une donnée (`safeAisleLabel` de l'adaptateur), et les identifiants de rayon et de famille (des nombres).
// Étape 1 (DRV-647) : le libellé résolu de chaque rayon et les textes du rayon du premier produit (catalogue public, rendus sûrs par l'adaptateur :
// ni numéro de magasin, ni ville, ni e-mail).
import type {
  AisleGrouping,
  AisleLabelSource,
  AisleLevel,
  AisleSample,
  AisleMenuFacts,
  ArrivalFacts,
  AttemptFacts,
  Candidate,
  CartProbeFacts,
  CartReplyFacts,
  CountKey,
  FacetExploration,
  FacetMatch,
  ProbeAttempt,
  RetailerAdapter,
  KeyShape,
  RetailerCause,
  RetailerErrorCode,
  LinkFacts,
  NamedObjectKeys,
  ReplyFacts,
  SearchFacts,
  ShownText,
  VocabularyKey,
} from '../retailers'
import { MAX_MENU_AISLES, type StoreReadFacts } from '../retailers'
import type { LastReason, LastRefusal } from '../flow'
import { own } from '../own'
import type { ForegroundFacts } from './foreground'
import { S } from '../ui'

/** Le mot qu'aucun produit ne porte : la forme de la réponse d'une recherche sans résultat (hypothèse H2 de l'audit). */
export const NONSENSE_TERM = 'zzqxkw'

/** Une recherche sondée : ce que l'adaptateur a retenu de la réponse, ou l'erreur quand aucune réponse n'est venue. */
export interface ProbedSearch {
  term: string
  /** `null` : aucune réponse (réseau coupé, page non prise en charge) ou recherche non faite. */
  facts: SearchFacts | null
  fault: { code: RetailerErrorCode; cause: RetailerCause | null; status: number | null } | null
  /** Vrai : la recherche n'a pas été faite (blocage, page non prise en charge). */
  skipped: boolean
}

export interface ProbeFacts {
  arrival: ArrivalFacts | null
  /** Le mot courant du contrôle « recherche » : le même relevé, et les variantes de requête si la première a échoué. */
  common: ProbedSearch | null
  /** Le mot absurde : la forme d'une réponse sans résultat. */
  nonsense: ProbedSearch | null
  /** La disponibilité lue sur la recherche courante (DRV-635). */
  availability?: AvailabilityFacts | null
  /** Les rayons vus par les recherches d'essai (DRV-646), dans l'ordre de `SHELF_TERMS`. */
  shelves?: readonly ShelfFacts[]
  /** Pourquoi les rayons n'ont pas été lus (DRV-646) : un motif fixe. */
  shelvesSkipped?: string
  /** Le menu des rayons de la page (DRV-647) : identifiants et libellés de catalogue des liens de rayon. `null` : la page ne se laisse pas lire. */
  aisleMenu?: AisleMenuFacts | null
  /** La structure d'une réponse de recherche (DRV-647) : le mot cherché, les noms de ses clés. */
  reply?: { term: string; facts: ReplyFacts } | null
  /** Étape 1 (DRV-647) : les rayons les plus fournis de la première recherche d'essai, leur libellé résolu et sa source (8 au plus). */
  aisleLabels?: readonly AisleLabelFacts[] | null
  /** La facette « Rayons » et la forme du filtre de la première recherche d'essai (DRV-647, agent 0.35.0). */
  facets?: FacetExploration | null
  /** Les listes de produits des réponses « tomate » et « courgette » (DRV-647, 0.38.0). */
  productLists?: readonly { term: string; report: ProductListsReport }[]
  /** Pourquoi le dernier envoi n'a pas mis des produits habituels au panier (DRV-635), dans l'ordre du passage. */
  lastPass?: readonly LastReason[]
  /** Ce que le panier a répondu aux produits choisis qu'il n'a pas pris, au dernier envoi (DRV-644). */
  lastRefusals?: readonly LastRefusal[]
  /** La sonde de lecture du panier (DRV-752) : la forme de sa réponse. Absente chez une enseigne dont le panier ne se lit pas à part, ou sonde non faite. */
  cart?: CartProbeFacts | null
  /** La forme de la dernière réponse du panier qui a échoué dans cet onglet (DRV-752), même avant un rechargement de la page. */
  cartFailure?: CartReplyFacts | null
  /** La fenêtre au premier plan (DRV-757, A2) : des formes seulement, voir `foreground.ts`. */
  foreground?: ForegroundFacts | null
}

/** Ce que l'échantillon de résultats dit de la disponibilité (DRV-635) : des nombres, jamais un libellé. */
export interface AvailabilityFacts {
  sampled: number
  /** `iQteDisponible` à 0, positif, illisible. */
  zeroStock: number
  stocked: number
  unreadable: number
  /** La répartition des valeurs entières de `eDisponibilite` (6 au plus, les plus fréquentes d'abord) : la valeur et le nombre de produits. */
  labels: readonly { value: number; count: number }[]
  /** Produits sans `eDisponibilite` lisible. */
  noLabel: number
  /** Produits dont la fiche dit « Bientôt disponible ». */
  comingSoon: number
}

/** Les listes de produits d'une réponse (DRV-647, 0.38.0), telles que l'adaptateur les décrit. */
export type ProductListsReport = NonNullable<ReturnType<RetailerAdapter['describeProductLists']>>

/** Le relevé des libellés d'une recherche d'essai (DRV-647) : le niveau retenu, les groupes les plus fournis, des produits échantillons. */
export interface AisleLabelFacts {
  term: string
  products: number
  grouping: AisleGrouping
  samples: readonly AisleSample[]
}

/** Les mots d'essai des produits frais dont on mesure les rayons (DRV-646). */
export const SHELF_TERMS = ['tomate', 'pomme', 'courgette'] as const
/** Les groupes montrés au plus par ligne. */
export const SHELF_GROUPS = 8

/** Un identifiant de rayon ou de famille et le nombre de produits qui le portent. */
export interface ShelfGroup {
  id: number
  count: number
}

/** Les rayons et familles vus par une recherche d'essai : des identifiants et des nombres, jamais un produit. */
export interface ShelfFacts {
  term: string
  /** Produits lus ; `null` : la recherche a échoué ou n'a pas été faite. */
  products: number | null
  aisles: readonly ShelfGroup[]
  families: readonly ShelfGroup[]
  /** Produits sans identifiant de rayon, de famille lisible. */
  noAisle: number
  noFamily: number
  /** Première recherche seulement : la page porte-t-elle une page suivante ? `null` : aucun indice lisible. */
  nextPage?: boolean | null
  /** Première recherche seulement (DRV-647) : tous les identifiants de rayon et de famille distincts, pour la correspondance avec le menu. */
  aisleIds?: readonly number[]
  familyIds?: readonly number[]
  /** Pourquoi la recherche a échoué (code et cause : un mot fixe). */
  fault?: string
}

/** Regroupe des identifiants numériques par valeur : les plus fréquents d'abord, `SHELF_GROUPS` au plus. */
function groupIds(values: readonly (number | null)[]): { groups: ShelfGroup[]; missing: number } {
  const counts = new Map<number, number>()
  let missing = 0
  for (const value of values) {
    if (value === null || !Number.isInteger(value) || value < 0 || value > 99_999_999) missing += 1
    else counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const groups = [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id - b.id)
    .slice(0, SHELF_GROUPS)
  return { groups, missing }
}

/** Les rayons et familles de CHAQUE produit lu par une recherche (DRV-646). */
export function shelfFacts(term: string, candidates: readonly Candidate[]): ShelfFacts {
  const aisles = groupIds(candidates.map((candidate) => candidate.aisle))
  const families = groupIds(candidates.map((candidate) => candidate.family))
  return {
    term,
    products: candidates.length,
    aisles: aisles.groups,
    families: families.groups,
    noAisle: aisles.missing,
    noFamily: families.missing,
  }
}

/** Les identifiants de rayon et de famille distincts d'une recherche, dans l'ordre de la page (DRV-647) : des nombres, 200 au plus chacun. */
export function shelfIds(candidates: readonly Candidate[]): {
  aisleIds: number[]
  familyIds: number[]
} {
  const distinct = (values: readonly (number | null)[]) =>
    [
      ...new Set(
        values.filter(
          (value): value is number =>
            value !== null && Number.isInteger(value) && value >= 0 && value <= 99_999_999,
        ),
      ),
    ].slice(0, 200)
  return {
    aisleIds: distinct(candidates.map((candidate) => candidate.aisle)),
    familyIds: distinct(candidates.map((candidate) => candidate.family)),
  }
}

/** Le nombre de produits de l'échantillon de la mesure : les premiers de la recherche courante. */
export const AVAILABILITY_SAMPLE = 12

/**
 * Le stock et l'étiquette de disponibilité des `AVAILABILITY_SAMPLE` premiers résultats, en nombres (DRV-635) : de quoi savoir si « Bientôt
 * disponible » et le stock sont fiables. `null` sans résultat.
 */
export function availabilityFacts(candidates: readonly Candidate[]): AvailabilityFacts | null {
  const sample = candidates.slice(0, AVAILABILITY_SAMPLE)
  if (sample.length === 0) return null
  const counts = new Map<number, number>()
  let noLabel = 0
  for (const { availability } of sample) {
    if (availability === null || !Number.isInteger(availability) || Math.abs(availability) > 999) {
      noLabel += 1
    } else counts.set(availability, (counts.get(availability) ?? 0) + 1)
  }
  return {
    sampled: sample.length,
    zeroStock: sample.filter((candidate) => candidate.stock === 0).length,
    stocked: sample.filter((candidate) => candidate.stock !== null && candidate.stock > 0).length,
    unreadable: sample.filter((candidate) => candidate.stock === null).length,
    labels: [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value - b.value)
      .slice(0, 6),
    noLabel,
    comingSoon: sample.filter((candidate) => candidate.comingSoon).length,
  }
}

const P = S.diagnostic.probe
const F = S.diagnostic.facet

/** « BLOCKED, HTTP 403 » ou « CONTRACT_CHANGED (HTTP_400) » : le code d'erreur, sa cause et le code HTTP s'il y en a un. */
export function faultText(fault: {
  code: RetailerErrorCode
  cause: RetailerCause | null
  status?: number | null
}): string {
  const named = fault.cause === null ? fault.code : `${fault.code} (${fault.cause})`
  return fault.status == null ? named : `${named}, HTTP ${fault.status}`
}

/** « HTTP 200, type text/html, 4,1 k caractères, adresse /cart, non redirigée, corps page HTML, mots reconnus : page de connexion » : la forme d'une réponse du panier. */
export function cartReplyText(facts: CartReplyFacts): string {
  return P.cartReply(facts)
}

/** Les lignes du rapport sur le panier (DRV-752) : la sonde de lecture, les noms d'en-têtes de sa réponse, le dernier échec de l'onglet. */
function cartLines(
  cart: CartProbeFacts | null | undefined,
  failure: CartReplyFacts | null | undefined,
): string[] {
  const lines: string[] = []
  if (cart) {
    const reply = cart.reply === null ? null : cartReplyText(cart.reply)
    lines.push(
      P.cartProbe(
        cart.outcome === 'READ'
          ? P.cartProbeRead(cart.lines ?? 0, reply)
          : P.cartProbeFailed(cart.fault === null ? '?' : faultText(cart.fault), reply),
      ),
    )
    if (cart.reply !== null) lines.push(P.cartHeaders(cart.reply.headers))
  }
  if (failure) lines.push(P.cartFailure(cartReplyText(failure)))
  return lines
}

/** Le suffixe de ville de l'adresse de la page, lu dans son motif (`/magasin-N-N-V/…` : oui, `/magasin-N-N/…` : non). */
function cityOf(address: string): string {
  if (/^\/magasin-N-N-V(\/|$)/.test(address)) return S.diagnostic.probe.yes
  if (/^\/magasin-N-N(\/|$)/.test(address)) return S.diagnostic.probe.no
  return S.diagnostic.probe.notApplicable
}

/** La ligne « Commencer mes courses » : absent, bouton cliquable (le vrai site, DRV-629), ou lien avec la forme de son adresse et où il mène. */
function startLine(link: LinkFacts, clickable: boolean, siteDomain: string): string {
  if (!link.present || link.shape === null) return P.start(link.present, clickable)
  return P.link(P.startLink, {
    present: true,
    shape: link.shape,
    where: link.where === null ? null : (own(P.where(siteDomain), link.where) ?? null),
  })
}

/** Comment le site a dit le magasin (DRV-717) : des formes et des mots fixes, jamais l'identifiant ni le libellé. */
function storeReadLine(read: StoreReadFacts): string {
  const store = { READ: P.storeReadRead, NONE: P.storeReadNone, ABSENT: P.storeReadAbsent }[
    read.store
  ]
  return P.storeRead({
    status: read.status === null ? P.noReply : String(read.status),
    contexts: read.contexts.length === 0 ? P.none : read.contexts.join(', '),
    others: read.otherContexts,
    store,
    idForm: read.idForm === null ? P.notApplicable : read.idForm === 'UUID' ? 'UUID' : P.other,
    pickUp: yesNo(read.pickUp),
    label: yesNo(read.store === 'READ' ? read.label : null),
  })
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
  if (facts.form !== undefined) lines.push(P.searchForm(term, facts.form))
  if (facts.phrases.length > 0) lines.push(P.phrases(facts.phrases.join(', ')))
  if (facts.landing !== undefined) lines.push(P.landing(term, facts.landing))
  if (facts.notDrive !== undefined) lines.push(P.notDrive(term, facts.notDrive))
  return lines
}

const groupsText = (groups: readonly ShelfGroup[]) =>
  groups.length === 0 ? P.unknown : groups.map(({ id, count }) => `${id}:${count}`).join(' ')

/** Le détail de la ligne de contrôle « Rayons vus » : « tomate 15:2 41:1 (203 produits) ; pomme … », trois groupes au plus par mot. */
export function shelvesRowDetail(
  shelves: readonly ShelfFacts[],
  menu?: AisleMenuFacts | null,
): string {
  const words = shelves
    .map((shelf) =>
      shelf.products === null
        ? `${shelf.term} non faite`
        : `${shelf.term} ${groupsText(shelf.aisles.slice(0, 3))} (${shelf.products} produit${shelf.products > 1 ? 's' : ''})`,
    )
    .join(' ; ')
  // DRV-647 : combien des rayons de la première recherche ont un lien numéroté dans le menu de la page.
  const first = shelves[0]
  if (!menu || menu.aisleIds.length === 0 || !first?.aisleIds || first.aisleIds.length === 0) {
    return words
  }
  const { found, seen } = menuCoverage(first.aisleIds, menu.aisleIds)
  return `${words} ; liens du menu : ${found}/${seen}`
}

/** Les lignes d'une recherche d'essai (DRV-646) : rayons puis familles, et pour la première l'indice de page suivante. */
function shelfLines(shelf: ShelfFacts): string[] {
  if (shelf.products === null) return [P.shelvesNone(shelf.term, shelf.fault)]
  const lines = [
    P.shelves(
      'Rayons vus',
      'rayon',
      shelf.term,
      groupsText(shelf.aisles),
      shelf.products,
      shelf.noAisle,
    ),
    P.shelves(
      'Familles vues',
      'famille',
      shelf.term,
      groupsText(shelf.families),
      shelf.products,
      shelf.noFamily,
    ),
  ]
  if (shelf.nextPage !== undefined) {
    lines.push(
      P.nextPage(
        shelf.term,
        shelf.products,
        shelf.nextPage === null ? 'inconnue' : shelf.nextPage ? 'oui' : 'non',
      ),
    )
  }
  return lines
}

/** Les identifiants dont la valeur est rapportée dans les clés d'un produit (DRV-647) : le rayon et la famille, des nombres. */
const VALUE_KEYS = ['iIdRayon', 'iIdFamille'] as const

/** « lstProduits[12] », « objPrix{} », « sLibelleLigne1 », « ? » pour un nom qui n'a pas le style du site ; le rayon et la famille avec leur valeur. */
function keyText(key: KeyShape, values: Readonly<Record<string, number | null>> = {}): string {
  const name = key.name ?? '?'
  if (key.kind === 'LIST') return `${name}[${key.size ?? '?'}]`
  if (key.kind === 'OBJECT') return `${name}{}`
  const value = key.name === null ? undefined : own(values, key.name)
  return value === undefined || value === null ? name : `${name} = ${value}`
}

const keysText = (keys: readonly KeyShape[], values?: Readonly<Record<string, number | null>>) =>
  keys.length === 0 ? P.unknown : keys.map((key) => keyText(key, values)).join(', ')

const vocabularyText = (keys: readonly VocabularyKey[]) =>
  keys.length === 0 ? 'aucune' : keys.map(({ name, count }) => `${name} (${count})`).join(', ')

/** Les lignes du menu des rayons de la page (DRV-647) : comptes, formes d'adresse, une ligne par lien de rayon, clés de l'état de la page. */
function menuLines(menu: AisleMenuFacts): string[] {
  const lines = [
    P.menu({
      menu: menu.menu,
      links: menu.links,
      menuLinks: menu.menuLinks,
      aisles: menu.aisleCount,
      families: menu.families,
    }),
  ]
  if (menu.shapes.length > 0) lines.push(P.menuShapes(menu.shapes.join(' ; ')))
  for (const aisle of menu.aisles) lines.push(P.menuAisle(aisle.kind, aisle.id, aisle.label))
  if (menu.aisleCount > menu.aisles.length) {
    lines.push(P.menuMore(menu.aisleCount - menu.aisles.length, MAX_MENU_AISLES))
  }
  lines.push(P.menuKeys(vocabularyText(menu.vocabulary)))
  return lines
}

/** Les lignes de la structure d'une réponse de recherche (DRV-647) : chemin des produits, clés du premier niveau et d'un produit. */
function replyLines(term: string, facts: ReplyFacts): string[] {
  const { shape } = facts
  const lines: string[] = []
  if (shape === null) lines.push(P.replyNoProduct(term))
  else {
    const path = shape.path.map((step) => `${step.name ?? '?'}${step.list ? '[]' : ''}`)
    lines.push(P.replyPath(term, path.length === 0 ? '(premier niveau)' : path.join(' > ')))
    lines.push(P.replyTop(term, shape.topTotal, keysText(shape.top)))
    const values = { [VALUE_KEYS[0]]: shape.aisle, [VALUE_KEYS[1]]: shape.family }
    lines.push(P.replyProduct(term, shape.productTotal, keysText(shape.product, values)))
  }
  lines.push(P.replyKeys(term, vocabularyText(facts.vocabulary)))
  return lines
}

/** Combien des identifiants vus dans une recherche ont un lien numéroté dans le menu (DRV-647) : les identifiants manquants, 8 au plus. */
export function menuCoverage(
  seen: readonly number[],
  linked: readonly number[],
): { found: number; seen: number; missing: number[] } {
  const known = new Set(linked)
  const missing = seen.filter((id) => !known.has(id))
  return { found: seen.length - missing.length, seen: seen.length, missing: missing.slice(0, 8) }
}

function coverageLine(
  kind: 'Rayons' | 'Familles',
  term: string,
  seen: readonly number[],
  linked: readonly number[],
): string {
  if (linked.length === 0) return P.coverageNone(kind, term)
  const { found, missing } = menuCoverage(seen, linked)
  return P.coverage(kind, term, found, seen.length, missing.join(', '))
}

const SOURCE_FIELDS: Record<NonNullable<AisleLabelSource>, string> = {
  FILTER: 'objFiltreBloc.sLibelle',
  URL: 'sUrlVoirRayon',
  FACET: 'objet de filtre de la réponse ou de la page',
}

const LEVEL_TEXT: Record<AisleLevel, { one: string; level: string }> = {
  RAYON: { one: 'du rayon', level: 'rayon' },
  FAMILLE: { one: 'de la famille', level: 'famille' },
}

const shownText = (shown: ShownText): string =>
  shown.kind === 'ABSENT' ? P.absent : shown.kind === 'HIDDEN' ? P.hidden : `« ${shown.text} »`

const namedKeysText = (keys: NamedObjectKeys | null | undefined): string =>
  keys === null || keys === undefined
    ? P.absent
    : `${keys.kind === 'LIST' ? P.listOf(keys.size ?? 0) : P.object} ; ${keys.total} clés : ${keysText(keys.keys)}`

/** « Produit échantillon de « tomate » : iIdRayon=… iIdFamille=… ; objFiltreBloc (…) : … ; sUrlVoirRayon : … ; sCategorie=… ». */
function sampleLine(term: string, sample: AisleSample): string {
  const { filter, url } = sample
  const filterText =
    filter === null
      ? P.absent
      : P.sampleFilter(
          filter.path === 'PRODUCT' ? P.inProduct : P.inElement,
          shownText(filter.label),
          filter.block,
          filter.type,
        )
  const urlText =
    url === null
      ? P.absent
      : P.sampleUrl(
          url.id,
          url.level === null ? null : LEVEL_TEXT[url.level].level,
          shownText(url.name),
        )
  return P.sample(
    term,
    sample.aisle,
    sample.family,
    filterText,
    urlText,
    shownText(sample.category),
  )
}

/**
 * Le relevé DRV-647 : pour chaque recherche d'essai mesurée, le niveau retenu (rayon ou famille) et pourquoi, le libellé de chaque groupe le plus fourni et sa
 * source, des produits échantillons aux paires (rayon, famille) distinctes ; puis les textes du premier produit, les objets de filtre de la réponse, les NOMS
 * des clés d'un `objFiltreBloc` et de `objNavigationRayonFamille`.
 */
function labelLines(probes: ProbeFacts): string[] {
  const lines: string[] = []
  for (const { term, products, grouping, samples } of probes.aisleLabels ?? []) {
    lines.push(
      P.aisleLevel(
        term,
        LEVEL_TEXT[grouping.level].level,
        grouping.coverage.RAYON,
        grouping.coverage.FAMILLE,
        products,
      ),
    )
    let rank = 0
    for (const { id, label, count, source } of grouping.choices) {
      const one = LEVEL_TEXT[grouping.level].one
      lines.push(
        label === null || source === null
          ? P.aisleLabelNone(one, id, count, S.picker.aisleFallback(++rank))
          : P.aisleLabel(one, id, count, label, SOURCE_FIELDS[source]),
      )
    }
    for (const sample of samples) lines.push(sampleLine(term, sample))
  }
  const facts = probes.reply?.facts
  if (facts && probes.reply) {
    const { term } = probes.reply
    if (facts.firstAisleTexts) {
      const { navigate, url, category } = facts.firstAisleTexts
      lines.push(P.firstAisleText(term, 'sLibelleUrlNaviguerRayon', shownText(navigate)))
      lines.push(P.firstAisleText(term, 'sUrlVoirRayon', shownText(url)))
      lines.push(P.firstAisleText(term, 'sCategorie', shownText(category)))
    }
    if (facts.filterBlock !== undefined) {
      lines.push(
        P.namedKeys(`réponse « ${term} »`, 'objFiltreBloc', namedKeysText(facts.filterBlock)),
      )
    }
    for (const [index, facet] of (facts.facets ?? []).entries()) {
      lines.push(
        P.facet(
          term,
          index + 1,
          `${facet.total} clés : ${keysText(facet.keys)}`,
          facet.ids.length === 0
            ? P.absent
            : facet.ids.map(({ name, value }) => `${name}=${value}`).join(' '),
          shownText(facet.label),
          shownText(facet.block),
        ),
      )
    }
    if (facts.pageNavigation !== undefined) {
      lines.push(
        P.namedKeys('page', 'objNavigationRayonFamille', namedKeysText(facts.pageNavigation)),
      )
    }
  }
  return lines
}

/** « « Fruits et légumes » » ou « (sans libellé) » : un libellé de facette rendu sûr par l'adaptateur. */
const facetLabel = (label: string | null): string => (label === null ? F.noLabel : `« ${label} »`)

const matchText = (id: number | null, match: FacetMatch | null): string =>
  `${id ?? '?'} → ${match === null ? F.noMatch : F.match(match.id, facetLabel(match.label), match.depth === 0 ? F.top : F.child)}`

const countKeysText = (keys: readonly CountKey[]): string =>
  keys.length === 0
    ? F.none
    : keys.map(({ name, values, count }) => `${name}=${values.join('|')} (×${count})`).join(', ')

const universesText = (list: readonly { value: number; count: number }[]): string =>
  list.length === 0 ? P.absent : list.map(({ value, count }) => `${value} ×${count}`).join(', ')

/** Les lignes d'une forme essayée (0.37.0) : la réponse et sa cohérence, ses groupes, son premier produit, et (0.38.0) ses produits par liste. */
function attemptLines(attempt: ProbeAttempt, target: string): string[] {
  const lines: string[] = []
  const head = F.formHead(
    F.formRank[attempt.form] ?? '?',
    F.formName[attempt.form] ?? attempt.form,
    attempt.value,
    target,
  )
  const result = attempt.coherence
  lines.push(
    attempt.status === null || result === null
      ? `${head}${F.probeFault(attempt.fault ?? 'EXCEPTION')}`
      : `${head}${F.formReply(
          attempt.status,
          attempt.before,
          attempt.total,
          attempt.references,
          attempt.products,
          result.share === null ? F.noChildren : `${Math.round(result.share * 100)} %`,
          result.valid ? F.valid : F.invalid,
          own(F.reason, result.reason) ?? result.reason,
        )}`,
  )
  for (const family of attempt.families) {
    lines.push(F.formGroup(family.label === null ? F.noLabel : `« ${family.label} »`, family.count))
  }
  if (attempt.first !== null) {
    lines.push(
      F.formFirst(`« ${attempt.first.label ?? F.noLabel} »`, attempt.first.fresh ? P.yes : P.no),
    )
  }
  if (attempt.lists !== undefined && attempt.lists.length > 0) {
    lines.push(
      F.formLists(attempt.lists.map(({ name, products }) => `${name} ${products}`).join(', ')),
    )
  }
  return lines
}

/** Les lignes des listes de produits d'une réponse (DRV-647, 0.38.0) : la somme face au total et à la facette, puis chaque liste et ses libellés. */
function listLines(term: string, report: ProductListsReport): string[] {
  const fresh = report.freshFacet
  const lines = [
    F.listsHead(
      term,
      report.total,
      report.sum,
      fresh === null
        ? F.noFreshFacet
        : F.freshFacet(
            facetLabel(fresh.label),
            fresh.references,
            fresh.children
              .map((child) => `${facetLabel(child.label)} ${child.references ?? '?'}`)
              .join(', '),
          ),
    ),
  ]
  for (const list of report.lists) {
    lines.push(
      F.list(
        list.name,
        term,
        list.kind === 'LIST' ? P.listOf(list.size ?? 0) : P.object,
        keysText(list.keys),
        list.occurrences,
        list.products,
        list.unread.span,
        list.unread.noLabel,
        list.aisles.length === 0
          ? F.none
          : list.aisles.map(({ id, count }) => `${id}:${count}`).join(' '),
        list.families.length === 0
          ? F.none
          : list.families
              .map(({ id, label, count }) => `${label === null ? id : `« ${label} »`} (${count})`)
              .join(', '),
        list.fresh ? P.yes : P.no,
      ),
    )
    if (list.labels.length > 0) {
      lines.push(
        F.listLabels(list.name, term, list.labels.map((label) => `« ${label} »`).join(' ; ')),
      )
    }
  }
  return lines
}

/**
 * Le relevé de la facette « Rayons » (DRV-647, agent 0.35.0) pour la première recherche d'essai : les blocs de filtre, les valeurs du bloc « Rayons », la valeur
 * « fruits / légumes », la correspondance des produits échantillons, la forme du paramètre `Filtres`, la recherche filtrée sondée, la pagination et les univers.
 */
function facetLines(term: string, facets: FacetExploration): string[] {
  const lines: string[] = []
  if (facets.blocs.length === 0) lines.push(F.noBlocs(term))
  for (const bloc of facets.blocs)
    lines.push(F.bloc(term, bloc.id, facetLabel(bloc.label), bloc.values))
  const rayons = facets.aisleBloc
  if (rayons === null) lines.push(F.noAisleBloc(term))
  else {
    for (const value of rayons.values) {
      const extra =
        value.childLabels === undefined
          ? ''
          : F.firstExtra(
              value.urlId === null || value.urlId === undefined ? P.absent : `« ${value.urlId} »`,
              value.urlHasId === true ? P.yes : P.no,
              value.childLabels.length === 0
                ? F.none
                : value.childLabels.map(facetLabel).join(', '),
            )
      lines.push(
        F.value(facetLabel(value.label), value.id, value.references, value.children) + extra,
      )
    }
    if (rayons.total > rayons.values.length) lines.push(F.more(rayons.total - rayons.values.length))
  }
  lines.push(
    facets.fresh.length === 0
      ? F.noFresh
      : F.fresh(
          facets.fresh
            .map(({ id, label, references, depth }) =>
              F.freshItem(facetLabel(label), id, references, depth === 0 ? F.top : F.child),
            )
            .join(' ; '),
        ),
  )
  for (const sample of facets.samples) {
    lines.push(
      F.sample(
        term,
        matchText(sample.aisle, sample.aisleMatch),
        matchText(sample.family, sample.familyMatch),
      ),
    )
  }
  for (const [where, found] of [
    [F.inPage, facets.links.page],
    [F.inReply(term), facets.links.reply],
  ] as const) {
    lines.push(F.links(where, found.count))
    for (const { shape, count } of found.shapes) lines.push(F.linkShape(where, count, shape))
  }
  lines.push(F.urlIds(facets.urlIdShapes.length === 0 ? P.absent : facets.urlIdShapes.join(' ; ')))
  const { template, probe } = facets
  lines.push(
    'miss' in template
      ? F.templateMiss(own(F.miss, template.miss) ?? template.miss)
      : F.template(template.shape, template.kind === 'URL_ID' ? 'sIdValeurUrl' : 'iIdValeur'),
  )
  if ('skipped' in probe)
    lines.push(F.probeSkipped(term, own(F.miss, probe.skipped) ?? probe.skipped))
  else {
    const target = facetLabel(probe.target.label)
    for (const attempt of probe.attempts) lines.push(...attemptLines(attempt, target))
    lines.push(F.address(probe.address ?? P.absent))
    lines.push(
      probe.retained === null
        ? F.retainedNone
        : F.retained(
            F.formRank[probe.retained] ?? '?',
            F.formName[probe.retained] ?? probe.retained,
          ),
    )
    // Aucune forme valide : ce qui pourrait dire la bonne (des formes seulement), pour la prochaine mesure.
    if (probe.retained === null) lines.push(F.noneHint)
    // La valeur « fruits / légumes » sondée avec la forme retenue (0.38.0) : d'où viennent ses produits.
    if (facets.freshProbe) {
      lines.push(F.freshProbe(facetLabel(facets.freshProbe.target.label)))
      for (const attempt of facets.freshProbe.attempts) {
        lines.push(...attemptLines(attempt, facetLabel(facets.freshProbe.target.label)))
      }
    }
  }
  lines.push(F.pagination(F.inReply(term), countKeysText(facets.pagination.reply)))
  lines.push(F.pagination(F.inPage, countKeysText(facets.pagination.page)))
  lines.push(F.universes(F.inReply(term), universesText(facets.universes.reply)))
  lines.push(F.universes(F.inPage, universesText(facets.universes.page)))
  return lines
}

/** Le relevé DRV-647 : menu de la page, structure de la réponse, et correspondance des rayons de la première recherche d'essai avec le menu. */
function aisleSourceLines(probes: ProbeFacts): string[] {
  const lines: string[] = [
    ...(probes.productLists ?? []).flatMap(({ term, report }) => listLines(term, report)),
    ...(probes.facets ? facetLines(SHELF_TERMS[0], probes.facets) : []),
    ...labelLines(probes),
  ]
  if (probes.aisleMenu) lines.push(...menuLines(probes.aisleMenu))
  if (probes.reply) lines.push(...replyLines(probes.reply.term, probes.reply.facts))
  const first = probes.shelves?.[0]
  if (probes.aisleMenu && first?.aisleIds && first.familyIds && first.aisleIds.length > 0) {
    lines.push(coverageLine('Rayons', first.term, first.aisleIds, probes.aisleMenu.aisleIds))
    lines.push(coverageLine('Familles', first.term, first.familyIds, probes.aisleMenu.familyIds))
  }
  return lines
}

/**
 * Les lignes des sondes du rapport (vide si rien n'a été relevé). `aisleSource: false` laisse de côté le relevé DRV-647 (menu des rayons, structure de
 * la réponse) : le test automatique, dont le rapport est borné à 20 000 caractères, ne le reprend pas ; il est au diagnostic.
 */
export function probeLines(
  probes: ProbeFacts | null | undefined,
  {
    aisleSource = true,
    siteDomain = '',
  }: { aisleSource?: boolean; siteDomain?: string | undefined } = {},
): string[] {
  if (!probes) return []
  const lines: string[] = []
  const {
    arrival,
    common,
    nonsense,
    availability,
    lastPass,
    lastRefusals,
    shelves,
    shelvesSkipped,
  } = probes
  if (arrival) {
    // Le suffixe de ville, le chemin de recherche, la page du panier et le point de livraison sont des faits de l'adresse de Leclerc : une enseigne dont le
    // magasin ne s'y lit pas (DRV-717) ne les a pas, et le rapport ne les invente pas.
    const inAddress = arrival.delivery !== undefined
    lines.push(P.address(arrival.address))
    if (inAddress) lines.push(P.city(cityOf(arrival.address)))
    if (inAddress) lines.push(P.searchBase(arrival.searchBase ?? null))
    if (arrival.cookies)
      lines.push(P.cookies(arrival.cookies.count, yesNo(arrival.cookies.antiBot)))
    lines.push(P.arrival(arrival.redirects, arrival.status))
    if (arrival.storeRead) lines.push(storeReadLine(arrival.storeRead))
    if (arrival.entry) {
      lines.push(startLine(arrival.entry.start, arrival.entry.clickable, siteDomain))
    }
    if (inAddress) lines.push(P.basketPage(cityOf(arrival.address)))
    if (arrival.mobile) {
      const { serverHost, links, oldBasketQuestion, session } = arrival.mobile
      lines.push(P.mobile(serverHost, links, yesNo(oldBasketQuestion), session))
    }
    if (arrival.delivery) {
      lines.push(
        P.delivery(P.inPage, yesNo(arrival.delivery.read), yesNo(arrival.delivery.sameAsAddress)),
      )
    }
  }
  if (probes.foreground) lines.push(P.foreground(probes.foreground))
  if (common) lines.push(...searchLines(common))
  // Les rayons juste après la recherche du mot courant, pas après les clés et les en-têtes.
  if (shelvesSkipped !== undefined) lines.push(P.shelvesSkipped(shelvesSkipped))
  for (const shelf of shelves ?? []) lines.push(...shelfLines(shelf))
  if (aisleSource) lines.push(...aisleSourceLines(probes))
  if (availability) {
    lines.push(P.availability(availability))
    const values =
      availability.labels.length === 0
        ? P.unknown
        : availability.labels.map(({ value, count }) => `${value} : ${count}`).join(', ')
    lines.push(P.availabilityLabels(values, availability.noLabel, availability.comingSoon))
  }
  if (lastPass && lastPass.length > 0) {
    lines.push(
      P.lastPass(
        lastPass
          .map(({ reason, tried }, index) => P.lastPassItem(index + 1, P.reason[reason], tried))
          .join(' ; '),
      ),
    )
  }
  if (lastRefusals && lastRefusals.length > 0) {
    lines.push(
      P.lastRefusals(
        lastRefusals
          .map(({ reason, stock, availability: label }, index) =>
            P.lastRefusalItem(index + 1, P.refusal[reason], stock, label),
          )
          .join(' ; '),
      ),
    )
  }
  if (nonsense) {
    lines.push(...searchLines(nonsense))
    const facts = nonsense.facts
    if (facts) {
      // Les signes de Leclerc (point de livraison, connexion, clés de l'état embarqué) : une enseigne dont la page n'en a pas ne les rapporte pas (DRV-724).
      if (facts.delivery) {
        lines.push(
          P.delivery(
            P.inReply(nonsense.term),
            yesNo(facts.delivery.read),
            yesNo(facts.delivery.sameAsAddress),
          ),
        )
      }
      if (facts.session !== undefined) lines.push(P.session(nonsense.term, facts.session))
      if (facts.keys) {
        lines.push(
          P.keys(nonsense.term, {
            total: facts.keys.total,
            present: facts.keys.present,
            absent: facts.keys.absent,
            session: facts.keys.session,
          }),
        )
      }
      lines.push(P.headers(nonsense.term, facts.headers))
    }
  }
  lines.push(...cartLines(probes.cart, probes.cartFailure))
  return lines.length === 0 ? [] : [P.title, ...lines.map((line) => ` - ${line}`)]
}

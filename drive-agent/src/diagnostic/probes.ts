// Les sondes du site réel dans le diagnostic (ticket B de l'audit du 2026-10-18). Ce fichier met en phrases ce que l'adaptateur a relevé
// (`leclerc/probe.ts`) : des FORMES (motifs d'adresse), des NOMS (clés, en-têtes, signes), des NOMBRES (codes HTTP, produits, longueurs) et des
// mots fixes. Jamais une valeur du site : un libellé, un cookie, un numéro de magasin, une ville, une adresse. Les phrases sont dans `ui/strings.ts`.
import type {
  ArrivalFacts,
  AttemptFacts,
  Candidate,
  LeclercCause,
  LeclercErrorCode,
  LinkFacts,
  SearchFacts,
} from '../leclerc'
import type { LastReason, LastRefusal } from '../flow'
import { own } from '../own'
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
  /** La disponibilité lue sur la recherche courante (DRV-635). */
  availability?: AvailabilityFacts | null
  /** Les rayons vus par les recherches d'essai (DRV-646), dans l'ordre de `SHELF_TERMS`. */
  shelves?: readonly ShelfFacts[]
  /** Pourquoi les rayons n'ont pas été lus (DRV-646) : un motif fixe. */
  shelvesSkipped?: string
  /** Pourquoi le dernier envoi n'a pas mis des produits habituels au panier (DRV-635), dans l'ordre du passage. */
  lastPass?: readonly LastReason[]
  /** Ce que le panier a répondu aux produits choisis qu'il n'a pas pris, au dernier envoi (DRV-644). */
  lastRefusals?: readonly LastRefusal[]
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

/** « BLOCKED, HTTP 403 » ou « CONTRACT_CHANGED (HTTP_400) » : le code d'erreur, sa cause et le code HTTP s'il y en a un. */
export function faultText(fault: {
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

/** La ligne « Commencer mes courses » : absent, bouton cliquable (le vrai site, DRV-629), ou lien avec la forme de son adresse et où il mène. */
function startLine(link: LinkFacts, clickable: boolean): string {
  if (!link.present || link.shape === null) return P.start(link.present, clickable)
  return P.link(P.startLink, {
    present: true,
    shape: link.shape,
    where: link.where === null ? null : (own(P.where, link.where) ?? null),
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
  if (facts.phrases.length > 0) lines.push(P.phrases(facts.phrases.join(', ')))
  return lines
}

const groupsText = (groups: readonly ShelfGroup[]) =>
  groups.length === 0 ? P.unknown : groups.map(({ id, count }) => `${id}:${count}`).join(' ')

/** Le détail de la ligne de contrôle « Rayons vus » : « tomate 15:2 41:1 (203 produits) ; pomme … », trois groupes au plus par mot. */
export function shelvesRowDetail(shelves: readonly ShelfFacts[]): string {
  return shelves
    .map((shelf) =>
      shelf.products === null
        ? `${shelf.term} non faite`
        : `${shelf.term} ${groupsText(shelf.aisles.slice(0, 3))} (${shelf.products} produit${shelf.products > 1 ? 's' : ''})`,
    )
    .join(' ; ')
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

/** Les lignes des sondes du rapport (vide si rien n'a été relevé). */
export function probeLines(probes: ProbeFacts | null | undefined): string[] {
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
    lines.push(P.address(arrival.address))
    lines.push(P.city(cityOf(arrival.address)))
    lines.push(P.searchBase(arrival.searchBase ?? null))
    if (arrival.cookies)
      lines.push(P.cookies(arrival.cookies.count, yesNo(arrival.cookies.antiBot)))
    lines.push(P.arrival(arrival.redirects, arrival.status))
    if (arrival.entry) {
      lines.push(startLine(arrival.entry.start, arrival.entry.clickable))
    }
    lines.push(P.basketPage(cityOf(arrival.address)))
    lines.push(
      P.delivery(P.inPage, yesNo(arrival.delivery.read), yesNo(arrival.delivery.sameAsAddress)),
    )
  }
  if (common) lines.push(...searchLines(common))
  // Les rayons juste après la recherche du mot courant, pas après les clés et les en-têtes.
  if (shelvesSkipped !== undefined) lines.push(P.shelvesSkipped(shelvesSkipped))
  for (const shelf of shelves ?? []) lines.push(...shelfLines(shelf))
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

// Les types du protocole v1 (architecture.md § 8 du dépôt back). Les schémas JSON (`*.schema.json`) disent la même chose ; le test de
// conformité (`drive-agent/test/protocol-schemas.spec.ts`) vérifie qu'ils donnent le même verdict que les validateurs de `validate.ts`.

/** La version du protocole : le champ `v` de chaque message. */
export const PROTOCOL_VERSION = 1

/** Les bornes du protocole, vérifiées des deux côtés. */
export const LIMITS = {
  /** Taille maximale d'un message une fois décodé (64 Ko). */
  messageBytes: 64 * 1024,
  /** Lignes d'un plan ou d'un résultat. */
  lines: 100,
  /** Produits classés par priorité d'une ligne. */
  products: 5,
  /** Produits refusés d'une ligne. */
  rejected: 20,
  /** Produits indisponibles d'une ligne `ADDED` (le produit mis au panier n'en fait pas partie). */
  unavailableAdded: 4,
  /** Nombre de produits à mettre au panier. */
  packsMax: 99,
  /** Libellés, noms et requêtes (en caractères). */
  label: 255,
  /** Symbole de l'unité d'une quantité demandée (« g », « paquet »), en caractères. */
  unitSymbol: 32,
  /** Quantité demandée (et facteur d'unité), dans l'unité de la ligne. */
  quantity: 1_000_000,
  /** Message d'une erreur (en caractères). */
  errorMessage: 200,
  /** Rapport du test automatique (en caractères, DRV-318). */
  selftestReport: 20_000,
  /** Prix, en centimes (un million d'euros). */
  cents: 100_000_000,
  /** Un compteur de requêtes, d'erreurs ou de blocages d'un passage (ticket L). */
  requests: 100_000,
  /** Rayons conseillés pour une ligne du plan (DRV-642), du plus choisi au moins choisi. */
  rayonHints: 3,
  /** La recherche mémorisée d'un produit choisi (DRV-650), en POINTS DE CODE (pas en unités UTF-16) : de 2 à 80 caractères. Les bornes du back. */
  searchQueryMin: 2,
  searchQueryMax: 80,
  /** Un identifiant de rayon ou de famille de l'enseigne (DRV-642) : un entier de 1 à cette valeur (le plus grand entier 32 bits). */
  catalogId: 2_147_483_647,
  /**
   * La contenance d'un produit dans l'unité de la liste (DRV-652) : un nombre de 0,001 à 9 999, trois décimales au plus. Les bornes du back
   * (`PackSize`) : une valeur hors de ces bornes fait refuser TOUT le lot de choix (`422 DRIVE_PACK_SIZE_INVALID`).
   */
  packSizeMin: 0.001,
  packSizeMax: 9_999,
  packSizeDecimals: 3,
  /** Le slug d'une unité de Repas (`needed.unitSlug`, `packSize.unitSlug`), en caractères : `^[a-z0-9-]{1,255}$`. */
  unitSlug: 255,
} as const

/** Le seul chemin de retour permis, sur l'origine de Repas écrite en dur dans l'agent. */
export const RETURN_PATH = '/drive/retour'

export const ERROR_CODES = [
  'NOT_LOGGED_IN',
  'STORE_MISMATCH',
  'BLOCKED',
  'CONTRACT_CHANGED',
  'NETWORK',
  'CANCELLED',
  'INVALID_MESSAGE',
  'UNSUPPORTED_PAGE',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const CONTENT_UNITS = ['g', 'kg', 'ml', 'cl', 'l', 'piece'] as const
/** L'unité d'un contenu net : `g`, `ml` et `piece` sont les unités normalisées de l'agent. */
export type ContentUnit = (typeof CONTENT_UNITS)[number]

export const MEASURE_UNITS = ['kg', 'l', 'piece'] as const
/** L'unité d'un prix par mesure. */
export type MeasureUnit = (typeof MEASURE_UNITS)[number]

export const LINE_STATUSES = ['KNOWN', 'NEW', 'HAVE_AT_HOME', 'SKIP'] as const
export type LineStatus = (typeof LINE_STATUSES)[number]

export const PACKS_STATUSES = ['COMPUTED', 'TO_CHECK'] as const
export type PacksStatus = (typeof PACKS_STATUSES)[number]

export const DIMENSIONS = ['WEIGHT', 'VOLUME', 'COUNT', 'PACKAGE'] as const
/** La dimension d'une unité de la liste : un poids, un volume, un nombre de pièces ou un nombre de produits (« 2 paquets »). */
export type Dimension = (typeof DIMENSIONS)[number]

export const PLACEMENTS = ['PRIMARY', 'FALLBACK', 'ONCE'] as const
export type Placement = (typeof PLACEMENTS)[number]

export const OUTCOMES = ['completed', 'partial', 'aborted', 'error'] as const
export type Outcome = (typeof OUTCOMES)[number]

export const LINE_OUTCOMES = [
  'ADDED',
  'CHOSEN',
  'HAVE_AT_HOME',
  'SKIPPED',
  'UNAVAILABLE',
  'FAILED',
] as const
export type LineOutcome = (typeof LINE_OUTCOMES)[number]

/** Un contenu net : `1000 g`, `6 piece`. */
export interface ProductContent {
  value: number
  unit: ContentUnit
}

/** Un produit désigné par son identifiant chez l'enseigne et son libellé. */
export interface ProductRef {
  id: string
  label: string
}

/** Un produit accepté d'une ligne `KNOWN`, avec ses propres `packs` (les contenus diffèrent d'un produit à l'autre). */
export interface PlanProduct extends ProductRef {
  content?: ProductContent
  packs?: number | null
  packsStatus?: PacksStatus | null
  /**
   * Facultatif (DRV-652) : la contenance que la personne a donnée pour CE produit, dans l'unité de la ligne (`needed.unitSlug`) ; `null` quand elle n'a rien
   * répondu. Quand elle est là, `packs` est déjà calculé avec elle (`COMPUTED`) et l'agent ne pose pas la question. Un récepteur qui ne connaît pas la clé rejette
   * le plan : le site ne l'envoie qu'à une application dont l'agent est de la version 0.42.0 ou plus (`PACK_SIZE_APP_VERSION`).
   */
  packSize?: PackSize | null
}

/** Combien d'unités de la liste (`unitSlug`, « tranche ») tiennent dans un produit : « 20 tranches » est `{value: 20, unitSlug: 'tranche'}`. */
export interface PackSize {
  /** De `LIMITS.packSizeMin` à `LIMITS.packSizeMax`, trois décimales au plus. */
  value: number
  /** Le slug de l'unité de la ligne du plan (`needed.unitSlug`), jamais déduit d'un symbole ni d'un libellé. */
  unitSlug: string
}

/**
 * Ce que la liste demande pour un ingrédient, dans l'unité de la ligne (« 800 g »). `dimension` et `baseFactor` (le facteur de l'unité
 * vers l'unité de base : 1 pour le gramme, 1000 pour le kilo) permettent à l'agent de calculer le nombre de produits d'un produit qu'il
 * ne connaissait pas (phase B, même formule que `PackCalculator` du dépôt back) ; absents, il demande la quantité à l'utilisateur.
 */
export interface NeededQuantity {
  quantity: number
  unitSymbol: string
  dimension?: Dimension | null
  baseFactor?: number | null
  /**
   * Facultatifs (DRV-652), les deux ou aucun : le slug de l'unité de la ligne et son nom au singulier (« tranche »), de quoi demander « Combien de tranches y
   * a-t-il dans ce produit ? » sans rien deviner du symbole. Absents d'un back plus ancien ou d'une application qui ne les connaît pas : l'agent demande alors
   * le nombre de produits. Un récepteur qui ne connaît pas ces clés rejette le plan (même règle que `rayonHints`).
   */
  unitSlug?: string
  unitName?: string
}

export interface PlanLine {
  ingredientSlug: string
  name: string
  status: LineStatus
  products?: PlanProduct[]
  rejected?: ProductRef[]
  searchQuery?: string
  replaces?: ProductRef
  needed?: NeededQuantity
  /**
   * Facultatif (DRV-642) : les rayons de l'enseigne où l'on prend d'habitude cet ingrédient (0 à 3 identifiants, du plus choisi au moins
   * choisi). Ils servent à ranger la liste de produits de l'écran de choix (ceux de ces rayons d'abord, aucun n'est caché) ; absents ou
   * vides, la liste garde l'ordre du site. Un récepteur qui ne connaît pas la clé rejette le plan.
   */
  rayonHints?: number[]
}

export interface StoreRef {
  id: string
  host: string
}

interface MessageHead {
  v: typeof PROTOCOL_VERSION
  runId: string
  retailer: 'leclerc'
  store: StoreRef
  returnPath: typeof RETURN_PATH
}

/** Repas vers l'agent : la liste à mettre au panier. */
export interface PlanMessage extends MessageHead {
  type: 'plan'
  lines: PlanLine[]
}

/**
 * Repas vers l'agent : « lis le magasin courant et renvoie-le ». Sans `store`, Repas ne connaît pas encore le magasin (DRV-320) :
 * l'agent lit celui de la page. Avec un `store`, la page doit être celle de ce magasin (sinon `STORE_MISMATCH`).
 */
export interface SetupMessage extends Omit<MessageHead, 'store'> {
  type: 'setup'
  store?: StoreRef
}

/** Prix d'un produit en centimes, avec le prix à l'unité de mesure quand l'agent l'a lu (décision D22). */
export interface ProductPrice {
  cents: number
  perMeasure?: { cents: number; unit: MeasureUnit }
}

/** Un produit refusé par l'utilisateur, avec de quoi le mémoriser. */
export interface RejectedProduct extends ProductRef {
  ean?: string | null
  content?: ProductContent
}

/** Le produit choisi par l'utilisateur sur le site. */
export interface ChosenProduct extends RejectedProduct {
  price?: ProductPrice
  /**
   * Facultatifs (DRV-642) : le rayon et la famille du produit chez l'enseigne (des faits du catalogue, pas de donnée de personne). Repas
   * en apprend dans quel rayon on prend d'habitude chaque ingrédient. Absents quand le site ne les donne pas, et chez les agents d'avant.
   */
  rayonId?: number
  familyId?: number
}

interface LineBase {
  ingredientSlug: string
  /** Les produits que l'utilisateur a choisi de ne plus jamais prendre. */
  rejected?: RejectedProduct[]
}

/**
 * Un produit connu a été mis au panier ; `usedRank` 1 = le préféré. `price` est le prix lu sur le site pendant le passage : Repas
 * rafraîchit ainsi le prix mémorisé du produit (décision D22).
 */
export interface AddedLine extends LineBase {
  outcome: 'ADDED'
  productId: string
  quantity: number
  usedRank: number
  unavailableIds?: string[]
  price?: ProductPrice
  /**
   * Facultatif (DRV-652) : la contenance du produit mis au panier dans l'unité de la ligne, donnée par la personne à l'écran « Vérifie la quantité » (le plan
   * ne savait pas calculer le nombre de produits). Absente quand elle a répondu par le nombre de produits ou qu'il n'y avait rien à demander. Repas la mémorise
   * pour ne plus poser la question. Un récepteur qui ne connaît pas la clé rejette le résultat.
   */
  packSize?: PackSize
}

/** L'utilisateur a choisi un produit sur le site, ajouté au panier. */
export interface ChosenLine extends LineBase {
  outcome: 'CHOSEN'
  product: ChosenProduct
  quantity: number
  placement: Placement
  /**
   * Facultatif (DRV-650) : la recherche qui a fait apparaître le produit choisi sur le site de l'enseigne (le texte du plan, ou celui que la personne a
   * tapé dans « Chercher autre chose »), de 2 à 80 caractères, déjà nettoyée. Émise seulement quand le produit est placé en `PRIMARY` ou `ONCE` ET que cette
   * recherche diffère de la `searchQuery` de la ligne du plan (sinon la valeur mémorisée par Repas est gardée). Repas la mémorise pour l'enseigne et le
   * magasin du passage, afin de chercher un remplaçant avec elle quand le produit n'est plus disponible. Absente chez les agents d'avant.
   * DRV-653 : pour un produit pris « Pas mon habituel » (`ONCE`), le produit n'est pas retenu mais la recherche qui l'a fait trouver l'est (Repas la mémorise
   * seule, sans produit : intention `NOTE_SEARCH`).
   */
  searchQuery?: string
  /**
   * Facultatif (DRV-652) : la contenance du produit choisi dans l'unité de la ligne, donnée par la personne à l'écran « Vérifie la quantité ». Émise seulement
   * pour un produit retenu (`PRIMARY`), jamais pour « Pas mon habituel » (`ONCE`) : rien n'est gardé de ce produit. Absente quand elle a répondu par le
   * nombre de produits, et chez les agents d'avant.
   */
  packSize?: PackSize
  unavailableIds?: string[]
}

export interface UnavailableLine extends LineBase {
  outcome: 'UNAVAILABLE'
  unavailableIds?: string[]
}

/** « J'en ai toujours » ou « passer cette fois » : rien n'a été mis au panier. */
export interface SettledLine extends LineBase {
  outcome: 'HAVE_AT_HOME' | 'SKIPPED'
}

export interface FailedLine extends LineBase {
  outcome: 'FAILED'
  error: ErrorCode
}

export type ResultLine = AddedLine | ChosenLine | UnavailableLine | SettledLine | FailedLine

export interface ResultError {
  code: ErrorCode
  message: string
}

/**
 * Les compteurs d'un passage (ticket L de l'audit du 2026-10-18) : des nombres, jamais une adresse ni un contenu. `requests` : les requêtes envoyées au
 * site, reprises comprises ; `errors` : celles qui n'ont pas eu de réponse (réseau, délai d'attente) ou une réponse 4xx ou 5xx hors refus ;
 * `blocks` : les refus de l'anti-robot (403, 429, page de défi). Cumulés sur tout le passage, même repris après un rechargement.
 */
export interface ResultStats {
  requests: number
  errors: number
  blocks: number
}

/** Agent vers Repas : ce qui a été mis au panier. */
export interface ResultMessage {
  v: typeof PROTOCOL_VERSION
  type: 'result'
  runId: string
  agentVersion: string
  outcome: Outcome
  /** Absent seulement quand un `setup` sans magasin (DRV-320) s'arrête avant que le magasin soit connu. */
  store?: { id: string }
  error?: ResultError
  /** Facultatif (ticket L) : absent d'un résultat où aucune requête n'est partie, et des agents d'avant. */
  stats?: ResultStats
  lines: ResultLine[]
}

/** Agent vers Repas : le magasin courant. */
export interface SetupResultMessage {
  v: typeof PROTOCOL_VERSION
  type: 'setup-result'
  runId: string
  agentVersion: string
  store: { id: string; host: string; baseUrl: string; label: string | null }
}

export const COMMANDS = ['diagnostic', 'selftest'] as const
/**
 * Une demande de l'application à l'agent, sans plan : `diagnostic` ouvre l'écran de diagnostic (DRV-308) ; `selftest` lance le test
 * automatique de la variante de débogage (DRV-318), que l'agent n'honore que si l'application a annoncé `debug: true`.
 */
export type Command = (typeof COMMANDS)[number]

/** Application vers l'agent : une commande (pas de plan, pas de magasin, pas de retour vers Repas). */
export interface CommandMessage {
  v: typeof PROTOCOL_VERSION
  type: 'command'
  command: Command
}

/** Agent vers l'application (variante de débogage seulement, DRV-318) : le rapport du test automatique, en texte à copier. */
export interface SelftestResultMessage {
  v: typeof PROTOCOL_VERSION
  type: 'selftest-result'
  /** Vrai : toutes les étapes sont réussies et le panier est revenu à son état initial. */
  ok: boolean
  agentVersion: string
  report: string
}

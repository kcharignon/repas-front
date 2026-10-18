// Ce que le test automatique (DRV-318) relève, étape par étape. Rien ici ne porte de donnée personnelle : des nombres, des codes
// d'erreur du protocole, des libellés de produits du catalogue nettoyés (`safeLabel`) et des mots de recherche fixes.
import type { LeclercErrorCode } from '../leclerc'
import type { CheckResult, PageFacts } from '../diagnostic'

export type Status = 'OK' | 'KO' | 'NOT_TESTED'

/** Ce qui a fait échouer une requête : le code d'erreur de l'adaptateur et le code HTTP quand il y en a un. */
export interface Failure {
  code: LeclercErrorCode | 'OTHER'
  http: number | null
}

/** Une recherche du lot. */
export interface WordResult {
  word: string
  status: Status
  /** Produits lus, dont le contenu net est lisible, dont le prix est lu. */
  found: number
  withContent: number
  withPrice: number
  ms: number
  failure?: Failure
}

/** Une écriture au panier : ajout, changement de quantité ou retrait. */
export interface WriteResult {
  /** La quantité voulue au panier. */
  wanted: number
  /** La quantité que le site dit avoir mise au panier, `null` si la réponse n'est pas venue. */
  obtained: number | null
  http: number | null
  ms: number
  /** Vrai : le site a mis au panier la quantité envoyée. */
  ok: boolean
  failure?: Failure
}

/** L'essai d'un ingrédient du passage. */
export interface ItemResult {
  word: string
  status: Status
  /** Le libellé du produit choisi, nettoyé et court. */
  label?: string
  /** Aucun produit ne remplissait les conditions du choix automatique. */
  noEligible?: boolean
  writes: WriteResult[]
  removal?: WriteResult
  failure?: Failure
}

/** L'état du panier lu : `null` pour ce que le site n'a pas dit. */
export interface CartState {
  items: number | null
  totalCents: number | null
}

export interface CompareResult {
  status: Status
  before: CartState
  /** Vrai : le nombre d'articles d'avant est déduit de la première réponse du panier (la page ne le portait pas). */
  beforeDerived: boolean
  after: CartState | null
  /** Les produits que le nettoyage n'a pas pu retirer (libellés), à retirer à la main. */
  leftovers: string[]
}

export interface SelftestData {
  agentVersion: string
  now: number
  durationMs: number
  page: PageFacts | null
  check: { status: Status; ms: number; results: CheckResult[] }
  store: { status: Status; ms: number; labelKnown?: boolean; failure?: Failure }
  words: WordResult[]
  items: ItemResult[]
  compare: CompareResult
  /** « Arrêter » touché pendant le test. */
  stopped: boolean
  /** Ce qui a arrêté le test : un blocage ou une erreur du site, ou trois recherches de suite sans résultat. */
  halt: Failure | 'REPEATED' | null
}

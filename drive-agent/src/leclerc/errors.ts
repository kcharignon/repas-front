import type { LeclercCause } from './causes'

/** Les erreurs de l'adaptateur Leclerc ; ce sont des codes d'erreur du protocole (`ErrorCode`). */
export type LeclercErrorCode =
  'NOT_LOGGED_IN' | 'BLOCKED' | 'CONTRACT_CHANGED' | 'NETWORK' | 'UNSUPPORTED_PAGE'

const MESSAGES: Record<LeclercErrorCode, string> = {
  NOT_LOGGED_IN: 'Tu n’es pas connecté au drive.',
  BLOCKED: 'Le site a refusé les requêtes (blocage anti-robot).',
  CONTRACT_CHANGED: 'Le site ne répond plus comme prévu.',
  NETWORK: 'Le site ne répond pas.',
  UNSUPPORTED_PAGE: 'Cette page n’est pas une page de magasin du drive.',
}

/**
 * Une erreur de l'adaptateur. Le message est un texte fixe : il ne contient jamais d'en-tête, de cookie ni de contenu de page
 * (le message part dans le résultat envoyé à Repas, et dans le journal de diagnostic).
 */
export class LeclercError extends Error {
  readonly code: LeclercErrorCode
  /** Le code HTTP de la réponse qui a causé l'erreur, `null` s'il n'y en a pas (erreur réseau, page hors magasin). Un nombre, jamais un texte. */
  readonly status: number | null
  /**
   * Quelle vérification a échoué (ticket A) : un code fixe (`SEARCH_NO_STATE`, `CART_NOT_JSON`, `HTTP_404`…), `null` quand le code d'erreur
   * suffit (blocage, erreur réseau). Jamais un morceau de page : la cause part dans le résultat et dans le diagnostic.
   */
  readonly cause: LeclercCause | null

  constructor(
    code: LeclercErrorCode,
    status: number | null = null,
    cause: LeclercCause | null = null,
  ) {
    super(MESSAGES[code])
    this.name = 'LeclercError'
    this.code = code
    this.status = status
    this.cause = cause
  }

  /** La même erreur avec le code HTTP de la réponse, pour le rapport (une erreur levée plus bas ne le connaît pas). */
  withStatus(status: number): LeclercError {
    return new LeclercError(this.code, status, this.cause)
  }
}

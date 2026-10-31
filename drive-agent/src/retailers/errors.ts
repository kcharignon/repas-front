import type { CartReplyFacts } from './cart-facts'
import type { RetailerCause } from './causes'

/** Les erreurs d'un adaptateur d'enseigne ; ce sont des codes d'erreur du protocole (`ErrorCode`). */
export type RetailerErrorCode =
  'NOT_LOGGED_IN' | 'BLOCKED' | 'CONTRACT_CHANGED' | 'NETWORK' | 'UNSUPPORTED_PAGE'

const MESSAGES: Record<RetailerErrorCode, string> = {
  NOT_LOGGED_IN: 'Tu n’es pas connecté au drive.',
  BLOCKED: 'Le site a refusé les requêtes (blocage anti-robot).',
  CONTRACT_CHANGED: 'Le site ne répond plus comme prévu.',
  NETWORK: 'Le site ne répond pas.',
  UNSUPPORTED_PAGE: 'Cette page n’est pas une page de magasin du drive.',
}

/** Le message d'une erreur réseau dont la cause est un délai d'attente dépassé (ticket K), quand l'adaptateur n'en donne pas un à son nom. */
const TIMEOUT_MESSAGE = 'Le site met trop de temps à répondre.'

/**
 * Une erreur de l'adaptateur d'une enseigne. Le message est un texte fixe : il ne contient jamais d'en-tête, de cookie ni de contenu de page
 * (le message part dans le résultat envoyé à Repas, et dans le journal de diagnostic).
 */
export class RetailerError extends Error {
  readonly code: RetailerErrorCode
  /** Le code HTTP de la réponse qui a causé l'erreur, `null` s'il n'y en a pas (erreur réseau, page hors magasin). Un nombre, jamais un texte. */
  readonly status: number | null
  /**
   * Quelle vérification a échoué (ticket A) : un code fixe (`SEARCH_NO_STATE`, `CART_NOT_JSON`, `HTTP_404`…), `null` quand le code d'erreur
   * suffit (blocage, erreur réseau). Jamais un morceau de page : la cause part dans le résultat et dans le diagnostic.
   */
  readonly cause: RetailerCause | null
  /**
   * La FORME de la réponse du panier qui a causé l'erreur (DRV-752) : code, type, taille, noms d'en-têtes, mots d'une liste fermée, jamais une valeur du site.
   * `null` quand l'erreur ne vient pas d'une réponse du panier.
   */
  readonly reply: CartReplyFacts | null

  /**
   * `message` : le texte fixe que l'adaptateur donne à une erreur (par exemple le délai d'attente dit avec le nom de l'enseigne) ; sans lui, le
   * texte du code. Un texte fixe aussi : jamais un morceau de réponse.
   */
  constructor(
    code: RetailerErrorCode,
    status: number | null = null,
    cause: RetailerCause | null = null,
    message?: string,
    reply: CartReplyFacts | null = null,
  ) {
    super(
      message ??
        (code === 'NETWORK' && cause === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : MESSAGES[code]),
    )
    this.name = 'RetailerError'
    this.code = code
    this.status = status
    this.cause = cause
    this.reply = reply
  }

  /** La même erreur avec le code HTTP de la réponse, pour le rapport (une erreur levée plus bas ne le connaît pas). */
  withStatus(status: number): RetailerError {
    return new RetailerError(this.code, status, this.cause, this.message, this.reply)
  }

  /** La même erreur avec la forme de la réponse qui l'a causée (DRV-752), sans rien changer d'autre. */
  withReply(reply: CartReplyFacts): RetailerError {
    return new RetailerError(this.code, this.status, this.cause, this.message, reply)
  }
}

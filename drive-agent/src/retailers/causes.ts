// La cause précise d'une erreur de l'adaptateur (ticket A de l'audit des hypothèses, 2026-10-18) : un code court qui dit QUELLE vérification
// a échoué, là où le code d'erreur du protocole (`CONTRACT_CHANGED`, `NOT_LOGGED_IN`…) ne distingue pas une dizaine de situations.
// Une cause est un code interne fixe : elle ne contient jamais un morceau de page, d'adresse, de cookie ni de libellé. Elle part dans le
// message du résultat (`error.message`) et dans le diagnostic ; l'interface de l'agent n'affiche que le conseil du code d'erreur.

import { own } from '../own'

/** Les causes fixes. Une réponse HTTP inattendue a sa propre forme : `HTTP_404`, `HTTP_401`… (voir `httpCause`). */
export const CAUSE_LABELS = {
  // La page de recherche.
  SEARCH_NO_STATE: 'page de recherche sans l’état embarqué du magasin',
  SEARCH_PRODUCTS_UNREADABLE: 'produits présents dans la page de recherche, mais illisibles',
  SEARCH_REDIRECTED: 'page de recherche remplacée par une autre page du site',
  // La réponse du panier.
  CART_NOT_JSON: 'réponse du panier qui n’est pas du JSON',
  CART_NO_EVENTS: 'réponse du panier sans liste d’évènements',
  CART_NO_CART_EVENT: 'réponse du panier sans évènement panier',
  CART_NO_PRODUCT_LIST: 'évènement panier sans liste de produits',
  CART_QUANTITY_UNREADABLE: 'quantité du produit illisible dans la réponse du panier',
  // La connexion.
  LOGIN_REDIRECT: 'redirection vers une page de connexion',
  LOGIN_FORM: 'page de connexion servie à la place de la réponse',
  SESSION_VISITOR: 'page d’un visiteur non connecté',
  // Les requêtes elles-mêmes (ticket K).
  REQUEST_TIMEOUT: 'le site n’a pas répondu dans le délai d’attente (20 s)',
  CHALLENGE: 'page de vérification de l’anti-robot (défi) servie à la place de la réponse',
  // La page courante.
  PAGE_HOST: 'la page n’est pas sur un site de l’enseigne',
  PAGE_PATH: 'l’adresse de la page n’est pas celle d’un magasin',
  PAGE_MOBILE: 'le site mobile (m-courses), pas la version ordinateur du site',
  // Les contrôles du diagnostic.
  SEARCH_COMMON_EMPTY: 'aucun produit pour le mot courant d’essai',
  SEARCH_FIELDS_INCOMPLETE: 'produits lus sans tous les champs attendus',
  CONTENT_UNREADABLE: 'contenu net illisible pour la plupart des produits',
  // Un incident imprévu de l'agent (jamais son message).
  EXCEPTION: 'incident imprévu de l’agent',
} as const

export type FixedCause = keyof typeof CAUSE_LABELS

/** Une réponse HTTP que l'agent n'attendait pas : `HTTP_404` (le code est un nombre, jamais un texte de la réponse). */
export type HttpCause = `HTTP_${number}`

export type RetailerCause = FixedCause | HttpCause

/** La cause d'un code HTTP inattendu. */
export function httpCause(status: number): HttpCause {
  return `HTTP_${status}`
}

/** Le texte français d'une cause, pour le diagnostic. */
export function causeLabel(cause: RetailerCause): string {
  return own(CAUSE_LABELS, cause) ?? `réponse HTTP ${cause.slice('HTTP_'.length)} inattendue`
}

/** « cause SEARCH_NO_STATE : page de recherche sans l’état embarqué du magasin » : la ligne du diagnostic. */
export function causeText(cause: RetailerCause): string {
  return `cause ${cause} : ${causeLabel(cause)}`
}

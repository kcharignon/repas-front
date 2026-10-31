// La FORME de la réponse du panier d'Auchan (DRV-752) et ce qu'elle veut dire. Le 2026-10-31, une lecture du panier a rendu autre chose que du JSON et l'agent
// a dit « Auchan a changé son site » sans pouvoir expliquer quoi : on ne savait ni le statut, ni le type, ni la forme de la réponse. Ce fichier relève
// cette forme, sans AUCUNE valeur du site ni du compte (voir `retailers/cart-facts.ts`), puis tranche, pour une réponse qui n'est pas du JSON :
//   1. un DÉFI de l'anti-robot (la page de vérification de DataDome, `captcha-delivery.com`, mesurée chez Leclerc et SUPPOSÉE identique ici ; un reCAPTCHA ou
//      une phrase « je ne suis pas un robot », SUPPOSÉS aussi) : `BLOCKED`, cause `CHALLENGE` (le passage attend la personne) ;
//   2. une PAGE DE CONNEXION (un champ de mot de passe, ou les marqueurs du serveur d'identité Keycloak de `compte.auchan.fr`, D-5 mesuré) : `NOT_LOGGED_IN`,
//      cause `LOGIN_FORM`, comme chez Leclerc ;
//   3. sinon `CONTRACT_CHANGED` avec la cause la plus précise : corps vide (`CART_EMPTY`), JSON vide (`CART_JSON_EMPTY`), page d'erreur (`CART_ERROR_PAGE`),
//      ou `CART_NOT_JSON` quand aucun mot ne reconnaît la réponse.
// Le défi passe avant la connexion, sauf si la page porte un champ de mot de passe : le reCAPTCHA invisible est présent sur la page de connexion (D-4, mesuré),
// il ne la rend pas pour autant un défi. Le mot « consentement » (une page de cookies) est RAPPORTÉ, il ne change pas le verdict : une bannière de cookies figure
// sur des pages ordinaires. Aucun de ces marqueurs n'a été vu sur la réponse du panier : ils sont des SUPPOSITIONS (S), à corriger à la recette réelle.
import { parseJson } from '../primitives'
import type { CartReplyBody, CartReplyFacts, CartReplyWord } from '../retailers/cart-facts'
import { headerNames, mimeOf } from '../retailers/contract'
import { RetailerError } from '../retailers/errors'
import type { Reply } from '../retailers/pacer'
import { addressShape, fold } from './page'

/** Les commentaires, scripts et styles : ce que la personne ne voit pas. */
const INVISIBLE = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi

const DATADOME_CHALLENGE = /captcha-delivery\.com/i
const RECAPTCHA = /recaptcha/i
const PASSWORD_FIELD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i
/** Les marqueurs de la page de connexion du serveur d'identité (D-5 : Keycloak) : l'adresse de ses formulaires et leurs classes. */
const IDENTITY_SERVER = /openid-connect|login-actions|\bkc-form|keycloak/i

/** Les phrases d'un défi demandé à la personne (SUPPOSÉES, sans accent ni majuscule). */
const HUMAN_PHRASES = [
  'je ne suis pas un robot',
  'etes-vous un robot',
  'verifiez que vous etes',
  'verify you are human',
  'are you a robot',
]
/** Les phrases d'une page de consentement aux cookies (SUPPOSÉES). */
const CONSENT_PHRASES = ['consentement', 'tout accepter', 'accepter et fermer', 'gerer mes cookies']
/** Les phrases d'une page d'erreur (liste fermée, SUPPOSÉES hormis celles du 404 mesuré). */
const ERROR_PHRASES = [
  'erreur',
  'error',
  'introuvable',
  'indisponible',
  'maintenance',
  'acces refuse',
  'access denied',
  'forbidden',
  'not found',
  'unavailable',
  'bad request',
]

function safePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return ''
  }
}

/** Le texte visible d'une page, comparable : sans commentaire, script, style ni balise. */
function visibleText(page: string): string {
  return fold(page.replace(INVISIBLE, ' ').replace(/<[^>]*>/g, ' '))
}

/** Ce qu'est le corps : du JSON (vide ou non), une page HTML, un texte, ou rien. */
function bodyOf(text: string): CartReplyBody {
  const trimmed = text.trim()
  if (trimmed === '') return 'EMPTY'
  try {
    const parsed = parseJson(trimmed)
    const empty =
      parsed === null ||
      parsed === '' ||
      (Array.isArray(parsed) && parsed.length === 0) ||
      (typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.keys(parsed as Record<string, unknown>).length === 0)
    return empty ? 'JSON_EMPTY' : 'JSON'
  } catch {
    return trimmed.startsWith('<') ? 'HTML' : 'TEXT'
  }
}

/** Les mots de la liste fermée que dit une réponse qui n'est pas du JSON (jamais autre chose que ces mots). */
function wordsOf(text: string): CartReplyWord[] {
  const login = PASSWORD_FIELD.test(text) || IDENTITY_SERVER.test(text)
  const visible = visibleText(text)
  const says = (phrases: readonly string[]) => phrases.some((phrase) => visible.includes(phrase))
  // La page de connexion porte le reCAPTCHA invisible (D-4) : sans défi de DataDome ni phrase demandée, il ne dit pas « défi ».
  const challenge =
    DATADOME_CHALLENGE.test(text) || (RECAPTCHA.test(text) && !login) || says(HUMAN_PHRASES)
  const words: CartReplyWord[] = []
  if (login) words.push('LOGIN')
  if (challenge) words.push('CHALLENGE')
  if (says(CONSENT_PHRASES)) words.push('CONSENT')
  if (says(ERROR_PHRASES)) words.push('ERROR')
  return words
}

/**
 * La forme de la réponse du panier : le code, le type de média, la taille, les NOMS des en-têtes, un motif d'adresse fermé, ce qu'est le corps et les mots
 * d'une liste fermée. Jamais le texte, une valeur d'en-tête, un cookie ni une adresse.
 */
export function describeCartReply(reply: Reply): CartReplyFacts {
  const body = bodyOf(reply.text)
  return {
    status: reply.status,
    mime: mimeOf(reply.contentType),
    length: reply.text.length,
    redirected: reply.redirected,
    address: addressShape(safePath(reply.url)),
    headers: headerNames(reply.headers),
    body,
    words: body === 'HTML' || body === 'TEXT' ? wordsOf(reply.text) : [],
  }
}

/**
 * Ce que dit une réponse 2xx dont le corps n'est pas un panier lisible, ou `null` quand le corps est du JSON (`readCart` en juge). Une erreur qui porte la
 * forme de la réponse. Voir l'ordre en tête de fichier.
 */
export function verdictOf(facts: CartReplyFacts): RetailerError | null {
  const error = (
    code: 'BLOCKED' | 'NOT_LOGGED_IN' | 'CONTRACT_CHANGED',
    cause: 'CHALLENGE' | 'LOGIN_FORM' | 'CART_EMPTY' | 'CART_JSON_EMPTY' | 'CART_ERROR_PAGE',
  ) => new RetailerError(code, facts.status, cause, undefined, facts)
  switch (facts.body) {
    case 'JSON':
      return null
    case 'EMPTY':
      return error('CONTRACT_CHANGED', 'CART_EMPTY')
    case 'JSON_EMPTY':
      return error('CONTRACT_CHANGED', 'CART_JSON_EMPTY')
    default:
      if (facts.words.includes('CHALLENGE')) return error('BLOCKED', 'CHALLENGE')
      if (facts.words.includes('LOGIN')) return error('NOT_LOGGED_IN', 'LOGIN_FORM')
      if (facts.words.includes('ERROR')) return error('CONTRACT_CHANGED', 'CART_ERROR_PAGE')
      // Aucun mot ne reconnaît la réponse : `readCart` dira `CART_NOT_JSON`.
      return null
  }
}

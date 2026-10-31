// La forme de la dernière réponse du panier d'Auchan qui a échoué (DRV-752), gardée dans le `sessionStorage` de l'onglet pour que le diagnostic la montre même
// après un rechargement de la page : un envoi qui s'arrête sur la réponse du panier laisse sa forme, que l'on lit ensuite en ouvrant le diagnostic. Des nombres,
// des NOMS d'en-têtes et des mots d'une liste fermée, jamais une valeur du site ni du compte (`retailers/cart-facts.ts`).
//
// Ce qui est relu est une entrée NON FIABLE : la page du site peut écrire dans son `sessionStorage`. `parseCartFailure` ne rend que des champs de la forme
// attendue, bornés, ou `null` ; elle n'échoue jamais.
import { parseJson, stringifyJson } from '../primitives'
import {
  CART_REPLY_BODIES,
  CART_REPLY_WORDS,
  type CartReplyBody,
  type CartReplyFacts,
  type CartReplyWord,
} from '../retailers/cart-facts'

/** La clé du `sessionStorage` : une seule valeur, remplacée à chaque échec. */
export const CART_FAILURE_KEY = 'repas:last-cart-reply'

/** Au plus autant de noms d'en-têtes (la sonde en garde déjà `MAX_HEADERS`). */
const MAX_NAMES = 40
const HEADER_NAME = /^[a-z0-9-]{1,60}$/
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,40}$|^autre$/
/** Un motif d'adresse : `/`, `/recherche`, `/cart/…`, `/…`. */
const ADDRESS = /^\/[a-z-]{0,30}(?:\/…)?$|^\/…(?:\/…)?$/

/** Le texte à garder. */
export function stringifyCartFailure(facts: CartReplyFacts): string {
  return stringifyJson(facts)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** La forme gardée, ou `null` si le texte n'en est pas une (absent, abîmé, de forme inattendue). */
export function parseCartFailure(raw: string | null): CartReplyFacts | null {
  if (raw === null || raw.length > 4000) return null
  let value: unknown
  try {
    value = parseJson(raw)
  } catch {
    return null
  }
  if (!isObject(value)) return null
  const { status, mime, length, redirected, address, headers, body, words } = value
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599)
    return null
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > 1e9)
    return null
  if (typeof redirected !== 'boolean') return null
  if (typeof address !== 'string' || !ADDRESS.test(address)) return null
  if (mime !== null && (typeof mime !== 'string' || !MIME.test(mime))) return null
  if (!Array.isArray(headers) || headers.length > MAX_NAMES) return null
  if (!headers.every((name) => typeof name === 'string' && HEADER_NAME.test(name))) return null
  if (typeof body !== 'string' || !(CART_REPLY_BODIES as readonly string[]).includes(body))
    return null
  if (!Array.isArray(words) || words.length > CART_REPLY_WORDS.length) return null
  if (!words.every((word) => (CART_REPLY_WORDS as readonly unknown[]).includes(word))) return null
  return {
    status,
    mime: mime as string | null,
    length,
    redirected,
    address,
    headers: headers as string[],
    body: body as CartReplyBody,
    words: words as CartReplyWord[],
  }
}

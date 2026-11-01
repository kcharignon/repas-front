// La FORME d'une réponse du panier de la version mobile (DRV-754, sur le modèle de la lecture du panier de l’autre enseigne du registre) : jamais une valeur du site ni du compte, seulement le code,
// le type de média, la taille, des NOMS d'en-têtes, un motif d'adresse, ce qu'est le corps et des mots d'une liste fermée. Elle accompagne toute erreur du panier
// (`RetailerError.reply`) : « Leclerc a changé son site » ne se dit jamais sans elle.
import { parseJson } from '../primitives'
import type { CartReplyBody, CartReplyFacts, CartReplyWord } from '../retailers/cart-facts'
import { isChallenge, type Reply } from './pacer'
import { visibleText } from './page-text'
import { headerNames, mimeOf, pagePhrases, urlShape } from './probe'

const PASSWORD_FIELD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i

/** Ce qu'est le corps : du JSON (vide ou non), une page HTML, un autre texte, ou rien. */
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
  const words: CartReplyWord[] = []
  if (PASSWORD_FIELD.test(text)) words.push('LOGIN')
  if (isChallenge(text)) words.push('CHALLENGE')
  if (visibleText(text).includes('tout accepter')) words.push('CONSENT')
  if (pagePhrases(text).length > 0) words.push('ERROR')
  return words
}

/** La forme de la réponse : le code, le type de média, la taille, les NOMS des en-têtes, le motif de l'adresse, le genre du corps et les mots d'une liste fermée. */
export function describeCartReply(reply: Reply): CartReplyFacts {
  const body = bodyOf(reply.text)
  return {
    status: reply.status,
    mime: mimeOf(reply.contentType),
    length: reply.text.length,
    redirected: reply.redirected,
    address: urlShape(reply.url),
    headers: headerNames(reply.headers),
    body,
    words: body === 'HTML' || body === 'TEXT' ? wordsOf(reply.text) : [],
  }
}

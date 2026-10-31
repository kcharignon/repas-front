// Ce que le diagnostic sait de la RÉPONSE du panier d'une enseigne (DRV-752) : sa FORME seulement. Un code HTTP, un type de média, une taille, des NOMS
// d'en-têtes, un motif d'adresse de liste fermée et quelques mots d'une liste fermée que la page dit à voir. Jamais une valeur du site ni du compte : ni
// cookie, ni identifiant, ni adresse, ni libellé, ni morceau de page. Un fichier sans import de valeur.
import type { RetailerCause } from './causes'
import type { RetailerErrorCode } from './errors'

/**
 * Les mots d'une liste FERMÉE qu'une réponse qui n'est pas du JSON peut dire : une page de connexion, un défi de l'anti-robot, une page de consentement (cookies),
 * une page d'erreur. Écrits ici, jamais lus dans la page.
 */
export const CART_REPLY_WORDS = ['LOGIN', 'CHALLENGE', 'CONSENT', 'ERROR'] as const
export type CartReplyWord = (typeof CART_REPLY_WORDS)[number]

/** Ce qu'est le corps : vide, du JSON (vide : `{}`, `[]`, `null`, `""`), une page HTML, un autre texte. */
export const CART_REPLY_BODIES = ['EMPTY', 'JSON', 'JSON_EMPTY', 'HTML', 'TEXT'] as const
export type CartReplyBody = (typeof CART_REPLY_BODIES)[number]

export interface CartReplyFacts {
  /** Le code HTTP de la réponse. */
  status: number
  /** Le type de média (`application/json`), sans paramètre ; `null` s'il manque, `autre` s'il n'a pas la forme d'un type. */
  mime: string | null
  /** La longueur du texte, en caractères. */
  length: number
  /** La réponse vient d'une redirection (`fetch` ne dit pas combien). */
  redirected: boolean
  /** Le motif de l'adresse FINALE : un premier segment d'une liste fermée de pages du site, `…` sinon (jamais l'adresse). */
  address: string
  /** Les NOMS des en-têtes de la réponse (jamais leurs valeurs : les cookies y sont). */
  headers: string[]
  body: CartReplyBody
  /** Les mots de [CART_REPLY_WORDS] que la réponse dit, dans l'ordre de la liste ; cherchés seulement quand le corps n'est pas du JSON. */
  words: CartReplyWord[]
}

/** Le résultat de la sonde de lecture du panier du diagnostic (DRV-752) : une seule requête `GET`, jamais une écriture. */
export interface CartProbeFacts {
  /** `READ` : le panier s'est lu ; `FAILED` : l'adaptateur a levé une erreur (voir [fault]). */
  outcome: 'READ' | 'FAILED'
  /** La forme de la réponse du site, `null` quand aucune réponse n'est venue (réseau coupé, identifiant de consentement illisible). */
  reply: CartReplyFacts | null
  /** Le nombre de lignes du panier quand il s'est lu. */
  lines: number | null
  fault: { code: RetailerErrorCode; cause: RetailerCause | null; status: number | null } | null
}

// Les sondes du site réel (ticket B de l'audit du 2026-10-18). La recette réelle a montré qu'une hypothèse jamais mesurée peut tout arrêter :
// le diagnostic et le test automatique relèvent donc, sur le vrai site, ce qui permet de la confirmer ou de la corriger. Règle absolue :
// RIEN de ce que le site dit n'est rapporté. Ce fichier ne rend que des FORMES (l'adresse en motif, `N` pour un nombre, `V` pour la ville),
// des NOMS (de clés connues, de clés de connexion, d'en-têtes) et des NOMBRES (produits, clés). Jamais un libellé, un cookie, un numéro de
// magasin, une ville, une adresse, un point de livraison ni la valeur d'un en-tête. `probe.spec.ts` et `diagnostic.spec.ts` le prouvent avec
// une page hostile.
import type { RetailerCause } from '../retailers/causes'
import type { EntryFacts } from './entry'
import { decodeEntities, pageReadings } from './embedded'
import type { RetailerErrorCode } from '../retailers/errors'
import type { Reply } from './pacer'
import { visibleText } from './page-text'
import type { SearchVariant } from './search-request'
import { describeSession, readSession } from './session'
import { findDeliveryPoint } from './store'

// —— L'adresse en motif ——————————————————————————————————————————————————————————————————————————————————————————————————

const STORE_SEGMENT = /^magasin-\d{1,12}-\d{1,12}(-[^/]*)?$/i
const SAFE_NAME = /^[a-z][a-z0-9_.-]{0,30}$/i

/** Le nom d'une page, ses nombres remplacés par `N` ; `V` si c'est la ville ; `…` s'il n'a pas la forme simple d'un nom de page du site. */
function pageName(segment: string, city: string | null): string {
  if (city !== null && segment.toLowerCase() === city.toLowerCase()) return 'V'
  const masked = segment.replace(/\d+/g, 'N')
  return SAFE_NAME.test(masked) ? masked : '…'
}

/**
 * Le MOTIF d'un chemin d'adresse, sans un seul chiffre ni nom de ville : `/magasin-123456-123456-Ville-Test/accueil.aspx` donne
 * `/magasin-N-N-V/accueil.aspx`. Le nom de la page n'est gardé que s'il a la forme simple d'un nom de fichier du site ; ce qui suit la page
 * est caché (`…`), comme tout ce qui suit la première partie d'une adresse hors d'un magasin. Une requête et un fragment ne sont jamais lus.
 */
export function addressShape(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? ''
  const segments = path.split('/').slice(1)
  const trailing = segments.at(-1) === ''
  const parts = trailing ? segments.slice(0, -1) : segments
  const first = parts[0]
  if (first === undefined) return '/'
  const store = STORE_SEGMENT.exec(first)
  const out: string[] = []
  if (store) {
    const city = store[1] === undefined ? null : store[1].slice(1)
    out.push(city === null ? 'magasin-N-N' : 'magasin-N-N-V')
    if (parts[1] !== undefined) out.push(pageName(parts[1], city))
    if (parts.length >= 3) out.push('…')
  } else {
    out.push(pageName(first, null))
    if (parts.length >= 2) out.push('…')
  }
  return `/${out.join('/')}${trailing && parts.length <= 2 ? '/' : ''}`
}

/** Le motif du chemin d'une adresse complète (avec son site) ou relative : le site, la requête et le fragment ne sont jamais lus. */
export function urlShape(url: string): string {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '')
  return addressShape(path.startsWith('/') ? path : '/…')
}

// —— Les en-têtes de réponse ———————————————————————————————————————————————————————————————————————————————————————————————

const HEADER_NAME = /^[a-z][a-z0-9-]{1,39}$/
/** Les en-têtes qui portent un secret : leur nom même n'est pas rapporté. */
const SECRET_HEADERS = new Set([
  'set-cookie',
  'set-cookie2',
  'cookie',
  'authorization',
  'proxy-authorization',
])
/** Au plus autant de noms d'en-têtes dans un rapport. */
export const MAX_HEADERS = 40

/** Les NOMS des en-têtes d'une réponse : minuscules, sans doublon, triés, de forme simple, sans les cookies. Jamais une valeur. */
export function headerNames(names: Iterable<string>): string[] {
  const kept = new Set<string>()
  for (const raw of names) {
    const name = raw.toLowerCase()
    if (HEADER_NAME.test(name) && !SECRET_HEADERS.has(name)) kept.add(name)
  }
  return [...kept].sort().slice(0, MAX_HEADERS)
}

// —— Le point de livraison ———————————————————————————————————————————————————————————————————————————————————————————————

export interface DeliveryFacts {
  /** Le champ `sNoPointLivraison` est lu dans le texte. */
  read: boolean
  /** Sa valeur est égale au premier nombre de l'adresse du magasin ; `null` si l'un des deux manque. */
  sameAsAddress: boolean | null
}

/** Le point de livraison de [pageText] : lu ou non, égal ou non au numéro de l'adresse ([storeId]), jamais sa valeur. */
export function deliveryFacts(pageText: string, storeId: string | null): DeliveryFacts {
  const point = findDeliveryPoint(pageText)
  return {
    read: point !== null,
    sameAsAddress: point === null || storeId === null ? null : point === storeId,
  }
}

// —— Les cookies ————————————————————————————————————————————————————————————————————————————————————————————————————————————

/** Les cookies lisibles par la page : un nombre et un oui/non. Ni un nom ni une valeur n'en sort jamais. */
export interface CookieFacts {
  count: number
  /** L'un d'eux porte le nom d'une protection anti-robot connue. */
  antiBot: boolean
}

/** Les noms usuels des cookies de protection anti-robot (DataDome, Imperva, Akamai, Cloudflare), comparés en minuscules. Une liste fermée. */
const ANTI_BOT_COOKIES = /^(datadome|incap_ses_|visid_incap_|_abck$|bm_sz$|cf_clearance$)/

/**
 * Le compte des cookies de [raw] (`document.cookie`, lu une fois en mémoire) et la présence d'un cookie anti-robot. Exception motivée à la règle
 * « jamais lire un cookie » (ticket B) : seuls un nombre et un oui/non sortent, les noms et les valeurs ne sont jamais gardés ni rapportés.
 */
export function cookieFacts(raw: string): CookieFacts {
  const names = raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => (part.split('=', 1)[0] ?? '').trim().toLowerCase())
  return { count: names.length, antiBot: names.some((name) => ANTI_BOT_COOKIES.test(name)) }
}

// —— Les clés de l'état embarqué ————————————————————————————————————————————————————————————————————————————————————————————

/**
 * Les clés que l'agent connaît ou cherche dans la page de recherche (le squelette du magasin, les champs d'un produit, la disponibilité,
 * DRV-007) : pour chacune, présente ou absente. Une liste fermée, écrite ici.
 */
export const KNOWN_KEYS = [
  'sNoPointLivraison',
  'sTotalAPayer',
  'iQuantitePanier',
  'lstProduitsLight',
  'lstProduits',
  'iIdProduit',
  'sLibelleLigne1',
  'sLibelleLigne2',
  'nrPVUnitaireTTC',
  'nrPVParUniteDeMesureTTC',
  'iQteDisponible',
  'sUrlVignetteProduit',
  'eDisponibilite',
  'fAfficherTexteProduitIndispo',
  'iNbProduitIndisponible',
] as const

/** Une clé JSON entre guillemets, juste après `{` ou `,` : une valeur ne contient jamais de guillemet non échappé, donc ne peut pas imiter une clé. */
const QUOTED_KEY = /(?<=[{,]\s{0,16})"([A-Za-z_][A-Za-z0-9_]{0,59})"\s*:/g
/** Le style des noms du site : une à trois lettres minuscules, puis une majuscule (`bClientConnecte`, `iIdUtilisateur`). */
const SITE_STYLE = /^[a-z]{1,3}[A-Z][A-Za-z]{2,36}$/
/** Ce qui parle de la connexion ou du compte : le seul nom de clé, hors de la liste connue, qui peut figurer dans un rapport. */
const SESSION_VOCABULARY =
  /conn|client|user|utilisateur|compte|auth|login|logged|session|ident|visit|member|membre|cust/i
/** Au plus autant de noms de clés de connexion dans un rapport. */
export const MAX_SESSION_KEYS = 20

export interface StateKeys {
  /** Les clés connues ([KNOWN_KEYS]) lues dans la page. */
  present: string[]
  /** Les clés connues qui manquent. */
  absent: string[]
  /** Les clés qui parlent de la connexion ou du compte (au plus [MAX_SESSION_KEYS]), pour trouver le marqueur « connecté ». */
  session: string[]
  /** Le nombre de clés JSON distinctes de la page, nommées ou non. */
  total: number
}

/**
 * Ce que la page laisse voir de son état embarqué, par ses NOMS de clés seulement. Les clés connues sont nommées (présentes ou absentes),
 * celles qui parlent de la connexion aussi ; toute autre clé n'est que comptée, car elle peut être une donnée de l'utilisateur (une
 * recherche récente, une ville). Jamais une valeur.
 */
export function stateKeys(page: string): StateKeys {
  const readings = pageReadings(page)
  const present = KNOWN_KEYS.filter((name) => {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])["']?${name}["']?\\s*[:=]`)
    return readings.some((reading) => pattern.test(reading))
  })
  // Pour les noms hors de la liste connue, seuls le texte tel quel et celui dont les entités sont décodées sont lus : un libellé aux guillemets
  // échappés ne doit pas pouvoir passer pour une clé.
  const texts = /&quot;|&#0*34;|&#x0*22;/i.test(page) ? [page, decodeEntities(page)] : [page]
  const names = new Set<string>()
  for (const text of texts) {
    for (const found of text.matchAll(QUOTED_KEY)) if (found[1]) names.add(found[1])
  }
  const known = new Set<string>(KNOWN_KEYS)
  const session = [...names]
    .filter((name) => !known.has(name) && SITE_STYLE.test(name) && SESSION_VOCABULARY.test(name))
    .sort()
    .slice(0, MAX_SESSION_KEYS)
  return {
    present,
    absent: KNOWN_KEYS.filter((name) => !present.includes(name)),
    session,
    total: names.size,
  }
}

// —— Le type de contenu, la longueur, les mots d'une page d'erreur ————————————————————————————————————————————————————————————

/** Le type de média d'un en-tête `Content-Type` (`text/html; charset=utf-8` donne `text/html`), `autre` s'il n'a pas la forme d'un type, `null` s'il manque. */
export function mimeOf(raw: string | null): string | null {
  if (raw === null) return null
  const type = (raw.split(';', 1)[0] ?? '').trim().toLowerCase()
  return /^[a-z]+\/[a-z0-9.+-]{1,40}$/.test(type) ? type : 'autre'
}

/**
 * Les mots d'une liste FERMÉE que la page dit à voir (sans accent ni majuscule), pour reconnaître une page d'erreur du serveur ou du site sans en
 * rapporter le texte : jamais autre chose que ces mots, écrits ici. Cherchés dans le texte visible seulement.
 */
export const PAGE_PHRASES = [
  'bad request',
  'request header',
  'too large',
  'too long',
  'invalid',
  'forbidden',
  'access denied',
  'not found',
  'unavailable',
  'maintenance',
  'requete incorrecte',
  'page demandee',
  'introuvable',
  'indisponible',
  'acces refuse',
] as const

/** Ceux de [PAGE_PHRASES] que la page dit à voir. */
export function pagePhrases(page: string): string[] {
  const text = visibleText(page)
  return PAGE_PHRASES.filter((phrase) => text.includes(phrase))
}

// —— Ce que l'adaptateur retient d'une recherche ————————————————————————————————————————————————————————————————————————————

/** Une requête de recherche : quelle forme, quel code, ce que la réponse est (type, longueur), à quelle adresse. Jamais le contenu. */
export interface AttemptFacts {
  variant: SearchVariant
  /** Le code HTTP ; `null` si aucune réponse n'est venue (réseau coupé). */
  status: number | null
  mime: string | null
  /** La longueur du texte de la réponse, en caractères. */
  length: number | null
  /** Le motif de l'adresse demandée. */
  address: string
}

export interface SearchFacts {
  /** La forme de requête dont vient la réponse retenue (la dernière essayée). */
  variant: SearchVariant
  status: number
  /** La réponse vient d'une redirection (`fetch` ne dit pas combien). */
  redirected: boolean
  /** Le motif de l'adresse finale de la réponse. */
  address: string
  /** Le motif de l'adresse demandée. */
  requested: string
  mime: string | null
  length: number
  headers: string[]
  keys: StateKeys
  /** Les mots de [PAGE_PHRASES] que la réponse dit à voir (cherchés seulement quand la recherche n'a pas rendu de produit). */
  phrases: string[]
  /** Ce que la réponse montre de la connexion ([describeSession] : un état et des noms de signes). */
  session: string
  delivery: DeliveryFacts
  /** Les produits lus ; `null` quand la réponse n'a pas pu être lue. */
  products: number | null
  /** `PRODUCTS` (au moins un produit), `EMPTY` (page reconnue sans produit), `FAILED` (erreur de l'adaptateur : voir [fault]). */
  outcome: 'PRODUCTS' | 'EMPTY' | 'FAILED'
  fault?: { code: RetailerErrorCode; cause: RetailerCause | null }
  /** Toutes les requêtes de cette recherche, dans l'ordre : la courante, puis le repli ou la sonde des variantes. */
  attempts: AttemptFacts[]
}

/** Ce qu'une réponse laisse voir de la requête, avant toute analyse. */
export function attemptOf(
  variant: SearchVariant,
  reply: Reply,
  requestedUrl: string,
): AttemptFacts {
  return {
    variant,
    status: reply.status,
    mime: mimeOf(reply.contentType),
    length: reply.text.length,
    address: urlShape(requestedUrl),
  }
}

/** Ce que la réponse à une recherche laisse voir, avant l'analyse des produits (le résultat de l'analyse s'y ajoute ensuite). */
export function describeSearchReply(
  variant: SearchVariant,
  reply: Reply,
  requestedUrl: string,
  storeId: string | null,
): SearchFacts {
  return {
    variant,
    status: reply.status,
    redirected: reply.redirected,
    address: urlShape(reply.url),
    requested: urlShape(requestedUrl),
    mime: mimeOf(reply.contentType),
    length: reply.text.length,
    headers: headerNames(reply.headers),
    keys: stateKeys(reply.text),
    phrases: [],
    session: describeSession(readSession(reply.text)),
    delivery: deliveryFacts(reply.text, storeId),
    products: null,
    outcome: 'FAILED',
    attempts: [],
  }
}

/** Ce que la page d'arrivée laisse voir, sans aucune requête. */
export interface ArrivalFacts {
  /** Le motif de l'adresse de la page. */
  address: string
  /** Le nombre de redirections que le navigateur a suivies pour y arriver ; `null` s'il ne le dit pas. */
  redirects: number | null
  /** Le code HTTP du document ; `null` s'il ne le dit pas. */
  status: number | null
  delivery: DeliveryFacts
  /** Les cookies lisibles par la page (hors HttpOnly) : un nombre et un oui/non ; `null` si la page ne les dit pas. */
  cookies: CookieFacts | null
  /** Le chemin avec la ville que la page donne (formulaire de recherche, à défaut lien), en motif ; `null` si elle n'en donne pas. */
  searchBase: { shape: string; source: 'FORM' | 'LINK' } | null
  /** « Commencer mes courses » dans la page : présent ou non, la forme de son adresse, bouton cliquable ou non (DRV-625, DRV-629). */
  entry?: EntryFacts
}

/** Ce que le navigateur sait de la navigation qui a amené sur la page (`PerformanceNavigationTiming`) : des nombres, jamais une adresse. */
export interface NavigationFacts {
  redirects: number | null
  status: number | null
}

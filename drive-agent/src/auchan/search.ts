// La recherche d'Auchan (DRV-724) : la requête, et ce que la réponse veut dire. Une recherche est `GET /recherche?text=<terme>` (une seule clé de requête,
// B-1 mesuré) ; la réponse est une page HTML complète lue par `search-page.ts`. Ce fichier tranche, dans cet ordre :
//   1. la réponse est vide, ou n'est pas du HTML : `CONTRACT_CHANGED` (cause explicite) ;
//   2. l'adresse FINALE n'est pas la page de recherche : le site a redirigé (clé `searchRedirects` de son stockage local, SUPPOSÉ : B-8). Vers une fiche de
//      produit ou un rayon, ce n'est PAS une page de résultats : aucun produit, jamais le contenu de cette page lu comme des résultats ; vers toute autre
//      page, `CONTRACT_CHANGED` (`SEARCH_REDIRECTED`) ;
//   3. des produits lus : ce sont les résultats ;
//   4. des traces de produit mais aucun produit lisible : `CONTRACT_CHANGED` (`SEARCH_PRODUCTS_UNREADABLE`), jamais « aucun produit » ;
//   5. aucune trace de produit : « aucun résultat » SEULEMENT si la page a le squelette du site (la barre du magasin) ET le dit par une phrase de
//      `NO_RESULT_PHRASES` (NON MESURÉ) ; sinon `CONTRACT_CHANGED` (`SEARCH_UNKNOWN_PAGE`). Une structure inconnue n'est jamais prise pour une liste vide.
// Aucune pagination, aucun tri, aucun filtre n'est lu (B-7 : INCONNU) : seule la première page de résultats l'est.
import { RetailerError } from '../retailers/errors'
import type { SearchFacts } from '../retailers/contract'
import { addressShape, isNotFoundPage, storeBar } from './page'
import {
  hasProductTrace,
  phrasesOf,
  readProducts,
  saysNoResult,
  stripInert,
  type PageProduct,
} from './search-page'

/** Un produit lu de la page et le fait que la page y a mené par une redirection du terme. */
export interface SearchReading {
  kind: 'PRODUCTS' | 'EMPTY'
  products: PageProduct[]
  /** Les éléments `data-product-id` de la page (plusieurs par produit), pour le diagnostic. */
  markers: number
  /** Les produits écartés parce qu'illisibles. */
  unreadable: number
  /** Pourquoi la page est vide : le site a dit « aucun résultat », ou le terme a mené à une fiche de produit ou à un rayon. */
  why?: 'NO_RESULT' | 'REDIRECT_PRODUCT' | 'REDIRECT_AISLE'
  /** Les phrases de la liste fermée que la page dit (pour le diagnostic). */
  phrases: string[]
}

/** L'adresse de la recherche : le terme encodé dans la seule clé `text` (B-1). */
const SEARCH_PATH = '/recherche'
export function searchPath(query: string): string {
  return `${SEARCH_PATH}?text=${encodeURIComponent(query)}`
}

/** La requête : une page HTML demandée comme le navigateur la demande, sans en-tête de requête XHR (ce n'est pas l'API du site). */
export const SEARCH_INIT: RequestInit = {
  method: 'GET',
  headers: { Accept: 'text/html,application/xhtml+xml' },
}

/** Le chemin d'une adresse (`/recherche`), sans requête, fragment ni barre finale ; `''` si elle n'est pas lisible. */
export function pathOf(url: string): string {
  try {
    const path = new URL(url, 'https://x.invalid').pathname
    return path.length > 1 ? path.replace(/\/+$/, '') : path
  } catch {
    return ''
  }
}

/** Le chemin de la page qui a répondu : celui de la recherche, sauf si le site a redirigé (alors l'adresse finale, `Response.url`). */
function finalPath(reply: { url: string; redirected: boolean }): string {
  return reply.redirected ? pathOf(reply.url) : SEARCH_PATH
}

/** Une fiche de produit (`/<libellé>/pr-C<chiffres>`, B-2 mesuré) ou un rayon (`/<libellé>/ca-…`, B-1 : les identifiants de rayon `ca-…`). */
const PRODUCT_PAGE = /\/pr-C\d+$/
const AISLE_PAGE = /\/ca-[^/]+$/

/** Le type MIME d'une réponse : une page HTML, ou rien (un faux `fetch` ne le dit pas). */
function isHtml(contentType: string | null): boolean {
  if (contentType === null) return true
  const type = (contentType.split(';', 1)[0] ?? '').trim().toLowerCase()
  return type === 'text/html' || type === 'application/xhtml+xml'
}

/**
 * Ce que dit la réponse de la recherche (voir l'ordre en tête de fichier). `parseHtml` : le `DOMParser` pris au démarrage.
 * @throws {RetailerError} `CONTRACT_CHANGED` quand la page n'est de aucune forme connue.
 */
export function interpretSearch(
  reply: { text: string; url: string; redirected: boolean; contentType: string | null },
  parseHtml: (html: string) => Document,
): SearchReading {
  if (reply.text.trim() === '')
    throw new RetailerError('CONTRACT_CHANGED', null, 'SEARCH_PAGE_EMPTY')
  if (!isHtml(reply.contentType))
    throw new RetailerError('CONTRACT_CHANGED', null, 'SEARCH_NOT_HTML')
  const path = finalPath(reply)
  if (path !== SEARCH_PATH) {
    if (PRODUCT_PAGE.test(path)) return empty('REDIRECT_PRODUCT')
    if (AISLE_PAGE.test(path)) return empty('REDIRECT_AISLE')
    throw new RetailerError('CONTRACT_CHANGED', null, 'SEARCH_REDIRECTED')
  }
  const doc = parseHtml(reply.text)
  stripInert(doc)
  const read = readProducts(doc)
  const phrases = phrasesOf(doc)
  if (read.products.length > 0) {
    return {
      kind: 'PRODUCTS',
      products: read.products,
      markers: read.markers,
      unreadable: read.unreadable,
      phrases,
    }
  }
  if (hasProductTrace(doc)) {
    throw new RetailerError('CONTRACT_CHANGED', null, 'SEARCH_PRODUCTS_UNREADABLE')
  }
  if (isNotFoundPage(doc, null)) throw new RetailerError('CONTRACT_CHANGED', null, 'PAGE_NOT_FOUND')
  if (storeBar(doc) !== null && saysNoResult(doc)) {
    return { ...empty('NO_RESULT'), phrases }
  }
  throw new RetailerError('CONTRACT_CHANGED', null, 'SEARCH_UNKNOWN_PAGE')
}

function empty(why: NonNullable<SearchReading['why']>): SearchReading {
  return { kind: 'EMPTY', products: [], markers: 0, unreadable: 0, why, phrases: [] }
}

// —— Les faits du diagnostic ————————————————————————————————————————————————————————————————————————————————————————————

/**
 * La requête de recherche d'Auchan est UNE seule forme (la variante `a` du diagnostic, « la requête courante ») : il n'y a pas de repli ni de variante à
 * sonder, `exploreSearchVariants` ne fait aucune requête.
 */
const VARIANT = 'a'

/**
 * Les faits d'une recherche avant l'analyse des produits (le résultat de l'analyse s'y ajoute ensuite) : formes et nombres seulement, jamais le terme
 * cherché, une valeur d'en-tête ni un contenu. `mime` et `headers` sont déjà réduits à un type de média et à des NOMS d'en-têtes.
 */
export function describeReply(
  reply: { status: number; text: string; url: string; redirected: boolean },
  mime: string | null,
  headers: string[],
): SearchFacts {
  return {
    variant: VARIANT,
    status: reply.status,
    redirected: reply.redirected,
    address: addressShape(finalPath(reply)),
    requested: addressShape(SEARCH_PATH),
    mime,
    length: reply.text.length,
    headers,
    phrases: [],
    products: null,
    outcome: 'FAILED',
    attempts: [
      {
        variant: VARIANT,
        status: reply.status,
        mime,
        length: reply.text.length,
        address: addressShape(SEARCH_PATH),
      },
    ],
  }
}

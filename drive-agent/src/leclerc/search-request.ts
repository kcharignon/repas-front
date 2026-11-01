// La forme de la requête de recherche. Recette réelle du 2026-10-18 : `GET <chemin de la page>/recherche.aspx?TexteRecherche=sel` répond HTTP 400
// sur une vraie page de magasin, alors qu'un essai jetable du matin (le banc d'essai du favori, retiré depuis, dans l'historique Git) envoyait
// la même requête et passait. Ce fichier fige la requête courante (`a`, celle de cet essai : chemin de la page AVEC la ville, `Accept: text/html,
// application/xhtml+xml`, les cookies de la session) et liste les variantes essayées quand le site répond 400, une par différence possible :
//   b  le même GET sans aucun en-tête personnalisé (fetch par défaut) ;
//   c  avec `Accept: */*` (identique à `b` sur le réseau : n'est que sondée, jamais un repli) ;
//   g  le chemin AVEC la ville, tiré de la page (action du formulaire de recherche, à défaut premier lien) quand il diffère de l'adresse de la page :
//      recette réelle du 2026-10-18, la recherche répond 400 sur le chemin de l'accueil du magasin et réussit sur celui des pages de résultats ;
//   e1 le chemin SANS suffixe de ville (celui du panier) ;
//   e2 l'adresse relative `recherche.aspx?…`, résolue contre le dossier de la page courante ;
//   f  sans l'en-tête Referer (`referrerPolicy: 'no-referrer'`) ;
//   h  sans cache (`cache: 'no-store'`).
// L'adresse absolue (origine + chemin) ne fait pas une variante : le navigateur résout un chemin relatif contre l'origine de la page et envoie
// exactement la même requête (c'est ce que faisait l'essai du matin).
// Toutes sont des GET sans corps : aucune n'écrit. Chacune est une adresse de l'hôte de la page (un chemin qui commence par un seul « / »).

/**
 * L'ordre des essais : le chemin avec la ville tiré de la page d'abord (`g`, quand la page en donne un autre que celui de son adresse : la cause de la
 * recette réelle), puis la requête courante, puis chaque variante une fois tant que le site répond HTTP 400.
 */
export const FALLBACK_ORDER = ['g', 'a', 'b', 'e1', 'e2', 'f', 'h'] as const
/**
 * Toutes les variantes : celles du repli, `c` que le diagnostic sonde en plus, et `m` (DRV-754) : la recherche de la VERSION MOBILE (`POST recherche-ajax.aspx`, `mobile.ts`),
 * la seule que l'agent emploie sur `m-courses`, sans repli ni variante. Les autres sont celles du site ordinateur (`GET recherche.aspx`).
 */
export const DESKTOP_VARIANTS = [...FALLBACK_ORDER, 'c'] as const
export const SEARCH_VARIANTS = [...DESKTOP_VARIANTS, 'm'] as const
export type SearchVariant = (typeof SEARCH_VARIANTS)[number]
/** Les variantes de la recherche du site ordinateur : celles que `buildSearch` sait écrire. */
export type DesktopVariant = (typeof DESKTOP_VARIANTS)[number]

/** Ce que la page courante donne pour bâtir l'adresse. */
export interface SearchContext {
  /** `/magasin-<id>-<id>[-<Ville>]` : début des pages du magasin, comme dans l'adresse. */
  pagePath: string
  /** `/magasin-<id>-<id>` : sans le suffixe de ville. */
  cartPath: string
  /** Le chemin complet de la page courante (`location.pathname`). */
  pathname: string
  /** `/magasin-<id>-<id>-<Ville>` tiré de la page (formulaire de recherche, à défaut lien), `null` s'il n'y en a pas. */
  linkPath: string | null
}

/** La variante a-t-elle un sens pour cette page ? `g` n'en a que si la page porte un lien avec la ville, différent de son adresse. */
export function applicable(variant: SearchVariant, context: SearchContext): boolean {
  return variant === 'm'
    ? false
    : variant !== 'g' || (context.linkPath !== null && context.linkPath !== context.pagePath)
}

const ACCEPT_HTML = 'text/html,application/xhtml+xml'

/** Le dossier d'une page : `/magasin-1-1-V/accueil.aspx` donne `/magasin-1-1-V/`, `/magasin-1-1-V` donne `/`. */
function folderOf(pathname: string): string {
  return (pathname.split(/[?#]/, 1)[0] ?? '').replace(/[^/]*$/, '')
}

/** La requête de recherche de [query] pour cette variante : l'adresse (relative à l'hôte) et les options de `fetch` (le `Pacer` y ajoute `credentials`). */
export function buildSearch(
  variant: DesktopVariant,
  context: SearchContext,
  query: string,
): { url: string; init: RequestInit } {
  const search = `recherche.aspx?TexteRecherche=${encodeURIComponent(query)}`
  const page = `${context.pagePath}/${search}`
  switch (variant) {
    case 'a':
      return { url: page, init: { method: 'GET', headers: { Accept: ACCEPT_HTML } } }
    case 'b':
      return { url: page, init: { method: 'GET' } }
    case 'c':
      return { url: page, init: { method: 'GET', headers: { Accept: '*/*' } } }
    case 'g':
      return {
        url: `${context.linkPath ?? context.pagePath}/${search}`,
        init: { method: 'GET', headers: { Accept: ACCEPT_HTML } },
      }
    case 'e1':
      return {
        url: `${context.cartPath}/${search}`,
        init: { method: 'GET', headers: { Accept: ACCEPT_HTML } },
      }
    case 'e2':
      return {
        url: `${folderOf(context.pathname)}${search}`,
        init: { method: 'GET', headers: { Accept: ACCEPT_HTML } },
      }
    case 'f':
      return {
        url: page,
        init: { method: 'GET', headers: { Accept: ACCEPT_HTML }, referrerPolicy: 'no-referrer' },
      }
    case 'h':
      return {
        url: page,
        init: { method: 'GET', headers: { Accept: ACCEPT_HTML }, cache: 'no-store' },
      }
  }
}

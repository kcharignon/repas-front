import { STORE_HOST } from '../../protocol'
import { RetailerError } from '../retailers/errors'

/** Le magasin de la page, tel que le protocole le renvoie (`setup-result`). */
export interface StoreInfo {
  /** Premier identifiant de l'adresse, conservé en texte (« 001234 » garde son zéro). */
  id: string
  /** Hôte de la page (par magasin : `fdN-courses.leclercdrive.fr`). */
  host: string
  /** `https://<hôte>/magasin-<id>-<id>`. */
  baseUrl: string
  /** Libellé du magasin lu dans la page, `null` s'il n'y en a pas. */
  label: string | null
}

/** L'adresse de la page : ce que l'agent lit de `window.location`. */
export interface LocationLike {
  hostname: string
  pathname: string
  /** `https:` ; absent d'un faux emplacement de test : la page est alors prise pour une page `https`. */
  protocol?: string
  /** Le port, vide pour le port par défaut ; absent d'un faux emplacement de test. */
  port?: string
}

/** Le magasin et les chemins qu'on en déduit (relatifs : seul l'hôte de la page est joint). */
export interface StorePaths {
  store: StoreInfo
  /** `/magasin-<id>-<id>[-<Ville>]` : début des pages du magasin, comme dans l'adresse. */
  pagePath: string
  /** `/magasin-<id>-<id>` : début de l'adresse du panier, **sans le suffixe de ville** que portent les pages. */
  cartPath: string
}

const STORE_PATH = /^\/magasin-([0-9]{1,12})-([0-9]{1,12})(-[^/?#]*)?(?=\/|$)/i

/**
 * Le site mobile de l'enseigne : sur un téléphone Leclerc sert `m-courses.leclercdrive.fr` (DRV-754 : c'est LUI que l'agent sert désormais, par ses propres appels,
 * voir `mobile.ts`). Son nom est exactement `m-courses` (les autres `m-…` ne sont pas des sites de l'enseigne reconnus).
 */
const MOBILE_HOST = /^m-courses\./i

/** `fd9` pour `fd9-courses.leclercdrive.fr` (la famille d'hôte, jamais le numéro de magasin), `null` pour tout autre hôte. */
export function hostFamily(host: string): string | null {
  return /^(fd\d{1,3})-courses\.leclercdrive\.fr$/.exec(host.toLowerCase())?.[1] ?? null
}

/** Vrai pour un hôte du site mobile de l'enseigne (`m-courses.leclercdrive.fr`) : un hôte de PAGES, dont le serveur du magasin est un autre (`fd<N>-courses`). */
export function isMobileHost(host: string): boolean {
  return STORE_HOST.test(host.toLowerCase()) && MOBILE_HOST.test(host)
}

/** Le magasin d'une adresse de page, sans l'hôte du serveur : les deux numéros et les deux chemins. */
export interface PageStore {
  id: string
  second: string
  pagePath: string
  cartPath: string
}

/**
 * Lit les numéros du magasin dans l'adresse de la page, quel que soit l'hôte `*.leclercdrive.fr` (le serveur du magasin, ou `m-courses` : DRV-754).
 *
 * @throws {RetailerError} `UNSUPPORTED_PAGE` si la page n'est pas sur `*.leclercdrive.fr` (cause `PAGE_HOST`) ou n'a pas d'adresse de magasin (cause `PAGE_PATH`).
 */
export function readPageStore(location: LocationLike): PageStore {
  const host = location.hostname.toLowerCase()
  const found = STORE_PATH.exec(location.pathname)
  const id = found?.[1]
  const second = found?.[2]
  if (!STORE_HOST.test(host)) throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_HOST')
  if (!found || id === undefined || second === undefined) {
    throw new RetailerError('UNSUPPORTED_PAGE', null, 'PAGE_PATH')
  }
  return { id, second, pagePath: found[0], cartPath: `/magasin-${id}-${second}` }
}

/**
 * Lit l'identifiant et l'hôte du magasin dans l'adresse de la page (la page est sur le serveur du magasin : `fd<N>-courses`). Sur `m-courses` l'hôte du serveur
 * n'est pas celui de la page : l'adaptateur le lit dans ses liens (`mobile.ts`).
 *
 * @throws {RetailerError} comme `readPageStore`.
 */
export function readStorePaths(location: LocationLike, label: string | null = null): StorePaths {
  const host = location.hostname.toLowerCase()
  const { id, pagePath, cartPath } = readPageStore(location)
  return {
    store: { id, host, baseUrl: `https://${host}${cartPath}`, label },
    pagePath,
    cartPath,
  }
}

/** Les petits mots d'un nom de ville qui restent en minuscules quand ils ne le commencent pas (« Saint-Maur-des-Fosses »). */
const SMALL_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'sur',
  'sous',
  'en',
  'aux',
  'au',
  'et',
  'l',
  'd',
])

/**
 * Le nom de la ville du magasin, lu dans l'adresse de la page (`/magasin-N-N-saint-priest`, avec ou sans `.aspx`) : « Saint-Priest ». Du texte pour l'écran seulement : des
 * lettres, des chiffres, des espaces, l'apostrophe et le trait d'union, 80 caractères au plus. `null` quand l'adresse n'a pas de ville ou qu'elle n'est pas lisible
 * (jamais un morceau d'adresse brut à l'écran : la personne voit alors le numéro du magasin).
 */
export function cityOfPath(pathname: string): string | null {
  const slug = /^\/magasin-\d{1,12}-\d{1,12}-([A-Za-z0-9%_-]{1,100})(?:\.aspx)?(?:\/|$)/i.exec(
    pathname,
  )?.[1]
  if (slug === undefined) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(slug)
  } catch {
    return null
  }
  const words = decoded
    .replace(/_/g, '-')
    .split('-')
    .filter((word) => word !== '')
  if (words.length === 0 || words.some((word) => !/^[\p{L}\p{N}']{1,40}$/u.test(word))) return null
  const city = words
    .map((word, rank) => {
      const lower = word.toLowerCase()
      return rank > 0 && SMALL_WORDS.has(lower)
        ? lower
        : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('-')
  return city.length <= 80 ? city : null
}

/**
 * La page d'où l'on vient est-elle l'ACCUEIL NATIONAL de l'enseigne (`https://www.leclercdrive.fr/…`), où l'on choisit son magasin (DRV-755) ? Une lecture de `document.referrer` :
 * `sessionStorage` ne passe pas de `www` à `m-courses` (deux origines), le référent si. Une adresse illisible, ou d'un autre site, n'en est pas.
 */
export function cameFromNationalHome(
  referrer: string,
  page: Pick<LocationLike, 'protocol' | 'port'> = {},
): boolean {
  try {
    const url = new URL(referrer)
    return (
      url.protocol === (page.protocol ?? 'https:') &&
      url.port === (page.port ?? '') &&
      STORE_HOST.test(url.hostname) &&
      /^www\./i.test(url.hostname)
    )
  } catch {
    return false
  }
}

/** Le point de livraison (`sNoPointLivraison`) lu dans le texte de la page, `null` s'il n'y est pas. */
export function findDeliveryPoint(pageText: string): string | null {
  const found = /["']?sNoPointLivraison["']?\s*[:=]\s*["']?(\w{3,20})["']?/.exec(
    pageText.replace(/&quot;/g, '"'),
  )
  return found?.[1] ?? null
}

/** Le point de livraison (`sNoPointLivraison`) lu dans la page ; à défaut, le premier identifiant de l'adresse. */
export function readDeliveryPoint(pageText: string, store: StoreInfo): string {
  return findDeliveryPoint(pageText) ?? store.id
}

/** D'où vient le chemin avec la ville : de l'action du formulaire de recherche du site, ou d'un lien de la page. */
export type SearchBaseSource = 'FORM' | 'LINK'

export interface SearchBase {
  /** `/magasin-<id>-<id>-<Ville>` */
  path: string
  source: SearchBaseSource
}

/** Le préfixe `/magasin-<id>-<id>` d'un magasin : des chiffres seulement, donc sans caractère spécial pour une expression régulière. */
const CART_PATH = /^\/magasin-\d{1,12}-\d{1,12}$/

/** Un site devant un chemin : `https://hôte` n'en fait pas partie. */
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i

/** Les caractères qu'un nom de ville ne contient pas (ce qui ferme une adresse dans une page, ou un échappement). */
const CITY_CHARS = `[^/"'?#<>\\s\\\\&]{1,80}`

/**
 * Le chemin du magasin AVEC sa ville, tiré de l'action du formulaire de recherche du site : `<form action="/magasin-<id>-<id>-<Ville>/recherche.aspx">`
 * (avec ou sans son hôte). Recette réelle du 2026-10-18 : la recherche répond HTTP 400 sur le chemin de l'accueil du magasin et réussit sur celui de la
 * page de résultats du site, dont l'adresse porte la ville. `null` si aucun formulaire ne vise ce magasin avec une ville. [cartPath] : `/magasin-<id>-<id>`.
 */
export function findSearchFormPath(pageText: string, cartPath: string): string | null {
  if (!CART_PATH.test(cartPath)) return null
  const target = new RegExp(`^${cartPath}(-${CITY_CHARS})/recherche\\.aspx$`, 'i')
  for (const form of pageText.matchAll(/<form\b[^>]*\baction\s*=\s*(["'])([^"']*)\1/gi)) {
    const path = (form[2] ?? '').replace(ORIGIN, '').split(/[?#]/, 1)[0] ?? ''
    const found = target.exec(path)
    if (found?.[1]) return `${cartPath}${found[1]}`
  }
  return null
}

/**
 * Le chemin du magasin AVEC sa ville, tiré du premier lien de la page qui commence par [cartPath] (`/magasin-<id>-<id>`) suivi de `-` : le site le
 * donne dans ses liens quand l'adresse de la page n'en a pas. `null` s'il n'y en a pas. Un lien d'un autre magasin n'en est jamais un : le préfixe est
 * celui de ce magasin.
 */
export function findCityPath(pageText: string, cartPath: string): string | null {
  if (!CART_PATH.test(cartPath)) return null
  const found = new RegExp(`${cartPath}(-${CITY_CHARS})(?=[/"'?#<>\\s]|$)`, 'i').exec(pageText)
  return found?.[1] ? `${cartPath}${found[1]}` : null
}

/** Le chemin avec la ville que la page donne : le formulaire de recherche d'abord, à défaut le premier lien. */
export function findSearchBase(pageText: string, cartPath: string): SearchBase | null {
  const form = findSearchFormPath(pageText, cartPath)
  if (form) return { path: form, source: 'FORM' }
  const link = findCityPath(pageText, cartPath)
  return link ? { path: link, source: 'LINK' } : null
}

import { STORE_HOST } from '../../protocol'
import { LeclercError } from './errors'

/** Le magasin de la page, tel que le protocole le renvoie (`setup-result`). */
export interface StoreInfo {
  /** Premier identifiant de l'adresse, conservé en texte (« 053701 » garde son zéro). */
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
 * Lit l'identifiant et l'hôte du magasin dans l'adresse de la page.
 *
 * @throws {LeclercError} `UNSUPPORTED_PAGE` si la page n'est pas sur `*.leclercdrive.fr` ou n'a pas d'adresse de magasin.
 */
export function readStorePaths(location: LocationLike, label: string | null = null): StorePaths {
  const host = location.hostname.toLowerCase()
  const found = STORE_PATH.exec(location.pathname)
  const id = found?.[1]
  const second = found?.[2]
  if (!STORE_HOST.test(host) || !found || id === undefined || second === undefined) {
    throw new LeclercError('UNSUPPORTED_PAGE')
  }
  const cartPath = `/magasin-${id}-${second}`
  return {
    store: { id, host, baseUrl: `https://${host}${cartPath}`, label },
    pagePath: found[0],
    cartPath,
  }
}

/** Le point de livraison (`sNoPointLivraison`) lu dans la page ; à défaut, le premier identifiant de l'adresse. */
export function readDeliveryPoint(pageText: string, store: StoreInfo): string {
  const found = /["']?sNoPointLivraison["']?\s*[:=]\s*["']?(\w{3,20})["']?/.exec(
    pageText.replace(/&quot;/g, '"'),
  )
  return found?.[1] ?? store.id
}

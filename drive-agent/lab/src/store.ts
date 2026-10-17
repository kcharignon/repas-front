// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Le magasin courant, lu dans l'adresse de la page (`/magasin-<id>-<id>/…`), et les adresses qu'on en déduit.

export interface StoreInfo {
  /** Hôte de la page (par magasin : `fdN-courses.leclercdrive.fr`). */
  host: string
  origin: string
  /** Premier identifiant de l'adresse (« 053701 »). */
  id: string
  /** Deuxième partie de l'adresse (un second identifiant, ou un nom de ville purement décoratif). */
  second: string
  /** `/magasin-<id>-<id>` : début commun à toutes les pages du magasin. */
  basePath: string
}

export interface LocationLike {
  origin: string
  host: string
  pathname: string
}

const STORE_SEGMENT = /^\/(magasin-(\d+)-([^/?#]+))/i

export function parseStore(location: LocationLike): StoreInfo | null {
  const found = STORE_SEGMENT.exec(location.pathname)
  if (!found) return null
  const [, segment, id, second] = found
  if (segment === undefined || id === undefined || second === undefined) return null
  return { host: location.host, origin: location.origin, id, second, basePath: `/${segment}` }
}

export function searchUrl(store: StoreInfo, query: string): string {
  return `${store.origin}${store.basePath}/recherche.aspx?TexteRecherche=${encodeURIComponent(query)}`
}

export function cartUrl(store: StoreInfo): string {
  return `${store.origin}${store.basePath}/panier.aspx?op=1`
}

/** Adresse d'une page du magasin avec un fragment : sert à l'essai « fragment vers Leclerc ». */
export function fragmentTargetUrl(store: StoreInfo, fragment: string): string {
  return `${store.origin}${store.basePath}/recherche.aspx?TexteRecherche=farine#lab=${fragment}`
}

/** Cherche `sNoPointLivraison` dans le texte de la page ; à défaut, le premier identifiant de l'adresse. */
export function findDeliveryPoint(
  pageText: string,
  store: StoreInfo,
): { value: string; from: 'page' | 'adresse' } {
  const found = /["']?sNoPointLivraison["']?\s*[:=]\s*["']?(\w{3,20})["']?/.exec(pageText)
  if (found?.[1]) return { value: found[1], from: 'page' }
  return { value: store.id, from: 'adresse' }
}

/** Vrai pour `leclercdrive.fr` et ses sous-domaines (`fd9-courses.leclercdrive.fr`). */
export function isLeclercHost(host: string): boolean {
  return /(^|\.)leclercdrive\.fr$/i.test(host.split(':')[0] ?? '')
}

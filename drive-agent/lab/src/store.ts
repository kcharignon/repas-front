// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Le magasin courant, lu dans l'adresse de la page (`/magasin-<id>-<id>/…`), et les adresses qu'on en déduit.

export interface StoreInfo {
  /** Hôte de la page (par magasin : `fdN-courses.leclercdrive.fr`). */
  host: string
  origin: string
  /** Premier identifiant de l'adresse (« 001234 »). */
  id: string
  /** Deuxième partie de l'adresse (un second identifiant, ou un nom de ville purement décoratif). */
  second: string
  /** `/magasin-<id>-<id>` : début commun à toutes les pages du magasin. */
  basePath: string
  /** Deuxième identifiant, quand le segment est « deux nombres » suivis, ou non, d'un nom de ville ; sinon `null`. */
  secondId: string | null
  /** Le nom de ville qui suit les deux nombres dans l'adresse de la page (jamais dans celle du panier), s'il y en a un. */
  city: string | null
  /** Début d'adresse du panier : `/magasin-<id>-<id>` sans le nom de ville, comme le site ; le segment complet si la forme est inattendue. */
  cartPath: string
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
  const shape = /^(\d+)(?:-(.+))?$/.exec(second)
  const secondId = shape?.[1] ?? null
  const basePath = `/${segment}`
  return {
    host: location.host,
    origin: location.origin,
    id,
    second,
    basePath,
    secondId,
    city: shape?.[2] ?? null,
    cartPath: secondId === null ? basePath : `/magasin-${id}-${secondId}`,
  }
}

export function searchUrl(store: StoreInfo, query: string): string {
  return `${store.origin}${store.basePath}/recherche.aspx?TexteRecherche=${encodeURIComponent(query)}`
}

/** Le panier, comme le site : `/magasin-<id>-<id>/panier.aspx?op=1`, sans le nom de ville des pages. */
export function cartUrl(store: StoreInfo): string {
  return `${store.origin}${store.cartPath}/panier.aspx?op=1`
}

/** Diagnostic : l'adresse du panier a-t-elle perdu le suffixe de ville ? Aucune valeur n'est affichée. */
export function cartAddressNote(store: StoreInfo): string {
  return store.secondId === null
    ? 'Adresse du panier : segment complet (forme inattendue)'
    : 'Adresse du panier : sans suffixe de ville'
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

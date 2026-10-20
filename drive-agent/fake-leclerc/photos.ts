// Les photos du faux site (DRV-633) : des images SYNTHÉTIQUES (un paquet coloré, sans texte), jamais une image d'une enseigne. Servies sous le nom
// d'hôte d'images du faux site (`PHOTO_HOST`, un sous-domaine de `leclercdrive.fr` comme les `fdN-photos.leclercdrive.fr` du vrai site) à l'adresse
// `/image.ashx?id=<n>&use=l&cat=p` ; l'identifiant de photo diffère de celui du produit, comme sur le vrai site (`recherche.md`).
import { PRODUCTS, type FakeProduct } from './catalog.ts'

/** Le nom d'hôte des images du faux site. */
export const PHOTO_HOST = 'photos-test.leclercdrive.fr'
/** L'hôte d'un faux « autre site » : la liste blanche de l'agent doit le refuser. Il ne répond jamais (aucun nom n'y mène). */
export const FOREIGN_PHOTO_HOST = 'images.autre-site.invalid'

/** L'identifiant de photo d'un produit. */
export const photoIdOf = (product: FakeProduct): number => product.id - 999000

/** L'adresse (JSON de la recherche) de la photo d'un produit : `null` quand le produit n'en a pas, un autre hôte quand elle est « étrangère ». */
export function photoAddress(product: FakeProduct): string | null {
  const id = photoIdOf(product)
  if (product.photo === 'none') return null
  if (product.photo === 'foreign')
    return `https://${FOREIGN_PHOTO_HOST}/image.ashx?id=${id}&use=l&cat=p`
  return `https://${PHOTO_HOST}/image.ashx?id=${id}&use=l&cat=p`
}

export interface PhotoReply {
  status: number
  type: string
  body: string
}

/** Un paquet synthétique : un rectangle de teinte propre à l'identifiant, un couvercle plus sombre, un cartouche blanc. Aucun texte. */
function packet(id: number): string {
  const hue = (id * 47) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" fill="#fff"/><rect x="26" y="14" width="68" height="96" rx="8" fill="hsl(${hue} 60% 55%)"/><rect x="26" y="14" width="68" height="20" rx="8" fill="hsl(${hue} 60% 35%)"/><rect x="38" y="52" width="44" height="32" rx="4" fill="#fff"/></svg>`
}

/**
 * La réponse du faux hôte d'images à `image.ashx?id=<n>` : le paquet, ou un 404 pour un produit dont la photo « manque » (`photo: 'missing'`) et
 * pour un identifiant inconnu.
 */
export function photoReply(search: string): PhotoReply {
  const id = Number(new URLSearchParams(search).get('id'))
  const product = PRODUCTS.find((candidate) => photoIdOf(candidate) === id)
  if (!product || product.photo === 'missing') {
    return { status: 404, type: 'text/plain; charset=utf-8', body: 'introuvable' }
  }
  return { status: 200, type: 'image/svg+xml', body: packet(id) }
}

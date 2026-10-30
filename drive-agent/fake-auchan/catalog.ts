// Les produits INVENTÉS du faux site d'Auchan (DRV-717) : des identifiants de test (UUID tirés à la main), des libellés de test, des prix de test. Rien
// ici ne vient du vrai site. La FORME (un produit et une offre, deux UUID ; un code-barres ; un prix en euros sur la page et en centimes dans le panier)
// est celle que le spike du 2026-10-30 a mesurée (DRV-714) ; les valeurs sont fausses.
export interface FakeProduct {
  /** `productId` : un UUID de test. */
  productId: string
  /** `offerId` : un UUID de test, celui de l'offre du produit dans le faux magasin. */
  offerId: string
  label: string
  brand: string
  /** Le prix en CENTIMES (le panier) ; la page l'affiche en euros. */
  priceCents: number
  /** Le contenu net tel que la page l'affiche (« 1kg »), jamais un champ structuré (non relevé). */
  net: string
  ean: string
  /** Au plus ce nombre au panier (`offering.maxQuantity`, lié au stock). */
  maxQuantity: number
  /** Le nom du fichier de la photo, dans `/media/` du faux hôte d'images. */
  photo: string
}

export const PRODUCTS: readonly FakeProduct[] = [
  {
    productId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    offerId: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
    label: 'Farine de blé T55 de test',
    brand: 'Marque Test',
    priceCents: 91,
    net: '1kg',
    ean: '0000000000017',
    maxQuantity: 397,
    photo: 'S00000000001G1GPRIMARY',
  },
  {
    productId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    offerId: '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80',
    label: 'Lait UHT demi-écrémé de test',
    brand: 'Marque Test',
    priceCents: 105,
    net: '1L',
    ean: '0000000000024',
    maxQuantity: 120,
    photo: 'S00000000002G1GPRIMARY',
  },
  {
    productId: '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091',
    offerId: '6f7a8b9c-0d1e-4f2a-8b4c-5d6e7f8091a2',
    label: 'Farine complète de test',
    brand: 'Marque Test',
    priceCents: 129,
    net: '1kg',
    ean: '0000000000031',
    maxQuantity: 12,
    photo: 'S00000000003G1GPRIMARY',
  },
  {
    productId: '7a8b9c0d-1e2f-4a3b-9c5d-6e7f8091a2b3',
    offerId: '8b9c0d1e-2f3a-4b4c-8d6e-7f8091a2b3c4',
    label: 'Sel fin de test',
    brand: 'Marque Test',
    priceCents: 55,
    net: '500g',
    ean: '0000000000048',
    maxQuantity: 80,
    photo: 'S00000000004G1GPRIMARY',
  },
]

export function findProduct(productId: string): FakeProduct | undefined {
  return PRODUCTS.find((product) => product.productId === productId)
}

/** Les produits dont le libellé contient le texte cherché (sans casse). Pas de moteur d'Auchan : un squelette pour DRV-724. */
export function searchCatalog(text: string): FakeProduct[] {
  const wanted = text.trim().toLowerCase()
  if (wanted === '') return []
  return PRODUCTS.filter((product) => product.label.toLowerCase().includes(wanted))
}

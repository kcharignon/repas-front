// Les causes du panier d'Auchan (DRV-725) : une vérification de plus qui peut échouer, dite par un code fixe (jamais un morceau de réponse, d'adresse ou de
// cookie). `auchan/causes.ts` les reprend, comme celles du magasin. Chaque libellé dit ce qui a été VÉRIFIÉ ; aucun ne prétend connaître un message du site
// (les codes d'erreur `401` et `99001` à `99007` de `GET /cart/config` sont INCONNUS : hypothèse C-7).
export const AUCHAN_CART_CAUSES = {
  CART_CONSENT_UNREADABLE: 'identifiant de consentement du panier absent ou illisible dans la page',
  CART_NO_CART: 'réponse du panier sans panier lisible',
  CART_ID_UNREADABLE: 'identifiant du panier absent ou illisible dans la réponse',
  CART_ITEMS_UNREADABLE: 'réponse du panier sans liste de lignes',
  CART_LINE_UNREADABLE: 'ligne du panier sans quantité lisible',
  CART_LINE_ID_UNREADABLE: 'ligne du panier déjà présente sans identifiant lisible',
  CART_OFFER_UNKNOWN: 'offre du produit inconnue (ni lue dans la recherche, ni dans le panier)',
  CART_QUANTITY_MISMATCH: 'quantité au panier différente de celle demandée après l’écriture',
} as const

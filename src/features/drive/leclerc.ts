/**
 * La page du panier, à la suite de l'adresse du magasin. L'adresse précise est à relever à l'intégration (DRV-501) : d'ici là, la page
 * d'accueil du magasin (chemin vide) d'où le panier est à un geste.
 */
export const BASKET_PATH = ''

/** L'adresse à ouvrir dans le navigateur pour finaliser la commande, ou `null` sans magasin. */
export const basketUrl = (storeBaseUrl: string | null | undefined): string | null =>
  storeBaseUrl ? `${storeBaseUrl}${BASKET_PATH}` : null

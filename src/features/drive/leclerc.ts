/**
 * L'accueil du drive Leclerc (celui de `NavigationPolicy.START_URL` de l'application Android) : session ouverte, il affiche l'accueil du magasin
 * de l'utilisateur, d'où le panier est à une touche. Dans l'application, ce lien s'ouvre dans l'écran du drive (connecté), jamais dans le
 * navigateur du téléphone (DRV-625).
 */
export const DRIVE_HOME_URL = 'https://www.leclercdrive.fr/'

/**
 * La page du panier, à la suite de l'adresse du magasin. Vide tant que l'adresse du vrai site n'est pas relevée (le diagnostic de l'agent la
 * sonde, DRV-625) : « Finaliser sur Leclerc » ouvre alors l'accueil du drive. Une fois relevée (`/panier.aspx`…), elle est bâtie à partir du
 * magasin enregistré dans Repas, jamais d'une adresse lue sur une page de Leclerc ; l'application n'ouvre qu'une page de magasin du drive et
 * se replie sur l'accueil du drive sinon.
 */
export const BASKET_PATH: string = ''

/** L'adresse à ouvrir pour finaliser la commande, ou `null` sans magasin. */
export const basketUrl = (storeBaseUrl: string | null | undefined): string | null => {
  if (!storeBaseUrl) return null

  return BASKET_PATH === '' ? DRIVE_HOME_URL : `${storeBaseUrl}${BASKET_PATH}`
}

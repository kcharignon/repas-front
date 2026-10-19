/**
 * L'accueil du drive Leclerc (celui de `NavigationPolicy.START_URL` de l'application Android) : session ouverte, il affiche l'accueil du magasin
 * de l'utilisateur, d'où le panier est à une touche. Dans l'application, ce lien s'ouvre dans l'écran du drive (connecté), jamais dans le
 * navigateur du téléphone (DRV-625). C'est aussi le repli de « Finaliser sur Leclerc » quand la page du panier est inconnue ou refusée.
 */
export const DRIVE_HOME_URL = 'https://www.leclercdrive.fr/'

/**
 * La page du panier, à la suite du chemin du magasin AVEC la ville (constat du 2026-10-19 sur le vrai site : `/magasin-N-N-Ville/detail-panier.aspx`).
 * Le segment est fixe ; la ville, elle, ne se lit que dans une page du magasin : Repas ne la connaît pas (il garde les numéros du magasin), c'est
 * l'application qui la retient (dernière page de magasin vue) et complète le lien (`DriveEntry` côté Android). Mêmes mots des deux côtés
 * (`android/__tests__/basket-link.spec.ts` le vérifie).
 */
export const BASKET_PATH = '/detail-panier.aspx'

/** `/magasin-N-N`, avec ou sans ville : les deux numéros du magasin, sans le reste de l'adresse. */
const STORE_IDS = /^\/(magasin-\d{1,12}-\d{1,12})(?:-[^/?#]*)?(?:\/|$)/

/**
 * L'adresse à ouvrir pour finaliser la commande, ou `null` sans magasin.
 *
 * Dans l'application (`inApp`) : le lien du panier `https://<hôte>/magasin-N-N/detail-panier.aspx` (sans ville : la coquille y met celle qu'elle a
 * retenue, et ouvre l'accueil du drive sinon). Dans un navigateur : l'accueil du drive, car ce lien sans ville y serait une page introuvable, et l'on
 * n'y est pas connecté de toute façon. Jamais une adresse lue sur une page de Leclerc : seuls l'hôte et les numéros du magasin enregistré servent.
 */
export const basketUrl = (
  storeBaseUrl: string | null | undefined,
  inApp = false,
): string | null => {
  if (!storeBaseUrl) return null
  if (!inApp) return DRIVE_HOME_URL

  try {
    const url = new URL(storeBaseUrl)
    const store = STORE_IDS.exec(url.pathname)
    if (url.protocol !== 'https:' || store === null) return DRIVE_HOME_URL

    return `https://${url.host}/${store[1]}${BASKET_PATH}`
  } catch {
    return DRIVE_HOME_URL
  }
}

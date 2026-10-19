/**
 * L'accueil du drive Leclerc (celui de `NavigationPolicy.START_URL` de l'application Android) : session ouverte, il affiche l'accueil du magasin
 * de l'utilisateur, d'où le panier est à une touche. Dans l'application, ce lien s'ouvre dans l'écran du drive (connecté), jamais dans le
 * navigateur du téléphone (DRV-625). C'est aussi le repli de « Finaliser sur Leclerc » quand l'application ne connaît pas encore le chemin du
 * magasin.
 */
export const DRIVE_HOME_URL = 'https://www.leclercdrive.fr/'

/** `/magasin-N-N`, avec ou sans ville : les deux numéros du magasin, sans le reste de l'adresse. */
const STORE_IDS = /^\/(magasin-\d{1,12}-\d{1,12})(?:-[^/?#]*)?(?:\/|$)/

/**
 * L'adresse du lien « Finaliser sur Leclerc », ou `null` sans magasin.
 *
 * Dans l'application (`inApp`) : `https://<hôte>/magasin-N-N` (sans ville), un lien qui dit seulement **quel magasin**. L'application l'ouvre sur la
 * page d'accueil du magasin avec la ville qu'elle a retenue (celle qui charge toujours), sur l'accueil du drive sinon, et ne va **jamais** vers la
 * page `detail-panier.aspx` (DRV-631 : Leclerc l'ouvre « introuvable » quand on n'y arrive pas depuis son site). Dans un navigateur : l'accueil du
 * drive, car ce lien sans ville y serait une page introuvable, et l'on n'y est pas connecté de toute façon. Jamais une adresse lue sur une page de
 * Leclerc : seuls l'hôte et les numéros du magasin enregistré servent.
 */
export const finalizeLink = (
  storeBaseUrl: string | null | undefined,
  inApp = false,
): string | null => {
  if (!storeBaseUrl) return null
  if (!inApp) return DRIVE_HOME_URL

  try {
    const url = new URL(storeBaseUrl)
    const store = STORE_IDS.exec(url.pathname)
    if (url.protocol !== 'https:' || store === null) return DRIVE_HOME_URL

    return `https://${url.host}/${store[1]}`
  } catch {
    return DRIVE_HOME_URL
  }
}

package eu.kantin.repas.drive

/**
 * Ouvrir le drive DANS l'application, sans plan (DRV-625, DRV-629) : « Finaliser sur Leclerc » du récapitulatif de Repas est un lien vers le drive.
 * Il ne s'ouvre pas dans le navigateur du téléphone, où l'utilisateur n'est pas connecté à Leclerc (sa connexion est dans le profil « drive » de
 * l'application) : la coquille le confie à [DriveActivity].
 *
 * Où il s'ouvre :
 * - le lien du front est `https://<hôte>/magasin-N-N/detail-panier.aspx` (le magasin enregistré dans Repas, sans ville) : la page du panier du vrai
 *   site est sous le chemin AVEC la ville (`/magasin-N-N-Ville/detail-panier.aspx`), que la dernière page de magasin vue dans le drive a donnée
 *   ([StorePathMemory]). Si ce chemin est connu et du même hôte et des mêmes numéros : la page du panier. Sinon : l'accueil du drive
 *   ([NavigationPolicy.START_URL]), où le panier est à une touche. Jamais une adresse tirée du plan ni d'une page ;
 * - toute autre page du drive (accueil, page de magasin, site mobile, forme douteuse) est remplacée par l'accueil du drive. Une adresse qui n'est
 *   pas du drive n'est pas concernée (la coquille la confie au navigateur, comme avant).
 *
 * Si le site refuse la page du panier (404, erreur), l'écran du drive se replie sur l'accueil ([fallsBack]).
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
object DriveEntry {
    /** Le nom de la page du panier, sous le chemin du magasin (avec la ville) : constat du 2026-10-19, `BASKET_PATH` du front. */
    const val BASKET_PAGE = "detail-panier.aspx"

    /** Le lien du front : `https://<hôte>/magasin-N-N/detail-panier.aspx`, sans ville, sans paramètre ni fragment. */
    private val BASKET_LINK = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})/" + Regex.escape(BASKET_PAGE) + "$")

    /**
     * La page où ouvrir le drive pour ce lien de la page de Repas, ou `null` si ce n'est pas un lien du drive. La page du panier (avec la ville
     * retenue par [memory]) pour le lien du panier du front, sinon l'accueil du drive.
     */
    fun target(url: String?, memory: StorePathMemory? = null): String? {
        if (!NavigationPolicy.isAllowed(url)) return null
        if (url == NavigationPolicy.START_URL) return url
        return basketOf(url!!, memory) ?: NavigationPolicy.START_URL
    }

    /** La page d'ouverture demandée à l'écran du drive, revérifiée : l'accueil, ou une page du panier (avec la ville) ; sinon l'accueil. */
    fun startPage(url: String?): String =
        if (isBasketPage(url)) url!! else NavigationPolicy.START_URL

    /** Vrai pour la page du panier d'un magasin, avec la ville dans le chemin : `https://<hôte>/magasin-N-N-Ville/detail-panier.aspx`. */
    fun isBasketPage(url: String?): Boolean {
        val entry = StorePathMemory.parse(url) ?: return false
        return url == "${entry.value}/$BASKET_PAGE"
    }

    /**
     * Faut-il se replier sur l'accueil du drive ? Vrai quand la page du panier demandée ([armed]) est refusée par le site : même adresse, code 4xx ou
     * 5xx. Sauf 403 et 429 : c'est le plus souvent le défi de l'anti-robot, que l'utilisateur doit pouvoir passer (le même défi attendrait sur l'accueil).
     */
    fun fallsBack(armed: String?, requested: String?, status: Int): Boolean =
        armed != null && requested == armed && status >= 400 && status != 403 && status != 429

    private fun basketOf(url: String, memory: StorePathMemory?): String? {
        if (NavigationPolicy.isMobileSite(url)) return null
        val host = NavigationPolicy.httpsHostOf(url) ?: return null
        val afterScheme = url.substring("https://".length)
        val slash = afterScheme.indexOf('/')
        if (slash < 0) return null
        val found = BASKET_LINK.matchEntire(afterScheme.substring(slash)) ?: return null
        return memory?.basketUrl(host, found.groupValues[1], found.groupValues[2])
    }
}

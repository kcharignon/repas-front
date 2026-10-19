package eu.kantin.repas.drive

/**
 * Ouvrir le drive DANS l'application, sans plan (DRV-625) : « Finaliser sur Leclerc » du récapitulatif de Repas est un lien vers le drive. Il ne
 * s'ouvre pas dans le navigateur du téléphone, où l'utilisateur n'est pas connecté à Leclerc (sa connexion est dans le profil « drive » de
 * l'application) : la coquille le confie à [DriveActivity].
 *
 * Où il s'ouvre : l'accueil du drive ([NavigationPolicy.START_URL]) tant que l'adresse du panier du vrai site n'est pas relevée (`BASKET_PATH`
 * du front est vide), où le panier est à une touche ; ensuite la page du panier, que le front bâtit à partir du magasin enregistré dans Repas
 * (jamais d'une adresse tirée d'une page de Leclerc). Ici on ne croit que ce qui a la forme attendue : une page de magasin du drive, sinon
 * l'accueil du drive. Une adresse qui n'est pas du drive n'est pas concernée (la coquille la confie au navigateur, comme avant).
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
object DriveEntry {
    /**
     * La page où ouvrir le drive pour ce lien de la page de Repas, ou `null` si ce n'est pas un lien du drive. L'accueil du drive, une page de
     * magasin du drive (le panier) ; toute autre page du drive (site mobile, page sans magasin, forme douteuse) est remplacée par l'accueil.
     */
    fun target(url: String?): String? {
        if (!NavigationPolicy.isAllowed(url)) return null
        if (url == NavigationPolicy.START_URL) return url
        return if (NavigationPolicy.isStorePage(url)) url else NavigationPolicy.START_URL
    }
}

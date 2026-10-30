package eu.kantin.repas.drive

/**
 * Les enseignes d'ESSAI de la variante de débogage (DRV-707) : une seconde enseigne FICTIVE, servie par le faux site de l'émulateur (`*.exemple-b.test`,
 * `.test` est un domaine réservé que le DNS de l'émulateur renvoie vers le faux site local), pour que `make android-e2e` prouve l'isolement entre
 * enseignes : écran de B limité à B, profil de WebView à part, plan refusé sur la mauvaise page.
 *
 * Elle n'existe que dans les APK de débogage (`app/src/debug`) ; la construction de publication a son propre `TestRetailers` vide
 * (`app/src/release`), et `android/__tests__/screen-retailer.spec.ts` le garde. Elle n'est jamais annoncée à Repas (`app.info`) ni proposée dans un menu.
 */
internal object TestRetailers {
    private const val CITY = "[^/?#\\s\\\\<>\"'\\u0000-\\u001f]+"

    private val B = RetailerSite(
        id = "exempleb",
        name = "Enseigne B",
        nameDe = "de l’enseigne B",
        startUrl = "https://www.exemple-b.test/",
        siteMode = SiteMode.DESKTOP,
        hosts = listOf(
            SiteHost(HostPattern.exact("exemple-b.test"), bridge = false),
            SiteHost(HostPattern.subdomainsOf("exemple-b.test"), bridge = true),
        ),
        storeHost = Regex("[a-z0-9-]+\\.exemple-b\\.test"),
        storeIdPattern = Regex("[0-9]{1,12}"),
        storePages = StorePages(
            pagePath = Regex("^/point-[0-9]{1,12}-[0-9]{1,12}(-[^/]*)?(/|$)", RegexOption.IGNORE_CASE),
            homeSegment = Regex("^/point-([0-9]{1,12})-([0-9]{1,12})-$CITY$"),
            frontLink = Regex("^/point-([0-9]{1,12})-([0-9]{1,12})$"),
        ),
        loginPath = Regex("^/connexion(\\.aspx)?(/|$)", RegexOption.IGNORE_CASE),
        mobileSiteLabel = Regex("m(-[a-z0-9-]*)?"),
    )

    /** Les enseignes d'essai que cette construction ajoute à celles de [RetailerSites.DEFAULT]. */
    val extra: List<RetailerSite> = listOf(B)
}

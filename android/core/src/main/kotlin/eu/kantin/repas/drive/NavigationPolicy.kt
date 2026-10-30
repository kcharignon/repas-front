package eu.kantin.repas.drive

/** Ce que l'application fait d'une adresse que la WebView veut ouvrir. */
enum class Decision {
    /** Rester dans la WebView : `https` et un hôte de l'enseigne de l'écran. */
    ALLOW,

    /** Confier l'adresse au navigateur du téléphone : une page web (`http` ou `https`) d'un autre site. */
    OPEN_EXTERNALLY,

    /** Ne rien faire : tout autre type d'adresse (`javascript:`, `intent:`, `file:`, `tel:`…). */
    BLOCK,
}

/**
 * La règle de navigation : seules les pages `https` **de l'enseigne de l'écran** ([RetailerSite]) restent dans l'application. Une page d'une autre enseigne
 * n'y reste pas : elle part au navigateur du téléphone, comme n'importe quel autre site.
 *
 * Écrite en Kotlin pur (sans `android.net.Uri`) pour se tester sans téléphone. Elle lit l'adresse à la main et refuse tout ce qui est ambigu (barre
 * oblique inverse, `@`, port inattendu, point final, caractère hors ASCII) : un refus envoie l'adresse au navigateur du téléphone, ce qui est sans
 * danger ; une acceptation à tort ne l'est pas.
 *
 * Les formes d'adresse propres à une enseigne (page de magasin, accueil, connexion, site mobile) sont des méthodes de [RetailerSite]. Les fonctions de cet
 * objet qui ne reçoivent pas d'enseigne ([decide], [isAllowed], [START_URL]…) sont celles de l'enseigne d'avant le multi-enseignes
 * ([RetailerSites.legacy]) : un écran qui n'a pas choisi d'enseigne ne navigue que chez elle, jamais chez toutes.
 */
object NavigationPolicy {
    private const val HTTPS = "https://"
    private const val HTTP = "http://"

    private val legacy: RetailerSite get() = RetailerSites.DEFAULT.legacy

    /** L'accueil de l'enseigne d'avant le multi-enseignes ([RetailerSite.startUrl]). */
    val START_URL: String get() = legacy.startUrl

    /** Ce que l'application fait de cette adresse dans l'écran de l'enseigne d'avant le multi-enseignes. */
    fun decide(url: String?): Decision = decide(legacy, url)

    /** Ce que l'application fait de cette adresse dans l'écran de [site] : elle ne reste dans la WebView que sur les pages de **cette** enseigne. */
    fun decide(site: RetailerSite, url: String?): Decision {
        if (url == null) return Decision.BLOCK
        if (site.isNavigable(url)) return Decision.ALLOW
        val isWebPage = startsWithAscii(url, HTTPS) || startsWithAscii(url, HTTP)
        return if (isWebPage) Decision.OPEN_EXTERNALLY else Decision.BLOCK
    }

    /**
     * Vrai si `url` commence par `prefix` (en minuscules ASCII), sans tenir compte de la casse des seules lettres ASCII. Pas de comparaison
     * « sans casse » de Kotlin : elle suit Unicode, où « \u017F » (s long) devient « S » en majuscule et ferait de `http\u017F://` un `https://`.
     */
    internal fun startsWithAscii(url: String, prefix: String): Boolean =
        url.length >= prefix.length && prefix.indices.all { index ->
            val char = url[index]
            (if (char in 'A'..'Z') char + ('a' - 'A') else char) == prefix[index]
        }

    /** Une page où l'on navigue chez l'enseigne d'avant le multi-enseignes ([RetailerSite.isNavigable]). */
    fun isAllowed(url: String?): Boolean = legacy.isNavigable(url)

    /** Le site mobile de l'enseigne d'avant le multi-enseignes ([RetailerSite.isMobileSite]). */
    fun isMobileSite(url: String?): Boolean = legacy.isMobileSite(url)

    /** Une page de magasin de l'enseigne d'avant le multi-enseignes ([RetailerSite.isStorePage]). */
    fun isStorePage(url: String?): Boolean = legacy.isStorePage(url)

    /** L'accueil de l'enseigne d'avant le multi-enseignes ([RetailerSite.isHomePage]). */
    fun isHomePage(url: String?): Boolean = legacy.isHomePage(url)

    /** La page de connexion hors d'un magasin de l'enseigne d'avant le multi-enseignes ([RetailerSite.isLoginPage]). */
    fun isLoginPage(url: String?): Boolean = legacy.isLoginPage(url)

    /**
     * Le chemin d'une adresse `https` déjà lue ([httpsHostOf] n'est pas `null`) : ce qui suit le nom du site, sans requête ni fragment. Vide quand
     * l'adresse n'a pas de chemin (`https://exemple.test`, `https://exemple.test?x=1`).
     */
    internal fun pathOf(url: String): String {
        val afterScheme = url.substring(HTTPS.length)
        val pathStart = afterScheme.indexOfAny(charArrayOf('/', '?', '#'))
        if (pathStart < 0) return ""
        return afterScheme.substring(pathStart).substringBefore('?').substringBefore('#')
    }

    /**
     * Le nom du site d'une adresse `https` (en minuscules), ou `null` si l'adresse n'est pas une adresse `https` sûre à lire.
     * Le port n'est accepté que s'il est 443.
     */
    fun httpsHostOf(url: String?): String? {
        if (url == null || !startsWithAscii(url, HTTPS)) return null
        val authority = authorityOf(url.substring(HTTPS.length))
        val colon = authority.indexOf(':')
        val host = if (colon < 0) authority else authority.substring(0, colon)
        if (colon >= 0 && authority.substring(colon + 1) != "443") return null
        return if (isPlainHostName(host)) host.lowercase() else null
    }

    /**
     * Une description de l'adresse sans chemin ni paramètres, pour l'écran de diagnostic : `https://exemple.org`,
     * `http://exemple.org`, ou seulement le type d'adresse (`tel`, `intent`…). Jamais d'adresse complète.
     */
    fun describe(url: String?): String {
        if (url == null) return "?"
        for (scheme in listOf(HTTPS, HTTP)) {
            if (!startsWithAscii(url, scheme)) continue
            val authority = authorityOf(url.substring(scheme.length))
            val host = authority.substringBefore(':')
            // Un identifiant dans l'adresse (« nom:secret@site ») n'est jamais recopié.
            return if ('@' !in authority && isPlainHostName(host)) scheme + host.lowercase() else scheme + "?"
        }
        val colon = url.indexOf(':')
        val scheme = if (colon in 1..20) url.substring(0, colon) else ""
        return if (scheme.isNotEmpty() && scheme.all { it in 'a'..'z' || it in 'A'..'Z' }) scheme.lowercase() else "?"
    }

    /** Ce qui suit `https://` jusqu'au premier `/`, `?` ou `#` : le site, éventuellement avec un port (ou, à tort, un identifiant). */
    private fun authorityOf(afterScheme: String): String {
        val end = afterScheme.indexOfAny(charArrayOf('/', '?', '#')).let { if (it < 0) afterScheme.length else it }
        return afterScheme.substring(0, end)
    }

    /** Un nom de site en lettres ASCII, chiffres, tirets et points, sans libellé vide ni tiret au bord, sans point final. */
    internal fun isPlainHostName(host: String): Boolean {
        if (host.isEmpty() || host.length > 253) return false
        return host.split('.').all { label ->
            label.isNotEmpty() &&
                label.length <= 63 &&
                !label.startsWith('-') &&
                !label.endsWith('-') &&
                label.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '-' }
        }
    }
}

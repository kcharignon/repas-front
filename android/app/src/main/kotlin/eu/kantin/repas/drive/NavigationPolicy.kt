package eu.kantin.repas.drive

/** Ce que l'application fait d'une adresse que la WebView veut ouvrir. */
enum class Decision {
    /** Rester dans la WebView : `https` et un hôte de `leclercdrive.fr`. */
    ALLOW,

    /** Confier l'adresse au navigateur du téléphone : une page web (`http` ou `https`) d'un autre site. */
    OPEN_EXTERNALLY,

    /** Ne rien faire : tout autre type d'adresse (`javascript:`, `intent:`, `file:`, `tel:`…). */
    BLOCK,
}

/**
 * La règle de navigation : seules les pages `https` de `leclercdrive.fr` et de ses sous-domaines restent dans l'application.
 *
 * Écrite en Kotlin pur (sans `android.net.Uri`) pour se tester sans téléphone. Elle lit l'adresse à la main et refuse
 * tout ce qui est ambigu (barre oblique inverse, `@`, port inattendu, point final, caractère hors ASCII) : un refus
 * envoie l'adresse au navigateur du téléphone, ce qui est sans danger ; une acceptation à tort ne l'est pas.
 */
object NavigationPolicy {
    const val START_URL = "https://www.leclercdrive.fr/"

    private const val HOME_HOST = "www.leclercdrive.fr"

    private const val ALLOWED_DOMAIN = "leclercdrive.fr"
    private const val HTTPS = "https://"
    private const val HTTP = "http://"

    /** Le début du chemin d'une page de magasin : `/magasin-123456-123456`, puis `/`, `-Ville`, ou la fin du chemin. */
    private val STORE_PATH = Regex("^/magasin-[0-9]{1,12}-[0-9]{1,12}(-[^/]*)?(/|$)", RegexOption.IGNORE_CASE)

    /** Le premier nom du site mobile de Leclerc (`m-courses.leclercdrive.fr`) : `m`, ou un nom qui commence par `m-`. */
    private val MOBILE_LABEL = Regex("m(-[a-z0-9-]*)?")

    fun decide(url: String?): Decision {
        if (url == null) return Decision.BLOCK
        if (isAllowed(url)) return Decision.ALLOW
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

    fun isAllowed(url: String?): Boolean {
        val host = httpsHostOf(url) ?: return false
        return host == ALLOWED_DOMAIN || host.endsWith(".$ALLOWED_DOMAIN")
    }

    /**
     * L'adresse est-elle celle du site mobile de Leclerc (`m-courses.leclercdrive.fr`, ticket J) ? Il n'a pas les routes du site ordinateur (la
     * recherche y répond 200 sans produit) : l'agent n'y agit pas, et l'application ne lui envoie ni plan ni lecture du magasin ([isStorePage]).
     * La WebView est en mode ordinateur pour ne pas le recevoir ; s'il apparaît quand même, [StoreBanner.MOBILE] le dit à l'utilisateur.
     */
    fun isMobileSite(url: String?): Boolean {
        if (!isAllowed(url)) return false
        val host = httpsHostOf(url) ?: return false
        return MOBILE_LABEL.matches(host.substringBefore('.'))
    }

    /**
     * L'adresse est-elle celle d'une page de magasin (DRV-320) ? Une page `https` du drive dont le chemin commence par
     * `/magasin-<identifiant>-<identifiant>` (chiffres), éventuellement suivi d'un nom de ville : la même règle que l'agent
     * (`readStorePaths`), qui lit le magasin dans cette adresse. L'accueil du drive et la page de connexion n'en sont pas, ni le site mobile
     * ([isMobileSite]), même avec une adresse de cette forme.
     */
    fun isStorePage(url: String?): Boolean {
        if (!isAllowed(url) || isMobileSite(url)) return false
        val afterScheme = url!!.substring(HTTPS.length)
        val pathStart = afterScheme.indexOfAny(charArrayOf('/', '?', '#'))
        if (pathStart < 0 || afterScheme[pathStart] != '/') return false
        val path = afterScheme.substring(pathStart).substringBefore('?').substringBefore('#')
        return STORE_PATH.containsMatchIn(path)
    }

    /**
     * L'adresse est-elle l'accueil de l'enseigne ([START_URL], DRV-625) : `https://www.leclercdrive.fr/`, sans chemin (la requête et le fragment ne
     * comptent pas) ? C'est là qu'un plan s'ouvre : session ouverte, la page affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer
     * mes courses », que l'agent suit lui-même. Ce n'est pas une page de magasin ([isStorePage]).
     */
    fun isHomePage(url: String?): Boolean {
        if (httpsHostOf(url) != HOME_HOST) return false
        val afterScheme = url!!.substring(HTTPS.length)
        val pathStart = afterScheme.indexOfAny(charArrayOf('/', '?', '#'))
        if (pathStart < 0) return true
        return afterScheme.substring(pathStart).substringBefore('?').substringBefore('#').let { it == "" || it == "/" }
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
    private fun isPlainHostName(host: String): Boolean {
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

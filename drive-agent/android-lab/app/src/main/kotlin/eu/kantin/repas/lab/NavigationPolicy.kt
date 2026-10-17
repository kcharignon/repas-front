package eu.kantin.repas.lab

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

    private const val ALLOWED_DOMAIN = "leclercdrive.fr"
    private const val HTTPS = "https://"
    private const val HTTP = "http://"

    fun decide(url: String?): Decision {
        if (url == null) return Decision.BLOCK
        if (isAllowed(url)) return Decision.ALLOW
        val isWebPage = url.startsWith(HTTPS, ignoreCase = true) || url.startsWith(HTTP, ignoreCase = true)
        return if (isWebPage) Decision.OPEN_EXTERNALLY else Decision.BLOCK
    }

    fun isAllowed(url: String?): Boolean {
        val host = httpsHostOf(url) ?: return false
        return host == ALLOWED_DOMAIN || host.endsWith(".$ALLOWED_DOMAIN")
    }

    /**
     * Le nom du site d'une adresse `https` (en minuscules), ou `null` si l'adresse n'est pas une adresse `https` sûre à lire.
     * Le port n'est accepté que s'il est 443.
     */
    fun httpsHostOf(url: String?): String? {
        if (url == null || !url.startsWith(HTTPS, ignoreCase = true)) return null
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
            if (!url.startsWith(scheme, ignoreCase = true)) continue
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

package eu.kantin.repas.drive

/**
 * L'origine du front Repas que la coquille charge (DRV-317) : `https://<hôte>`, sans port ni chemin. Elle est écrite à la construction
 * (`BuildConfig.REPAS_ORIGIN`, `https://kantin.eu/` en production) et ne vient jamais d'un message ni d'une page.
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
object RepasOrigin {
    /** L'origine de la production, celle de l'APK de publication (`app/build.gradle.kts` l'écrit dans `BuildConfig.REPAS_ORIGIN`). */
    const val PRODUCTION = "https://kantin.eu/"

    /** La forme canonique d'une origine (`https://kantin.eu`, sans barre finale), ou `null` si ce n'est pas `https://<hôte>` (port 443 permis). */
    fun parse(value: String?): String? {
        if (value == null) return null
        val trimmed = value.removeSuffix("/")
        val host = NavigationPolicy.httpsHostOf(trimmed) ?: return null
        val canonical = "https://$host"
        return canonical.takeIf { trimmed.lowercase().removeSuffix(":443") == it }
    }

    /** Le nom du site d'une origine canonique. */
    fun hostOf(origin: String): String = origin.removePrefix("https://")

    /** Vrai si `candidate` (par exemple l'origine d'un message de la page) est exactement l'origine de Repas. */
    fun matches(candidate: String?, origin: String): Boolean = parse(candidate) == origin
}

/**
 * La règle de navigation de la coquille : seules les pages `https` de l'origine de Repas restent dans la WebView. Une autre page web
 * (dont `*.leclercdrive.fr`, qui a son écran dédié) s'ouvre dans le navigateur du téléphone ; tout autre type d'adresse est ignoré.
 *
 * Elle lit l'adresse comme [NavigationPolicy] : tout ce qui est ambigu (identifiant dans l'adresse, barre oblique inverse, port
 * inattendu, caractère hors ASCII) va au navigateur, ce qui est sans danger ; une acceptation à tort ne l'est pas.
 */
class ShellNavigation(origin: String) {
    private val host = RepasOrigin.hostOf(RepasOrigin.parse(origin) ?: throw IllegalArgumentException("Origine de Repas invalide."))

    fun decide(url: String?): Decision {
        if (url == null) return Decision.BLOCK
        if (NavigationPolicy.httpsHostOf(url) == host) return Decision.ALLOW
        val isWebPage = url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)
        return if (isWebPage) Decision.OPEN_EXTERNALLY else Decision.BLOCK
    }

    /** L'adresse d'un lien entrant (`https://kantin.eu/…` ouvert depuis une autre application) à charger dans la coquille, ou `null`. */
    fun entryUrl(data: String?): String? = data?.takeIf { decide(it) == Decision.ALLOW }
}

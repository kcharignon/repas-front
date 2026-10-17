package eu.kantin.repas.lab

/** Les agents utilisateur essayés par le spike, mémorisés par leur clé. */
enum class UserAgentChoice(val key: String) {
    /** Celui de la WebView, tel quel (il porte le marqueur `wv`). Leclerc y répond par son site mobile. */
    WEBVIEW_DEFAULT("webview"),

    /** Le même, sans le marqueur `; wv`. */
    WITHOUT_WV("sans-wv"),

    /** Celui du mode « version pour ordinateur » de Chrome Android : Leclerc répond par son site pour ordinateur. */
    DESKTOP("ordinateur"),
    ;

    companion object {
        /** Une clé inconnue ou absente donne le choix par défaut. */
        fun fromKey(key: String?): UserAgentChoice = entries.firstOrNull { it.key == key } ?: WEBVIEW_DEFAULT
    }
}

/** Une marque annoncée par les indications client (`Sec-CH-UA`) : son nom et ses versions. */
data class Brand(val name: String, val majorVersion: String, val fullVersion: String) {
    fun label(): String = "$name $majorVersion"
}

object UserAgents {
    const val WEBVIEW_BRAND = "Android WebView"
    const val CHROME_BRAND = "Google Chrome"
    private const val CHROMIUM_BRAND = "Chromium"

    /** `wv` seul, entre deux points-virgules ou avant la parenthèse fermante, jamais un mot qui commence par `wv`. */
    private val WV_MARKER = Regex(";\\s*wv(?=\\s*[;)])")
    private val CHROME_MAJOR = Regex("Chrome/(\\d+)\\.")

    /** L'agent utilisateur à donner à la WebView pour ce choix, à partir de l'agent par défaut de la WebView. */
    fun resolve(choice: UserAgentChoice, webViewDefault: String): String = when (choice) {
        UserAgentChoice.WEBVIEW_DEFAULT -> webViewDefault
        UserAgentChoice.WITHOUT_WV -> withoutWvMarker(webViewDefault)
        // Sans numéro de version de Chrome à reprendre, on ne devine rien : l'agent de la WebView reste en place.
        UserAgentChoice.DESKTOP -> chromeMajorOf(webViewDefault)?.let(::desktop) ?: webViewDefault
    }

    fun withoutWvMarker(userAgent: String): String = userAgent.replace(WV_MARKER, "")

    /** Le numéro de version majeur de Chrome écrit dans un agent utilisateur (`Chrome/155.0.7000.1` donne 155). */
    fun chromeMajorOf(userAgent: String): Int? = CHROME_MAJOR.find(userAgent)?.groupValues?.get(1)?.toIntOrNull()

    /**
     * L'agent utilisateur du mode « version pour ordinateur » de Chrome Android : Linux, sans `wv`, sans `Mobile`, sans `Android`,
     * avec la version de Chrome réduite à son numéro majeur (`Chrome/155.0.0.0`), comme Chrome le fait.
     */
    fun desktop(chromeMajor: Int): String =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$chromeMajor.0.0.0 Safari/537.36"

    /**
     * Les marques annoncées en mode ordinateur : celles de la WebView, avec les mêmes versions, mais « Android WebView » devient
     * « Google Chrome », comme dans le navigateur dont ce mode copie l'agent utilisateur.
     */
    fun desktopBrands(webViewBrands: List<Brand>, chromeMajor: Int?): List<Brand> {
        val renamed = webViewBrands.map { if (it.name == WEBVIEW_BRAND) it.copy(name = CHROME_BRAND) else it }
        if (renamed.any { it.name == CHROME_BRAND }) return renamed
        val chromium = renamed.firstOrNull { it.name == CHROMIUM_BRAND }
        val major = chromium?.majorVersion ?: chromeMajor?.toString() ?: return renamed
        return renamed + Brand(CHROME_BRAND, major, chromium?.fullVersion ?: "$major.0.0.0")
    }
}

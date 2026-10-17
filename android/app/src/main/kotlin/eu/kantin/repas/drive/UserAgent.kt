package eu.kantin.repas.drive

/**
 * Ce que l'application donne à la WebView pour paraître un navigateur de bureau (DRV-312).
 *
 * @property userAgent l'agent utilisateur à utiliser
 * @property clientHints vrai si les indications client (plateforme Linux, mobile faux) doivent être posées en plus
 * @property note une phrase pour le journal de l'application quand le mode ordinateur est incomplet, sinon `null`
 */
data class DesktopIdentity(val userAgent: String, val clientHints: Boolean, val note: String?)

/** Une marque annoncée par les indications client (`Sec-CH-UA`) : son nom et ses versions. */
data class Brand(val name: String, val majorVersion: String, val fullVersion: String) {
    fun label(): String = "$name $majorVersion"
}

/**
 * L'identité que l'application donne à sa WebView : celle du mode « version pour ordinateur » de Chrome, en permanence.
 *
 * Sur un téléphone, Leclerc sert son site mobile, dont les routes sont autres que celles du site pour ordinateur sur lequel le contrat
 * de l'agent a été mesuré (décision D25). Écrit en Kotlin pur (sans classe Android) pour se tester sans téléphone.
 */
object UserAgents {
    const val WEBVIEW_BRAND = "Android WebView"
    const val CHROME_BRAND = "Google Chrome"
    private const val CHROMIUM_BRAND = "Chromium"

    private val CHROME_MAJOR = Regex("Chrome/(\\d+)\\.")

    /**
     * L'agent utilisateur à donner à la WebView, à partir de celui qu'elle a par défaut. Sans numéro de version de Chrome à reprendre,
     * on ne devine rien : l'agent de la WebView reste en place.
     */
    fun resolve(webViewDefault: String): String = chromeMajorOf(webViewDefault)?.let(::desktop) ?: webViewDefault

    /**
     * L'identité complète du mode ordinateur. Chaque faiblesse est notée (jamais d'adresse ni de contenu) et l'application continue :
     * sans indications client, elle garde l'agent utilisateur seul ; sans version de Chrome lisible, elle laisse la WebView telle quelle.
     */
    fun identity(webViewDefault: String, clientHintsSupported: Boolean): DesktopIdentity {
        val major = chromeMajorOf(webViewDefault)
            ?: return DesktopIdentity(webViewDefault, clientHints = false, note = "Version de Chrome illisible : l'identité de la WebView reste en place.")
        val note = if (clientHintsSupported) null else "Indications client indisponibles : agent utilisateur seul."
        return DesktopIdentity(desktop(major), clientHints = clientHintsSupported, note = note)
    }

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

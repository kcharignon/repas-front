package eu.kantin.repas.lab

/** Les deux agents utilisateur essayés par le spike, mémorisés par leur clé. */
enum class UserAgentChoice(val key: String) {
    /** Celui de la WebView, tel quel (il porte le marqueur `wv`). */
    WEBVIEW_DEFAULT("webview"),

    /** Le même, sans le marqueur `; wv`. */
    WITHOUT_WV("sans-wv"),
    ;

    companion object {
        /** Une clé inconnue ou absente donne le choix par défaut. */
        fun fromKey(key: String?): UserAgentChoice = entries.firstOrNull { it.key == key } ?: WEBVIEW_DEFAULT
    }
}

object UserAgents {
    /** `wv` seul, entre deux points-virgules ou avant la parenthèse fermante, jamais un mot qui commence par `wv`. */
    private val WV_MARKER = Regex(";\\s*wv(?=\\s*[;)])")

    /** L'agent utilisateur à donner à la WebView pour ce choix, à partir de l'agent par défaut de la WebView. */
    fun resolve(choice: UserAgentChoice, webViewDefault: String): String = when (choice) {
        UserAgentChoice.WEBVIEW_DEFAULT -> webViewDefault
        UserAgentChoice.WITHOUT_WV -> withoutWvMarker(webViewDefault)
    }

    fun withoutWvMarker(userAgent: String): String = userAgent.replace(WV_MARKER, "")
}

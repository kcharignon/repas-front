package eu.kantin.repas.lab

/** Ce que l'écran « Diagnostic » montre. Aucun cookie, aucune adresse de page, aucune donnée de compte. */
data class DiagnosticInfo(
    val appVersionName: String,
    val appVersionCode: Long,
    val buildCommit: String,
    val debuggable: Boolean,
    val androidRelease: String,
    val androidSdk: Int,
    val webViewPackage: String?,
    val webViewVersion: String?,
    val choice: UserAgentChoice,
    val userAgent: String,
    val labDigest: String?,
    /** Les derniers sites envoyés au navigateur du téléphone (nom du site seulement). */
    val externalSites: List<String>,
)

object DiagnosticReport {
    fun render(info: DiagnosticInfo): String = buildString {
        appendLine("Banc Android de Repas (outil jetable)")
        appendLine(
            "Application : ${info.appVersionName} (numéro ${info.appVersionCode}), construction ${info.buildCommit}" +
                if (info.debuggable) ", version de débogage" else "",
        )
        appendLine("Android : ${info.androidRelease} (API ${info.androidSdk})")
        appendLine("WebView : ${info.webViewPackage ?: "inconnue"} ${info.webViewVersion ?: ""}".trimEnd())
        appendLine("Agent utilisateur choisi : ${choiceLabel(info.choice)}")
        appendLine("Agent utilisateur utilisé : ${info.userAgent}")
        appendLine("Banc embarqué : ${info.labDigest ?: "introuvable"}")
        append("Sites envoyés au navigateur du téléphone : ")
        append(if (info.externalSites.isEmpty()) "aucun" else info.externalSites.joinToString(", "))
    }

    fun choiceLabel(choice: UserAgentChoice): String = when (choice) {
        UserAgentChoice.WEBVIEW_DEFAULT -> "celui de la WebView (avec « wv »)"
        UserAgentChoice.WITHOUT_WV -> "sans le marqueur « wv »"
    }
}

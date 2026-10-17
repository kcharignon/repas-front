package eu.kantin.repas.lab

/** Les indications client (`Sec-CH-UA…`) envoyées avec chaque requête, pour le choix d'agent utilisateur actif. */
enum class ClientHintsStatus {
    /** Les indications du mode ordinateur sont appliquées (plateforme Linux, pas mobile). */
    APPLIED,

    /** Ce choix ne demande rien de particulier : les valeurs d'origine de la WebView restent en place. */
    NOT_REQUESTED,

    /** Le mode ordinateur est choisi mais cette WebView ne permet pas de changer les indications : seule la chaîne est appliquée. */
    UNAVAILABLE,
}

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
    val clientHints: ClientHintsStatus,
    /** Les marques annoncées quand les indications du mode ordinateur sont appliquées (« Chromium 155 »…). */
    val clientHintsBrands: List<String>,
    /** Le nom du site de la page affichée (jamais l'adresse complète), ou `null` s'il n'y en a pas. */
    val currentSite: String?,
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
        appendLine("Indications client (client hints) : ${clientHintsLabel(info.clientHints, info.clientHintsBrands)}")
        appendLine("Mise en page : ${if (info.choice == UserAgentChoice.DESKTOP) "ordinateur (fenêtre large)" else "celle de la WebView"}")
        appendLine("Site affiché (nom seulement) : ${info.currentSite ?: "aucun"}")
        appendLine("Banc embarqué : ${info.labDigest ?: "introuvable"}")
        append("Sites envoyés au navigateur du téléphone : ")
        append(if (info.externalSites.isEmpty()) "aucun" else info.externalSites.joinToString(", "))
    }

    fun choiceLabel(choice: UserAgentChoice): String = when (choice) {
        UserAgentChoice.WEBVIEW_DEFAULT -> "celui de la WebView (avec « wv »)"
        UserAgentChoice.WITHOUT_WV -> "sans le marqueur « wv »"
        UserAgentChoice.DESKTOP -> "ordinateur (Linux, sans « wv », sans « Mobile »)"
    }

    fun clientHintsLabel(status: ClientHintsStatus, brands: List<String>): String = when (status) {
        ClientHintsStatus.APPLIED ->
            "oui (plateforme Linux, mobile = non" + (if (brands.isEmpty()) "" else ", marques : ${brands.joinToString(", ")}") + ")"
        ClientHintsStatus.NOT_REQUESTED -> "non (valeurs d'origine de la WebView)"
        ClientHintsStatus.UNAVAILABLE -> "non disponible (cette WebView ne le permet pas : seule la chaîne est appliquée)"
    }
}

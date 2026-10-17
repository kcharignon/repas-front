package eu.kantin.repas.lab

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le texte copiable de l'écran Diagnostic : versions et agent utilisateur, rien d'autre. */
class DiagnosticReportTest {
    private val info = DiagnosticInfo(
        appVersionName = "0.1.0",
        appVersionCode = 7,
        buildCommit = "abc1234",
        debuggable = true,
        androidRelease = "14",
        androidSdk = 34,
        webViewPackage = "com.exemple.webview",
        webViewVersion = "120.0.0.0",
        choice = UserAgentChoice.WITHOUT_WV,
        userAgent = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36",
        labDigest = "sha384-AAAA",
        externalSites = listOf("https://www.exemple.org", "tel"),
    )

    @Test
    fun `le texte porte les versions, l'agent utilisateur et le banc embarque`() {
        val text = DiagnosticReport.render(info)

        assertTrue(text.contains("Application : 0.1.0 (numéro 7), construction abc1234, version de débogage"))
        assertTrue(text.contains("Android : 14 (API 34)"))
        assertTrue(text.contains("WebView : com.exemple.webview 120.0.0.0"))
        assertTrue(text.contains("Agent utilisateur choisi : sans le marqueur « wv »"))
        assertTrue(text.contains("Agent utilisateur utilisé : Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36"))
        assertTrue(text.contains("Banc embarqué : sha384-AAAA"))
        assertTrue(text.contains("Sites envoyés au navigateur du téléphone : https://www.exemple.org, tel"))
    }

    @Test
    fun `sans information, le texte le dit`() {
        val text = DiagnosticReport.render(
            info.copy(webViewPackage = null, webViewVersion = null, labDigest = null, externalSites = emptyList(), debuggable = false),
        )

        assertTrue(text.contains("WebView : inconnue"))
        assertTrue(text.contains("Banc embarqué : introuvable"))
        assertTrue(text.endsWith("Sites envoyés au navigateur du téléphone : aucun"))
        assertEquals(false, text.contains("version de débogage"))
    }

    @Test
    fun `le texte ne mentionne ni cookie ni adresse de page`() {
        val text = DiagnosticReport.render(info).lowercase()

        assertEquals(false, text.contains("cookie"))
        assertEquals(false, text.contains("leclercdrive"))
    }
}

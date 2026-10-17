package eu.kantin.repas.drive

import android.webkit.WebViewClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Le classement des incidents de chargement, rapproché des constantes de la WebView. */
class LoadProblemTest {
    @Test
    fun `pas de reseau ou site introuvable donne hors connexion`() {
        assertEquals(LoadProblem.OFFLINE, LoadProblems.fromWebViewError(WebViewClient.ERROR_HOST_LOOKUP))
        assertEquals(LoadProblem.OFFLINE, LoadProblems.fromWebViewError(WebViewClient.ERROR_CONNECT))
        assertEquals(LoadProblem.OFFLINE, LoadProblems.fromWebViewError(WebViewClient.ERROR_IO))
    }

    @Test
    fun `un delai depasse donne page indisponible`() {
        assertEquals(LoadProblem.UNAVAILABLE, LoadProblems.fromWebViewError(WebViewClient.ERROR_TIMEOUT))
    }

    @Test
    fun `une poignee de main refusee donne certificat`() {
        assertEquals(LoadProblem.CERTIFICATE, LoadProblems.fromWebViewError(WebViewClient.ERROR_FAILED_SSL_HANDSHAKE))
    }

    @Test
    fun `tout autre code donne autre incident`() {
        listOf(WebViewClient.ERROR_UNKNOWN, WebViewClient.ERROR_REDIRECT_LOOP, WebViewClient.ERROR_BAD_URL, 0, 99).forEach {
            assertEquals(LoadProblem.OTHER, LoadProblems.fromWebViewError(it))
        }
    }

    @Test
    fun `seules les erreurs 5xx du serveur sont un incident`() {
        listOf(500, 502, 503, 599).forEach { assertEquals(LoadProblem.UNAVAILABLE, LoadProblems.fromHttpStatus(it)) }
        // Une page 403 ou 429 peut être le défi de l'anti-robot : elle doit rester visible.
        listOf(200, 301, 403, 404, 429, 499, 600).forEach { assertNull(LoadProblems.fromHttpStatus(it)) }
    }
}

package eu.kantin.repas.lab

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Le choix de l'agent utilisateur. Agents SYNTHÉTIQUES, au format de ceux d'une WebView. */
class UserAgentTest {
    private val webView =
        "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36"

    @Test
    fun `le choix par defaut garde l'agent de la WebView tel quel`() {
        assertEquals(webView, UserAgents.resolve(UserAgentChoice.WEBVIEW_DEFAULT, webView))
    }

    @Test
    fun `l'autre choix retire seulement le marqueur wv`() {
        val expected =
            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36"
        assertEquals(expected, UserAgents.resolve(UserAgentChoice.WITHOUT_WV, webView))
    }

    @Test
    fun `le marqueur wv est retire quel que soit l'endroit de la parenthese`() {
        assertEquals(
            "Mozilla/5.0 (Linux; Android 9; SM-X000 Build/AAA1.000000.001) AppleWebKit/537.36",
            UserAgents.withoutWvMarker("Mozilla/5.0 (Linux; Android 9; SM-X000 Build/AAA1.000000.001; wv) AppleWebKit/537.36"),
        )
        assertEquals(
            "Mozilla/5.0 (Linux; U; Android 4.4; en) AppleWebKit/537.36",
            UserAgents.withoutWvMarker("Mozilla/5.0 (Linux; U; Android 4.4; wv; en) AppleWebKit/537.36"),
        )
        assertEquals(
            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36",
            UserAgents.withoutWvMarker("Mozilla/5.0 (Linux; Android 14; K;wv) AppleWebKit/537.36"),
        )
    }

    @Test
    fun `un agent sans marqueur ne change pas`() {
        val chrome = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        assertEquals(chrome, UserAgents.withoutWvMarker(chrome))
    }

    @Test
    fun `un mot qui commence par wv n'est pas touche`() {
        val other = "Mozilla/5.0 (Linux; Android 14; wvx) AppleWebKit/537.36 wv"
        assertEquals(other, UserAgents.withoutWvMarker(other))
    }

    @Test
    fun `le resultat sans marqueur ne contient plus wv entre parentheses mais garde le reste`() {
        val result = UserAgents.resolve(UserAgentChoice.WITHOUT_WV, webView)
        assertFalse(result.contains("; wv"))
        assertEquals(true, result.contains("Version/4.0"))
        assertEquals(true, result.contains("Chrome/120.0.0.0"))
    }

    @Test
    fun `le choix se retrouve par sa cle et une cle inconnue donne le choix par defaut`() {
        UserAgentChoice.entries.forEach { assertEquals(it, UserAgentChoice.fromKey(it.key)) }
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey(null))
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey("autre"))
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey(""))
    }
}

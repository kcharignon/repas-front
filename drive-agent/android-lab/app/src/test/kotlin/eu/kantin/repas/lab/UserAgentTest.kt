package eu.kantin.repas.lab

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le choix de l'agent utilisateur. Agents SYNTHÉTIQUES, au format de ceux d'une WebView. */
class UserAgentTest {
    private val webView =
        "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36"

    // Une WebView plus récente, avec un numéro de version complet de Chrome.
    private val recentWebView =
        "Mozilla/5.0 (Linux; Android 16; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.7712.34 Mobile Safari/537.36"

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
        assertEquals(UserAgentChoice.DESKTOP, UserAgentChoice.fromKey("ordinateur"))
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey(null))
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey("autre"))
        assertEquals(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.fromKey(""))
    }

    @Test
    fun `il y a trois choix, dans l'ordre WebView, sans wv, ordinateur`() {
        assertEquals(
            listOf(UserAgentChoice.WEBVIEW_DEFAULT, UserAgentChoice.WITHOUT_WV, UserAgentChoice.DESKTOP),
            UserAgentChoice.entries.toList(),
        )
    }

    @Test
    fun `le mode ordinateur donne l'agent de Chrome pour ordinateur avec la version majeure de la WebView`() {
        assertEquals(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
            UserAgents.resolve(UserAgentChoice.DESKTOP, recentWebView),
        )
        assertEquals(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            UserAgents.resolve(UserAgentChoice.DESKTOP, webView),
        )
    }

    @Test
    fun `le mode ordinateur n'a ni wv, ni Mobile, ni Android, ni Version`() {
        val result = UserAgents.resolve(UserAgentChoice.DESKTOP, recentWebView)

        listOf("wv", "Mobile", "Android", "Version/", "Build/").forEach {
            assertFalse("ne devrait pas contenir $it : $result", result.contains(it))
        }
        assertTrue(result.startsWith("Mozilla/5.0 (X11; Linux x86_64) "))
        assertTrue(result.endsWith(" Safari/537.36"))
    }

    @Test
    fun `le mode ordinateur ne touche pas aux deux autres choix`() {
        assertEquals(recentWebView, UserAgents.resolve(UserAgentChoice.WEBVIEW_DEFAULT, recentWebView))
        assertTrue(UserAgents.resolve(UserAgentChoice.WITHOUT_WV, recentWebView).contains("Mobile"))
    }

    @Test
    fun `sans version de Chrome a reprendre, le mode ordinateur laisse l'agent de la WebView`() {
        val odd = "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36"
        assertEquals(odd, UserAgents.resolve(UserAgentChoice.DESKTOP, odd))
        assertNull(UserAgents.chromeMajorOf(odd))
    }

    @Test
    fun `la version majeure de Chrome se lit dans l'agent utilisateur`() {
        assertEquals(155, UserAgents.chromeMajorOf(recentWebView))
        assertEquals(120, UserAgents.chromeMajorOf(webView))
        assertEquals(99, UserAgents.chromeMajorOf("x Chrome/99.1.2.3 y"))
        assertNull(UserAgents.chromeMajorOf("x Chrome/ y"))
        assertNull(UserAgents.chromeMajorOf("x Chromium/120.0 y"))
        assertNull(UserAgents.chromeMajorOf(""))
    }

    @Test
    fun `les marques du mode ordinateur gardent les versions de la WebView, et Android WebView devient Google Chrome`() {
        val webViewBrands = listOf(
            Brand("Chromium", "155", "155.0.7712.34"),
            Brand("Not?A_Brand", "24", "24.0.0.0"),
            Brand("Android WebView", "155", "155.0.7712.34"),
        )

        val result = UserAgents.desktopBrands(webViewBrands, 155)

        assertEquals(
            listOf(
                Brand("Chromium", "155", "155.0.7712.34"),
                Brand("Not?A_Brand", "24", "24.0.0.0"),
                Brand("Google Chrome", "155", "155.0.7712.34"),
            ),
            result,
        )
        assertEquals(listOf("Chromium 155", "Not?A_Brand 24", "Google Chrome 155"), result.map { it.label() })
    }

    @Test
    fun `sans marque WebView, la marque Google Chrome est ajoutee avec les versions de Chromium`() {
        val result = UserAgents.desktopBrands(listOf(Brand("Chromium", "155", "155.0.7712.34")), 155)

        assertEquals(
            listOf(Brand("Chromium", "155", "155.0.7712.34"), Brand("Google Chrome", "155", "155.0.7712.34")),
            result,
        )
    }

    @Test
    fun `sans aucune marque, les versions viennent de l'agent utilisateur`() {
        assertEquals(listOf(Brand("Google Chrome", "155", "155.0.0.0")), UserAgents.desktopBrands(emptyList(), 155))
        assertEquals(emptyList<Brand>(), UserAgents.desktopBrands(emptyList(), null))
    }

    @Test
    fun `Google Chrome deja present n'est pas ajoute une deuxieme fois`() {
        val brands = listOf(Brand("Chromium", "155", "155.0.1.2"), Brand("Google Chrome", "155", "155.0.1.2"))
        assertEquals(brands, UserAgents.desktopBrands(brands, 155))
    }
}

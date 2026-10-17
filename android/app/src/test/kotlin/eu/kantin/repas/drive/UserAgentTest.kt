package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** L'identité du mode ordinateur. Agents SYNTHÉTIQUES, au format de ceux d'une WebView. */
class UserAgentTest {
    private val webView =
        "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36"

    // Une WebView plus récente, avec un numéro de version complet de Chrome.
    private val recentWebView =
        "Mozilla/5.0 (Linux; Android 16; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.7712.34 Mobile Safari/537.36"

    @Test
    fun `le mode ordinateur donne l'agent de Chrome pour ordinateur avec la version majeure de la WebView`() {
        assertEquals(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
            UserAgents.resolve(recentWebView),
        )
        assertEquals(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            UserAgents.resolve(webView),
        )
    }

    @Test
    fun `le mode ordinateur n'a ni wv, ni Mobile, ni Android, ni Version`() {
        val result = UserAgents.resolve(recentWebView)

        listOf("wv", "Mobile", "Android", "Version/", "Build/").forEach {
            assertFalse("ne devrait pas contenir $it : $result", result.contains(it))
        }
        assertTrue(result.startsWith("Mozilla/5.0 (X11; Linux x86_64) "))
        assertTrue(result.endsWith(" Safari/537.36"))
    }

    @Test
    fun `sans version de Chrome a reprendre, le mode ordinateur laisse l'agent de la WebView`() {
        val odd = "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36"
        assertEquals(odd, UserAgents.resolve(odd))
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

    @Test
    fun `l'identite complete pose l'agent de bureau et les indications client quand la WebView sait le faire`() {
        val identity = UserAgents.identity(recentWebView, clientHintsSupported = true)

        assertEquals(UserAgents.desktop(155), identity.userAgent)
        assertTrue(identity.clientHints)
        assertNull(identity.note)
    }

    @Test
    fun `sans indications client, l'application garde l'agent utilisateur seul et le note`() {
        val identity = UserAgents.identity(webView, clientHintsSupported = false)

        assertEquals(UserAgents.desktop(120), identity.userAgent)
        assertFalse(identity.clientHints)
        assertTrue(identity.note!!.contains("Indications client indisponibles"))
    }

    @Test
    fun `sans version de Chrome lisible, rien n'est change et la raison est notee`() {
        val odd = "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36"
        val identity = UserAgents.identity(odd, clientHintsSupported = true)

        assertEquals(odd, identity.userAgent)
        assertFalse(identity.clientHints)
        assertTrue(identity.note!!.contains("Version de Chrome illisible"))
    }

    @Test
    fun `l'identite ne contient ni numero de serie ni adresse`() {
        listOf(webView, recentWebView).forEach {
            val result = UserAgents.identity(it, true).userAgent
            assertFalse(result.contains("Build/"))
            assertFalse(result.contains("http"))
        }
    }
}

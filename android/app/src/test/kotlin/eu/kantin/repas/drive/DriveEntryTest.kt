package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * « Finaliser sur Leclerc » ouvre le drive dans l'application (DRV-625), sur la page du panier quand la ville du magasin est connue (DRV-629) :
 * une page du drive, jamais autre chose. Adresses SYNTHÉTIQUES.
 */
class DriveEntryTest {
    private class MemoryStore(var value: String? = null) : StorePathStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    private val link = "https://courses-test.leclercdrive.fr/magasin-000000-000000/detail-panier.aspx"
    private val basket = "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/detail-panier.aspx"
    private val storePage = "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/recherche.aspx"

    private fun memory(seen: String? = null) = StorePathMemory(MemoryStore()).also { if (seen != null) it.remember(seen) }

    @Test
    fun `l'accueil du drive reste l'accueil du drive`() {
        assertEquals(NavigationPolicy.START_URL, DriveEntry.target(NavigationPolicy.START_URL))
        assertEquals(NavigationPolicy.START_URL, DriveEntry.target(NavigationPolicy.START_URL, memory(storePage)))
    }

    @Test
    fun `le lien du panier s'ouvre sur la page du panier avec la ville de la derniere page de magasin vue`() {
        assertEquals(basket, DriveEntry.target(link, memory(storePage)))
    }

    @Test
    fun `sans chemin connu, le lien du panier ouvre l'accueil du drive`() {
        assertEquals(NavigationPolicy.START_URL, DriveEntry.target(link, memory()))
        assertEquals(NavigationPolicy.START_URL, DriveEntry.target(link))
    }

    @Test
    fun `un chemin d'un autre hote ou d'un autre magasin n'est pas utilise`() {
        assertEquals(
            NavigationPolicy.START_URL,
            DriveEntry.target(link, memory("https://autre-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/")),
        )
        assertEquals(
            NavigationPolicy.START_URL,
            DriveEntry.target(link, memory("https://courses-test.leclercdrive.fr/magasin-000000-000002-Ville-Test/")),
        )
    }

    @Test
    fun `seul le lien exact du panier est complete, toute autre page du drive est remplacee par l'accueil`() {
        val seen = memory(storePage)
        listOf(
            "https://courses-test.leclercdrive.fr/",
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://courses-test.leclercdrive.fr/magasin-000000-000000",
            storePage,
            basket,
            "$link?a=1",
            "$link#x",
            "https://courses-test.leclercdrive.fr/magasin-000000-000000/autre.aspx",
            "https://courses-test.leclercdrive.fr/x/magasin-000000-000000/detail-panier.aspx",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000/detail-panier.aspx",
            "https://courses-test.leclercdrive.fr/autre-page",
        ).forEach { assertEquals(it, NavigationPolicy.START_URL, DriveEntry.target(it, seen)) }
    }

    @Test
    fun `ce qui n'est pas une page du drive n'est pas concerne`() {
        listOf(
            null,
            "",
            "https://www.exemple.org/",
            "https://www.leclercdrive.fr.evil.com/",
            "https://user:pass@www.leclercdrive.fr/",
            "http://www.leclercdrive.fr/",
            "javascript:alert(1)",
            "intent://www.leclercdrive.fr/#Intent;scheme=https;end",
            "https://kantin.eu/",
        ).forEach { assertNull(it, DriveEntry.target(it, memory(storePage))) }
    }

    @Test
    fun `l'ecran du drive ne rouvre que l'accueil ou une page du panier avec la ville`() {
        assertEquals(basket, DriveEntry.startPage(basket))
        assertEquals(NavigationPolicy.START_URL, DriveEntry.startPage(NavigationPolicy.START_URL))
        listOf(null, "", link, storePage, "https://www.exemple.org/", "http://courses-test.leclercdrive.fr/magasin-000000-000000-V/detail-panier.aspx")
            .forEach { assertEquals(it, NavigationPolicy.START_URL, DriveEntry.startPage(it)) }
    }

    @Test
    fun `la page du panier refusee par le site ramene a l'accueil, sauf un defi de l'anti-robot`() {
        listOf(404, 410, 400, 500, 503).forEach { assertTrue("$it", DriveEntry.fallsBack(basket, basket, it)) }
        listOf(403, 429, 200, 302).forEach { assertFalse("$it", DriveEntry.fallsBack(basket, basket, it)) }
        // Une autre page, ou aucune page du panier demandee : rien ne se replie
        assertFalse(DriveEntry.fallsBack(basket, storePage, 404))
        assertFalse(DriveEntry.fallsBack(null, basket, 404))
    }
}

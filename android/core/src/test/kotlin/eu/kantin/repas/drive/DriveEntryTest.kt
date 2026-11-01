package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * « Finaliser sur Leclerc » ouvre le drive dans l'application (DRV-625), sur l'accueil du magasin AVEC la ville quand elle est connue (DRV-631),
 * jamais sur la page du panier de Leclerc : une page du drive, jamais autre chose. Adresses SYNTHÉTIQUES.
 */
class DriveEntryTest {
    private class MemoryStore(var value: String? = null) : StorePathStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    private val link = "https://fd9-courses.leclercdrive.fr/magasin-000000-000000"
    private val home = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test"
    private val storePage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/recherche.aspx"
    private val oldBasketPage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/detail-panier.aspx"

    private fun memory(seen: String? = null) = StorePathMemory(MemoryStore()).also { if (seen != null) it.remember(seen) }

    @Test
    fun `l'accueil du drive reste l'accueil du drive, sans bandeau ni forme a retenir`() {
        assertEquals(DriveEntry.Entry(NavigationPolicy.START_URL, null), DriveEntry.resolve(NavigationPolicy.START_URL))
        assertEquals(DriveEntry.Entry(NavigationPolicy.START_URL, null), DriveEntry.resolve(NavigationPolicy.START_URL, memory(storePage)))
    }

    @Test
    fun `le lien du magasin s'ouvre sur l'accueil du magasin avec la ville de la derniere page de magasin vue`() {
        assertEquals(DriveEntry.Entry(home, FinalizeOutcome.OUVERTE), DriveEntry.resolve(link, memory(storePage)))
        assertEquals(home, DriveEntry.target(link, memory(storePage)))
    }

    @Test
    fun `sans chemin connu, le lien du magasin ouvre l'accueil du drive`() {
        assertEquals(DriveEntry.Entry(NavigationPolicy.START_URL, FinalizeOutcome.CHEMIN_INCONNU), DriveEntry.resolve(link, memory()))
        assertEquals(DriveEntry.Entry(NavigationPolicy.START_URL, FinalizeOutcome.CHEMIN_INCONNU), DriveEntry.resolve(link))
    }

    @Test
    fun `un chemin d'un autre magasin n'est pas utilise, l'adresse est refusee`() {
        val refused = DriveEntry.Entry(NavigationPolicy.START_URL, FinalizeOutcome.ADRESSE_REFUSEE)
        assertEquals(refused, DriveEntry.resolve(link, memory("https://m-courses.leclercdrive.fr/magasin-000000-000002-Ville-Test/")))
        assertEquals(refused, DriveEntry.resolve(link, memory("https://m-courses.leclercdrive.fr/magasin-000002-000000-ville-test")))
    }

    /**
     * DRV-754 : le lien du front porte l'hôte du serveur du plan (`fd<N>-courses`), la page retenue est celle de la version mobile (`m-courses`). Pour Leclerc,
     * les deux numéros font le magasin, sur tout hôte de l'enseigne ; ce qui s'ouvre est la page RETENUE, jamais une adresse construite avec l'hôte du lien.
     */
    @Test
    fun `le lien d'un hote du serveur ouvre la page retenue de la version mobile du meme magasin`() {
        val mobileHome = "https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test"
        val serverLink = "https://fd8-courses.leclercdrive.fr/magasin-000000-000000"
        assertEquals(DriveEntry.Entry(mobileHome, FinalizeOutcome.OUVERTE), DriveEntry.resolve(serverLink, memory("$mobileHome/")))
        assertEquals(DriveEntry.Entry(mobileHome, FinalizeOutcome.OUVERTE), DriveEntry.resolve("https://m-courses.leclercdrive.fr/magasin-000000-000000", memory("$mobileHome/")))
        // Autres numéros : repli sur l'accueil du drive, adresse refusée
        val refused = DriveEntry.Entry(NavigationPolicy.START_URL, FinalizeOutcome.ADRESSE_REFUSEE)
        assertEquals(refused, DriveEntry.resolve("https://fd8-courses.leclercdrive.fr/magasin-000000-000002", memory("$mobileHome/")))
        assertEquals(refused, DriveEntry.resolve("https://fd8-courses.leclercdrive.fr/magasin-000002-000000", memory("$mobileHome/")))
        // Rien retenu : chemin inconnu
        assertEquals(DriveEntry.Entry(NavigationPolicy.START_URL, FinalizeOutcome.CHEMIN_INCONNU), DriveEntry.resolve(serverLink, memory()))
        // Un nom de l'enseigne où le pont n'existe pas (le domaine nu) ne profite pas de la règle
        assertEquals(refused, DriveEntry.resolve("https://leclercdrive.fr/magasin-000000-000000", memory("$mobileHome/")))
    }

    @Test
    fun `l'application ne navigue jamais vers la page du panier de Leclerc, quel que soit le lien`() {
        val seen = memory(storePage)
        listOf(
            oldBasketPage,
            "$link/detail-panier.aspx",
            "$link/detail-panier.aspx?a=1",
            "https://m-courses.leclercdrive.fr/x/magasin-000000-000000/detail-panier.aspx",
        ).forEach {
            val entry = DriveEntry.resolve(it, seen)!!
            assertEquals(it, NavigationPolicy.START_URL, entry.page)
            assertEquals(it, FinalizeOutcome.ADRESSE_REFUSEE, entry.outcome)
            assertEquals(it, NavigationPolicy.START_URL, DriveEntry.startPage(it))
        }
        // Et rien de ce que l'application ouvre ne contient le nom de cette page
        assertFalse(DriveEntry.startPage(oldBasketPage).contains("detail-panier"))
    }

    @Test
    fun `seul le lien exact du magasin est complete, toute autre page du drive est remplacee par l'accueil`() {
        val seen = memory(storePage)
        listOf(
            "https://m-courses.leclercdrive.fr/",
            "https://www.leclercdrive.fr/connexion.aspx",
            storePage,
            home,
            "$link?a=1",
            "$link#x",
            "$link/",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000/autre.aspx",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000/autre",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test",
            "https://m-courses.leclercdrive.fr/autre-page",
        ).forEach { assertEquals(it, NavigationPolicy.START_URL, DriveEntry.resolve(it, seen)!!.page) }
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
        ).forEach { assertNull(it, DriveEntry.resolve(it, memory(storePage))) }
    }

    @Test
    fun `l'ecran du drive ne rouvre que l'accueil ou l'accueil d'un magasin avec la ville`() {
        assertEquals(home, DriveEntry.startPage(home))
        assertEquals("$home/", DriveEntry.startPage("$home/"))
        assertEquals(NavigationPolicy.START_URL, DriveEntry.startPage(NavigationPolicy.START_URL))
        listOf(null, "", link, storePage, oldBasketPage, "https://www.exemple.org/", "http://m-courses.leclercdrive.fr/magasin-000000-000000-V")
            .forEach { assertEquals(it, NavigationPolicy.START_URL, DriveEntry.startPage(it)) }
    }

    @Test
    fun `la page d'arrivee est l'accueil du drive ou l'accueil d'un magasin, rien d'autre`() {
        listOf(home, "$home/", "$home?a=1", NavigationPolicy.START_URL).forEach { assertTrue(it, DriveEntry.isArrivalPage(it)) }
        listOf(null, "", storePage, link, "$home/rayon.aspx", "https://m-courses.leclercdrive.fr/").forEach {
            assertFalse(it, DriveEntry.isArrivalPage(it))
        }
    }

    @Test
    fun `l'accueil du magasin refuse par le site ramene a l'accueil du drive, sauf un defi de l'anti-robot`() {
        listOf(404, 410, 400, 500, 503).forEach { assertTrue("$it", DriveEntry.fallsBack(home, home, it)) }
        listOf(403, 429, 200, 302).forEach { assertFalse("$it", DriveEntry.fallsBack(home, home, it)) }
        // Une autre page, ou aucun accueil de magasin demande : rien ne se replie
        assertFalse(DriveEntry.fallsBack(home, storePage, 404))
        assertFalse(DriveEntry.fallsBack(null, home, 404))
    }

    @Test
    fun `un titre qui dit introuvable est reconnu, un titre ordinaire non`() {
        listOf(
            "Page introuvable",
            "PAGE INTROUVABLE - E.Leclerc Drive",
            "Erreur 404",
            "404",
            "Désolé, la page demandée n'a pas pu être trouvée",
            "Not Found",
        ).forEach { assertTrue(it, DriveEntry.isNotFoundTitle(it)) }
        listOf(
            null,
            "",
            "   ",
            "E.Leclerc Drive - Ville-Test",
            "Mon panier",
            "Produits 4040 en promotion",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test",
        ).forEach { assertFalse(it, DriveEntry.isNotFoundTitle(it)) }
    }
}

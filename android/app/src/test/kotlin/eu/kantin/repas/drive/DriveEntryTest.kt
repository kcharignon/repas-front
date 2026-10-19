package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * « Finaliser sur Leclerc » ouvre le drive dans l'application (DRV-625) : une page du drive, jamais autre chose. Adresses SYNTHÉTIQUES.
 */
class DriveEntryTest {
    private val storePage = "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/panier.aspx"

    @Test
    fun `l'accueil du drive reste l'accueil du drive`() {
        assertEquals(NavigationPolicy.START_URL, DriveEntry.target(NavigationPolicy.START_URL))
    }

    @Test
    fun `une page de magasin du drive (le panier, quand son adresse sera relevee) est ouverte telle quelle`() {
        assertEquals(storePage, DriveEntry.target(storePage))
        assertEquals(
            "https://courses-test.leclercdrive.fr/magasin-000000-000000",
            DriveEntry.target("https://courses-test.leclercdrive.fr/magasin-000000-000000"),
        )
    }

    @Test
    fun `toute autre page du drive est remplacee par l'accueil du drive`() {
        listOf(
            "https://courses-test.leclercdrive.fr/",
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/",
            "https://courses-test.leclercdrive.fr/autre-page",
        ).forEach { assertEquals(it, NavigationPolicy.START_URL, DriveEntry.target(it)) }
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
        ).forEach { assertNull(it, DriveEntry.target(it)) }
    }
}

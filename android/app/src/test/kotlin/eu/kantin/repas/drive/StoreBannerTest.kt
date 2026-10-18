package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Le message d'en-tête du drive : dit quoi faire tant que la page n'est pas celle d'un magasin, au lieu de laisser un écran qui n'a rien de Repas. */
class StoreBannerTest {
    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    private val plan = DrivePlan.parse(JSONObject(java.io.File("src/test/resources/plan-complet.json").readText()))!!
    private val setup = SetupRequest.of(runId)!!

    private val storePage = "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
    private val storeRoot = "https://courses-test.leclercdrive.fr/"
    private val enseigne = "https://www.leclercdrive.fr/"
    private val login = "https://courses-test.leclercdrive.fr/connexion.aspx"

    @Test
    fun `sans passage en cours, aucun message`() {
        listOf(null, storePage, storeRoot, enseigne).forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(null, it)) }
    }

    @Test
    fun `un plan sur la page de son magasin n'a rien a dire, sa page de depart non plus`() {
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, storePage))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, plan.startUrl))
    }

    @Test
    fun `un plan hors d'une page de magasin dit d'ouvrir son magasin, au lieu d'un ecran vide`() {
        // La racine de l'hôte, l'accueil de l'enseigne, la connexion, une adresse inconnue : l'agent n'y agit pas.
        listOf(storeRoot, enseigne, login, null, "https://courses-test.leclercdrive.fr/autre-page").forEach {
            assertEquals(it, StoreBanner.PLAN, StoreBanner.of(plan, it))
        }
    }

    @Test
    fun `une lecture du magasin dit de se connecter et de choisir son magasin tant que la page n'en est pas un`() {
        listOf(enseigne, storeRoot, login, null).forEach { assertEquals(it, StoreBanner.SETUP, StoreBanner.of(setup, it)) }
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, storePage))
    }
}

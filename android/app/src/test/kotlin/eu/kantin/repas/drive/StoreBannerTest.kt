package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le message d'en-tête du drive : dit quoi faire tant que la page n'est pas celle d'un magasin (ou que le site l'a refusée), au lieu de laisser
 * un écran qui n'a rien de Repas. Pour un plan, il vient de la surveillance de la page ([OpeningWatch]) ; pour la lecture du magasin, de l'adresse.
 */
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
        PageTrouble.entries.forEach { assertEquals(it.name, StoreBanner.NONE, StoreBanner.of(null, storeRoot, it)) }
    }

    @Test
    fun `un plan sur une page de magasin n'a rien a dire`() {
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, storePage))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, "https://courses-test.leclercdrive.fr/magasin-000000-000000/panier.aspx"))
    }

    /**
     * Constat de la recette réelle : la page d'ouverture d'un plan est la racine de l'hôte, qui affiche l'accueil du magasin avec son bouton
     * « Commencer mes courses ». Ce n'est pas une page de magasin pour l'agent : l'utilisateur doit toucher ce bouton. Le message le dit
     * (et ne le fait jamais à sa place), sans alarme : c'est l'attente normale.
     */
    @Test
    fun `sur l'accueil du magasin ou toute page qui n'en est pas une, un plan dit d'ouvrir son magasin, sans alarme ni bouton`() {
        listOf(storeRoot, enseigne, login, null, "https://courses-test.leclercdrive.fr/autre-page", plan.startUrl).forEach {
            assertEquals(it, StoreBanner.OPEN, StoreBanner.of(plan, it))
            assertEquals(it, StoreBanner.OPEN, StoreBanner.of(plan, it, PageTrouble.NONE))
        }
        assertFalse(StoreBanner.OPEN.hasAction)
    }

    @Test
    fun `une page refusee, trop lente ou sans agent dit de recommencer depuis l'accueil du drive`() {
        listOf(PageTrouble.HTTP_ERROR, PageTrouble.SLOW, PageTrouble.NO_AGENT).forEach { trouble ->
            listOf(storeRoot, enseigne, login, null, storePage).forEach {
                assertEquals("$trouble $it", StoreBanner.PLAN, StoreBanner.of(plan, it, trouble))
            }
        }
    }

    @Test
    fun `le message d'un plan qui cloche propose un bouton, pas les autres`() {
        // Y compris la vérification : si le refus du site n'est pas un défi, l'utilisateur garde une issue.
        assertTrue(StoreBanner.PLAN.hasAction)
        assertTrue(StoreBanner.VERIFICATION.hasAction)
        listOf(StoreBanner.NONE, StoreBanner.SETUP, StoreBanner.OPEN).forEach { assertFalse(it.name, it.hasAction) }
    }

    @Test
    fun `une verification a faire sur la page est dite sans cacher la page`() {
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(plan, plan.startUrl, PageTrouble.VERIFICATION))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(plan, storePage, PageTrouble.VERIFICATION))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(setup, storePage, PageTrouble.VERIFICATION))
    }

    @Test
    fun `une lecture du magasin dit de se connecter et de choisir son magasin tant que la page n'en est pas un`() {
        listOf(enseigne, storeRoot, login, null).forEach { assertEquals(it, StoreBanner.SETUP, StoreBanner.of(setup, it)) }
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, storePage))
    }

    @Test
    fun `une page d'erreur du site pendant une lecture du magasin garde le message de la lecture`() {
        assertEquals(StoreBanner.SETUP, StoreBanner.of(setup, storePage, PageTrouble.HTTP_ERROR))
    }
}

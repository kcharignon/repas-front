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
     * Constat de la recette réelle : la page d'ouverture d'un plan est l'accueil de l'enseigne, qui affiche l'accueil du magasin avec son bouton
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
        assertTrue(StoreBanner.MOBILE.hasAction)
        listOf(StoreBanner.NONE, StoreBanner.SETUP, StoreBanner.OPEN).forEach { assertFalse(it.name, it.hasAction) }
    }

    /**
     * Le site mobile (ticket J) : l'agent n'y agit pas, l'application ne lui envoie rien. Le message dit que ce n'est pas la version ordinateur du
     * site et propose de recommencer depuis l'accueil du drive, pour un envoi comme pour la lecture du magasin.
     */
    @Test
    fun `le site mobile dit que ce n'est pas la version ordinateur, pour un envoi comme pour la lecture du magasin`() {
        val mobilePage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
        val mobileRoot = "https://m-courses.leclercdrive.fr/"

        listOf(mobilePage, mobileRoot).forEach {
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(plan, it))
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(setup, it))
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(plan, it, PageTrouble.NONE))
        }
        // Sans passage en cours, rien à dire ; une vérification du site passe avant (la page doit rester visible pour qu'on la passe).
        assertEquals(StoreBanner.NONE, StoreBanner.of(null, mobilePage))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(plan, mobilePage, PageTrouble.VERIFICATION))
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

    /**
     * Constat de la recette réelle (application 0.1.3) : la racine de l'hôte du magasin et `/magasin-<id>-<id>/` (sans ville) sont des pages 404
     * du vrai site. Que l'utilisateur les rencontre pendant un envoi (un ancien lien, une redirection) ou que l'accueil de l'enseigne lui-même
     * soit refusé, le repli s'affiche (jamais un écran muet), le plan ne part pas vers la page d'erreur, et le bouton « Ouvrir l'accueil du
     * drive » recharge la page de départ du plan : l'accueil de l'enseigne, qui n'est pas une de ces pages 404.
     */
    @Test
    fun `une page 404 pendant un envoi montre le repli, dont le bouton recharge l'accueil de l'enseigne`() {
        val pages404 = listOf(
            storeRoot,
            "https://courses-test.leclercdrive.fr/magasin-000000-000000/",
            "https://courses-test.leclercdrive.fr/magasin-000000-000000",
            enseigne,
        )
        pages404.forEach { url ->
            // Dans l'ordre de la WebView (début de la page, puis son statut) comme dans l'ordre inverse, qu'elle ne s'interdit pas.
            val inOrder = OpeningWatch().apply { pageStarted(); httpError(404); pageFinished() }
            val reversed = OpeningWatch().apply { httpError(404); pageStarted(); pageFinished() }
            listOf(inOrder, reversed).forEach { watch ->
                val banner = StoreBanner.of(plan, url, watch.trouble(url))

                assertEquals(url, StoreBanner.PLAN, banner)
                assertTrue("le bouton « Ouvrir l'accueil du drive » est proposé : $url", banner.hasAction)
                assertFalse("le plan ne part pas vers une page 404 : $url", watch.canDeliver(url))
            }
        }
        // Ce que recharge le bouton : la page de départ du plan, l'accueil de l'enseigne, jamais une de ces pages.
        assertEquals(NavigationPolicy.START_URL, plan.startUrl)
        assertFalse(pages404.dropLast(1).contains(plan.startUrl))
        assertEquals(StoreBanner.OPEN, StoreBanner.of(plan, plan.startUrl))
    }
}

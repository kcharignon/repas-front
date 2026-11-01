package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Les messages d'en-tête d'une enseigne **sans page de magasin** (DRV-733) : le magasin n'est pas dans l'adresse, la personne le choisit dans la page du
 * site et l'agent le lit lui-même ; l'écran n'a donc aucun message de magasin (« Commencer mes courses », « choisis ton magasin ») sur les pages
 * ordinaires. Les messages d'une page qui cloche (refusée, vérification) restent. La preuve de Leclerc, inchangée, est dans [StoreBannerTest] : ici, la
 * seule différence est la table (une enseigne fictive sans `storePages`, [FictionalSites.C], et une enseigne fictive à pages de magasin, [FictionalSites.A]).
 */
class StoreBannerWithoutStorePagesTest {
    private val sites = FictionalSites.ALL
    private val noPages = FictionalSites.C
    private val withPages = FictionalSites.A

    private val plan = DrivePlan.parse(FictionalSites.plan(noPages, FictionalSites.STORE_UUID, "www.exemple-c.test"), sites)!!
    private val setup = SetupRequest.of(FictionalSites.RUN_ID, noPages)!!

    private val planA = DrivePlan.parse(FictionalSites.plan(withPages, "123456", "courses-test.exemple-a.test"), sites)!!
    private val setupA = SetupRequest.of(FictionalSites.RUN_ID, withPages)!!

    private val pages = listOf(
        null,
        "https://www.exemple-c.test/courses",
        "https://www.exemple-c.test/",
        "https://www.exemple-c.test/rayons/fruits",
        "https://www.exemple-c.test/produit/123",
        "https://www.exemple-c.test/connexion",
    )

    /** La page du mot de passe de l'enseigne : on y navigue, mais aucun code de Repas n'y vit (ni agent ni carte). */
    private val passwordPage = "https://compte.exemple-c.test/auth/connexion"

    @Test
    fun `l'enseigne fictive de test n'a pas de page de magasin et l'autre en a`() {
        assertFalse(noPages.hasStorePages)
        assertTrue(withPages.hasStorePages)
        assertTrue("Leclerc, l'enseigne d'avant, a des pages de magasin", RetailerSites.DEFAULT.legacy.hasStorePages)
        assertFalse("Auchan n'en a pas : l'agent lit le magasin", RetailerSites.DEFAULT.byId("auchan")!!.hasStorePages)
    }

    @Test
    fun `un plan sur une enseigne sans page de magasin n'a aucun message de magasin sur ses pages`() {
        pages.forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it)) }
        pages.forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it, PageTrouble.NONE)) }
    }

    @Test
    fun `DRV-757 la page du mot de passe sans agent par choix a un message de l'ecran et la personne n'est jamais seule devant elle`() {
        assertFalse(noPages.isBridgePage(passwordPage))
        assertTrue(noPages.isNavigable(passwordPage))

        assertEquals(StoreBanner.LOGIN, StoreBanner.of(plan, passwordPage))
        assertFalse("pas de bouton : la personne se connecte dans la page", StoreBanner.LOGIN.hasAction)
        // Les autres pages du site, où l'agent vit, gardent l'agent : aucun message de l'écran
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, "https://www.exemple-c.test/courses"))
        // Une page qui cloche garde son message (le défaut passe avant)
        assertEquals(StoreBanner.PLAN, StoreBanner.of(plan, passwordPage, PageTrouble.HTTP_ERROR))
    }

    @Test
    fun `DRV-757 le message de connexion n'est que pour la page du mot de passe de l'enseigne, jamais pour une page sans pont qui n'en est pas une`() {
        // Le domaine nu d'une enseigne à pages de magasin : on y navigue, sans pont, mais ce n'est pas une page de mot de passe
        val bare = "https://exemple-a.test/"
        assertTrue(withPages.isNavigable(bare))
        assertFalse(withPages.isBridgePage(bare))
        assertFalse(withPages.isPasswordPage(bare))
        assertTrue(noPages.isPasswordPage(passwordPage))
        assertFalse(noPages.isPasswordPage("https://www.exemple-c.test/courses"))

        assertFalse(StoreBanner.LOGIN == StoreBanner.of(planA, bare))
        assertFalse(StoreBanner.LOGIN == StoreBanner.of(plan, "https://www.exemple-c.test/courses"))
        assertEquals(StoreBanner.LOGIN, StoreBanner.of(plan, passwordPage))
    }

    @Test
    fun `Auchan, la page du mot de passe a le message de connexion et la page du site non`() {
        val auchan = RetailerSites.DEFAULT.byId("auchan")!!
        val request = DrivePlan.parse(
            FictionalSites.plan(auchan, FictionalSites.STORE_UUID, "www.auchan.fr"),
            RetailerSites.DEFAULT,
        )!!

        assertEquals(StoreBanner.LOGIN, StoreBanner.of(request, "https://compte.auchan.fr/connexion"))
        assertEquals(StoreBanner.NONE, StoreBanner.of(request, "https://www.auchan.fr/courses"))
    }

    @Test
    fun `une lecture du magasin sur une enseigne sans page de magasin n'a aucun message de magasin, page ordinaire ou en erreur`() {
        pages.forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(setup, it)) }
        PageTrouble.entries.filter { it != PageTrouble.VERIFICATION }.forEach { trouble ->
            pages.forEach { assertEquals("$trouble $it", StoreBanner.NONE, StoreBanner.of(setup, it, trouble)) }
        }
    }

    @Test
    fun `une page qui cloche garde son message et son bouton, comme ailleurs`() {
        listOf(PageTrouble.HTTP_ERROR, PageTrouble.SLOW, PageTrouble.NO_AGENT).forEach { trouble ->
            pages.forEach { assertEquals("$trouble $it", StoreBanner.PLAN, StoreBanner.of(plan, it, trouble)) }
        }
        pages.forEach {
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(plan, it, PageTrouble.VERIFICATION))
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(setup, it, PageTrouble.VERIFICATION))
        }
    }

    @Test
    fun `sans passage en cours, rien de change pour une enseigne sans page de magasin`() {
        pages.forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(null, it)) }
        pages.forEach { assertEquals(it, StoreBanner.BASKET, StoreBanner.of(null, it, PageTrouble.NONE, basketHint = true)) }
    }

    @Test
    fun `une enseigne a pages de magasin garde ses messages dans les memes etats`() {
        val storePage = "https://courses-test.exemple-a.test/depot-000000-000000-Ville-Test/accueil.aspx"
        val storeRoot = "https://courses-test.exemple-a.test/"
        val home = "https://www.exemple-a.test/"
        val login = "https://courses-test.exemple-a.test/connexion.aspx"

        assertEquals(StoreBanner.NONE, StoreBanner.of(planA, storePage))
        assertEquals(StoreBanner.NONE, StoreBanner.of(planA, home))
        assertEquals(StoreBanner.OPEN, StoreBanner.of(planA, storeRoot, storeKnown = true))
        assertEquals(StoreBanner.STORE_FIRST, StoreBanner.of(planA, login))
        assertEquals(StoreBanner.SETUP, StoreBanner.of(setupA, home))
        assertEquals(StoreBanner.SETUP, StoreBanner.of(setupA, storeRoot))
        assertEquals(StoreBanner.SETUP, StoreBanner.of(setupA, storePage, PageTrouble.HTTP_ERROR))
        assertEquals(StoreBanner.STORE_FIRST, StoreBanner.of(setupA, login))
        assertEquals(StoreBanner.NONE, StoreBanner.of(setupA, storePage))
    }
}

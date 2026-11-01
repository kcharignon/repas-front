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
    private val plan = DrivePlan.parse(ReferencePlans.json())!!
    private val setup = SetupRequest.of(runId)!!

    private val storePage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
    private val storeRoot = "https://m-courses.leclercdrive.fr/"
    private val enseigne = "https://www.leclercdrive.fr/"
    private val login = "https://m-courses.leclercdrive.fr/connexion.aspx"

    @Test
    fun `sans passage en cours, aucun message`() {
        listOf(null, storePage, storeRoot, enseigne).forEach { assertEquals(it, StoreBanner.NONE, StoreBanner.of(null, it)) }
        PageTrouble.entries.forEach { assertEquals(it.name, StoreBanner.NONE, StoreBanner.of(null, storeRoot, it)) }
    }

    @Test
    fun `l'arrivee de Finaliser, sans passage, dit ou est le panier, sans bouton ni alarme`() {
        listOf(null, storePage, storeRoot, enseigne).forEach { assertEquals(it, StoreBanner.BASKET, StoreBanner.of(null, it, PageTrouble.NONE, basketHint = true)) }
        assertFalse(StoreBanner.BASKET.hasAction)
        // Une page refusee ou un defi : le message de la page prime, pas le bandeau du panier
        PageTrouble.entries.filter { it != PageTrouble.NONE }.forEach {
            assertEquals(it.name, StoreBanner.NONE, StoreBanner.of(null, storeRoot, it, basketHint = true))
        }
    }

    @Test
    fun `un plan sur une page de magasin n'a rien a dire`() {
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, storePage))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, "https://m-courses.leclercdrive.fr/magasin-000000-000000/panier.aspx"))
    }

    /**
     * Constat de la recette réelle : la page d'ouverture d'un plan est l'accueil de l'enseigne, qui affiche l'accueil du magasin avec son bouton
     * « Commencer mes courses ». Ce n'est pas une page de magasin pour l'agent : l'utilisateur doit toucher ce bouton. Le message le dit
     * (et ne le fait jamais à sa place), sans alarme : c'est l'attente normale.
     */
    @Test
    fun `sur l'accueil du magasin ou toute page qui n'en est pas une, un plan dit d'ouvrir son magasin, sans alarme ni bouton`() {
        listOf(storeRoot, null, "https://m-courses.leclercdrive.fr/autre-page").forEach {
            assertEquals(it, StoreBanner.OPEN, StoreBanner.of(plan, it, storeKnown = true))
            assertEquals(it, StoreBanner.OPEN, StoreBanner.of(plan, it, PageTrouble.NONE, storeKnown = true))
        }
        assertFalse(StoreBanner.OPEN.hasAction)
    }

    /**
     * DRV-753 (recette du 2026-11-01) : au premier usage, aucun magasin n'a jamais été ouvert dans l'application, et « Commencer mes courses » n'est pas sur le site (il
     * n'apparaît qu'une fois le magasin choisi). Le message qui le désignait mentait : il se tait, c'est la carte du guide de l'agent qui dit quoi faire. Une page refusée ou
     * une vérification gardent leur message.
     */
    @Test
    fun `sans magasin deja ouvert, aucun message ne designe un bouton Commencer mes courses qui n'existe pas encore`() {
        listOf(storeRoot, null, "https://m-courses.leclercdrive.fr/autre-page").forEach {
            assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it))
            assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it, PageTrouble.NONE, storeKnown = false))
            assertEquals(it, StoreBanner.PLAN, StoreBanner.of(plan, it, PageTrouble.HTTP_ERROR))
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(plan, it, PageTrouble.VERIFICATION))
        }
    }

    /**
     * Recette réelle (2026-10-19) : Leclerc exige un magasin choisi AVANT la connexion (« Avant de vous authentifier, veuillez sélectionner un
     * Drive. »). Si la page de connexion s'affiche avant tout magasin, pour un envoi comme pour la lecture du magasin, le message ramène au choix
     * du magasin ; il ne parle pas de connexion et ne porte pas de bouton. Une page refusée ou une vérification gardent leur propre message.
     */
    @Test
    fun `la page de connexion avant tout magasin ramene au choix du magasin, pour un envoi comme pour la lecture du magasin`() {
        listOf(login, "https://www.leclercdrive.fr/connexion").forEach {
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(plan, it))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(setup, it))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(setup, it, PageTrouble.NONE))
            assertEquals(it, StoreBanner.PLAN, StoreBanner.of(plan, it, PageTrouble.HTTP_ERROR))
            assertEquals(it, StoreBanner.SETUP, StoreBanner.of(setup, it, PageTrouble.HTTP_ERROR))
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(plan, it, PageTrouble.VERIFICATION))
            // Sans passage en cours, rien à dire
            assertEquals(it, StoreBanner.NONE, StoreBanner.of(null, it))
        }
        assertFalse(StoreBanner.STORE_FIRST.hasAction)
        // Sous le chemin d'un magasin, un magasin est ouvert : rien à dire pour la lecture, l'agent a la main pour un envoi.
        val inStore = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/connexion.aspx"
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, inStore))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, inStore))
    }

    /**
     * DRV-751 : la personne touche « Se connecter » depuis sa page de magasin, le site l'emmène sur la page de connexion. Un magasin est déjà ouvert : « Choisis d'abord
     * ton magasin » serait faux, un envoi n'y dit rien. La lecture du magasin et les pages refusées gardent leur message ; sans magasin connu, rien ne change.
     */
    @Test
    fun `la page de connexion d'un envoi ne dit pas de choisir son magasin quand un magasin est deja ouvert`() {
        listOf(login, "https://www.leclercdrive.fr/connexion").forEach {
            assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it, storeKnown = true))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(plan, it, storeKnown = false))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(plan, it))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(setup, it, storeKnown = true))
            assertEquals(it, StoreBanner.PLAN, StoreBanner.of(plan, it, PageTrouble.HTTP_ERROR, storeKnown = true))
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(plan, it, PageTrouble.VERIFICATION, storeKnown = true))
        }
    }

    /** DRV-625 : sur l'accueil de l'enseigne, l'agent suit lui-même « Commencer mes courses » (ou dit de le toucher) : le bandeau de l'application se tait. */
    @Test
    fun `sur l'accueil de l'enseigne, un plan n'a pas de bandeau, l'agent y parle`() {
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, enseigne))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, plan.startUrl))
        // La lecture du magasin, elle, dit toujours de choisir son magasin
        assertEquals(StoreBanner.SETUP, StoreBanner.of(setup, enseigne))
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
        listOf(StoreBanner.NONE, StoreBanner.SETUP, StoreBanner.OPEN, StoreBanner.STORE_FIRST).forEach { assertFalse(it.name, it.hasAction) }
    }

    /**
     * Le site mobile d'une enseigne qui le refuse (ticket J, mécanisme générique, prouvé avec une enseigne FICTIVE : Leclerc n'en a plus, DRV-754) : l'agent n'y
     * agit pas, l'application ne lui envoie rien. Le message propose de recommencer depuis l'accueil du drive, pour un envoi comme pour la lecture du magasin.
     */
    @Test
    fun `le site mobile d'une enseigne qui le refuse propose de recommencer, pour un envoi comme pour la lecture du magasin`() {
        val site = FictionalSites.A
        val fakePlan = DrivePlan.parse(FictionalSites.plan(site, "123456", "fd9-courses.exemple-a.test"), FictionalSites.ALL)!!
        val fakeSetup = SetupRequest.of(runId, site)!!
        val mobilePage = "https://m-courses.exemple-a.test/depot-000000-000000-Ville-Test/accueil.aspx"
        val mobileRoot = "https://m-courses.exemple-a.test/"

        listOf(mobilePage, mobileRoot).forEach {
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(fakePlan, it))
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(fakeSetup, it))
            assertEquals(it, StoreBanner.MOBILE, StoreBanner.of(fakePlan, it, PageTrouble.NONE))
        }
        // Sans passage en cours, rien à dire ; une vérification du site passe avant (la page doit rester visible pour qu'on la passe).
        assertEquals(StoreBanner.NONE, StoreBanner.of(null, mobilePage))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(fakePlan, mobilePage, PageTrouble.VERIFICATION))
    }

    /**
     * DRV-754 : Leclerc passe par sa version mobile. Ses pages `m-courses` ne sont plus « un site mobile » : aucun message « site mobile » ni « version ordinateur »
     * n'est jamais montré pour Leclerc, quelle que soit la page, avec ou sans magasin connu.
     */
    @Test
    fun `Leclerc ne montre jamais le message du site mobile, sur aucune page de sa version mobile`() {
        val pages = listOf(
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test",
            "https://m-courses.leclercdrive.fr/",
            "https://www.leclercdrive.fr/#_divMoc123",
            "https://fd8-courses.leclercdrive.fr/magasin-000000-000000-ville-test/mobile-detail-panier.aspx?sProvenance=SM",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/authentification.aspx?s=600",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/home-espace-client-ccc.aspx",
        )
        pages.forEach { page ->
            listOf(false, true).forEach { known ->
                assertTrue(page, StoreBanner.of(plan, page, storeKnown = known) != StoreBanner.MOBILE)
                assertTrue(page, StoreBanner.of(setup, page, storeKnown = known) != StoreBanner.MOBILE)
            }
        }
        // Une page du magasin sur m-courses : l'agent y a la main, rien à dire
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, pages[0]))
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, pages[0]))
    }

    /**
     * DRV-754 : la connexion et la création de compte de la version mobile (`fd<N>-espace-client`) suivent les règles de la connexion d'avant : avant tout magasin
     * connu, le message ramène au choix du magasin ; un magasin connu, un envoi n'y dit rien (la carte « Connecte-toi » de l'agent y parle). Le compte une fois
     * connecté (`home-espace-client-ccc.aspx`) n'est pas une page de connexion.
     */
    @Test
    fun `la connexion et la creation de compte de la version mobile suivent les regles de la connexion`() {
        val mobileLogin = "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/authentification.aspx?s=600"
        val signUp = "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-ville-test/creation-compte-ccc.aspx?s=16000&v=&u=&r=x"
        listOf(mobileLogin, signUp).forEach {
            assertEquals(it, StoreBanner.NONE, StoreBanner.of(plan, it, storeKnown = true))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(plan, it, storeKnown = false))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(setup, it, storeKnown = true))
            assertEquals(it, StoreBanner.STORE_FIRST, StoreBanner.of(setup, it))
            assertEquals(it, StoreBanner.PLAN, StoreBanner.of(plan, it, PageTrouble.HTTP_ERROR, storeKnown = true))
            assertEquals(it, StoreBanner.VERIFICATION, StoreBanner.of(plan, it, PageTrouble.VERIFICATION, storeKnown = true))
        }
        val account = "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/home-espace-client-ccc.aspx"
        assertFalse(RetailerSites.DEFAULT.legacy.isLoginPage(account))
        // Connecté, avec un magasin connu : le bandeau « Commencer mes courses » comme sur toute autre page qui n'est ni magasin ni connexion
        assertEquals(StoreBanner.OPEN, StoreBanner.of(plan, account, storeKnown = true))
    }

    @Test
    fun `une verification a faire sur la page est dite sans cacher la page`() {
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(plan, plan.startUrl, PageTrouble.VERIFICATION))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(plan, storePage, PageTrouble.VERIFICATION))
        assertEquals(StoreBanner.VERIFICATION, StoreBanner.of(setup, storePage, PageTrouble.VERIFICATION))
    }

    @Test
    fun `une lecture du magasin dit de choisir son magasin tant que la page n'en est pas un`() {
        listOf(enseigne, storeRoot, null).forEach { assertEquals(it, StoreBanner.SETUP, StoreBanner.of(setup, it)) }
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
            "https://m-courses.leclercdrive.fr/magasin-000000-000000/",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000",
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
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, plan.startUrl))
    }
}

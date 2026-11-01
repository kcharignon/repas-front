package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La surveillance de la page où un envoi attend la page du magasin (ticket E de l'audit des hypothèses) : ce qui cloche (erreur du site, délai
 * dépassé, page sans l'agent), pour ne jamais laisser l'utilisateur devant un écran muet. L'accueil de l'enseigne, où un plan s'ouvre, n'est pas
 * une page de magasin pour l'agent : l'attendre est normal, ce n'est pas un problème. Adresses SYNTHÉTIQUES.
 */
class OpeningWatchTest {
    private val storePage = "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
    private val root = "https://courses-test.leclercdrive.fr/"
    private val enseigne = "https://www.leclercdrive.fr/"

    /** Une page qui a démarré puis fini de charger, sans erreur du site. */
    private fun loaded(): OpeningWatch = OpeningWatch().apply {
        pageStarted()
        pageFinished()
    }

    @Test
    fun `tant que la premiere page charge, rien n'est reproche au site`() {
        val watch = OpeningWatch()
        assertEquals(PageTrouble.NONE, watch.trouble(null))

        watch.pageStarted()
        assertEquals(PageTrouble.NONE, watch.trouble(root))
        assertEquals("pas encore d'adresse connue", PageTrouble.NONE, watch.trouble(null))
    }

    @Test
    fun `une page de magasin chargee sans incident ne pose aucun probleme et peut recevoir le plan`() {
        val watch = loaded()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        assertTrue(watch.canDeliver(storePage))
    }

    @Test
    fun `une page qui n'est pas celle d'un magasin n'est pas un probleme, mais ne recoit pas le plan`() {
        // La racine de l'hôte du magasin (une page 404 du vrai site), l'accueil de l'enseigne, la connexion : l'utilisateur y choisit son magasin.
        listOf(root, enseigne, "https://courses-test.leclercdrive.fr/connexion.aspx", "https://courses-test.leclercdrive.fr/autre", null).forEach {
            val watch = loaded()
            assertEquals(it, PageTrouble.NONE, watch.trouble(it))
            assertFalse(it, watch.canDeliver(it))
        }
    }

    /** DRV-625 : un plan part aussi de l'accueil de l'enseigne, où l'agent entre dans le magasin ; la lecture du magasin attend toujours une page de magasin. */
    @Test
    fun `un plan part de l'accueil de l'enseigne, pas la lecture du magasin, et jamais d'une page refusee`() {
        val watch = loaded()
        assertTrue(watch.canDeliver(enseigne, entersStore = true))
        assertFalse(watch.canDeliver(enseigne))
        assertFalse("la racine de l'hôte du magasin n'est pas l'accueil", watch.canDeliver(root, entersStore = true))
        assertFalse(watch.canDeliver("https://www.leclercdrive.fr/connexion", entersStore = true))
        assertEquals(PageTrouble.NONE, watch.trouble(enseigne))

        val refused = OpeningWatch().apply { pageStarted(); httpError(403); pageFinished() }
        assertFalse(refused.canDeliver(enseigne, entersStore = true))
    }

    /**
     * DRV-753 : la page de connexion (hors d'un magasin) reçoit le plan d'un envoi quand un magasin a déjà été ouvert : l'agent y dit « Entre tes identifiants dans la page » (étape 2
     * du parcours guidé). Sans magasin connu, la connexion serait refusée par Leclerc et le message de l'application ramène au choix du magasin : rien n'est livré. Jamais la
     * lecture du magasin, jamais une page refusée, jamais le site mobile.
     */
    @Test
    fun `un plan part de la page de connexion seulement quand un magasin a deja ete ouvert`() {
        val watch = loaded()
        val login = "https://www.leclercdrive.fr/connexion"
        assertTrue(watch.canDeliver(login, entersStore = true, storeKnown = true))
        assertTrue(watch.canDeliver("https://www.leclercdrive.fr/connexion.aspx", entersStore = true, storeKnown = true))
        assertFalse(watch.canDeliver(login, entersStore = true, storeKnown = false))
        assertFalse("la lecture du magasin n'y va jamais", watch.canDeliver(login, entersStore = false, storeKnown = true))
        assertFalse(watch.canDeliver("https://www.leclercdrive.fr/connexion-autre", entersStore = true, storeKnown = true))
        assertFalse(watch.canDeliver("https://m-courses.leclercdrive.fr/connexion.aspx", entersStore = true, storeKnown = true))
        assertFalse(watch.canDeliver("https://www.exemple.org/connexion", entersStore = true, storeKnown = true))
        val refused = OpeningWatch().apply { pageStarted(); httpError(403); pageFinished() }
        assertFalse(refused.canDeliver(login, entersStore = true, storeKnown = true))
    }

    @Test
    fun `un agent absent de l'accueil de l'enseigne est dit, comme sur une page de magasin`() {
        val watch = loaded().apply { agentTimedOut() }
        assertEquals(PageTrouble.NO_AGENT, watch.trouble(enseigne))
        assertEquals(PageTrouble.NO_AGENT, watch.trouble(storePage))
        assertEquals(PageTrouble.NONE, watch.trouble(root))
    }

    @Test
    fun `le site mobile ne recoit jamais le plan, meme charge sans incident (ticket J)`() {
        val mobilePage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
        val watch = loaded()

        assertEquals(PageTrouble.NONE, watch.trouble(mobilePage))
        assertFalse(watch.canDeliver(mobilePage))
    }

    @Test
    fun `une erreur HTTP du site sur la page principale est signalee, meme sur une adresse de magasin`() {
        listOf(400, 404, 410, 418, 451, 500, 502, 503, 599).forEach { status ->
            val watch = OpeningWatch()
            watch.pageStarted()
            watch.httpError(status)
            watch.pageFinished()
            assertEquals("HTTP $status", PageTrouble.HTTP_ERROR, watch.trouble(storePage))
            assertEquals("HTTP $status, sur la racine aussi", PageTrouble.HTTP_ERROR, watch.trouble(root))
            assertFalse("le plan ne part pas vers une page d'erreur (HTTP $status)", watch.canDeliver(storePage))
        }
    }

    @Test
    fun `un refus 403 ou 429 est une verification a faire, pas une page d'erreur`() {
        // Leclerc protège ses pages par un défi anti-robot, servi avec ce code : la page doit rester visible pour que l'utilisateur le passe.
        listOf(403, 429).forEach { status ->
            val watch = OpeningWatch()
            watch.pageStarted()
            watch.httpError(status)
            watch.pageFinished()
            assertEquals("HTTP $status", PageTrouble.VERIFICATION, watch.trouble(storePage))
            assertFalse(watch.canDeliver(storePage))
        }
    }

    @Test
    fun `une erreur HTTP est oubliee a la page suivante`() {
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.httpError(404)
        watch.pageFinished()
        assertEquals(PageTrouble.HTTP_ERROR, watch.trouble(storePage))

        // L'utilisateur ouvre une autre page, qui répond normalement.
        watch.pageStarted()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        assertTrue(watch.canDeliver(storePage))
    }

    /**
     * L'ordre des événements d'une même page n'est pas garanti : la WebView annonce l'erreur HTTP de la page principale AVANT son début
     * (`onPageStarted` a lieu à la validation de la navigation, après la réponse). Constaté dans l'émulateur : une erreur 404 effacée par le début
     * de la page, et le plan envoyé à une page d'erreur.
     */
    @Test
    fun `une erreur HTTP annoncee avant le debut de la page est gardee`() {
        listOf(404 to PageTrouble.HTTP_ERROR, 503 to PageTrouble.HTTP_ERROR, 403 to PageTrouble.VERIFICATION, 429 to PageTrouble.VERIFICATION).forEach { (status, trouble) ->
            val watch = OpeningWatch()
            watch.httpError(status)
            watch.pageStarted()
            watch.pageFinished()
            assertEquals("HTTP $status", trouble, watch.trouble(storePage))
            assertFalse("HTTP $status", watch.canDeliver(storePage))
        }
    }

    @Test
    fun `une erreur annoncee avant le debut de la page est gardee aussi apres une page qui a fini`() {
        val watch = loaded()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))

        // L'utilisateur ouvre une autre page : son erreur arrive d'abord, puis son début.
        watch.httpError(404)
        watch.pageStarted()
        watch.pageFinished()
        assertEquals(PageTrouble.HTTP_ERROR, watch.trouble(storePage))
        assertFalse(watch.canDeliver(storePage))

        // Une page qui répond bien, ensuite : l'erreur est oubliée.
        watch.pageStarted()
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        assertTrue(watch.canDeliver(storePage))
    }

    @Test
    fun `un echec de chargement annonce avant le debut de la page est garde`() {
        val watch = OpeningWatch()
        watch.loadFailed()
        watch.pageStarted()
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(root))
        assertFalse(watch.canDeliver(storePage))
    }

    @Test
    fun `une page rechargee sans erreur apres une page d'erreur est une page bonne`() {
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.httpError(404)
        watch.pageFinished()
        assertEquals(PageTrouble.HTTP_ERROR, watch.trouble(storePage))

        watch.pageStarted()
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
    }

    @Test
    fun `une page rouverte pendant que la precedente charge repart de zero`() {
        // « Ouvrir l'accueil du drive » touché alors que la page n'arrive pas : ce qu'on savait d'elle est oublié, son début n'est pas attendu.
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.loadTimedOut()
        assertEquals(PageTrouble.SLOW, watch.trouble(root))

        watch.restart()
        assertEquals(PageTrouble.NONE, watch.trouble(root))
        watch.pageStarted()
        watch.pageFinished()
        assertEquals("la page est arrivée : l'accueil du magasin, rien à reprocher", PageTrouble.NONE, watch.trouble(root))
    }

    @Test
    fun `une page que la WebView n'a pas pu charger est expliquee par le panneau d'incident, pas par le message du magasin`() {
        // Pas de réseau, certificat refusé : « Réessayer » suffit, proposer l'accueil du drive serait faux.
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.loadFailed()
        watch.pageFinished()
        watch.agentTimedOut()
        assertEquals(PageTrouble.NONE, watch.trouble(root))
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        assertFalse(watch.canDeliver(storePage))

        watch.pageStarted()
        watch.pageFinished()
        assertTrue("la page suivante est jugée à nouveau", watch.canDeliver(storePage))
    }

    @Test
    fun `une page qui tarde trop est signalee, puis oubliee des qu'elle finit`() {
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.loadTimedOut()
        assertEquals(PageTrouble.SLOW, watch.trouble(root))
        assertEquals(PageTrouble.SLOW, watch.trouble(storePage))

        watch.pageFinished()
        assertEquals("la page est arrivée", PageTrouble.NONE, watch.trouble(root))
    }

    @Test
    fun `le delai de chargement ne dit rien d'une page qui a deja fini`() {
        val watch = loaded()
        watch.loadTimedOut()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
    }

    @Test
    fun `une page de magasin sans agent est signalee au bout du delai, si le plan n'est pas parti`() {
        val watch = loaded()
        assertEquals("avant le délai, l'agent a le temps de s'annoncer", PageTrouble.NONE, watch.trouble(storePage))

        watch.agentTimedOut()
        assertEquals(PageTrouble.NO_AGENT, watch.trouble(storePage))
        assertTrue("le plan peut encore partir si l'agent s'annonce enfin", watch.canDeliver(storePage))
    }

    @Test
    fun `une page qui n'est pas un magasin n'est jamais signalee comme sans agent`() {
        // Sur l'accueil, l'agent n'a rien à recevoir : son absence ne se voit pas, et n'a pas à être dite.
        val watch = loaded()
        watch.agentTimedOut()
        assertEquals(PageTrouble.NONE, watch.trouble(root))
    }

    @Test
    fun `un plan parti vers l'agent n'est jamais signale comme sans agent`() {
        val watch = loaded()
        watch.planSent()
        watch.agentTimedOut()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
    }

    /**
     * L'utilisateur touche « Commencer mes courses » : l'historique du drive a désormais deux pages (l'accueil, puis le magasin). Le retour du
     * téléphone ne doit pas défaire cette navigation pendant que l'agent travaille sur la page du magasin (il y mourrait en plein passage) : il demande
     * d'abandonner l'envoi. L'activité le sait par [OpeningWatch.hasDeliveredPlan].
     */
    @Test
    fun `on sait si le plan est parti vers l'agent de la page, jusqu'a la page suivante`() {
        val watch = OpeningWatch()
        assertFalse(watch.hasDeliveredPlan())

        watch.pageStarted()
        watch.pageFinished()
        assertFalse("l'accueil n'a pas reçu le plan", watch.hasDeliveredPlan())

        watch.planSent()
        assertTrue(watch.hasDeliveredPlan())

        watch.pageStarted()
        assertFalse("une autre page n'a pas reçu le plan", watch.hasDeliveredPlan())
    }

    @Test
    fun `un agent qui s'annonce en retard efface le probleme`() {
        val watch = loaded()
        watch.agentTimedOut()
        assertEquals(PageTrouble.NO_AGENT, watch.trouble(storePage))

        watch.planSent()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
    }

    @Test
    fun `le delai de l'agent ne dit rien avant la fin du chargement`() {
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.agentTimedOut()
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
    }

    @Test
    fun `une nouvelle page remet tout a zero`() {
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.httpError(404)
        watch.loadTimedOut()
        watch.pageFinished()
        watch.agentTimedOut()
        watch.planSent()

        watch.pageStarted()
        watch.pageFinished()
        assertEquals(PageTrouble.NONE, watch.trouble(storePage))
        watch.agentTimedOut()
        assertEquals("le plan envoyé à l'ancienne page ne compte plus", PageTrouble.NO_AGENT, watch.trouble(storePage))
    }

    @Test
    fun `quand plusieurs choses cloquent, la plus grave parle d'abord`() {
        // Vérification > erreur HTTP > page trop lente.
        val watch = OpeningWatch()
        watch.pageStarted()
        watch.httpError(429)
        watch.loadTimedOut()
        assertEquals(PageTrouble.VERIFICATION, watch.trouble(root))

        val error = OpeningWatch()
        error.pageStarted()
        error.httpError(404)
        error.loadTimedOut()
        assertEquals(PageTrouble.HTTP_ERROR, error.trouble(root))

        val slow = OpeningWatch()
        slow.pageStarted()
        slow.loadTimedOut()
        assertEquals(PageTrouble.SLOW, slow.trouble(root))
    }

    @Test
    fun `une page refusee par le site ou qui n'a pas pu charger n'est pas retenue (DRV-629)`() {
        assertFalse(loaded().refused())
        assertTrue(OpeningWatch().apply { pageStarted(); httpError(404); pageFinished() }.refused())
        assertTrue(OpeningWatch().apply { pageStarted(); loadFailed(); pageFinished() }.refused())
        assertFalse(OpeningWatch().apply { pageStarted(); httpError(404); restart(); pageFinished() }.refused())
    }

    @Test
    fun `les delais sont raisonnables`() {
        // Assez longs pour une page lente sur un réseau mobile, assez courts pour que l'utilisateur ne reste pas devant un écran muet.
        assertTrue(OpeningWatch.LOAD_TIMEOUT_MS in 15_000L..45_000L)
        assertTrue(OpeningWatch.AGENT_TIMEOUT_MS in 5_000L..20_000L)
    }
}

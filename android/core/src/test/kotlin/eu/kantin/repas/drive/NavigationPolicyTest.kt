package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** La règle de navigation. Adresses SYNTHÉTIQUES : aucun vrai magasin, aucune vraie ville. */
class NavigationPolicyTest {
    @Test
    fun `la page d'accueil de depart est autorisee`() {
        assertEquals("https://www.leclercdrive.fr/", NavigationPolicy.START_URL)
        assertTrue(NavigationPolicy.isAllowed(NavigationPolicy.START_URL))
    }

    @Test
    fun `leclercdrive_fr et ses sous-domaines en https sont autorises`() {
        val allowed = listOf(
            "https://leclercdrive.fr",
            "https://leclercdrive.fr/",
            "https://www.leclercdrive.fr/",
            "https://courses-test.leclercdrive.fr/magasin-000000-Ville-Test/accueil.aspx",
            "https://a.b.c.leclercdrive.fr/recherche.aspx?TexteRecherche=farine#haut",
            "https://magasin.leclercdrive.fr?x=1",
            "https://magasin.leclercdrive.fr#ancre",
            "https://www.leclercdrive.fr:443/",
        )
        allowed.forEach { assertTrue("devrait etre autorise : $it", NavigationPolicy.isAllowed(it)) }
    }

    @Test
    fun `les majuscules ne changent rien`() {
        assertTrue(NavigationPolicy.isAllowed("HTTPS://WWW.LeclercDrive.FR/Accueil"))
        assertEquals("www.leclercdrive.fr", NavigationPolicy.httpsHostOf("HTTPS://WWW.LeclercDrive.FR/Accueil"))
    }

    @Test
    fun `un autre domaine qui contient leclercdrive_fr est refuse`() {
        val refused = listOf(
            "https://leclercdrive.fr.evil.com/",
            "https://www.leclercdrive.fr.evil.com/",
            "https://evilleclercdrive.fr/",
            "https://www.leclercdrive.fr-evil.com/",
            "https://leclercdrive.frevil.com/",
            "https://leclercdrive.com/",
            "https://leclerc.fr/",
            "https://evil.com/leclercdrive.fr",
            "https://evil.com/?u=https://www.leclercdrive.fr/",
            "https://evil.com#.leclercdrive.fr",
            "https://evil.com?.leclercdrive.fr",
        )
        refused.forEach { assertFalse("devrait etre refuse : $it", NavigationPolicy.isAllowed(it)) }
    }

    @Test
    fun `les astuces d'ecriture de l'adresse sont refusees`() {
        val refused = listOf(
            "https://www.leclercdrive.fr@evil.com/",
            "https://user:pass@www.leclercdrive.fr/",
            "https://evil.com\\@www.leclercdrive.fr/",
            "https://evil.com\\.leclercdrive.fr/",
            "https://www.leclercdrive.fr\\.evil.com/",
            "https://www.leclercdrive.fr./",
            "https://.leclercdrive.fr/",
            "https://..leclercdrive.fr/",
            "https://-.leclercdrive.fr/",
            "https://a-.leclercdrive.fr/",
            "https://www.leclercdrive.fr:8443/",
            "https://www.leclercdrive.fr:/",
            "https://www.leclercdrive.fr:443x/",
            "https://[::1]/",
            "https://www.leclercdrive.fr /",
            "https://www.leclercdrive.fr\n.evil.com/",
            "https://www.leclercdrive.fr\t/",
            "https://www.lеclercdrive.fr/",
            "https://www.leclercdrive.fr%2f@evil.com/",
            "https://www.leclercdrive.fr‮/",
            "https:///www.leclercdrive.fr/",
            "https://",
            "https:/www.leclercdrive.fr/",
        )
        refused.forEach { assertFalse("devrait etre refuse : $it", NavigationPolicy.isAllowed(it)) }
    }

    @Test
    fun `seul https est autorise`() {
        val refused = listOf(
            "http://www.leclercdrive.fr/",
            "ftp://www.leclercdrive.fr/",
            "file:///www.leclercdrive.fr/",
            "javascript:alert('www.leclercdrive.fr')",
            "data:text/html,https://www.leclercdrive.fr/",
            "intent://www.leclercdrive.fr/#Intent;scheme=https;end",
            "about:blank",
            "//www.leclercdrive.fr/",
            "www.leclercdrive.fr",
            "",
        )
        refused.forEach { assertFalse("devrait etre refuse : $it", NavigationPolicy.isAllowed(it)) }
        assertFalse(NavigationPolicy.isAllowed(null))
    }

    @Test
    fun `l'accueil de l'enseigne est la racine de www, sans chemin`() {
        listOf(
            "https://www.leclercdrive.fr/",
            "https://www.leclercdrive.fr",
            "https://www.leclercdrive.fr/?a=1",
            "https://www.leclercdrive.fr/#haut",
            "HTTPS://WWW.LeclercDrive.FR/",
            "https://www.leclercdrive.fr:443/",
        ).forEach { assertTrue(it, NavigationPolicy.isHomePage(it)) }
        listOf(
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://www.leclercdrive.fr//",
            "https://courses-test.leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/",
            "https://leclercdrive.fr/",
            "https://www.leclercdrive.fr.evil.com/",
            "https://user:pass@www.leclercdrive.fr/",
            "http://www.leclercdrive.fr/",
            "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/",
            "",
        ).forEach { assertFalse(it, NavigationPolicy.isHomePage(it)) }
        assertFalse(NavigationPolicy.isHomePage(null))
        assertTrue(NavigationPolicy.isHomePage(NavigationPolicy.START_URL))
        assertFalse("l'accueil n'est pas une page de magasin", NavigationPolicy.isStorePage(NavigationPolicy.START_URL))
    }

    @Test
    fun `un site d'une page web ordinaire s'ouvre dans le navigateur du telephone`() {
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide("https://www.exemple.org/page"))
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide("https://leclercdrive.fr.evil.com/"))
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide("http://www.leclercdrive.fr/"))
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide("HTTP://www.exemple.org"))
    }

    @Test
    fun `les autres types d'adresse ne sont ouverts nulle part`() {
        val blocked = listOf(
            "javascript:alert(1)",
            "intent://exemple.org/#Intent;scheme=https;end",
            "market://details?id=exemple",
            "file:///data/data/eu.kantin.repas.drive/",
            "content://exemple/fichier",
            "tel:0102030405",
            "mailto:test@exemple.invalid",
            "data:text/html,<p>x</p>",
            "about:blank",
            "",
        )
        blocked.forEach { assertEquals("devrait etre bloque : $it", Decision.BLOCK, NavigationPolicy.decide(it)) }
        assertEquals(Decision.BLOCK, NavigationPolicy.decide(null))
    }

    @Test
    fun `une adresse autorisee est ALLOW`() {
        assertEquals(Decision.ALLOW, NavigationPolicy.decide("https://www.leclercdrive.fr/"))
        assertEquals(Decision.ALLOW, NavigationPolicy.decide("https://fd-test.leclercdrive.fr/x"))
    }

    @Test
    fun `le nom du site est lu sans le chemin ni le port`() {
        assertEquals("www.exemple.org", NavigationPolicy.httpsHostOf("https://www.exemple.org/a/b?c=d#e"))
        assertEquals("www.exemple.org", NavigationPolicy.httpsHostOf("https://www.exemple.org:443"))
        assertNull(NavigationPolicy.httpsHostOf("https://www.exemple.org:80/"))
        assertNull(NavigationPolicy.httpsHostOf("http://www.exemple.org/"))
        assertNull(NavigationPolicy.httpsHostOf(null))
    }

    @Test
    fun `la description pour le diagnostic ne garde ni chemin ni parametres`() {
        assertEquals("https://www.exemple.org", NavigationPolicy.describe("https://www.exemple.org/chemin/secret?jeton=abc#frag"))
        assertEquals("https://www.exemple.org", NavigationPolicy.describe("https://www.exemple.org:8443/chemin"))
        assertEquals("http://www.exemple.org", NavigationPolicy.describe("http://www.exemple.org/chemin"))
        assertEquals("tel", NavigationPolicy.describe("tel:0102030405"))
        assertEquals("intent", NavigationPolicy.describe("intent://exemple.org/#Intent;end"))
        assertEquals("https://?", NavigationPolicy.describe("https://user:pass@exemple.org/"))
        assertEquals("https://?", NavigationPolicy.describe("https://exemple.org\\@evil.example/"))
        assertEquals("http://?", NavigationPolicy.describe("http://"))
        assertEquals("?", NavigationPolicy.describe(""))
        assertEquals("?", NavigationPolicy.describe(null))
    }

    @Test
    fun `un schema qui n'est https qu'une fois mis en majuscules par Unicode n'est pas https`() {
        // « \u017F » (s long) devient « S » en majuscule : une comparaison sans casse ferait de http\u017F:// un https://. Une adresse
        // que le navigateur n'accepterait pas comme https ne doit jamais rester dans l'application.
        listOf("http\u017F://www.leclercdrive.fr/", "http\u017F://www.leclercdrive.fr:443/", "http\u017F://evil.com/").forEach {
            assertFalse(it, NavigationPolicy.isAllowed(it))
            assertNull(it, NavigationPolicy.httpsHostOf(it))
            assertEquals(it, Decision.BLOCK, NavigationPolicy.decide(it))
        }
        assertEquals("?", NavigationPolicy.describe("http\u017F://www.leclercdrive.fr/"))
    }

    @Test
    fun `une page de magasin se reconnait a son chemin (DRV-320), l'accueil et la connexion non`() {
        val stores = listOf(
            "https://fd0-courses.leclercdrive.fr/magasin-123456-123456/accueil.aspx",
            "https://fd0-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test/recherche.aspx?TexteRecherche=farine#haut",
            "https://fd0-courses.leclercdrive.fr/magasin-123456-123456",
            "https://fd0-courses.leclercdrive.fr/magasin-123456-123456?x=1",
            "https://www.leclercdrive.fr/MAGASIN-000001-000001-Ville-Test/",
        )
        val others = listOf(
            "https://www.leclercdrive.fr/",
            "https://www.leclercdrive.fr",
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://www.leclercdrive.fr/?u=/magasin-123456-123456/",
            "https://www.leclercdrive.fr?u=/magasin-123456-123456/",
            "https://www.leclercdrive.fr#/magasin-123456-123456/",
            "https://www.leclercdrive.fr/#/magasin-123456-123456/",
            "https://www.leclercdrive.fr/x/magasin-123456-123456/",
            "https://www.leclercdrive.fr/magasin-123456/accueil.aspx",
            "https://www.leclercdrive.fr/magasin-abc-123456/accueil.aspx",
            "https://www.leclercdrive.fr/magasin-123456-123456abc/accueil.aspx",
            "https://www.leclercdrive.fr/magasin-1234567890123-1/accueil.aspx",
            "https://exemple.org/magasin-123456-123456/accueil.aspx",
            "http://www.leclercdrive.fr/magasin-123456-123456/accueil.aspx",
            "https://www.leclercdrive.fr.evil.com/magasin-123456-123456/accueil.aspx",
            "about:blank",
            "",
            null,
        )
        stores.forEach { assertTrue("devrait être une page de magasin : $it", NavigationPolicy.isStorePage(it)) }
        others.forEach { assertFalse("ne devrait pas être une page de magasin : $it", NavigationPolicy.isStorePage(it)) }
    }

    /**
     * La page de connexion hors d'un magasin : Leclerc la refuse tant qu'aucun magasin n'est choisi (« veuillez sélectionner un Drive »). Seule
     * l'adresse compte : `/connexion` ou `/connexion.aspx`, ou (version mobile, DRV-754) `/drive/magasin-N-N[-Ville]/authentification.aspx` et `creation-compte-ccc.aspx`
     * de `fd<N>-espace-client`, sur le drive, et jamais sous le chemin d'un magasin ni le compte une fois connecté (`home-espace-client-ccc.aspx`).
     */
    @Test
    fun `la page de connexion hors d'un magasin se reconnait a son chemin, jamais une page de magasin ni le compte`() {
        val login = listOf(
            "https://www.leclercdrive.fr/connexion",
            "https://www.leclercdrive.fr/connexion/",
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://www.leclercdrive.fr/Connexion.aspx?retour=%2F#haut",
            "https://courses-test.leclercdrive.fr/connexion.aspx",
            "https://m-courses.leclercdrive.fr/connexion.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/authentification.aspx?s=600&x=1",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-ville-test/authentification.aspx",
            "https://fd12-espace-client.leclercdrive.fr/drive/magasin-123456-123456/Authentification.aspx#haut",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-ville-test/creation-compte-ccc.aspx?s=16000&v=&u=&r=abc",
        )
        val others = listOf(
            "https://www.leclercdrive.fr/",
            "https://www.leclercdrive.fr/?u=/connexion",
            "https://www.leclercdrive.fr#/connexion",
            "https://www.leclercdrive.fr/connexion-et-securite",
            "https://www.leclercdrive.fr/mon-compte/connexion.aspx",
            "https://www.leclercdrive.fr/deconnexion.aspx",
            // Sous le chemin d'un magasin, un magasin est ouvert : c'est une page de magasin, pas ce cas.
            "https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/connexion.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/home-espace-client-ccc.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/mon-compte.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/authentification.aspx.evil",
            "https://fd8-espace-client.leclercdrive.fr/autre/drive/magasin-123456-123456-Ville-Test/authentification.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/x/authentification.aspx",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-abc-123456-Ville-Test/authentification.aspx",
            "https://exemple.org/drive/magasin-123456-123456-Ville-Test/authentification.aspx",
            "https://exemple.org/connexion.aspx",
            "http://www.leclercdrive.fr/connexion.aspx",
            "https://www.leclercdrive.fr.evil.com/connexion.aspx",
            "about:blank",
            "",
            null,
        )
        login.forEach {
            assertTrue("devrait être la page de connexion : $it", NavigationPolicy.isLoginPage(it))
            assertFalse("la page de connexion n'est pas une page de magasin : $it", NavigationPolicy.isStorePage(it))
            assertFalse("la page de connexion n'est pas l'accueil : $it", NavigationPolicy.isHomePage(it))
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(it))
        }
        others.forEach { assertFalse("ne devrait pas être la page de connexion : $it", NavigationPolicy.isLoginPage(it)) }
    }

    /**
     * DRV-754 : Leclerc passe par sa VERSION MOBILE (décision du propriétaire du 2026-11-01), comme Auchan. Ses quatre hôtes sont dans `*.leclercdrive.fr`
     * en minuscules : `www` (accueil), `m-courses` (pages du magasin, sans `.aspx`), `fd<N>-espace-client` (connexion) et `fd<N>-courses` (AJAX, panier, plan).
     * On y navigue, le pont et l'agent y existent ; `m-courses` n'est plus un « site mobile » refusé.
     */
    @Test
    fun `les quatre hotes de la version mobile de Leclerc restent dans l'application, avec le pont, jamais un autre domaine`() {
        val leclerc = RetailerSites.DEFAULT.byId("leclerc")!!
        val hosts = listOf(
            "https://www.leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/authentification.aspx?s=600",
            "https://fd8-courses.leclercdrive.fr/magasin-123456-123456-ville-test/mobile-detail-panier.aspx?sProvenance=SM",
        )
        hosts.forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(leclerc, it))
            assertTrue("le pont existe : $it", leclerc.isBridgePage(it))
            assertFalse("Leclerc n'a plus de site mobile à refuser : $it", leclerc.isMobileSite(it))
        }
        val others = listOf(
            "https://m-courses.leclercdrive.fr.evil.com/magasin-123456-123456-ville-test",
            "https://m-courses.exemple.org/magasin-123456-123456-ville-test",
            "https://fd8-courses.leclercdrive.fr:8443/magasin-123456-123456-ville-test",
            "http://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr\\@evil.test/",
            "https://fd8-courses.leclercdrive.fr@evil.test/",
        )
        others.forEach { assertTrue("ne reste pas dans l'application : $it", NavigationPolicy.decide(leclerc, it) != Decision.ALLOW) }
        // Un nom en majuscules est lu en minuscules (le même site) ; le pont ne s'ouvre que sur l'origine exacte
        assertTrue(leclerc.isBridgeOrigin("https://m-courses.leclercdrive.fr"))
        assertTrue(leclerc.isBridgeOrigin("https://fd8-espace-client.leclercdrive.fr"))
        assertFalse(leclerc.isBridgeOrigin("https://leclercdrive.fr"))
        assertFalse(leclerc.isBridgeOrigin("https://m-courses.leclercdrive.fr.evil.com"))
        assertFalse(leclerc.isBridgeOrigin("https://m-courses.leclercdrive.fr:8443"))
        assertEquals(setOf("https://*.leclercdrive.fr"), leclerc.bridgeOrigins)
        assertEquals(SiteMode.MOBILE, leclerc.siteMode)
    }

    /** DRV-754 : une page de `m-courses` ou de `fd<N>-courses` dont le chemin est un magasin (sans `.aspx`, ville en minuscules ou en majuscules, panier mobile) est une page de magasin. */
    @Test
    fun `les pages de magasin de la version mobile sont des pages de magasin, la connexion et le compte n'en sont pas`() {
        val stores = listOf(
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test/",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test",
            "https://fd8-courses.leclercdrive.fr/magasin-123456-123456-ville-test/mobile-detail-panier.aspx?sProvenance=SM",
            "https://fd8-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test/mobile-detail-panier.aspx",
            "https://fd9-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test/recherche.aspx",
        )
        val notStores = listOf(
            "https://www.leclercdrive.fr/",
            "https://www.leclercdrive.fr/#_divMoc123",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/authentification.aspx?s=600",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-ville-test/creation-compte-ccc.aspx?s=16000&v=&u=&r=x",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-123456-123456-Ville-Test/home-espace-client-ccc.aspx",
            "https://m-courses.leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/autre-page",
        )
        stores.forEach { assertTrue("devrait être une page de magasin : $it", NavigationPolicy.isStorePage(it)) }
        notStores.forEach { assertFalse("ne devrait pas être une page de magasin : $it", NavigationPolicy.isStorePage(it)) }
    }

    /**
     * Le mécanisme générique d'un site mobile à refuser (`mobileSiteLabel`, mode ordinateur) reste pour les enseignes qui en ont besoin : prouvé avec une
     * enseigne FICTIVE, plus avec Leclerc.
     */
    @Test
    fun `le site mobile d'une enseigne qui le refuse se reconnait a son nom et n'est jamais une page de magasin`() {
        val site = FictionalSites.A
        val mobile = listOf(
            "https://m-courses.exemple-a.test/",
            "https://m-courses.exemple-a.test/depot-123456-123456-Ville-Test/recherche.aspx",
            "https://M-COURSES.EXEMPLE-A.TEST/depot-123456-123456/accueil.aspx",
            "https://m-autre.exemple-a.test/depot-123456-123456/accueil.aspx",
            "https://m.exemple-a.test/depot-123456-123456/accueil.aspx",
        )
        val desktop = listOf(
            "https://fd9-courses.exemple-a.test/depot-123456-123456-Ville-Test/recherche.aspx",
            "https://fd14-courses.exemple-a.test/",
            "https://www.exemple-a.test/",
            "https://mm-courses.exemple-a.test/depot-123456-123456/accueil.aspx",
            "https://xm-courses.exemple-a.test/depot-123456-123456/accueil.aspx",
            "https://m-courses.exemple.org/depot-123456-123456/accueil.aspx",
            "http://m-courses.exemple-a.test/",
            "",
            null,
        )
        mobile.forEach {
            assertTrue("devrait être le site mobile : $it", site.isMobileSite(it))
            assertFalse("le site mobile n'est pas une page de magasin : $it", site.isStorePage(it))
            // Il reste dans l'application (la page se charge, l'utilisateur y est guidé) : seul l'agent n'y agit pas.
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(site, it))
        }
        desktop.forEach { assertFalse("ne devrait pas être le site mobile : $it", site.isMobileSite(it)) }
        assertTrue(site.isStorePage("https://fd9-courses.exemple-a.test/depot-123456-123456-Ville-Test/recherche.aspx"))
    }

    /**
     * Un plan s'ouvre sur l'accueil de l'enseigne (`www`), et « Commencer mes courses » mène, par une ou plusieurs redirections, à la page du
     * magasin sur son hôte `fdN-courses` : chaque étape reste dans l'application (l'agent y est injecté, le pont y est ouvert), et seule la
     * dernière est une page de magasin, celle où le plan part vers l'agent.
     */
    @Test
    fun `de l'accueil de l'enseigne a la page du magasin, chaque etape reste dans l'application`() {
        val steps = listOf(
            NavigationPolicy.START_URL,
            "https://fd9-courses.leclercdrive.fr/",
            "https://fd9-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test/",
            "https://fd9-courses.leclercdrive.fr/magasin-123456-123456-Ville-Test/accueil.aspx",
        )

        steps.forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(it))
            assertTrue(it, BridgeMessages.isAllowedOrigin(NavigationPolicy.httpsHostOf(it)?.let { host -> "https://$host" }))
        }
        assertEquals(listOf(false, false, true, true), steps.map(NavigationPolicy::isStorePage))
        assertEquals("www.leclercdrive.fr", NavigationPolicy.httpsHostOf(steps.first()))
        assertEquals("fd9-courses.leclercdrive.fr", NavigationPolicy.httpsHostOf(steps.last()))
    }
}

package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Auchan dans la table des enseignes (DRV-728, servie par la version publiée depuis DRV-738) : la sécurité de la navigation, du pont et de l'injection, sur la vraie entrée du
 * registre et non sur une enseigne fictive. Les règles sont celles de la décision DRV-715 : on navigue sur `www.auchan.fr` ET `compte.auchan.fr`, mais le
 * pont et l'agent n'existent que sur `www.auchan.fr`, jamais sur la page du mot de passe. Les tables d'adresses hostiles sont celles de Leclerc
 * (`NavigationPolicyTest`, [HostileAddresses]) appliquées à Auchan, plus l'isolement entre les deux enseignes réelles. Aucune adresse n'est ouverte,
 * aucun identifiant n'est un vrai : un UUID de test.
 */
class AuchanSiteTest {
    private val both = RetailerSites.REGISTERED
    private val auchan = both.byId("auchan")!!
    private val leclerc = both.byId("leclerc")!!

    /** Le registre d'une application plus ancienne, qui n'annonce pas Auchan (R5) : Leclerc seul. */
    private val leclercOnly = RetailerSites(listOf(leclerc))

    private val storeUuid = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    private val home = "https://www.auchan.fr/courses"
    private val loginPage = "https://compte.auchan.fr/auth/realms/auchan/protocol/openid-connect/auth?client_id=test"

    private fun plan(site: RetailerSite, storeId: String, storeHost: String): JSONObject = FictionalSites.plan(site, storeId, storeHost)

    private fun auchanPlan(storeId: String = storeUuid, storeHost: String = "www.auchan.fr"): JSONObject = plan(auchan, storeId, storeHost)

    // —— l'entrée du registre ——————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `l'entree d'Auchan est celle de la decision, avec le pont sur www seulement`() {
        assertEquals("auchan", auchan.id)
        assertEquals("Auchan", auchan.name)
        assertEquals("d’Auchan", auchan.nameDe)
        assertEquals(home, auchan.startUrl)
        assertEquals(SiteMode.AS_IS, auchan.siteMode)
        assertNull("le magasin n'est pas dans l'adresse : aucune page de magasin à reconnaître", auchan.storePages)
        assertNull("rien à reconnaître sur la page de connexion", auchan.loginPath)
        assertNull("un seul site adaptatif : pas de site mobile à refuser", auchan.mobileSiteLabel)
        assertEquals(setOf("https://www.auchan.fr"), auchan.bridgeOrigins)
    }

    @Test
    fun `Auchan est dans le registre de la version publiee, apres Leclerc, et plus dans les enseignes eteintes`() {
        assertSame(auchan, RetailerSites.DEFAULT.byId("auchan"))
        assertTrue(RetailerSites.SWITCHED_OFF.none { it === auchan })
        assertSame(auchan, RetailerSites.DEFAULT.forNavigation(home))
        assertSame("la page du mot de passe se navigue dans l'écran d'Auchan", auchan, RetailerSites.DEFAULT.forNavigation(loginPage))
        assertEquals(listOf("leclerc", "auchan"), RetailerSites.DEFAULT.announcedRetailers())
        assertSame("Leclerc reste l'enseigne d'avant", leclerc, RetailerSites.DEFAULT.legacy)
        // le pont : le sous-domaine de Leclerc ET www.auchan.fr (nom exact), jamais compte.auchan.fr ni un joker d'auchan.fr
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), RetailerSites.DEFAULT.bridgeOrigins())
        assertEquals(RetailerSites.DEFAULT.bridgeOrigins(), BridgeMessages.ORIGIN_RULES)
        assertTrue(BridgeMessages.ORIGIN_RULES.none { it.contains("compte") || it.contains("*.auchan") || it == "*" })
        assertSame(auchan, RetailerSites.DEFAULT.forScreen("auchan"))
    }

    @Test
    fun `une application plus ancienne, qui n'annonce pas Auchan, la traite comme n'importe quel autre site`() {
        assertNull(leclercOnly.byId("auchan"))
        assertNull(leclercOnly.forNavigation(home))
        assertNull(leclercOnly.forNavigation(loginPage))
        assertEquals(listOf("leclerc"), leclercOnly.announcedRetailers())
        assertEquals(setOf("https://*.leclercdrive.fr"), leclercOnly.bridgeOrigins())
        // l'écran d'Auchan ne s'ouvre pas dans une version qui ne le sert pas : c'est l'écran de l'enseigne d'avant
        assertSame(leclerc, leclercOnly.forScreen("auchan"))
    }

    // —— la navigation ————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `www et compte restent dans l'ecran d'Auchan, avec leurs chemins`() {
        listOf(
            "https://www.auchan.fr",
            "https://www.auchan.fr/",
            home,
            "https://www.auchan.fr/recherche?text=farine#haut",
            "https://www.auchan.fr:443/panier",
            "HTTPS://WWW.AUCHAN.FR/Courses",
            "https://Www.Auchan.FR/",
            "https://compte.auchan.fr",
            "https://compte.auchan.fr/",
            loginPage,
            "https://compte.auchan.fr:443/login-actions/authenticate?x=1#y",
            "HTTPS://COMPTE.AUCHAN.FR/",
        ).forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(auchan, it))
            assertTrue(it, auchan.isNavigable(it))
            assertSame(it, auchan, both.forNavigation(it))
        }
    }

    @Test
    fun `seuls www et compte sont des noms d'Auchan, aucun autre nom de son domaine`() {
        listOf(
            "https://auchan.fr/",
            "https://auchan.fr",
            "https://x.www.auchan.fr/",
            "https://www.www.auchan.fr/",
            "https://x.compte.auchan.fr/",
            "https://autre.auchan.fr/",
            "https://accounts.auchan.fr/",
            // les sous-ressources de la page ne sont pas des navigations
            "https://api.auchan.fr/cart",
            "https://cdn.auchan.fr/images/produit.jpg",
            "https://dd.ecom.auchan.fr/js/",
            "https://www.google.com/recaptcha/enterprise.js",
            "https://google.com/recaptcha/",
            // d'autres noms d'Auchan
            "https://www.auchan.com/",
            "https://auchan.com/",
            "https://www.auchandrive.fr/",
        ).forEach {
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(auchan, it))
            assertFalse(it, auchan.isNavigable(it))
            assertFalse(it, auchan.isBridgePage(it))
            assertNull(it, both.forNavigation(it))
        }
    }

    @Test
    fun `les adresses du ticket sont refusees comme chez Leclerc`() {
        listOf(
            "https://www.auchan.fr.exemple.invalid",
            "https://www.auchan.fr.exemple.invalid/",
            "https://wwwauchan.fr",
            "https://wwwauchan.fr/courses",
            "http://www.auchan.fr",
            "http://www.auchan.fr/courses",
            "http://compte.auchan.fr/",
            "https://user@www.auchan.fr",
            "https://user:secret@www.auchan.fr/",
            "https://user@compte.auchan.fr/",
            "https://www.auchan.fr:8443",
            "https://www.auchan.fr:8443/courses",
            "https://compte.auchan.fr:8443/",
            "https://www.auchan.fr:/",
            "https://www.auchan.fr./",
            "https://compte.auchan.fr./",
            // non-ASCII (IDN, homoglyphes)
            "https://www.аuchan.fr/",
            "https://www.auchan.fr/".replace("www", "ｗｗｗ"),
            "https://www.auchan。fr/",
            "https://www.auchan.fr​/",
            "https://xn--auchan-9ze.fr/",
            "https://compte.аuchan.fr/",
            // schémas qui ne sont pas des pages web
            "javascript:alert('www.auchan.fr')",
            "intent://www.auchan.fr/courses#Intent;scheme=https;end",
            "intent://compte.auchan.fr/#Intent;scheme=https;end",
            "file:///www.auchan.fr/",
            "data:text/html,https://www.auchan.fr/",
            "",
        ).forEach {
            assertFalse("devrait être refusé : $it", auchan.isNavigable(it))
            assertFalse("ne doit pas porter le pont : $it", auchan.isBridgePage(it))
            assertTrue("ne reste jamais dans l'écran : $it", NavigationPolicy.decide(auchan, it) != Decision.ALLOW)
            assertNull("aucune enseigne ne la reconnaît : $it", both.forNavigation(it))
        }
        assertEquals(Decision.BLOCK, NavigationPolicy.decide(auchan, "javascript:alert(1)"))
        assertEquals(Decision.BLOCK, NavigationPolicy.decide(auchan, "intent://www.auchan.fr/#Intent;end"))
        assertEquals(Decision.BLOCK, NavigationPolicy.decide(auchan, null))
        assertFalse(auchan.isNavigable(null))
        // http et https hors du site partent au navigateur, sans danger
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(auchan, "http://www.auchan.fr/"))
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(auchan, "https://www.auchan.fr.exemple.invalid"))
    }

    @Test
    fun `les familles d'adresses hostiles de Leclerc sont refusees pour chacun des deux noms d'Auchan`() {
        listOf("www.auchan.fr", "compte.auchan.fr", "auchan.fr").forEach { name ->
            HostileAddresses.of(name).forEach {
                assertFalse("devrait être refusé pour auchan ($name) : $it", auchan.isNavigable(it))
                assertFalse("ne doit pas porter le pont : $it", auchan.isBridgePage(it))
                assertFalse("ne doit pas être une origine du pont : $it", auchan.isBridgeOrigin(it))
                assertTrue("ne reste jamais dans l'écran : $it", NavigationPolicy.decide(auchan, it) != Decision.ALLOW)
                assertNull("aucune enseigne ne la reconnaît : $it", both.forNavigation(it))
            }
        }
    }

    // —— le pont : seulement sur www ————————————————————————————————————————————————————————————————————————————

    @Test
    fun `le pont et l'agent n'existent que sur www, jamais sur la page du mot de passe`() {
        listOf(home, "https://www.auchan.fr/", "https://www.auchan.fr/panier", "https://www.auchan.fr:443/recherche?text=a").forEach {
            assertTrue(it, auchan.isBridgePage(it))
        }
        listOf(
            loginPage,
            "https://compte.auchan.fr/",
            "https://compte.auchan.fr/courses",
            "https://compte.auchan.fr:443/",
            "HTTPS://COMPTE.AUCHAN.FR/",
            "https://auchan.fr/",
            "https://api.auchan.fr/",
        ).forEach { assertFalse(it, auchan.isBridgePage(it)) }

        assertTrue(auchan.isBridgeOrigin("https://www.auchan.fr"))
        assertTrue(auchan.isBridgeOrigin("https://www.auchan.fr:443"))
        assertTrue(auchan.isBridgeOrigin("HTTPS://WWW.AUCHAN.FR"))
        listOf(
            "https://compte.auchan.fr",
            "https://compte.auchan.fr:443",
            "https://auchan.fr",
            "https://api.auchan.fr",
            "https://cdn.auchan.fr",
            "https://x.www.auchan.fr",
            "http://www.auchan.fr",
            "https://www.auchan.fr:8443",
            "https://www.auchan.fr.exemple.invalid",
            "https://www.auchan.fr@exemple.invalid",
            "https://exemple.invalid@www.auchan.fr",
            "https://www.auchan.fr/",
            "https://www.auchan.fr/courses",
            "https://www.auchan.fr?x=1",
            "null",
            "",
        ).forEach { assertFalse("« $it »", auchan.isBridgeOrigin(it)) }
        assertFalse(auchan.isBridgeOrigin(null))
    }

    @Test
    fun `les regles d'origine de la WebView d'Auchan sont www seulement, sans joker`() {
        assertEquals(setOf("https://www.auchan.fr"), BridgeMessages.originRules(listOf(auchan)))
        assertEquals(setOf("https://www.auchan.fr"), RetailerSites(listOf(auchan)).bridgeOrigins())
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), BridgeMessages.originRules(both.all))
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), both.bridgeOrigins())
        BridgeMessages.originRules(both.all).forEach {
            assertTrue(it, it.startsWith("https://"))
            assertFalse("aucune règle pour la page du mot de passe : $it", it.contains("compte"))
            assertFalse("aucun joker sur auchan.fr : $it", it.contains("*") && it.contains("auchan"))
            assertFalse(it, it == "*")
        }
    }

    @Test
    fun `un message de la page de connexion n'est jamais lu, celui de www l'est, et jamais celui d'une autre enseigne`() {
        val hello = """{"v":1,"type":"hello"}"""
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen(auchan, hello, "https://www.auchan.fr", true))
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen(auchan, hello, "https://www.auchan.fr:443", true))
        listOf(
            "https://compte.auchan.fr",
            "https://auchan.fr",
            "https://api.auchan.fr",
            "https://www.leclercdrive.fr",
            "https://boutique.leclercdrive.fr",
            "http://www.auchan.fr",
            "https://www.auchan.fr.exemple.invalid",
        ).forEach { assertEquals(it, Rejection.ORIGIN, (BridgeMessages.screen(auchan, hello, it, true) as Inbound.Rejected).reason) }
        assertEquals(Rejection.NOT_MAIN_FRAME, (BridgeMessages.screen(auchan, hello, "https://www.auchan.fr", false) as Inbound.Rejected).reason)
        // et l'origine d'Auchan n'ouvre pas le pont de Leclerc
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(leclerc, hello, "https://www.auchan.fr", true) as Inbound.Rejected).reason)
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(hello, "https://www.auchan.fr", true) as Inbound.Rejected).reason)
        assertFalse(BridgeMessages.isAllowedOrigin("https://www.auchan.fr"))
        assertFalse(BridgeMessages.isAllowedOrigin(leclerc, "https://www.auchan.fr"))
        assertFalse(BridgeMessages.isAllowedOrigin(auchan, "https://www.leclercdrive.fr"))
    }

    // —— la livraison d'un plan ————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `un plan d'Auchan est accepte avec un UUID de magasin et www, et s'ouvre sur l'accueil d'Auchan`() {
        val parsed = DrivePlan.parse(auchanPlan(), both)!!

        assertSame(auchan, parsed.site)
        assertEquals(storeUuid, parsed.storeId)
        assertEquals("www.auchan.fr", parsed.storeHost)
        assertEquals(home, parsed.startUrl)
        assertEquals("auchan", JSONObject(parsed.text).getString("retailer"))
    }

    @Test
    fun `l'hote du magasin d'un plan d'Auchan est www, jamais la page du mot de passe ni un autre nom`() {
        listOf(
            "compte.auchan.fr",
            "auchan.fr",
            "api.auchan.fr",
            "cdn.auchan.fr",
            "x.www.auchan.fr",
            "www.auchan.fr.exemple.invalid",
            "www.auchan.fr:8443",
            "www.auchan.fr:443",
            "www.auchan.fr/",
            "www.auchan.fr.",
            "www.auchan.fr\\",
            "www.auchan.fr@exemple.invalid",
            "exemple.invalid@www.auchan.fr",
            "WWW.AUCHAN.FR",
            "wwwauchan.fr",
            "www.аuchan.fr",
            "https://www.auchan.fr",
            "www.auchan.fr\"}",
            "boutique.leclercdrive.fr",
            "www.leclercdrive.fr",
            "",
        ).forEach { assertNull("« $it »", DrivePlan.parse(auchanPlan(storeHost = it), both)) }
    }

    @Test
    fun `l'identifiant du magasin d'un plan d'Auchan est un UUID en minuscules`() {
        listOf(
            "",
            "123456",
            "abc",
            storeUuid.uppercase(),
            storeUuid.dropLast(1),
            storeUuid + "0",
            " $storeUuid",
            "$storeUuid ",
            "$storeUuid\n",
            storeUuid.replace('-', '_'),
            storeUuid.replace("a", "g"),
            "{$storeUuid}",
        ).forEach { assertNull("« $it »", DrivePlan.parse(auchanPlan(storeId = it), both)) }
        assertNotNull(DrivePlan.parse(auchanPlan(storeId = storeUuid), both))
        assertTrue(auchan.isStoreId("ffffffff-ffff-ffff-ffff-ffffffffffff"))
        assertNull("un numéro à la Leclerc n'est pas un magasin d'Auchan", DrivePlan.parse(auchanPlan(storeId = "123456"), both))
        assertNull("un UUID n'est pas un magasin de Leclerc", DrivePlan.parse(plan(leclerc, storeUuid, "fd9-courses.leclercdrive.fr"), both))
    }

    @Test
    fun `un plan dont l'enseigne et l'hote ne vont pas ensemble est refuse`() {
        assertNull("un plan d'Auchan chez Leclerc", DrivePlan.parse(plan(auchan, storeUuid, "fd9-courses.leclercdrive.fr"), both))
        assertNull("un plan d'Auchan chez Leclerc", DrivePlan.parse(plan(auchan, "123456", "fd9-courses.leclercdrive.fr"), both))
        assertNull("un plan de Leclerc chez Auchan", DrivePlan.parse(plan(leclerc, "123456", "www.auchan.fr"), both))
        assertNull("un plan de Leclerc chez Auchan", DrivePlan.parse(plan(leclerc, storeUuid, "www.auchan.fr"), both))
        assertNull("un plan de Leclerc chez la page du mot de passe d'Auchan", DrivePlan.parse(plan(leclerc, "123456", "compte.auchan.fr"), both))
        assertNotNull(DrivePlan.parse(plan(leclerc, "123456", "fd9-courses.leclercdrive.fr"), both))
    }

    @Test
    fun `un plan d'Auchan n'est lu par aucun registre qui ne la sert pas`() {
        val text = auchanPlan().toString()

        assertNotNull("la version publiée la sert", DrivePlan.parse(auchanPlan()))
        assertNotNull(DrivePlan.parseText(text))
        assertNotNull(DrivePlan.parse(auchanPlan(), RetailerSites.serving("")))
        assertNull("une application plus ancienne ne la lit pas", DrivePlan.parse(auchanPlan(), leclercOnly))

        val refused = NativeBridge.screen("""{"v":1,"type":"drive.start","plan":$text}""", "https://repas.exemple.test", true, "https://repas.exemple.test", leclercOnly)
        assertEquals("INVALID_PLAN", JSONObject((refused as NativeRequest.Refused).reply).getString("code"))
        val served = NativeBridge.screen("""{"v":1,"type":"drive.start","plan":$text}""", "https://repas.exemple.test", true, "https://repas.exemple.test", both)
        assertSame(auchan, (served as NativeRequest.DriveStart).plan.site)
    }

    @Test
    fun `la lecture du magasin d'Auchan n'est servie que par un registre qui la sert`() {
        val data = """{"v":1,"type":"drive.setup","runId":"$runId","retailer":"auchan"}"""
        val repas = "https://repas.exemple.test"

        val refused = NativeBridge.screen(data, repas, true, repas, leclercOnly) as NativeRequest.Refused
        assertEquals("INVALID_SETUP", JSONObject(refused.reply).getString("code"))
        assertSame("la version publiée la sert", auchan, (NativeBridge.screen(data, repas, true, repas) as NativeRequest.DriveSetup).setup.site)
        val served = NativeBridge.screen(data, repas, true, repas, both) as NativeRequest.DriveSetup
        assertSame(auchan, served.setup.site)
        assertEquals(home, served.setup.startUrl)
        assertEquals("auchan", JSONObject(served.setup.text).getString("retailer"))
        // sans enseigne, c'est celle d'avant : Leclerc
        val legacy = NativeBridge.screen("""{"v":1,"type":"drive.setup","runId":"$runId"}""", repas, true, repas, both) as NativeRequest.DriveSetup
        assertSame(leclerc, legacy.setup.site)
    }

    @Test
    fun `un plan d'Auchan n'est livre qu'a une page de www, jamais a la page du mot de passe ni a une autre enseigne`() {
        val plan = DrivePlan.parse(auchanPlan(), both)!!
        val setup = SetupRequest.of(runId, auchan)!!
        val watch = OpeningWatch(auchan).apply { pageStarted(); pageFinished() }

        listOf(plan, setup).forEach { request ->
            assertTrue(watch.canDeliver(request, home))
            assertTrue(watch.canDeliver(request, "https://www.auchan.fr/"))
            assertTrue(watch.canDeliver(request, "https://www.auchan.fr/panier"))
            assertTrue(watch.canDeliver(request, "https://www.auchan.fr:443/recherche?text=a"))
            // la page du mot de passe n'a ni pont ni agent : rien n'y est envoyé
            assertFalse(watch.canDeliver(request, loginPage))
            assertFalse(watch.canDeliver(request, "https://compte.auchan.fr/"))
            assertFalse(watch.canDeliver(request, "https://compte.auchan.fr/courses"))
            // ni une autre page d'Auchan, ni une page d'une autre enseigne
            assertFalse(watch.canDeliver(request, "https://auchan.fr/"))
            assertFalse(watch.canDeliver(request, "https://api.auchan.fr/"))
            assertFalse(watch.canDeliver(request, "https://www.auchan.fr.exemple.invalid/"))
            assertFalse(watch.canDeliver(request, "https://www.leclercdrive.fr/"))
            assertFalse(watch.canDeliver(request, "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"))
            assertFalse(watch.canDeliver(request, null))
        }
        assertTrue(auchan.acceptsPlanOn(home))
        assertTrue(auchan.acceptsPlanOn(home, entersStore = true))
        assertFalse(auchan.acceptsPlanOn(loginPage))
        assertFalse(auchan.acceptsPlanOn(loginPage, entersStore = true))
    }

    @Test
    fun `une page d'Auchan refusee par le site ne recoit rien`() {
        val plan = DrivePlan.parse(auchanPlan(), both)!!
        val watch = OpeningWatch(auchan).apply { pageStarted(); httpError(404); pageFinished() }

        assertFalse(watch.canDeliver(plan, home))
        assertEquals(PageTrouble.HTTP_ERROR, watch.trouble(home))
    }

    @Test
    fun `le plan d'une autre enseigne n'est jamais livre a une page d'Auchan, et le plan d'Auchan jamais a une autre`() {
        val planOfAuchan = DrivePlan.parse(auchanPlan(), both)!!
        val planOfLeclerc = DrivePlan.parse(plan(leclerc, "123456", "fd9-courses.leclercdrive.fr"), both)!!
        val pageOfLeclerc = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"
        val homeOfLeclerc = "https://www.leclercdrive.fr/"

        listOf(OpeningWatch(auchan), OpeningWatch(leclerc)).forEach { watch ->
            watch.pageStarted()
            watch.pageFinished()
            assertFalse("un plan de Leclerc sur une page d'Auchan", watch.canDeliver(planOfLeclerc, home))
            assertFalse("un plan de Leclerc sur une page d'Auchan", watch.canDeliver(planOfLeclerc, "https://www.auchan.fr/panier"))
            assertFalse("un plan d'Auchan sur une page de Leclerc", watch.canDeliver(planOfAuchan, pageOfLeclerc))
            assertFalse("un plan d'Auchan sur une page de Leclerc", watch.canDeliver(planOfAuchan, homeOfLeclerc))
            assertTrue(watch.canDeliver(planOfAuchan, home))
            assertTrue(watch.canDeliver(planOfLeclerc, pageOfLeclerc))
        }
        assertFalse(leclerc.acceptsPlanOn(home, entersStore = true))
        assertFalse(auchan.acceptsPlanOn(pageOfLeclerc, entersStore = true))
        assertFalse(auchan.acceptsPlanOn(homeOfLeclerc, entersStore = true))
    }

    // —— l'isolement entre les deux enseignes réelles ————————————————————————————————————————————————————————

    @Test
    fun `une page de Leclerc n'est pas dans l'ecran d'Auchan et inversement`() {
        val leclercPages = listOf(
            "https://www.leclercdrive.fr/",
            "https://leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx",
            "https://www.leclercdrive.fr/connexion.aspx",
            "https://m-courses.leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/authentification.aspx",
            "https://fd8-courses.leclercdrive.fr/magasin-000000-000000-ville-test/mobile-detail-panier.aspx",
        )
        val auchanPages = listOf(home, "https://www.auchan.fr/", "https://www.auchan.fr/panier", loginPage, "https://compte.auchan.fr/")

        leclercPages.forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(leclerc, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(auchan, it))
            assertFalse(it, auchan.isBridgePage(it))
            assertSame(it, leclerc, both.forNavigation(it))
        }
        auchanPages.forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(auchan, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(leclerc, it))
            assertEquals("l'écran de l'enseigne d'avant est celui de Leclerc", Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(it))
            assertFalse(it, leclerc.isBridgePage(it))
            assertSame(it, auchan, both.forNavigation(it))
        }
    }

    @Test
    fun `les formes de Leclerc ne sont jamais celles d'Auchan`() {
        // Auchan n'a ni page de magasin, ni connexion à reconnaître, ni site mobile : même une adresse de la forme de Leclerc n'en est pas une
        listOf(
            "https://www.auchan.fr/magasin-000000-000000-Ville-Test/",
            "https://www.auchan.fr/connexion.aspx",
            "https://www.auchan.fr/",
            "https://compte.auchan.fr/connexion.aspx",
            // La version mobile de Leclerc (DRV-754) : ni ses pages de magasin, ni sa connexion ne sont celles d'Auchan
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test",
            "https://www.auchan.fr/drive/magasin-000000-000000-Ville-Test/authentification.aspx",
            "https://compte.auchan.fr/drive/magasin-000000-000000-Ville-Test/creation-compte-ccc.aspx",
        ).forEach {
            assertFalse(it, auchan.isStorePage(it))
            assertFalse(it, auchan.isLoginPage(it))
            assertFalse(it, auchan.isMobileSite(it))
        }
        assertTrue(auchan.isHomePage(home))
        assertTrue(auchan.isHomePage("https://www.auchan.fr/courses?a=1#haut"))
        assertFalse(auchan.isHomePage("https://www.auchan.fr/"))
        assertFalse(auchan.isHomePage("https://www.auchan.fr/courses/panier"))
        assertFalse("la connexion n'est pas l'accueil", auchan.isHomePage("https://compte.auchan.fr/courses"))
        // et les formes d'Auchan ne sont pas à Leclerc
        assertFalse(leclerc.isStorePage(home))
        assertFalse(leclerc.isHomePage(home))
        assertNull(StorePathMemory.parse("https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/", auchan))
    }

    @Test
    fun `chaque enseigne a son profil de WebView, celui de Leclerc ne change pas`() {
        assertEquals("drive", DriveProfileName.of(leclerc, both))
        assertEquals("drive-auchan", DriveProfileName.of(auchan, both))
        assertEquals("drive", DriveProfileName.of(leclerc, RetailerSites.DEFAULT))
        assertEquals("drive-auchan", DriveProfileName.of(auchan, RetailerSites.DEFAULT))
        assertEquals("drive", DriveProfileName.of(leclerc, leclercOnly))
        assertTrue(Regex("[a-z][a-z0-9-]*").matches(DriveProfileName.of(auchan, both)))
    }

    @Test
    fun `les memoires d'Auchan ne touchent pas celles de Leclerc`() {
        val keyValues = MemoryKeyValues(mapOf("path" to "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test", "finalize" to "OUVERTE"))
        val paths = StorePathMemories(both, keyValues)
        val outcomes = FinalizeOutcomeMemories(both, keyValues)
        val leclercPage = "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/accueil.aspx"

        // Auchan ne retient aucun chemin de magasin (il n'y en a pas), pas même celui d'une page de Leclerc
        paths.remember(home)
        paths.remember(leclercPage)
        assertFalse(paths.of(auchan).hasPath())
        assertTrue(paths.of(leclerc).hasPath())

        // « Finaliser » ouvre l'accueil d'Auchan pour tout lien d'Auchan, et le magasin de Leclerc pour le lien de Leclerc
        assertEquals(DriveEntry.Entry(home, null), DriveEntry.resolve(home, paths))
        assertEquals(DriveEntry.Entry(home, FinalizeOutcome.ADRESSE_REFUSEE), DriveEntry.resolve("https://www.auchan.fr/panier", paths))
        assertEquals(
            DriveEntry.Entry("https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test", FinalizeOutcome.OUVERTE),
            DriveEntry.resolve("https://fd9-courses.leclercdrive.fr/magasin-000000-000000", paths),
        )
        assertNull("une adresse d'aucune enseigne", DriveEntry.resolve("https://www.auchan.fr.exemple.invalid/", paths))
        // la page du mot de passe est une page d'Auchan : « Finaliser » ouvre l'accueil, jamais cette page
        assertEquals(home, DriveEntry.resolve(loginPage, paths)?.page)

        // les formes de « Finaliser » ont chacune leur clé
        outcomes.record(FinalizeOutcome.CHEMIN_INCONNU, auchan)
        assertEquals(FinalizeOutcome.CHEMIN_INCONNU, outcomes.last(auchan))
        assertEquals("OUVERTE", keyValues.values["finalize"])
        assertEquals(FinalizeOutcome.OUVERTE, outcomes.last(leclerc))
        outcomes.forget(auchan)
        assertNull(outcomes.last(auchan))
        assertEquals(FinalizeOutcome.OUVERTE, outcomes.last(leclerc))
        paths.forget(auchan)
        assertTrue(paths.of(leclerc).hasPath())
    }

    @Test
    fun `une table qui contient les deux enseignes est coherente`() {
        // aucun nom de site en commun : une adresse n'est celle que d'une seule enseigne
        assertThrows(IllegalArgumentException::class.java) { RetailerSites(listOf(auchan, auchan)) }
        assertEquals(listOf("leclerc", "auchan"), both.announcedRetailers())
        assertSame(leclerc, both.legacy)
    }
}

package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'isolement entre enseignes (DRV-706) : avec deux enseignes fictives (`*.exemple-a.test`, `*.exemple-b.test`) et une troisième qui a sa connexion sur un
 * autre hôte, une page, une origine, un plan ou une mémoire d'une enseigne n'est jamais ceux d'une autre. Les familles d'adresses hostiles sont celles de
 * `NavigationPolicyTest`, écrites pour chaque domaine. Adresses FICTIVES.
 */
class RetailerIsolationTest {
    private val a = FictionalSites.A
    private val b = FictionalSites.B
    private val c = FictionalSites.C
    private val all = FictionalSites.ALL

    private fun allowed(domain: String) = listOf(
        "https://$domain",
        "https://$domain/",
        "https://www.$domain/",
        "https://boutique.$domain/depot-000000-000000-Ville-Test/accueil.aspx",
        "https://a.b.c.$domain/recherche.aspx?TexteRecherche=farine#haut",
        "https://magasin.$domain?x=1",
        "https://www.$domain:443/",
        "HTTPS://WWW.${domain.uppercase()}/Accueil",
    )

    private fun hostile(domain: String): List<String> = HostileAddresses.of(domain)

    @Test
    fun `une page d'une enseigne reste dans son ecran, jamais dans l'ecran d'une autre`() {
        allowed("exemple-a.test").forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(a, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(b, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(c, it))
            assertEquals("l'écran de l'enseigne d'avant est celui de Leclerc", Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(it))
        }
        allowed("exemple-b.test").forEach {
            assertEquals(it, Decision.ALLOW, NavigationPolicy.decide(b, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(a, it))
            assertEquals(it, Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(c, it))
        }
    }

    @Test
    fun `les adresses hostiles sont refusees dans l'ecran de chaque enseigne comme elles le sont pour la premiere`() {
        listOf(a to "exemple-a.test", b to "exemple-b.test").forEach { (site, domain) ->
            hostile(domain).forEach {
                assertFalse("devrait être refusé pour ${site.id} : $it", site.isNavigable(it))
                assertFalse("ne doit pas porter le pont : $it", site.isBridgePage(it))
                assertTrue("ne reste jamais dans l'écran : $it", NavigationPolicy.decide(site, it) != Decision.ALLOW)
            }
            assertFalse(site.isNavigable(null))
        }
        // Et pour la troisième, dont les noms sont exacts
        hostile("www.exemple-c.test").forEach {
            assertFalse("devrait être refusé pour ${c.id} : $it", c.isNavigable(it))
        }
    }

    @Test
    fun `l'enseigne d'une adresse est la seule qui la reconnait, et aucune adresse hostile n'en a`() {
        allowed("exemple-a.test").forEach { assertSame(it, a, all.forNavigation(it)) }
        allowed("exemple-b.test").forEach { assertSame(it, b, all.forNavigation(it)) }
        hostile("exemple-a.test").plus(hostile("exemple-b.test")).forEach { assertNull(it, all.forNavigation(it)) }
    }

    @Test
    fun `le domaine nu est navigable mais n'a jamais le pont`() {
        listOf(a to "exemple-a.test", b to "exemple-b.test").forEach { (site, domain) ->
            assertTrue(site.isNavigable("https://$domain/"))
            assertFalse(site.isBridgePage("https://$domain/"))
            assertFalse(site.isBridgeOrigin("https://$domain"))
            assertTrue(site.isBridgeOrigin("https://www.$domain"))
        }
    }

    @Test
    fun `une origine d'une enseigne n'est jamais une origine du pont d'une autre`() {
        val origins = listOf(
            "https://www.exemple-a.test",
            "https://boutique.exemple-a.test",
            "https://www.exemple-b.test",
            "https://www.exemple-c.test",
            "https://compte.exemple-c.test",
        )
        val own = mapOf(a to origins.subList(0, 2), b to origins.subList(2, 3), c to origins.subList(3, 4))
        own.forEach { (site, ofSite) ->
            origins.forEach { origin ->
                assertEquals("${site.id} / $origin", origin in ofSite, BridgeMessages.isAllowedOrigin(site, origin))
            }
        }
        // Rien de plus lâche que l'origine entière
        listOf(
            null,
            "",
            "null",
            "https://exemple-a.test",
            "http://www.exemple-a.test",
            "https://www.exemple-a.test:8443",
            "https://www.exemple-a.test.evil.test",
            "https://evil.test/www.exemple-a.test",
            "https://www.exemple-a.test@evil.test",
            "https://evil.test@www.exemple-a.test",
            "https://www.exemple-a.test/chemin",
            "file:///data/www.exemple-a.test",
        ).forEach { assertFalse("$it", BridgeMessages.isAllowedOrigin(a, it)) }
        assertTrue(BridgeMessages.isAllowedOrigin(a, "https://www.exemple-a.test:443"))
    }

    @Test
    fun `un message de la page de connexion d'une enseigne n'est jamais lu, celui de sa page principale l'est`() {
        val hello = """{"v":1,"type":"hello"}"""
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen(c, hello, "https://www.exemple-c.test", true))
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(c, hello, "https://compte.exemple-c.test", true) as Inbound.Rejected).reason)
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(c, hello, "https://www.exemple-a.test", true) as Inbound.Rejected).reason)
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(a, hello, "https://www.exemple-c.test", true) as Inbound.Rejected).reason)
        assertEquals(Rejection.ORIGIN, (BridgeMessages.screen(hello, "https://www.exemple-a.test", true) as Inbound.Rejected).reason)
    }

    @Test
    fun `les regles d'origine de la WebView sont celles de l'ecran, jamais celles de toute l'application ni de la page du mot de passe`() {
        assertEquals(setOf("https://*.exemple-a.test"), BridgeMessages.originRules(listOf(a)))
        assertEquals(setOf("https://www.exemple-c.test"), BridgeMessages.originRules(listOf(c)))
        assertEquals(
            setOf("https://*.exemple-a.test", "https://*.exemple-b.test", "https://www.exemple-c.test"),
            BridgeMessages.originRules(all.all),
        )
        assertTrue(BridgeMessages.originRules(emptyList()).isEmpty())
        BridgeMessages.originRules(all.all).forEach {
            assertTrue(it, it.startsWith("https://"))
            assertFalse(it, it == "*" || it.contains("compte"))
        }
    }

    // —— les plans ———————————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `un plan d'une enseigne du registre est accepte, avec son accueil`() {
        val plan = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        assertSame(a, plan.site)
        assertEquals("https://www.exemple-a.test/", plan.startUrl)
        assertEquals("exemplea", JSONObject(plan.text).getString("retailer"))
        assertEquals(b.startUrl, DrivePlan.parse(FictionalSites.plan(b, "123456", "boutique.exemple-b.test"), all)!!.startUrl)
        val explicit = DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "www.exemple-c.test"), all)!!
        assertSame(c, explicit.site)
        assertEquals("https://www.exemple-c.test/courses", explicit.startUrl)
    }

    @Test
    fun `un plan dont l'hote est celui d'une autre enseigne est refuse`() {
        assertNull(DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-b.test"), all))
        assertNull(DrivePlan.parse(FictionalSites.plan(b, "123456", "boutique.exemple-a.test"), all))
        assertNull(DrivePlan.parse(FictionalSites.plan(a, "123456", "www.exemple-c.test"), all))
        assertNull(DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "boutique.exemple-a.test"), all))
        // l'hôte de la page du mot de passe n'est pas un hôte de magasin
        assertNull(DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "compte.exemple-c.test"), all))
    }

    @Test
    fun `un plan d'une enseigne absente du registre est refuse, comme tout ce qui n'est pas l'enseigne d'aujourd'hui`() {
        listOf("exempled", "", "Exemplea", "EXEMPLEA", "exemplea ", "leclerc").forEach {
            assertNull(it, DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test").put("retailer", it), all))
        }
        assertNull(DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test").put("retailer", 12), all))
        assertNull(DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test").also { it.remove("retailer") }, all))
        // Le registre par défaut ne connaît pas les enseignes fictives
        assertNull(DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test")))
        assertNull(DrivePlan.parseText(FictionalSites.plan(a, "123456", "boutique.exemple-a.test").toString()))
    }

    @Test
    fun `l'hote du magasin d'un plan suit les memes refus que l'adresse de navigation`() {
        listOf(
            "exemple-a.test",
            "exemple-a.test.evil.test",
            "boutique.exemple-a.test.evil.test",
            "exemple-aXtest",
            "boutique.exemple-aXtest",
            "evilexemple-a.test",
            "boutique.exemple-a.test:8443",
            "boutique.exemple-a.test:443",
            "boutique.exemple-a.test\\",
            "boutique.exemple-a.test@evil.test",
            "evil.test@boutique.exemple-a.test",
            "boutique.exemple-a.test.",
            "boutique.exemple-a.test/chemin",
            "Boutique.exemple-a.test",
            "a.b.exemple-a.test",
            "boutique.exemple-a.tеst",
            "boutique.exemple-a.test\"}",
            "",
        ).forEach { assertNull("« $it »", DrivePlan.parse(FictionalSites.plan(a, "123456", it), all)) }
    }

    @Test
    fun `l'identifiant du magasin a la forme de l'enseigne du plan`() {
        listOf("", "abc", "12 34", "1234567890123", "-1", FictionalSites.STORE_UUID).forEach {
            assertNull(it, DrivePlan.parse(FictionalSites.plan(a, it, "boutique.exemple-a.test"), all))
        }
        listOf("123456", "", "abc", FictionalSites.STORE_UUID.uppercase(), FictionalSites.STORE_UUID.dropLast(1)).forEach {
            assertNull(it, DrivePlan.parse(FictionalSites.plan(c, it, "www.exemple-c.test"), all))
        }
        assertNotNull(DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "www.exemple-c.test"), all))
    }

    // —— la livraison d'un plan ————————————————————————————————————————————————————————————————————————————————————

    private val pageOfA = "https://boutique.exemple-a.test/depot-000000-000000-Ville-Test/accueil.aspx"
    private val pageOfB = "https://boutique.exemple-b.test/point-000000-000000-Ville-Test/accueil.aspx"
    private val homeOfA = "https://www.exemple-a.test/"
    private val homeOfB = "https://www.exemple-b.test/"

    @Test
    fun `un plan n'est livre qu'a une page de son enseigne`() {
        val planA = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        val planB = DrivePlan.parse(FictionalSites.plan(b, "123456", "boutique.exemple-b.test"), all)!!
        val watch = OpeningWatch(a).apply { pageStarted(); pageFinished() }

        assertTrue(watch.canDeliver(planA, pageOfA))
        assertTrue(watch.canDeliver(planA, homeOfA))
        assertFalse("un plan de A sur la page de B", watch.canDeliver(planA, pageOfB))
        assertFalse(watch.canDeliver(planA, homeOfB))
        assertFalse("un plan de B sur la page de A", watch.canDeliver(planB, pageOfA))
        assertFalse(watch.canDeliver(planB, homeOfA))
        assertTrue(watch.canDeliver(planB, pageOfB))
        assertFalse("même un écran de B ne livre pas un plan de A", OpeningWatch(b).apply { pageStarted(); pageFinished() }.canDeliver(planA, pageOfB))
        // Les formes sans enseigne sont celles de la surveillance
        assertTrue(watch.canDeliver(pageOfA))
        assertFalse(watch.canDeliver(pageOfB))
    }

    @Test
    fun `la lecture du magasin attend une page de magasin de son enseigne, un plan entre depuis l'accueil`() {
        val setupA = SetupRequest.of(FictionalSites.RUN_ID, a)!!
        val planA = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        val watch = OpeningWatch(a).apply { pageStarted(); pageFinished() }

        assertTrue(watch.canDeliver(setupA, pageOfA))
        assertFalse(watch.canDeliver(setupA, homeOfA))
        assertTrue(watch.canDeliver(planA, homeOfA))
        assertFalse(watch.canDeliver(setupA, pageOfB))
        assertFalse("une page de magasin au chemin de B sur le domaine de A", watch.canDeliver(setupA, "https://boutique.exemple-a.test/point-000000-000000-Ville-Test/"))
    }

    @Test
    fun `une enseigne sans page de magasin livre de toute page ou le pont existe, jamais de la page du mot de passe`() {
        val plan = DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "www.exemple-c.test"), all)!!
        val watch = OpeningWatch(c).apply { pageStarted(); pageFinished() }

        assertTrue(watch.canDeliver(plan, "https://www.exemple-c.test/courses"))
        assertTrue(watch.canDeliver(plan, "https://www.exemple-c.test/panier"))
        assertFalse(watch.canDeliver(plan, "https://compte.exemple-c.test/connexion"))
        assertFalse(watch.canDeliver(plan, "https://compte.exemple-c.test/courses"))
        assertFalse(watch.canDeliver(plan, pageOfA))
        assertFalse(watch.canDeliver(plan, "https://exemple-c.test/"))
        // Et une enseigne à pages de magasin ne livre pas à la page d'une enseigne sans
        assertFalse(a.acceptsPlanOn("https://www.exemple-c.test/courses", entersStore = true))
    }

    @Test
    fun `une page refusee par le site ne recoit rien, quelle que soit l'enseigne`() {
        val plan = DrivePlan.parse(FictionalSites.plan(c, FictionalSites.STORE_UUID, "www.exemple-c.test"), all)!!
        val watch = OpeningWatch(c).apply { pageStarted(); httpError(404); pageFinished() }

        assertFalse(watch.canDeliver(plan, "https://www.exemple-c.test/courses"))
        assertEquals(PageTrouble.HTTP_ERROR, watch.trouble("https://www.exemple-c.test/courses"))
    }

    @Test
    fun `le bandeau d'un plan suit son enseigne, pas celle de la page`() {
        val planA = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        assertEquals(StoreBanner.NONE, StoreBanner.of(planA, pageOfA))
        assertEquals("la page de magasin de B n'est pas celle d'un magasin de A", StoreBanner.OPEN, StoreBanner.of(planA, pageOfB, storeKnown = true))
        assertEquals(StoreBanner.NONE, StoreBanner.of(planA, homeOfA))
        assertEquals(StoreBanner.OPEN, StoreBanner.of(planA, homeOfB, storeKnown = true))
    }

    // —— la lecture du magasin gardée ————————————————————————————————————————————————————————————————————————————

    @Test
    fun `une lecture du magasin garde son enseigne et se relit dans le registre qui la connait`() {
        val setupA = SetupRequest.of(FictionalSites.RUN_ID, a)!!

        assertEquals("exemplea", JSONObject(setupA.text).getString("retailer"))
        assertEquals(a.startUrl, setupA.startUrl)
        assertSame(a, (PassRequests.parseText(setupA.text, all) as SetupRequest).site)
        assertNull("le registre par défaut ne connaît pas A", PassRequests.parseText(setupA.text))
        assertNull(PassRequests.parseText(JSONObject(setupA.text).put("retailer", "inconnue").toString(), all))
        assertNull(PassRequests.parseText(JSONObject(setupA.text).put("retailer", 1).toString(), all))
    }

    @Test
    fun `un message d'avant le multi-enseignes sans enseigne est celui de l'enseigne d'avant`() {
        val old = JSONObject(SetupRequest.of(FictionalSites.RUN_ID, all.legacy)!!.text).also { it.remove("retailer") }.toString()

        assertSame(all.legacy, (PassRequests.parseText(old, all) as SetupRequest).site)
        assertSame(RetailerSites.DEFAULT.legacy, SetupRequest.of(FictionalSites.RUN_ID)!!.site)
    }

    @Test
    fun `un passage garde d'une autre enseigne n'est pas repris par un registre qui ne la sert plus`() {
        val store = object : PassStore {
            var value: String? = null

            override fun load() = value

            override fun save(value: String?) {
                this.value = value
            }
        }
        val planA = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        DrivePass(store, clock = { 1_000L }, agentVersion = { "1.0.0" }, sites = all).start(planA, PassSource.REPAS)

        assertEquals(planA.runId, DrivePass(store, clock = { 1_000L }, agentVersion = { "1.0.0" }, sites = all).current()!!.request.runId)
        assertNull(DrivePass(store, clock = { 1_000L }, agentVersion = { "1.0.0" }).current())
    }

    // —— les formes d'adresse de chaque enseigne ————————————————————————————————————————————————————————————————

    @Test
    fun `chaque enseigne reconnait ses pages de magasin, de connexion et son site mobile, pas celles d'une autre`() {
        listOf(a to "exemple-a.test", b to "exemple-b.test").forEach { (site, domain) ->
            val word = if (site === a) "depot" else "point"
            val other = if (site === a) "point" else "depot"
            assertTrue(site.isStorePage("https://boutique.$domain/$word-000000-000000-Ville-Test/accueil.aspx"))
            assertTrue(site.isStorePage("https://boutique.$domain/${word.uppercase()}-000001-000001"))
            assertFalse("le chemin d'une autre enseigne n'est pas le nôtre", site.isStorePage("https://boutique.$domain/$other-000000-000000-Ville-Test/"))
            assertFalse(site.isStorePage("https://boutique.$domain/magasin-000000-000000-Ville-Test/"))
            assertFalse(site.isStorePage("https://www.$domain/?u=/$word-000000-000000/"))
            assertFalse(site.isStorePage("https://m-courses.$domain/$word-000000-000000-Ville-Test/"))
            assertTrue(site.isMobileSite("https://m-courses.$domain/"))
            assertFalse(site.isMobileSite("https://mm-courses.$domain/"))
            assertTrue(site.isLoginPage("https://www.$domain/connexion.aspx"))
            assertFalse(site.isLoginPage("https://boutique.$domain/$word-000000-000000-Ville-Test/connexion.aspx"))
        }
        // Le site mobile d'une enseigne n'est pas celui d'une autre
        assertFalse(a.isMobileSite("https://m-courses.exemple-b.test/"))
        assertFalse(b.isLoginPage("https://www.exemple-a.test/connexion.aspx"))
    }

    // —— les mémoires et « Finaliser » ————————————————————————————————————————————————————————————————————————————

    @Test
    fun `la memoire d'une enseigne ne retient que ses pages`() {
        val memory = StorePathMemory(MemoryPath(), a)
        memory.remember(pageOfB)
        assertFalse(memory.hasPath())
        memory.remember(pageOfA)
        assertTrue(memory.hasPath())
        assertEquals("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", memory.storeHomeUrl("boutique.exemple-a.test", "000000", "000000"))
        assertNull(StorePathMemory.parse(pageOfA, b))
        assertNotNull(StorePathMemory.parse(pageOfA, a))
    }

    private class MemoryPath(var value: String? = null) : StorePathStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    @Test
    fun `finaliser complete le lien avec la memoire de l'enseigne du lien, jamais celle d'une autre`() {
        val keyValues = MemoryKeyValues()
        val memories = StorePathMemories(all, keyValues)
        memories.remember(pageOfA)
        memories.remember(pageOfB)
        val linkA = "https://boutique.exemple-a.test/depot-000000-000000"
        val linkB = "https://boutique.exemple-b.test/point-000000-000000"

        assertEquals(
            DriveEntry.Entry("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", FinalizeOutcome.OUVERTE),
            DriveEntry.resolve(linkA, memories),
        )
        assertEquals(
            DriveEntry.Entry("https://boutique.exemple-b.test/point-000000-000000-Ville-Test", FinalizeOutcome.OUVERTE),
            DriveEntry.resolve(linkB, memories),
        )
        // Le chemin de A ne complète pas un lien de B, même aux mêmes numéros : sans souvenir de B, c'est l'accueil de B
        val onlyA = StorePathMemories(all, MemoryKeyValues()).also { it.remember(pageOfA) }
        assertEquals(DriveEntry.Entry(b.startUrl, FinalizeOutcome.CHEMIN_INCONNU), DriveEntry.resolve(linkB, onlyA))
        assertEquals(DriveEntry.Entry(a.startUrl, null), DriveEntry.resolve(a.startUrl, onlyA))
        assertEquals(DriveEntry.Entry(c.startUrl, null), DriveEntry.resolve(c.startUrl, onlyA))
        assertNull("une adresse d'aucune enseigne", DriveEntry.resolve("https://evil.test/depot-000000-000000", onlyA))
        assertEquals(DriveEntry.Entry(c.startUrl, FinalizeOutcome.ADRESSE_REFUSEE), DriveEntry.resolve("https://www.exemple-c.test/depot-000000-000000", onlyA))
        // Les formes d'arrivée et d'ouverture sont celles de l'enseigne demandée
        assertEquals(a.startUrl, DriveEntry.startPage(pageOfA, a))
        assertEquals("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", DriveEntry.startPage("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", a))
        assertEquals(b.startUrl, DriveEntry.startPage("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", b))
        assertTrue(DriveEntry.isArrivalPage("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", a))
        assertFalse(DriveEntry.isArrivalPage("https://boutique.exemple-a.test/depot-000000-000000-Ville-Test", b))
    }
}

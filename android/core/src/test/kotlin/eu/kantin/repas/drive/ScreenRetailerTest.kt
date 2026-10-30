package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'écran du drive par enseigne (DRV-707), côté cœur : l'enseigne sur laquelle l'écran s'ouvre, le nom du profil de WebView de chaque enseigne, ce que
 * le pont natif lit et annonce. Avec des enseignes FICTIVES (`.test` est un domaine réservé) ; Leclerc seul pour ce qui doit rester comme avant.
 */
class ScreenRetailerTest {
    private val a = FictionalSites.A
    private val b = FictionalSites.B
    private val c = FictionalSites.C
    private val all = FictionalSites.ALL
    private val origin = "https://repas.exemple.test"

    private fun screen(data: String, sites: RetailerSites) = NativeBridge.screen(data, origin, true, origin, sites)

    // —— l'enseigne de l'écran ————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `un ecran sans enseigne, avec une enseigne vide ou inconnue s'ouvre sur l'enseigne d'avant`() {
        listOf(null, "", "inconnue", "Exemplea", "exemplea ", "exemple-a").forEach { assertSame(it, all.legacy, all.forScreen(it)) }
        assertSame(RetailerSites.DEFAULT.legacy, RetailerSites.DEFAULT.forScreen(null))
        assertSame(RetailerSites.DEFAULT.legacy, RetailerSites.DEFAULT.forScreen(b.id))
    }

    @Test
    fun `un ecran s'ouvre sur l'enseigne demandee quand le registre la sert`() {
        assertSame(a, all.forScreen(a.id))
        assertSame(b, all.forScreen(b.id))
        assertSame(c, all.forScreen(c.id))
    }

    // —— les profils de WebView ————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `le profil de l'enseigne d'avant garde le nom d'aujourd'hui, ce qui ne deconnecte personne`() {
        assertEquals("drive", DriveProfileName.of(RetailerSites.DEFAULT.legacy))
        assertEquals("drive", DriveProfileName.of(RetailerSites.DEFAULT.legacy, RetailerSites.DEFAULT))
        // même quand le registre sert d'autres enseignes : l'enseigne d'avant reste l'enseigne d'avant
        assertEquals("drive", DriveProfileName.of(FictionalSites.WITH_DEFAULT.legacy, FictionalSites.WITH_DEFAULT))
    }

    @Test
    fun `chaque autre enseigne a son profil, distinct des autres et du profil de Repas`() {
        val names = all.all.map { DriveProfileName.of(it, all) }

        assertEquals(listOf("drive", "drive-exempleb", "drive-exemplec"), names)
        assertEquals(names.size, names.toSet().size)
        assertFalse("jamais le profil par défaut, celui de Repas", names.any { it.equals("Default", ignoreCase = true) })
        names.forEach { assertTrue("un nom de profil simple : $it", Regex("[a-z][a-z0-9-]*").matches(it)) }
    }

    @Test
    fun `le nom du profil suit l'enseigne, pas sa place dans le registre`() {
        val reversed = RetailerSites(listOf(c, b, a), legacy = a)

        assertEquals("drive", DriveProfileName.of(a, reversed))
        assertEquals("drive-exempleb", DriveProfileName.of(b, reversed))
        assertNotEquals(DriveProfileName.of(a, reversed), DriveProfileName.of(c, reversed))
    }

    // —— le pont natif ————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `drive setup sans enseigne est celui de l'enseigne d'avant, avec une enseigne du registre celui de cette enseigne`() {
        val runId = FictionalSites.RUN_ID
        val legacy = screen("""{"v":1,"type":"drive.setup","runId":"$runId"}""", all) as NativeRequest.DriveSetup
        val other = screen("""{"v":1,"type":"drive.setup","runId":"$runId","retailer":"${b.id}"}""", all) as NativeRequest.DriveSetup

        assertSame(a, legacy.setup.site)
        assertSame(b, other.setup.site)
        assertEquals("exempleb", JSONObject(other.setup.text).getString("retailer"))
        assertEquals(b.startUrl, other.setup.startUrl)
    }

    @Test
    fun `drive setup d'une enseigne que l'application ne sert pas est refuse avec INVALID_SETUP`() {
        val runId = FictionalSites.RUN_ID
        listOf("\"inconnue\"", "null", "42", "[]", "\"\"", "\"${b.id.uppercase()}\"").forEach {
            val refused = screen("""{"v":1,"type":"drive.setup","runId":"$runId","retailer":$it}""", all) as NativeRequest.Refused
            assertEquals(it, "INVALID_SETUP", JSONObject(refused.reply).getString("code"))
        }
        // Le registre d'aujourd'hui ne sert que la seule enseigne d'avant
        val refused = NativeBridge.screen(
            """{"v":1,"type":"drive.setup","runId":"$runId","retailer":"${b.id}"}""",
            origin,
            true,
            origin,
        ) as NativeRequest.Refused
        assertEquals("INVALID_SETUP", JSONObject(refused.reply).getString("code"))
    }

    @Test
    fun `un plan d'une enseigne n'est lu que par un registre qui la sert, et son magasin doit etre chez elle`() {
        val planB = FictionalSites.plan(b, "123456", "boutique.exemple-b.test")
        val start = screen("""{"v":1,"type":"drive.start","plan":$planB}""", all) as NativeRequest.DriveStart
        assertSame(b, start.plan.site)

        // le même plan, vu d'un registre qui ne sert que l'enseigne d'avant (Leclerc seul) : refusé
        val refusedHere = NativeBridge.screen("""{"v":1,"type":"drive.start","plan":$planB}""", origin, true, origin) as NativeRequest.Refused
        assertEquals("INVALID_PLAN", JSONObject(refusedHere.reply).getString("code"))

        // un plan de B dont le magasin est chez A : refusé
        val mixed = FictionalSites.plan(b, "123456", "boutique.exemple-a.test")
        val refusedMixed = screen("""{"v":1,"type":"drive.start","plan":$mixed}""", all) as NativeRequest.Refused
        assertEquals("INVALID_PLAN", JSONObject(refusedMixed.reply).getString("code"))
    }

    @Test
    fun `un plan d'une enseigne n'est livre qu'a l'ecran de cette enseigne`() {
        val planA = DrivePlan.parse(FictionalSites.plan(a, "123456", "boutique.exemple-a.test"), all)!!
        val watchOfB = OpeningWatch(b)
        val watchOfA = OpeningWatch(a)
        val pageOfA = "https://boutique.exemple-a.test/depot-123456-123456-Ville-Test/accueil.aspx"
        val pageOfB = "https://boutique.exemple-b.test/point-123456-123456-Ville-Test/"

        assertTrue(watchOfA.canDeliver(planA, pageOfA))
        assertFalse("une page de B ne reçoit pas le plan de A, quel que soit l'écran", watchOfA.canDeliver(planA, pageOfB))
        assertFalse("une page de B ne reçoit pas le plan de A, quel que soit l'écran", watchOfB.canDeliver(planA, pageOfB))
    }

    @Test
    fun `une adresse de l'enseigne A est confiee au navigateur du telephone dans l'ecran de B`() {
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(b, "https://www.exemple-a.test/"))
        assertEquals(Decision.OPEN_EXTERNALLY, NavigationPolicy.decide(a, "https://www.exemple-b.test/"))
        assertEquals(Decision.ALLOW, NavigationPolicy.decide(b, "https://www.exemple-b.test/"))
        assertEquals(Decision.BLOCK, NavigationPolicy.decide(b, "intent://www.exemple-b.test/#Intent;end"))
    }

    @Test
    fun `les origines du pont d'un ecran sont celles de son enseigne seulement`() {
        assertEquals(setOf("https://*.exemple-b.test"), BridgeMessages.originRules(listOf(b)))
        assertEquals(setOf("https://*.exemple-a.test", "https://*.exemple-b.test"), BridgeMessages.originRules(listOf(a, b)))
        assertFalse(BridgeMessages.isAllowedOrigin(b, "https://www.exemple-a.test"))
        assertTrue(BridgeMessages.isAllowedOrigin(b, "https://www.exemple-b.test"))
    }

    // —— app.info ————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `app info annonce les enseignes servies quand l'application les donne, et rien sinon`() {
        val announced = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, retailers = RetailerSites.DEFAULT.announcedRetailers()))
        assertEquals(2, announced.getJSONArray("retailers").length())
        assertEquals(RetailerSites.DEFAULT.legacy.id, announced.getJSONArray("retailers").getString(0))
        assertEquals("auchan", announced.getJSONArray("retailers").getString(1))
        assertEquals(setOf("v", "type", "version", "versionCode", "drive", "retailers"), announced.keys().asSequence().toSet())

        val two = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, selfUpdate = true, retailers = listOf("un", "deux")))
        assertEquals(listOf("un", "deux"), (0 until 2).map { two.getJSONArray("retailers").getString(it) })
        assertTrue(two.getBoolean("selfUpdate"))

        // Sans l'argument : la réponse d'avant, octet pour octet
        assertFalse(JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true)).has("retailers"))
    }
}

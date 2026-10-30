package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le plan d'essai de débogage et son déroulement en deux messages. Magasin SYNTHÉTIQUE 123456 sur l'hôte fd0-courses.leclercdrive.fr. */
class DebugRunTest {
    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    private val host = "fd0-courses.leclercdrive.fr"

    // Le même fichier que celui de l'APK de débogage (`src/debug/assets`, un actif de l'application) : ce test reste donc dans l'application, pas dans le cœur ;
    // il tourne dans le dossier `android/app`.
    private val site = RetailerSites.DEFAULT.legacy
    private val template = File("src/debug/assets/${site.debugPlanFile}").readText()

    @Test
    fun `le plan d'essai remplace le passage et le magasin, et rien d'autre`() {
        val plan = DebugPlan.plan(template, runId, "123456", host, site)!!
        val json = JSONObject(plan)

        assertEquals(runId, json.getString("runId"))
        assertEquals("123456", json.getJSONObject("store").getString("id"))
        assertEquals(host, json.getJSONObject("store").getString("host"))
        assertEquals("plan", json.getString("type"))
        assertFalse(plan.contains("__"))
    }

    @Test
    fun `le plan d'essai est un plan de quatre ingredients courants, sans produit memorise, avec la quantite demandee`() {
        val lines = JSONObject(DebugPlan.plan(template, runId, "123456", host, site)!!).getJSONArray("lines")

        assertEquals(4, lines.length())
        for (index in 0 until lines.length()) {
            val line = lines.getJSONObject(index)
            assertEquals("NEW", line.getString("status"))
            assertEquals(0, line.getJSONArray("products").length())
            assertTrue(line.getJSONObject("needed").getDouble("quantity") > 0)
        }
        assertEquals(listOf("farine", "sucre", "sel", "huile"), (0 until 4).map { lines.getJSONObject(it).getString("ingredientSlug") })
    }

    @Test
    fun `le plan tient dans la borne du protocole`() {
        assertTrue(BridgeMessages.fitsBound(DebugPlan.plan(template, runId, "123456", host, site)!!))
    }

    @Test
    fun `une valeur qui n'est pas de la forme du protocole fait refuser le plan`() {
        assertNull(DebugPlan.plan(template, "pas-un-uuid", "123456", host, site))
        assertNull(DebugPlan.plan(template, runId, "12 34", host, site))
        assertNull(DebugPlan.plan(template, runId, "", host, site))
        assertNull(DebugPlan.plan(template, runId, "1234567890123", host, site))
        assertNull(DebugPlan.plan(template, runId, "123456", "exemple.invalid", site))
        assertNull(DebugPlan.plan(template, runId, "123456", "fd0-courses.leclercdrive.fr\"}", site))
        assertNull(DebugPlan.plan(template, runId, "123456", "FD0.leclercdrive.fr", site))
    }

    @Test
    fun `un modele illisible, trop gros ou a plus de 100 lignes fait refuser le plan`() {
        assertNull(DebugPlan.plan("pas du json __RUN_ID__", runId, "1", host, site))
        val line = """{"ingredientSlug":"a","name":"A","status":"SKIP"}"""
        assertNull(DebugPlan.plan("""{"lines":[${List(101) { line }.joinToString(",")}]}""", runId, "1", host, site))
        assertNotNull(DebugPlan.plan("""{"lines":[${List(100) { line }.joinToString(",")}]}""", runId, "1", host, site))
        assertNull(DebugPlan.plan("""{"lines":[],"x":"${"a".repeat(BridgeMessages.MAX_BYTES)}"}""", runId, "1", host, site))
    }

    // —— le déroulement ————————————————————————————————————————————————————————————————————————————————————————————————

    private class Harness(template: String?, var accept: Boolean = true, site: RetailerSite = RetailerSites.DEFAULT.legacy) {
        val sent = mutableListOf<String>()
        val shown = mutableListOf<String>()
        val run = DebugRun(
            site = site,
            template = { template },
            send = { text -> if (accept) sent += text; accept },
            startPass = { text -> if (accept) sent += text; accept },
            show = { shown += it },
            newRunId = { "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c" },
        )
    }

    private val setupResult = """{"v":1,"type":"setup-result","runId":"$runId","agentVersion":"1.0.0","store":{"id":"123456","host":"$host","baseUrl":"https://$host/magasin-123456-123456","label":null}}"""
    private val finalResult = """{"v":1,"type":"result","runId":"$runId","agentVersion":"1.0.0","outcome":"completed","store":{"id":"123456"},"lines":[]}"""

    @Test
    fun `l'essai envoie d'abord setup, puis le plan avec le magasin lu par l'agent, puis montre le resultat`() {
        val h = Harness(template)

        assertTrue(h.run.start())
        assertEquals(1, h.sent.size)
        assertEquals("setup", JSONObject(h.sent[0]).getString("type"))

        h.run.onAgentMessage("setup-result", setupResult)
        assertEquals(2, h.sent.size)
        val plan = JSONObject(h.sent[1])
        assertEquals("plan", plan.getString("type"))
        assertEquals("123456", plan.getJSONObject("store").getString("id"))
        assertTrue(h.shown.isEmpty())

        h.run.onAgentMessage("result", finalResult)
        assertEquals(1, h.shown.size)
        assertTrue(h.shown[0].contains("Issue : completed"))
        assertEquals(2, h.sent.size)
    }

    @Test
    fun `sans canal vers l'agent, l'essai ne demarre pas`() {
        val h = Harness(template, accept = false)

        assertFalse(h.run.start())
        h.run.onAgentMessage("setup-result", setupResult)
        // Rien n'attendait ce magasin : le message est montré tel un résultat, aucun plan ne part.
        assertTrue(h.sent.isEmpty())
    }

    @Test
    fun `si l'utilisateur refuse le magasin, le resultat est montre et aucun plan ne part`() {
        val h = Harness(template)
        h.run.start()

        h.run.onAgentMessage("result", finalResult.replace("completed", "aborted"))

        assertEquals(1, h.sent.size)
        assertTrue(h.shown[0].contains("Issue : aborted"))
    }

    @Test
    fun `un magasin de forme inattendue arrete l'essai avec un message clair`() {
        val h = Harness(template)
        h.run.start()

        h.run.onAgentMessage("setup-result", setupResult.replace("\"123456\"", "\"12 34\""))

        assertEquals(1, h.sent.size)
        assertTrue(h.shown[0].startsWith("Plan d'essai impossible"))
    }

    @Test
    fun `une reponse sans magasin ou sans modele arrete l'essai`() {
        val noStore = Harness(template)
        noStore.run.start()
        noStore.run.onAgentMessage("setup-result", """{"v":1,"type":"setup-result"}""")
        assertTrue(noStore.shown[0].startsWith("Magasin illisible"))

        val noTemplate = Harness(null)
        noTemplate.run.start()
        noTemplate.run.onAgentMessage("setup-result", setupResult)
        assertTrue(noTemplate.shown[0].startsWith("Plan d'essai impossible"))
        assertEquals(1, noTemplate.sent.size)
    }

    @Test
    fun `si le plan ne peut plus partir, l'essai le dit`() {
        val h = Harness(template)
        h.run.start()
        h.accept = false

        h.run.onAgentMessage("setup-result", setupResult)

        assertTrue(h.shown[0].startsWith("L'agent ne répond plus"))
    }

    @Test
    fun `les messages de progression sont ignores`() {
        val h = Harness(template)
        h.run.start()

        h.run.onAgentMessage("progress", """{"v":1,"type":"progress"}""")
        h.run.onAgentMessage("log", """{"v":1,"type":"log"}""")

        assertTrue(h.shown.isEmpty())
    }

    // —— un plan d'essai par enseigne (DRV-735) ————————————————————————————————————————————————————————————————————————

    /** Une enseigne FICTIVE dont le magasin est un UUID sur un hôte propre : la forme d'Auchan, sans la nommer. */
    private val other = RetailerSite(
        id = "exemplea",
        name = "Exemple A",
        nameDe = "d’Exemple A",
        startUrl = "https://www.exemple-a.test/",
        siteMode = SiteMode.AS_IS,
        hosts = listOf(SiteHost(HostPattern.exact("www.exemple-a.test"), bridge = true)),
        storeHost = Regex("www\\.exemple-a\\.test"),
        storeIdPattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
    )
    private val registered = RetailerSites.DEFAULT.all + RetailerSites.SWITCHED_OFF
    private val otherStoreId = "0b5b1d0c-6f4e-4d0e-9a53-2f6a3c1d7e88"
    private val otherTemplate = """{"v":1,"type":"plan","runId":"__RUN_ID__","retailer":"${other.id}","store":{"id":"__STORE_ID__","host":"__STORE_HOST__"},"lines":[]}"""

    @Test
    fun `le modele se choisit par la table de l'enseigne, un fichier de donnees par enseigne`() {
        assertEquals("debug-plan.exemplea.json", other.debugPlanFile)
        assertEquals("debug-plan.json", RetailerSites.DEFAULT.legacy.debugPlanFile)
        registered.forEach { assertTrue(it.id, File("src/debug/assets/${it.debugPlanFile}").isFile) }
        assertEquals(registered.size, registered.map { it.debugPlanFile }.toSet().size)
    }

    @Test
    fun `chaque modele dit l'enseigne dont il porte le nom de fichier`() {
        registered.forEach { site ->
            val json = JSONObject(File("src/debug/assets/${site.debugPlanFile}").readText())
            assertEquals(site.id, json.getString("retailer"))
        }
    }

    @Test
    fun `le plan d'une autre enseigne n'accepte que le magasin de la forme de cette enseigne`() {
        val plan = JSONObject(DebugPlan.plan(otherTemplate, runId, otherStoreId, "www.exemple-a.test", other)!!)
        assertEquals(other.id, plan.getString("retailer"))
        assertEquals(otherStoreId, plan.getJSONObject("store").getString("id"))

        assertNull(DebugPlan.plan(otherTemplate, runId, "123456", "www.exemple-a.test", other))
        assertNull(DebugPlan.plan(otherTemplate, runId, otherStoreId.uppercase(), "www.exemple-a.test", other))
        assertNull(DebugPlan.plan(otherTemplate, runId, otherStoreId, host, other))
        assertNull(DebugPlan.plan(otherTemplate, runId, otherStoreId, "autre.exemple-a.test", other))
        // Et le magasin d'une enseigne n'est jamais accepté pour une autre.
        assertNull(DebugPlan.plan(template, runId, otherStoreId, "www.exemple-a.test", site))
        assertNull(DebugPlan.plan(otherTemplate, runId, "123456", host, other))
    }

    @Test
    fun `l'essai d'une autre enseigne annonce son enseigne et refuse un magasin de la forme d'une autre`() {
        val h = Harness(otherTemplate, site = other)
        h.run.start()
        assertEquals(other.id, JSONObject(h.sent[0]).getString("retailer"))

        h.run.onAgentMessage("setup-result", setupResult.replace("\"123456\"", "\"$otherStoreId\"").replace(host, "www.exemple-a.test"))
        assertEquals("plan", JSONObject(h.sent[1]).getString("type"))
        assertEquals(other.id, JSONObject(h.sent[1]).getString("retailer"))

        val wrong = Harness(otherTemplate, site = other)
        wrong.run.start()
        wrong.run.onAgentMessage("setup-result", setupResult)
        assertEquals(1, wrong.sent.size)
        assertTrue(wrong.shown[0].startsWith("Plan d'essai impossible"))
    }

    @Test
    fun `le modele de l'enseigne d'avant est inchange, octet pour octet, et son plan aussi`() {
        val bytes = File("src/debug/assets/debug-plan.json").readBytes()
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals("e0e93df0af2aa6dd606b91164ed12ba540f2f95d360a628059abe4e733f393fb", digest)

        // Le plan d'avant : le modèle rempli par les trois remplacements, relu et réécrit par org.json.
        val before = JSONObject(
            template.replace("__RUN_ID__", runId).replace("__STORE_ID__", "123456").replace("__STORE_HOST__", host),
        ).toString()
        assertEquals(before, DebugPlan.plan(template, runId, "123456", host, site))
        assertEquals("leclerc", JSONObject(before).getString("retailer"))
    }
}

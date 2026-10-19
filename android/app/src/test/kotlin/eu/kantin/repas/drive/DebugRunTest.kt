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
    private val template = File("src/debug/assets/debug-plan.json").readText()

    @Test
    fun `le plan d'essai remplace le passage et le magasin, et rien d'autre`() {
        val plan = DebugPlan.plan(template, runId, "123456", host)!!
        val json = JSONObject(plan)

        assertEquals(runId, json.getString("runId"))
        assertEquals("123456", json.getJSONObject("store").getString("id"))
        assertEquals(host, json.getJSONObject("store").getString("host"))
        assertEquals("plan", json.getString("type"))
        assertFalse(plan.contains("__"))
    }

    @Test
    fun `le plan d'essai est un plan de quatre ingredients courants, sans produit memorise, avec la quantite demandee`() {
        val lines = JSONObject(DebugPlan.plan(template, runId, "123456", host)!!).getJSONArray("lines")

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
        assertTrue(BridgeMessages.fitsBound(DebugPlan.plan(template, runId, "123456", host)!!))
    }

    @Test
    fun `une valeur qui n'est pas de la forme du protocole fait refuser le plan`() {
        assertNull(DebugPlan.plan(template, "pas-un-uuid", "123456", host))
        assertNull(DebugPlan.plan(template, runId, "12 34", host))
        assertNull(DebugPlan.plan(template, runId, "", host))
        assertNull(DebugPlan.plan(template, runId, "1234567890123", host))
        assertNull(DebugPlan.plan(template, runId, "123456", "exemple.invalid"))
        assertNull(DebugPlan.plan(template, runId, "123456", "fd0-courses.leclercdrive.fr\"}"))
        assertNull(DebugPlan.plan(template, runId, "123456", "FD0.leclercdrive.fr"))
    }

    @Test
    fun `un modele illisible, trop gros ou a plus de 100 lignes fait refuser le plan`() {
        assertNull(DebugPlan.plan("pas du json __RUN_ID__", runId, "1", host))
        val line = """{"ingredientSlug":"a","name":"A","status":"SKIP"}"""
        assertNull(DebugPlan.plan("""{"lines":[${List(101) { line }.joinToString(",")}]}""", runId, "1", host))
        assertNotNull(DebugPlan.plan("""{"lines":[${List(100) { line }.joinToString(",")}]}""", runId, "1", host))
        assertNull(DebugPlan.plan("""{"lines":[],"x":"${"a".repeat(BridgeMessages.MAX_BYTES)}"}""", runId, "1", host))
    }

    // —— le déroulement ————————————————————————————————————————————————————————————————————————————————————————————————

    private class Harness(template: String?, var accept: Boolean = true) {
        val sent = mutableListOf<String>()
        val shown = mutableListOf<String>()
        val run = DebugRun(
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
}

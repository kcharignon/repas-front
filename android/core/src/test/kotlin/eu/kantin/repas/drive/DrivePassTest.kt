package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le passage du plan : un seul à la fois, reprise sous 24 h, résultats à livrer. Passage et magasin SYNTHÉTIQUES. */
class DrivePassTest {
    private class MemoryStore(var value: String? = null) : PassStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    private val otherRunId = "11111111-2222-4333-8444-555555555555"
    private var now = 1_000_000L

    private fun plan(id: String = runId): DrivePlan {
        val json = ReferencePlans.json().put("runId", id)
        return DrivePlan.parse(json)!!
    }

    private fun pass(store: PassStore = MemoryStore()) = DrivePass(store, clock = { now }, agentVersion = { "0.6.0" })

    private fun result(id: String = runId, outcome: String = "completed") =
        """{"v":1,"type":"result","runId":"$id","agentVersion":"0.6.0","outcome":"$outcome","store":{"id":"000000"},"lines":[]}"""

    @Test
    fun `sans passage, rien n'est en cours`() {
        val pass = pass()
        assertNull(pass.current())
        assertTrue(pass.pendingMessages().isEmpty())
    }

    @Test
    fun `un passage commence, avec son plan et l'heure`() {
        val pass = pass()

        assertSame(StartOutcome.Started, pass.start(plan(), PassSource.REPAS))
        assertEquals(runId, pass.current()!!.request.runId)
        assertEquals(PassSource.REPAS, pass.current()!!.source)
        assertEquals(now, pass.current()!!.startedAt)
    }

    @Test
    fun `un second plan est refuse tant que le premier dure, avec l'identifiant de celui qui occupe la place`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)

        val second = pass.start(plan(otherRunId), PassSource.REPAS)

        assertEquals(runId, (second as StartOutcome.Busy).runId)
        assertEquals(runId, pass.current()!!.request.runId)
    }

    @Test
    fun `le meme plan renvoye rouvre le passage sans le recommencer`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)
        now += 60_000

        assertSame(StartOutcome.Resumed, pass.start(plan(), PassSource.REPAS))
        assertEquals(1_000_000L, pass.current()!!.startedAt)
    }

    @Test
    fun `un plan de debogage ne prend pas la place d'un passage de Repas ni l'inverse`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)
        assertTrue(pass.start(plan(otherRunId), PassSource.DEBUG) is StartOutcome.Busy)
        assertTrue(pass.start(plan(), PassSource.DEBUG) is StartOutcome.Busy)
    }

    @Test
    fun `le resultat de l'agent clot le passage et part dans la file de Repas`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)

        val ended = pass.finish(result())

        assertNotNull(ended)
        assertNull(pass.current())
        val message = JSONObject(pass.pendingMessages().single())
        assertEquals("drive.result", message.getString("type"))
        assertEquals(1, message.getInt("v"))
        assertEquals(runId, message.getJSONObject("result").getString("runId"))
        assertEquals("completed", message.getJSONObject("result").getString("outcome"))
    }

    @Test
    fun `un resultat d'un autre passage, sans passage ou illisible est ignore`() {
        val pass = pass()
        assertNull(pass.finish(result()))

        pass.start(plan(), PassSource.REPAS)
        assertNull(pass.finish(result(otherRunId)))
        assertNull(pass.finish("pas du json"))
        assertNull(pass.finish("""{"v":1,"type":"setup-result","runId":"$runId"}"""))
        assertEquals(runId, pass.current()!!.request.runId)
        assertTrue(pass.pendingMessages().isEmpty())
    }

    @Test
    fun `le resultat d'un passage de debogage clot le passage sans rien mettre dans la file`() {
        val pass = pass()
        pass.start(plan(), PassSource.DEBUG)

        assertEquals(PassSource.DEBUG, pass.finish(result())!!.source)
        assertNull(pass.current())
        assertTrue(pass.pendingMessages().isEmpty())
    }

    @Test
    fun `l'abandon clot le passage par un resultat aborted pour Repas`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)

        assertNotNull(pass.abort())

        assertNull(pass.current())
        val sent = JSONObject(pass.pendingMessages().single()).getJSONObject("result")
        assertEquals("aborted", sent.getString("outcome"))
        assertEquals(runId, sent.getString("runId"))
        assertEquals("0.6.0", sent.getString("agentVersion"))
    }

    @Test
    fun `drive cancel ne vise que le passage en cours`() {
        val pass = pass()
        assertNull(pass.abort())
        assertNull(pass.abort(runId))

        pass.start(plan(), PassSource.REPAS)
        assertNull(pass.abort(otherRunId))
        assertEquals(runId, pass.current()!!.request.runId)
        assertNotNull(pass.abort(runId))
        assertNull(pass.current())
    }

    @Test
    fun `l'abandon d'un passage de debogage ne livre rien a Repas`() {
        val pass = pass()
        pass.start(plan(), PassSource.DEBUG)
        pass.abort()
        assertTrue(pass.pendingMessages().isEmpty())
    }

    @Test
    fun `une fois le passage clos, un autre peut commencer`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)
        pass.finish(result())

        assertSame(StartOutcome.Started, pass.start(plan(otherRunId), PassSource.REPAS))
    }

    @Test
    fun `les resultats se livrent dans l'ordre et ne se redonnent plus`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)
        pass.finish(result())
        pass.start(plan(otherRunId), PassSource.REPAS)
        pass.abort()

        assertEquals(2, pass.pendingMessages().size)
        assertEquals(runId, JSONObject(pass.pendingMessages()[0]).getJSONObject("result").getString("runId"))

        pass.delivered(1)
        assertEquals(otherRunId, JSONObject(pass.pendingMessages().single()).getJSONObject("result").getString("runId"))
        pass.delivered(5)
        assertTrue(pass.pendingMessages().isEmpty())
    }

    @Test
    fun `un passage de Repas non termine survit a la fin du processus pendant 24 heures`() {
        val store = MemoryStore()
        pass(store).start(plan(), PassSource.REPAS)

        now += DrivePass.MAX_AGE_MS - 1
        val restored = pass(store)

        assertEquals(runId, restored.current()!!.request.runId)
        assertEquals(PassSource.REPAS, restored.current()!!.source)
        assertEquals(1_000_000L, restored.current()!!.startedAt)
        assertTrue(restored.start(plan(otherRunId), PassSource.REPAS) is StartOutcome.Busy)
    }

    @Test
    fun `passe 24 heures le passage est oublie`() {
        val store = MemoryStore()
        pass(store).start(plan(), PassSource.REPAS)

        now += DrivePass.MAX_AGE_MS + 1

        assertNull(pass(store).current())
        assertNull("la valeur périmée est effacée", store.value)
    }

    @Test
    fun `un passage qui dure plus de 24 heures dans le meme processus est oublie`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)
        now += DrivePass.MAX_AGE_MS + 1

        assertNull(pass.current())
        assertSame(StartOutcome.Started, pass.start(plan(otherRunId), PassSource.REPAS))
    }

    @Test
    fun `un passage de debogage n'est jamais ecrit`() {
        val store = MemoryStore()
        pass(store).start(plan(), PassSource.DEBUG)
        assertNull(store.value)
        assertNull(pass(store).current())
    }

    @Test
    fun `les resultats en attente survivent a la fin du processus et ne sont plus ecrits une fois livres`() {
        val store = MemoryStore()
        val first = pass(store)
        first.start(plan(), PassSource.REPAS)
        first.finish(result())

        val restored = pass(store)
        assertEquals(1, restored.pendingMessages().size)
        assertNull(restored.current())

        restored.delivered(1)
        assertNull(store.value)
    }

    @Test
    fun `ce qui est garde ne contient ni cookie ni autre chose que le plan, l'heure et les resultats`() {
        val store = MemoryStore()
        pass(store).start(plan(), PassSource.REPAS)

        val saved = JSONObject(store.value!!)
        assertEquals(setOf("pass"), saved.keys().asSequence().toSet())
        assertEquals(setOf("plan", "startedAt"), saved.getJSONObject("pass").keys().asSequence().toSet())
    }

    @Test
    fun `une valeur gardee illisible ou sans plan valide est ignoree`() {
        assertNull(pass(MemoryStore("pas du json")).current())
        assertNull(pass(MemoryStore("""{"pass":{"plan":"{}","startedAt":1}}""")).current())
        assertNull(pass(MemoryStore("""{"pass":{"plan":"pas du json","startedAt":1}}""")).current())
        assertTrue(pass(MemoryStore("""{"outbox":["",3]}""")).pendingMessages().none { it.isEmpty() })
        assertFalse(pass(MemoryStore("[]")).pendingMessages().isNotEmpty())
    }

    @Test
    fun `un passage ecrit sans date est ignore`() {
        val plan = plan().text
        assertNull(pass(MemoryStore(JSONObject().put("pass", JSONObject().put("plan", plan)).toString())).current())
    }

    // —— la lecture du magasin (DRV-320) ————————————————————————————————————————————————————————————————————————————————

    private fun setup(id: String = runId) = SetupRequest.of(id)!!

    private fun setupResult(id: String = runId) =
        """{"v":1,"type":"setup-result","runId":"$id","agentVersion":"0.6.0","store":{"id":"000000","host":"fd9-courses.leclercdrive.fr","baseUrl":"https://fd9-courses.leclercdrive.fr/magasin-000000-000000","label":null}}"""

    @Test
    fun `une lecture du magasin est un passage comme un autre, un seul a la fois dans les deux sens`() {
        val pass = pass()
        assertSame(StartOutcome.Started, pass.start(setup(), PassSource.REPAS))

        assertSame(StartOutcome.Resumed, pass.start(setup(), PassSource.REPAS))
        assertEquals(runId, (pass.start(plan(otherRunId), PassSource.REPAS) as StartOutcome.Busy).runId)
        assertEquals(runId, (pass.start(setup(otherRunId), PassSource.REPAS) as StartOutcome.Busy).runId)
        assertTrue(pass.current()!!.request.isSetup)
    }

    @Test
    fun `un plan en cours refuse une lecture du magasin avec son identifiant`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)

        assertEquals(runId, (pass.start(setup(otherRunId), PassSource.REPAS) as StartOutcome.Busy).runId)
    }

    @Test
    fun `le setup-result de l'agent clot la lecture et part vers Repas dans drive result`() {
        val pass = pass()
        pass.start(setup(), PassSource.REPAS)

        assertNotNull(pass.finish(setupResult()))

        assertNull(pass.current())
        val sent = JSONObject(pass.pendingMessages().single())
        assertEquals("drive.result", sent.getString("type"))
        assertEquals("setup-result", sent.getJSONObject("result").getString("type"))
        assertEquals("000000", sent.getJSONObject("result").getJSONObject("store").getString("id"))
    }

    @Test
    fun `l'agent peut aussi clore la lecture par un result (annule, page inconnue)`() {
        val pass = pass()
        pass.start(setup(), PassSource.REPAS)

        assertNotNull(pass.finish("""{"v":1,"type":"result","runId":"$runId","agentVersion":"0.6.0","outcome":"aborted","lines":[]}"""))

        assertNull(pass.current())
        assertEquals("aborted", JSONObject(pass.pendingMessages().single()).getJSONObject("result").getString("outcome"))
    }

    @Test
    fun `le setup-result d'un autre passage est ignore`() {
        val pass = pass()
        pass.start(setup(), PassSource.REPAS)

        assertNull(pass.finish(setupResult(otherRunId)))
        assertEquals(runId, pass.current()!!.request.runId)
    }

    @Test
    fun `l'abandon d'une lecture du magasin donne un resultat aborted sans magasin`() {
        val pass = pass()
        pass.start(setup(), PassSource.REPAS)

        assertNotNull(pass.abort(runId))

        val sent = JSONObject(pass.pendingMessages().single()).getJSONObject("result")
        assertEquals("aborted", sent.getString("outcome"))
        assertEquals("CANCELLED", sent.getJSONObject("error").getString("code"))
        assertFalse(sent.has("store"))
        assertNull(pass.current())
    }

    @Test
    fun `une lecture du magasin non terminee survit a la fin du processus, sans autre chose que son message`() {
        val store = MemoryStore()
        pass(store).start(setup(), PassSource.REPAS)

        val restored = pass(store)

        assertTrue(restored.current()!!.request.isSetup)
        assertEquals(runId, restored.current()!!.request.runId)
        assertEquals(setup().text, restored.current()!!.request.text)
        assertEquals(setOf("plan", "startedAt"), JSONObject(store.value!!).getJSONObject("pass").keys().asSequence().toSet())
    }
}

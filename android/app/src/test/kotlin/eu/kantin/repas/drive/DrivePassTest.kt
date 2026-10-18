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
        val json = JSONObject(File("src/test/resources/plan-complet.json").readText()).put("runId", id)
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
        assertEquals(runId, pass.current()!!.plan.runId)
        assertEquals(PassSource.REPAS, pass.current()!!.source)
        assertEquals(now, pass.current()!!.startedAt)
    }

    @Test
    fun `un second plan est refuse tant que le premier dure, avec l'identifiant de celui qui occupe la place`() {
        val pass = pass()
        pass.start(plan(), PassSource.REPAS)

        val second = pass.start(plan(otherRunId), PassSource.REPAS)

        assertEquals(runId, (second as StartOutcome.Busy).runId)
        assertEquals(runId, pass.current()!!.plan.runId)
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
        assertEquals(runId, pass.current()!!.plan.runId)
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
        assertEquals(runId, pass.current()!!.plan.runId)
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

        assertEquals(runId, restored.current()!!.plan.runId)
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
}

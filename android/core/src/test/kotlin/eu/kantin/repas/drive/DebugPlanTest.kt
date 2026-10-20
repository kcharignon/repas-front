package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le message `setup` de l'essai de débogage, rapproché de son exemple de référence (aussi relu par `android/__tests__/agent-asset.spec.ts`). */
class DebugPlanTest {
    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"

    @Test
    fun `le message setup suit le protocole et n'a pas de magasin, l'agent lit celui de la page`() {
        val golden = JSONObject(File("src/test/resources/setup-message.json").readText())

        val built = JSONObject(DebugPlan.setupMessage(runId))

        assertTrue(sameJson(golden, built))
        assertFalse(built.has("store"))
    }
}

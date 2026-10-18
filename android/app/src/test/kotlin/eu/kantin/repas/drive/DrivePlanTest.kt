package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le plan reçu de Repas : forme, hôte, bornes ; le résultat `aborted`. Les fichiers de `src/test/resources` sont des copies des exemples du
 * protocole (`__tests__/native-contract.spec.ts` vérifie qu'elles n'ont pas dérivé et que l'agent les valide). Magasin SYNTHÉTIQUE 000000.
 */
class DrivePlanTest {
    private fun resource(name: String) = File("src/test/resources/$name").readText()

    private val valid = JSONObject(resource("plan-complet.json"))
    private val RUN_ID = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"

    /** Le plan valide dont on remplace un champ (`null` : on l'enlève). */
    private fun with(key: String, value: Any?, store: Boolean = false): JSONObject {
        val plan = JSONObject(valid.toString())
        val target = if (store) plan.getJSONObject("store") else plan
        if (value == null) target.remove(key) else target.put(key, value)
        return plan
    }

    @Test
    fun `un plan du protocole est accepte et seul son magasin est lu`() {
        val plan = DrivePlan.parse(valid)!!

        assertEquals("8f14e45f-ceea-467a-9575-8e6b8c0a1b2c", plan.runId)
        assertEquals("000000", plan.storeId)
        assertEquals("courses-test.leclercdrive.fr", plan.storeHost)
        assertEquals("https://courses-test.leclercdrive.fr/", plan.startUrl)
        assertTrue(NavigationPolicy.isAllowed(plan.startUrl))
        assertTrue(sameJson(valid, JSONObject(plan.text)))
    }

    @Test
    fun `un plan de 100 lignes est accepte`() {
        assertNotNull(DrivePlan.parse(JSONObject(resource("plan-100-lignes.json"))))
    }

    @Test
    fun `un plan de 101 lignes est refuse`() {
        val plan = JSONObject(resource("plan-100-lignes.json"))
        plan.getJSONArray("lines").put(plan.getJSONArray("lines").getJSONObject(0))
        assertNull(DrivePlan.parse(plan))
    }

    @Test
    fun `un plan de plus de 64 Ko est refuse`() {
        val plan = JSONObject(valid.toString()).put("x", "a".repeat(BridgeMessages.MAX_BYTES))
        assertNull(DrivePlan.parse(plan))
    }

    @Test
    fun `ce qui n'est pas un message plan est refuse`() {
        assertNull(DrivePlan.parse(null))
        assertNull(DrivePlan.parse(with("v", 2)))
        assertNull(DrivePlan.parse(with("v", "1")))
        assertNull(DrivePlan.parse(with("v", null)))
        assertNull(DrivePlan.parse(with("type", "setup")))
        assertNull(DrivePlan.parse(with("type", "command")))
        assertNull(DrivePlan.parse(with("retailer", "autre")))
        assertNull(DrivePlan.parse(with("returnPath", "/ailleurs")))
        assertNull(DrivePlan.parse(with("returnPath", null)))
        assertNull(DrivePlan.parse(with("lines", null)))
        assertNull(DrivePlan.parse(with("lines", "pas un tableau")))
        assertNull(DrivePlan.parse(with("store", "pas un objet")))
        assertNull(DrivePlan.parse(with("store", null)))
    }

    @Test
    fun `l'identifiant du passage doit etre un UUID`() {
        listOf("", "pas-un-uuid", "8f14e45f-ceea-467a-9575-8e6b8c0a1b2", "8f14e45f-ceea-467a-9575-8e6b8c0a1b2cX", "8f14e45fceea467a95758e6b8c0a1b2c")
            .forEach { assertNull(it, DrivePlan.parse(with("runId", it))) }
        assertNull(DrivePlan.parse(with("runId", 12)))
        assertTrue(DrivePlan.isRunId("8F14E45F-CEEA-467A-9575-8E6B8C0A1B2C"))
        assertFalse(DrivePlan.isRunId(null))
        assertFalse(DrivePlan.isRunId("pas-un-uuid"))
    }

    @Test
    fun `le magasin doit avoir un identifiant de chiffres et un hote du drive en minuscules`() {
        listOf("", "12 34", "abc", "1234567890123", "-1").forEach { assertNull(it, DrivePlan.parse(with("id", it, store = true))) }
        listOf(
            "",
            "exemple.invalid",
            "leclercdrive.fr",
            "www.leclercdrive.fr.exemple.invalid",
            "courses-test.leclercdrive.fr.exemple.invalid",
            "exemple.invalid/courses-test.leclercdrive.fr",
            "courses-test.leclercdrive.fr@exemple.invalid",
            "courses-test.leclercdrive.fr:8443",
            "courses-test.leclercdrive.fr/chemin",
            "Courses-Test.leclercdrive.fr",
            "sous.courses-test.leclercdrive.fr\"}",
            "autre.leclercdrive.com",
        ).forEach { assertNull(it, DrivePlan.parse(with("host", it, store = true))) }
        assertNull(DrivePlan.parse(with("id", 123456, store = true)))
        assertNotNull(DrivePlan.parse(with("host", "fd0-courses.leclercdrive.fr", store = true)))
    }

    @Test
    fun `un plan se relit depuis son texte`() {
        val plan = DrivePlan.parse(valid)!!
        assertEquals(plan.runId, DrivePlan.parseText(plan.text)!!.runId)
        assertNull(DrivePlan.parseText(null))
        assertNull(DrivePlan.parseText("pas du json"))
        assertNull(DrivePlan.parseText("{}"))
    }

    @Test
    fun `le resultat aborted est celui du fichier de reference, valide pour l'agent`() {
        val plan = DrivePlan.parse(valid)!!

        assertTrue(sameJson(JSONObject(resource("aborted-result.json")), JSONObject(plan.abortedResult("1.0.0"))))
    }

    @Test
    fun `le resultat aborted n'a pas de ligne et nomme le magasin et le passage`() {
        val result = JSONObject(DrivePlan.parse(valid)!!.abortedResult("0.6.0"))

        assertEquals("aborted", result.getString("outcome"))
        assertEquals("8f14e45f-ceea-467a-9575-8e6b8c0a1b2c", result.getString("runId"))
        assertEquals("000000", result.getJSONObject("store").getString("id"))
        assertEquals(0, result.getJSONArray("lines").length())
        assertEquals("CANCELLED", result.getJSONObject("error").getString("code"))
        assertEquals("0.6.0", result.getString("agentVersion"))
    }

    // —— la lecture du magasin (DRV-320) ————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `une lecture du magasin est le message setup du fichier de reference, sans magasin`() {
        val setup = SetupRequest.of(RUN_ID)!!

        assertTrue(sameJson(JSONObject(resource("setup-message.json")), JSONObject(setup.text)))
        assertTrue(setup.isSetup)
        assertEquals(NavigationPolicy.START_URL, setup.startUrl)
    }

    @Test
    fun `seul un UUID identifie une lecture du magasin`() {
        listOf(null, "", "pas-un-uuid", 12, true, JSONObject()).forEach { assertNull(it.toString(), SetupRequest.of(it)) }
    }

    @Test
    fun `l'abandon d'une lecture du magasin est le resultat aborted du fichier de reference, sans magasin`() {
        val aborted = JSONObject(SetupRequest.of(RUN_ID)!!.abortedResult("1.0.0"))

        assertTrue(sameJson(JSONObject(resource("aborted-setup-result.json")), aborted))
        assertFalse(aborted.has("store"))
    }

    @Test
    fun `un passage gardé se relit, plan ou lecture du magasin, sinon rien`() {
        val plan = DrivePlan.parse(valid)!!
        val setup = SetupRequest.of(RUN_ID)!!

        assertEquals(false, PassRequests.parseText(plan.text)!!.isSetup)
        assertEquals(true, PassRequests.parseText(setup.text)!!.isSetup)
        assertEquals(RUN_ID, PassRequests.parseText(setup.text)!!.runId)
        listOf(null, "pas du json", "{}", """{"type":"setup","runId":"x"}""", """{"type":"command"}""").forEach {
            assertNull(it, PassRequests.parseText(it))
        }
    }

    @Test
    fun `une version d'agent inconnue donne 0 0 0, la forme que le protocole exige`() {
        assertEquals("0.0.0", JSONObject(DrivePlan.parse(valid)!!.abortedResult("?")).getString("agentVersion"))
    }
}

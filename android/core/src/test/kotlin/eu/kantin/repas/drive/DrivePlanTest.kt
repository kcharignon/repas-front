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

    private val valid = ReferencePlans.json()
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
        assertEquals(ReferencePlans.STORE_HOST, plan.storeHost)
        assertEquals(NavigationPolicy.START_URL, plan.startUrl)
        assertTrue(NavigationPolicy.isAllowed(plan.startUrl))
        assertTrue(sameJson(valid, JSONObject(plan.text)))
    }

    /**
     * Garde de la recette réelle (2026-10-18, Pixel 9, application 0.1.3) : sur le vrai site, la RACINE de l'hôte du magasin (`https://<hôte>/`) est
     * une PAGE 404 (« la page demandée n'a pas pu être trouvée »), comme `/magasin-<id>-<id>/` sans ville. Seul l'accueil de l'enseigne
     * (`https://www.leclercdrive.fr/`), session ouverte, affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer mes courses »,
     * qui mène aux vraies pages du magasin (avec la ville, celles que l'agent lit, `isStorePage`). Un plan s'ouvre donc sur l'accueil de
     * l'enseigne, comme la lecture du magasin, quel que soit l'hôte du magasin du plan : jamais sur une adresse de l'hôte du magasin, jamais sur
     * une adresse de magasin inventée. Le message du passage part vers l'agent quand l'utilisateur touche ce bouton.
     */
    @Test
    fun `un plan s'ouvre sur l'accueil de l'enseigne, jamais sur la racine de l'hote du magasin ni sur une page 404`() {
        val stores = listOf("000000" to "fd8-courses.leclercdrive.fr", "1" to "fd9-courses.leclercdrive.fr", "123456789012" to "fd14-courses.leclercdrive.fr")
        stores.forEach { (id, host) ->
            val plan = DrivePlan.parse(with("host", host, store = true).apply { getJSONObject("store").put("id", id) })!!

            assertEquals("https://www.leclercdrive.fr/", plan.startUrl)
            assertEquals(NavigationPolicy.START_URL, plan.startUrl)
            assertFalse("la racine de l'hôte du magasin ($host) est une page 404 du vrai site", plan.startUrl.contains(host))
            assertFalse("/magasin-$id-$id/ est une page 404 du vrai site", plan.startUrl.contains("/magasin-"))
            assertTrue(NavigationPolicy.isAllowed(plan.startUrl))
            assertFalse("l'accueil de l'enseigne n'est pas une page de magasin : l'agent y attend", NavigationPolicy.isStorePage(plan.startUrl))
        }
    }

    @Test
    fun `un plan et une lecture du magasin s'ouvrent sur la meme page`() {
        assertEquals(SetupRequest.of(RUN_ID)!!.startUrl, DrivePlan.parse(valid)!!.startUrl)
    }

    @Test
    fun `un plan repris apres la mort de l'application s'ouvre aussi sur l'accueil de l'enseigne`() {
        val restored = PassRequests.parseText(DrivePlan.parse(valid)!!.text)!!

        assertEquals(NavigationPolicy.START_URL, restored.startUrl)
    }

    @Test
    fun `l'ouverture d'une lecture du magasin est l'accueil de l'enseigne`() {
        assertEquals(NavigationPolicy.START_URL, SetupRequest.of(RUN_ID)!!.startUrl)
    }

    /** DRV-722 : `offerId` est un champ facultatif du produit d'un plan ; l'application ne lit pas les lignes, elle le garde tel quel pour l'agent. */
    @Test
    fun `l'identifiant d'offre d'un produit du plan n'est ni refuse ni perdu`() {
        val offer = "0b5f8a2e-3c1d-4e7f-9a6b-123456789abc"
        val product = JSONObject().put("id", "1000001").put("label", "Farine de test").put("offerId", offer)
        val line = JSONObject().put("ingredientSlug", "farine").put("name", "Farine").put("status", "KNOWN").put("products", org.json.JSONArray().put(product))
        val message = JSONObject(valid.toString()).put("lines", org.json.JSONArray().put(line))

        val plan = DrivePlan.parse(message)!!

        assertTrue(sameJson(message, JSONObject(plan.text)))
        assertTrue(plan.text.contains(offer))
        assertTrue(sameJson(message, JSONObject(PassRequests.parseText(plan.text)!!.text)))
    }

    @Test
    fun `un plan de 100 lignes est accepte`() {
        assertNotNull(DrivePlan.parse(ReferencePlans.json("plan-100-lignes.json")))
    }

    @Test
    fun `un plan de 101 lignes est refuse`() {
        val plan = ReferencePlans.json("plan-100-lignes.json")
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
            "fd8-courses.leclercdrive.fr.exemple.invalid",
            "fd8-courses.leclercdrive.fr.attaquant.fr",
            "evil-fd8-courses.leclercdrive.fr",
            "exemple.invalid/fd8-courses.leclercdrive.fr",
            "fd8-courses.leclercdrive.fr@exemple.invalid",
            "fd8-courses.leclercdrive.fr:8443",
            "fd8-courses.leclercdrive.fr:443",
            "fd8-courses.leclercdrive.fr.",
            "fd8-courses.leclercdrive.fr/chemin",
            "FD8-courses.leclercdrive.fr",
            "fd8-courses.LECLERCDRIVE.fr",
            "sous.fd8-courses.leclercdrive.fr\"}",
            "autre.leclercdrive.com",
            // DRV-754 : l'hôte d'un plan est un hôte du serveur, pas un autre sous-domaine du drive
            "courses-test.leclercdrive.fr",
            "www.leclercdrive.fr",
            "m-courses.leclercdrive.fr",
            "fd8-espace-client.leclercdrive.fr",
            "fd8-photos.leclercdrive.fr",
            "fdx-courses.leclercdrive.fr",
            "fd-courses.leclercdrive.fr",
            "fd1234-courses.leclercdrive.fr",
            "fd8-courses2.leclercdrive.fr",
            "m-courses2.leclercdrive.fr",
            "m.leclercdrive.fr",
            "m-autre.leclercdrive.fr",
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

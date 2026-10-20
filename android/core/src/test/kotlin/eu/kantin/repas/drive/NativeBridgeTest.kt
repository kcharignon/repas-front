package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le pont natif `repasNative` : origine, cadre, bornes, forme, types, réponses. Origines et messages SYNTHÉTIQUES. */
class NativeBridgeTest {
    private val origin = "https://repas.exemple.test"

    private fun screen(data: String?, from: String? = origin, main: Boolean = true) = NativeBridge.screen(data, from, main, origin)

    private fun refusedWith(request: NativeRequest): JSONObject = JSONObject((request as NativeRequest.Refused).reply)

    @Test
    fun `l'objet s'appelle repasNative`() {
        assertEquals("repasNative", NativeBridge.OBJECT_NAME)
    }

    @Test
    fun `app info est reconnu`() {
        assertEquals(NativeRequest.AppInfo, screen("""{"v":1,"type":"app.info"}"""))
    }

    @Test
    fun `app menu est reconnu`() {
        assertEquals(NativeRequest.AppMenu, screen("""{"v":1,"type":"app.menu"}"""))
    }

    private val plan = File("src/test/resources/plan-complet.json").readText()

    @Test
    fun `drive start porte un plan valide`() {
        val start = screen("""{"v":1,"type":"drive.start","plan":$plan}""") as NativeRequest.DriveStart

        assertEquals("8f14e45f-ceea-467a-9575-8e6b8c0a1b2c", start.plan.runId)
        assertEquals("courses-test.leclercdrive.fr", start.plan.storeHost)
    }

    @Test
    fun `un plan invalide, absent ou d'un hote non autorise recoit INVALID_PLAN`() {
        val badHost = plan.replace("courses-test.leclercdrive.fr", "exemple.invalid")
        val asSetup = plan.replaceFirst("plan\"", "setup\"")
        listOf(
            """{"v":1,"type":"drive.start"}""",
            """{"v":1,"type":"drive.start","plan":"texte"}""",
            """{"v":1,"type":"drive.start","plan":{}}""",
            """{"v":1,"type":"drive.start","plan":$badHost}""",
            """{"v":1,"type":"drive.start","plan":$asSetup}""",
        ).forEach {
            val refused = refusedWith(screen(it))
            assertEquals(it.take(60), "drive.error", refused.getString("type"))
            assertEquals("INVALID_PLAN", refused.getString("code"))
        }
    }

    @Test
    fun `un plan qui fait depasser le message de 64 Ko est refuse`() {
        val padded = JSONObject(plan).put("x", "a".repeat(BridgeMessages.MAX_BYTES)).toString()
        assertEquals(Rejection.TOO_LARGE, (screen("""{"v":1,"type":"drive.start","plan":$padded}""") as NativeRequest.Refused).reason)
    }

    @Test
    fun `drive setup porte l'identifiant du passage (DRV-320)`() {
        val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
        val setup = screen("""{"v":1,"type":"drive.setup","runId":"$runId"}""") as NativeRequest.DriveSetup

        assertEquals(runId, setup.setup.runId)
        assertTrue(setup.setup.isSetup)
    }

    @Test
    fun `drive setup sans identifiant valide est refuse avec INVALID_SETUP`() {
        listOf("", ",\"runId\":null", ",\"runId\":\"pas-un-uuid\"", ",\"runId\":12", ",\"runId\":{}", ",\"runId\":\"\"").forEach {
            val refused = screen("""{"v":1,"type":"drive.setup"$it}""") as NativeRequest.Refused
            assertEquals(it, "INVALID_SETUP", JSONObject(refused.reply).getString("code"))
            assertEquals("drive.error", JSONObject(refused.reply).getString("type"))
        }
    }

    @Test
    fun `drive cancel vise le passage en cours, avec ou sans identifiant`() {
        assertEquals(null, (screen("""{"v":1,"type":"drive.cancel"}""") as NativeRequest.DriveCancel).runId)
        assertEquals(null, (screen("""{"v":1,"type":"drive.cancel","runId":null}""") as NativeRequest.DriveCancel).runId)
        val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
        assertEquals(runId, (screen("""{"v":1,"type":"drive.cancel","runId":"$runId"}""") as NativeRequest.DriveCancel).runId)
    }

    @Test
    fun `drive cancel avec un identifiant qui n'est pas un UUID est refuse`() {
        listOf("\"pas-un-uuid\"", "12", "true", "[]", "\"\"").forEach {
            val refused = refusedWith(screen("""{"v":1,"type":"drive.cancel","runId":$it}"""))
            assertEquals(it, "INVALID_MESSAGE", refused.getString("code"))
        }
    }

    @Test
    fun `le resultat d'un passage est livre dans une enveloppe drive result`() {
        val result = JSONObject("""{"v":1,"type":"result","runId":"8f14e45f-ceea-467a-9575-8e6b8c0a1b2c","outcome":"completed","lines":[]}""")
        val message = JSONObject(NativeBridge.driveResult(result))

        assertEquals(1, message.getInt("v"))
        assertEquals("drive.result", message.getString("type"))
        assertTrue(sameJson(result, message.getJSONObject("result")))
        assertEquals(setOf("v", "type", "result"), message.keys().asSequence().toSet())
    }

    @Test
    fun `les codes de drive error sont ceux du contrat`() {
        assertEquals(
            listOf("INVALID_PLAN", "INVALID_SETUP", "BUSY", "UNAVAILABLE", "NO_PASS"),
            listOf(NativeBridge.INVALID_PLAN, NativeBridge.INVALID_SETUP, NativeBridge.BUSY, NativeBridge.UNAVAILABLE, NativeBridge.NO_PASS),
        )
    }

    @Test
    fun `un message d'une autre origine est ignore sans reponse`() {
        listOf(null, "null", "https://autre.exemple.test", "http://repas.exemple.test", "https://www.leclercdrive.fr", "https://repas.exemple.test/page")
            .forEach { from ->
                val request = screen("""{"v":1,"type":"app.info"}""", from = from)
                assertEquals("$from", Rejection.ORIGIN, (request as NativeRequest.Ignored).reason)
            }
    }

    @Test
    fun `un message d'un cadre secondaire est ignore sans reponse`() {
        assertEquals(Rejection.NOT_MAIN_FRAME, (screen("""{"v":1,"type":"app.info"}""", main = false) as NativeRequest.Ignored).reason)
    }

    @Test
    fun `un message qui n'est pas du texte est refuse`() {
        val request = screen(null)
        assertEquals(Rejection.NOT_TEXT, (request as NativeRequest.Refused).reason)
        assertEquals("error", refusedWith(request).getString("type"))
        assertEquals("INVALID_MESSAGE", refusedWith(request).getString("code"))
    }

    @Test
    fun `un message de plus de 64 Ko est refuse`() {
        val big = """{"v":1,"type":"app.info","x":"${"a".repeat(BridgeMessages.MAX_BYTES)}"}"""
        assertEquals(Rejection.TOO_LARGE, (screen(big) as NativeRequest.Refused).reason)
        val limit = """{"v":1,"type":"app.info","x":"${"a".repeat(BridgeMessages.MAX_BYTES - 40)}"}"""
        assertTrue(limit.toByteArray().size < BridgeMessages.MAX_BYTES)
        assertEquals(NativeRequest.AppInfo, screen(limit))
    }

    @Test
    fun `la borne se compte en octets et non en caracteres`() {
        val accents = """{"v":1,"type":"app.info","x":"${"é".repeat(BridgeMessages.MAX_BYTES / 2)}"}"""
        assertTrue(accents.length < BridgeMessages.MAX_BYTES)
        assertEquals(Rejection.TOO_LARGE, (screen(accents) as NativeRequest.Refused).reason)
    }

    @Test
    fun `un message mal forme est refuse`() {
        mapOf(
            "pas du json" to Rejection.NOT_JSON,
            "[1,2]" to Rejection.NOT_JSON,
            """{"type":"app.info"}""" to Rejection.NOT_PROTOCOL,
            """{"v":2,"type":"app.info"}""" to Rejection.NOT_PROTOCOL,
            """{"v":1,"type":"inconnu"}""" to Rejection.NOT_PROTOCOL,
            """{"v":1}""" to Rejection.NOT_PROTOCOL,
            """{"v":1,"type":["app.info"]}""" to Rejection.NOT_PROTOCOL,
        ).forEach { (data, reason) ->
            val request = screen(data)
            assertEquals(data, reason, (request as NativeRequest.Refused).reason)
            assertEquals(data, "error", refusedWith(request).getString("type"))
        }
    }

    @Test
    fun `un type inconnu recoit le code UNKNOWN_TYPE`() {
        assertEquals("UNKNOWN_TYPE", refusedWith(screen("""{"v":1,"type":"agent.hack"}""")).getString("code"))
        assertEquals("INVALID_MESSAGE", refusedWith(screen("pas du json")).getString("code"))
    }

    @Test
    fun `la reponse a app info porte la version, le numero et la disponibilite du drive`() {
        val info = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true))
        assertEquals(1, info.getInt("v"))
        assertEquals("app.info", info.getString("type"))
        assertEquals("1.2.3", info.getString("version"))
        assertEquals(42L, info.getLong("versionCode"))
        assertTrue(info.getBoolean("drive"))
        assertFalse(JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = false)).getBoolean("drive"))
    }

    @Test
    fun `la reponse a app info ne parle de la mise a jour que si l'application sait la faire`() {
        val without = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true))
        assertFalse("comme avant : aucune clé de plus", without.has("selfUpdate"))
        assertEquals(setOf("v", "type", "version", "versionCode", "drive"), without.keys().asSequence().toSet())

        val with = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, selfUpdate = true))
        assertTrue(with.getBoolean("selfUpdate"))
        assertEquals(setOf("v", "type", "version", "versionCode", "drive", "selfUpdate"), with.keys().asSequence().toSet())
    }

    @Test
    fun `les messages update sont reconnus et ne portent rien`() {
        assertEquals(NativeRequest.UpdateStatus, screen("""{"v":1,"type":"update.status"}"""))
        assertEquals(NativeRequest.UpdateCheck, screen("""{"v":1,"type":"update.check"}"""))
        assertEquals(NativeRequest.UpdateStart, screen("""{"v":1,"type":"update.start"}"""))
        assertEquals(NativeRequest.UpdateCancel, screen("""{"v":1,"type":"update.cancel"}"""))
    }

    @Test
    fun `un message update ne peut pas donner d'adresse, tout champ en plus est ignore`() {
        // La page ne choisit rien : ni adresse, ni version, ni empreinte. Un message qui en porte est lu comme le message nu.
        assertEquals(
            NativeRequest.UpdateStart,
            screen("""{"v":1,"type":"update.start","url":"https://evil.example/x.apk","sha256":"00","version":"9.9.9"}"""),
        )
    }

    @Test
    fun `un message update d'une autre origine ou d'un cadre secondaire est ignore`() {
        listOf("update.status", "update.check", "update.start", "update.cancel").forEach {
            assertEquals(Rejection.ORIGIN, (screen("""{"v":1,"type":"$it"}""", from = "https://evil.example") as NativeRequest.Ignored).reason)
            assertEquals(Rejection.NOT_MAIN_FRAME, (screen("""{"v":1,"type":"$it"}""", main = false) as NativeRequest.Ignored).reason)
        }
    }

    @Test
    fun `une erreur du drive porte son code et au besoin le passage`() {
        val plain = JSONObject(NativeBridge.driveError("UNAVAILABLE"))
        assertEquals("drive.error", plain.getString("type"))
        assertEquals("UNAVAILABLE", plain.getString("code"))
        assertFalse(plain.has("runId"))
        assertEquals("8f14e45f-ceea-467a-9575-8e6b8c0a1b2c", JSONObject(NativeBridge.driveError("BUSY", "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c")).getString("runId"))
    }
}

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
        val info = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, google = true))
        assertEquals(1, info.getInt("v"))
        assertEquals("app.info", info.getString("type"))
        assertEquals("1.2.3", info.getString("version"))
        assertEquals(42L, info.getLong("versionCode"))
        assertTrue(info.getBoolean("drive"))
        assertFalse(JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = false, google = true)).getBoolean("drive"))
    }

    @Test
    fun `app info gagne le seul drapeau google, a cote des trois champs existants (AUTH-011)`() {
        val info = JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, google = true))

        assertEquals(setOf("v", "type", "version", "versionCode", "drive", "google"), info.keys().asSequence().toSet())
        assertTrue(info.getBoolean("google"))
        assertFalse(JSONObject(NativeBridge.appInfo("1.2.3", 42, drive = true, google = false)).getBoolean("google"))
    }

    // —— la connexion avec Google (AUTH-011) : google.signIn, google.result, google.error ————————————————————————————————

    private val clientId = "123456789-exemple0synthetique.apps.googleusercontent.com"
    private val nonce = "nonce_synthetique-0123456789"

    private fun signIn(clientId: Any? = this.clientId, nonce: Any? = this.nonce, extra: String = ""): String {
        val json = JSONObject().put("v", 1).put("type", "google.signIn")
        if (clientId != null) json.put("clientId", clientId)
        if (nonce != null) json.put("nonce", nonce)
        return json.toString().removeSuffix("}") + extra + "}"
    }

    private fun assertInvalidRequest(request: NativeRequest, case: String) {
        val refused = request as? NativeRequest.Refused ?: throw AssertionError("$case : accepté, alors qu'il devait être refusé")
        val reply = JSONObject(refused.reply)
        assertEquals(case, "google.error", reply.getString("type"))
        assertEquals(case, "INVALID_REQUEST", reply.getString("code"))
        assertEquals(case, setOf("v", "type", "code"), reply.keys().asSequence().toSet())
        assertEquals(case, Rejection.NOT_PROTOCOL, refused.reason)
    }

    @Test
    fun `google signIn valide porte l'ID client et le nonce, rien d'autre`() {
        val request = screen(signIn(extra = ""","prompt":"select_account","x":1""")) as NativeRequest.GoogleSignIn

        assertEquals(clientId, request.clientId)
        assertEquals(nonce, request.nonce)
    }

    @Test
    fun `ni l'ID client ni le nonce ne s'affichent quand on ecrit la demande`() {
        val request = screen(signIn()) as NativeRequest.GoogleSignIn

        assertFalse(request.toString().contains(clientId))
        assertFalse(request.toString().contains(nonce))
        assertFalse(request.toString().contains("googleusercontent"))
    }

    @Test
    fun `un ID client de la forme d'un client Web Google est accepte`() {
        listOf(
            "1-a.apps.googleusercontent.com",
            "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com",
        ).forEach { assertTrue(it, screen(signIn(clientId = it)) is NativeRequest.GoogleSignIn) }
    }

    @Test
    fun `un ID client mal forme recoit INVALID_REQUEST`() {
        listOf<Any?>(
            null,
            "",
            12345,
            true,
            JSONObject().put("id", clientId),
            "123456789-exemple.apps.googleusercontent.com.evil.test",
            "https://123456789-exemple.apps.googleusercontent.com",
            "123456789-exemple.apps.googleusercontent.com\n",
            " 123456789-exemple.apps.googleusercontent.com",
            "123456789-Exemple.apps.googleusercontent.com",
            "123456789_exemple.apps.googleusercontent.com",
            "-exemple.apps.googleusercontent.com",
            "123456789-.apps.googleusercontent.com",
            "abc-exemple.apps.googleusercontent.com",
            "123456789-exemple.apps.googleusercontent.org",
            "123456789-exemple.appsXgoogleusercontent.com",
            "123456789-exem.ple.apps.googleusercontent.com",
            "١٢٣-exemple.apps.googleusercontent.com",
        ).forEach { assertInvalidRequest(screen(signIn(clientId = it)), "clientId « $it »") }
    }

    @Test
    fun `un nonce de 16 a 128 caracteres A-Z a-z 0-9 _ - est accepte`() {
        listOf("a".repeat(16), "Z".repeat(128), "AZaz09_-AZaz09_-", "NO_ACCOUNT-0123456789").forEach {
            assertTrue(it, screen(signIn(nonce = it)) is NativeRequest.GoogleSignIn)
        }
    }

    @Test
    fun `un nonce mal forme recoit INVALID_REQUEST`() {
        listOf<Any?>(
            null,
            "",
            "a".repeat(15),
            "a".repeat(129),
            1234567890123456789L,
            listOf("nonce_synthetique-0123456789"),
            "nonce synthetique 0123456789",
            "nonce+synthetique/0123456789=",
            "nonce.synthetique.0123456789",
            "nonce_synthetique-0123456789\n",
            "nonce_synthétique-0123456789",
        ).forEach { assertInvalidRequest(screen(signIn(nonce = it)), "nonce « $it »") }
    }

    @Test
    fun `google signIn d'une autre origine ou d'un cadre secondaire est ignore sans reponse`() {
        assertEquals(Rejection.ORIGIN, (screen(signIn(), from = "https://autre.exemple.test") as NativeRequest.Ignored).reason)
        assertEquals(Rejection.ORIGIN, (screen(signIn(), from = "https://www.leclercdrive.fr") as NativeRequest.Ignored).reason)
        assertEquals(Rejection.NOT_MAIN_FRAME, (screen(signIn(), main = false) as NativeRequest.Ignored).reason)
    }

    @Test
    fun `google signIn de plus de 64 Ko est refuse comme tout message`() {
        val big = signIn(extra = ""","x":"${"a".repeat(BridgeMessages.MAX_BYTES)}"""")
        assertEquals(Rejection.TOO_LARGE, (screen(big) as NativeRequest.Refused).reason)
    }

    @Test
    fun `google result porte le jeton, et rien d'autre`() {
        val message = JSONObject(NativeBridge.googleResult("jeton.synthetique.signature"))

        assertEquals(1, message.getInt("v"))
        assertEquals("google.result", message.getString("type"))
        assertEquals("jeton.synthetique.signature", message.getString("idToken"))
        assertEquals(setOf("v", "type", "idToken"), message.keys().asSequence().toSet())
    }

    @Test
    fun `google error porte un code, et rien d'autre`() {
        val message = JSONObject(NativeBridge.googleError("BUSY"))

        assertEquals("google.error", message.getString("type"))
        assertEquals("BUSY", message.getString("code"))
        assertEquals(setOf("v", "type", "code"), message.keys().asSequence().toSet())
    }

    @Test
    fun `les codes de google error sont ceux du contrat`() {
        val codes = IdentityError.entries.map { it.name } + listOf(NativeBridge.BUSY, NativeBridge.INVALID_REQUEST)

        assertEquals(setOf("CANCELLED", "NO_ACCOUNT", "UNAVAILABLE", "BUSY", "INVALID_REQUEST", "FAILED"), codes.toSet())
        codes.forEach { assertTrue(it, Regex("^[A-Z][A-Z0-9_]{0,63}$").matches(it)) }
    }

    @Test
    fun `la reponse de la plateforme devient google result ou google error`() {
        assertEquals("jeton", JSONObject(NativeBridge.googleAnswer(IdentityResult.Token("jeton"))).getString("idToken"))
        IdentityError.entries.forEach {
            val message = JSONObject(NativeBridge.googleAnswer(IdentityResult.Failure(it)))
            assertEquals("google.error", message.getString("type"))
            assertEquals(it.name, message.getString("code"))
        }
    }

    @Test
    fun `un jeton vide ou trop long n'est pas rendu a la page`() {
        listOf("", "   ", "a".repeat(NativeBridge.MAX_ID_TOKEN_CHARS + 1)).forEach {
            val message = JSONObject(NativeBridge.googleAnswer(IdentityResult.Token(it)))
            assertEquals("google.error", message.getString("type"))
            assertEquals("FAILED", message.getString("code"))
        }
        val longest = "a".repeat(NativeBridge.MAX_ID_TOKEN_CHARS)
        assertEquals(longest, JSONObject(NativeBridge.googleAnswer(IdentityResult.Token(longest))).getString("idToken"))
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

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le canal de messages : origines, cadre, texte, borne de 64 Ko, forme du JSON. Origines et messages SYNTHÉTIQUES. */
class BridgeMessagesTest {
    private val origin = "https://fd0-courses.leclercdrive.fr"
    private val result = """{"v":1,"type":"result","runId":"8f14e45f-ceea-467a-9575-8e6b8c0a1b2c","outcome":"completed","lines":[]}"""

    private fun rejection(data: String?, origin: String? = this.origin, isMainFrame: Boolean = true): Rejection? =
        (BridgeMessages.screen(data, origin, isMainFrame) as? Inbound.Rejected)?.reason

    @Test
    fun `l'objet s'appelle repasHost et n'existe que pour les sous-domaines de leclercdrive et www d'Auchan`() {
        assertEquals("repasHost", BridgeMessages.OBJECT_NAME)
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), BridgeMessages.ORIGIN_RULES)
        assertFalse(BridgeMessages.ORIGIN_RULES.any { it == "*" || it.startsWith("http://") })
    }

    @Test
    fun `une origine https d'un sous-domaine de leclercdrive est autorisee`() {
        listOf(origin, "https://www.leclercdrive.fr", "https://FD7-courses.leclercdrive.fr", "https://fd0-courses.leclercdrive.fr:443")
            .forEach { assertTrue(it, BridgeMessages.isAllowedOrigin(it)) }
    }

    @Test
    fun `toute autre origine est refusee`() {
        listOf(
            null,
            "",
            "null",
            "https://leclercdrive.fr",
            "http://fd0-courses.leclercdrive.fr",
            "https://fd0-courses.leclercdrive.fr:8443",
            "https://fd0-courses.leclercdrive.fr.exemple.invalid",
            "https://exemple.invalid",
            "https://exemple.invalid/fd0-courses.leclercdrive.fr",
            "https://fd0-courses.leclercdrive.fr@exemple.invalid",
            "https://exemple.invalid@fd0-courses.leclercdrive.fr",
            "https://fd0-courses.leclercdrive.fr/chemin",
            "file:///data/fd0-courses.leclercdrive.fr",
        ).forEach { assertFalse("$it", BridgeMessages.isAllowedOrigin(it)) }
    }

    @Test
    fun `un message d'une origine non autorisee est ignore`() {
        assertEquals(Rejection.ORIGIN, rejection(result, origin = "https://exemple.invalid"))
        assertEquals(Rejection.ORIGIN, rejection(result, origin = null))
    }

    @Test
    fun `un message d'un cadre secondaire est ignore`() {
        assertEquals(Rejection.NOT_MAIN_FRAME, rejection(result, isMainFrame = false))
    }

    @Test
    fun `un message qui n'est pas du texte est ignore`() {
        assertEquals(Rejection.NOT_TEXT, rejection(null))
    }

    @Test
    fun `la borne est de 64 Ko en octets, dans les deux sens`() {
        val limit = 64 * 1024
        assertEquals(limit, BridgeMessages.MAX_BYTES)
        assertTrue(BridgeMessages.fitsBound("a".repeat(limit)))
        assertFalse(BridgeMessages.fitsBound("a".repeat(limit + 1)))
        // Un « é » pèse deux octets en UTF-8 : 32 769 lettres dépassent la borne alors qu'elles font moins de 64 Ko de caractères.
        assertTrue(BridgeMessages.fitsBound("é".repeat(limit / 2)))
        assertFalse(BridgeMessages.fitsBound("é".repeat(limit / 2 + 1)))
        assertTrue(BridgeMessages.fitsBound(""))
    }

    @Test
    fun `un message trop gros est ignore avant d'etre lu`() {
        val padding = "x".repeat(BridgeMessages.MAX_BYTES)
        assertEquals(Rejection.TOO_LARGE, rejection("""{"v":1,"type":"result","lines":"$padding"}"""))
        assertEquals(Rejection.TOO_LARGE, rejection("é".repeat(BridgeMessages.MAX_BYTES / 2 + 1)))
    }

    @Test
    fun `un message juste sous la borne passe`() {
        val prefix = """{"v":1,"type":"log","text":""""
        val filler = "a".repeat(BridgeMessages.MAX_BYTES - prefix.length - 2)
        val message = "$prefix$filler\"}"
        assertEquals(BridgeMessages.MAX_BYTES, message.toByteArray().size)
        assertTrue(BridgeMessages.screen(message, origin, true) is Inbound.FromAgent)
    }

    @Test
    fun `un texte qui n'est pas du JSON objet est ignore`() {
        listOf("", "pas du json", "[1,2]", "\"texte\"", "{\"v\":1", "12").forEach {
            assertEquals(it, Rejection.NOT_JSON, rejection(it))
        }
    }

    @Test
    fun `une version autre que 1 ou un type inconnu est ignore`() {
        assertEquals(Rejection.NOT_PROTOCOL, rejection("""{"type":"result"}"""))
        assertEquals(Rejection.NOT_PROTOCOL, rejection("""{"v":2,"type":"result"}"""))
        assertEquals(Rejection.NOT_PROTOCOL, rejection("""{"v":1,"type":"plan"}"""))
        assertEquals(Rejection.NOT_PROTOCOL, rejection("""{"v":1,"type":"command","command":"diagnostic"}"""))
        assertEquals(Rejection.NOT_PROTOCOL, rejection("""{"v":1}"""))
    }

    @Test
    fun `l'annonce de la page est reconnue, avec ou sans le mode debogage`() {
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen("""{"v":1,"type":"hello"}""", origin, true))
        assertEquals(Inbound.Hello(debug = true), BridgeMessages.screen("""{"v":1,"type":"hello","debug":true}""", origin, true))
        // Une valeur qui n'est pas vraiment « true » n'annonce pas le mode débogage.
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen("""{"v":1,"type":"hello","debug":"true"}""", origin, true))
        assertEquals(Inbound.Hello(debug = false), BridgeMessages.screen("""{"v":1,"type":"hello","debug":1}""", origin, true))
    }

    @Test
    fun `les messages de l'agent sont transmis tels quels`() {
        listOf("result", "setup-result", "selftest-result", "progress", "log").forEach { type ->
            val text = """{"v":1,"type":"$type"}"""
            val inbound = BridgeMessages.screen(text, origin, true) as Inbound.FromAgent
            assertEquals(type, inbound.type)
            assertEquals(text, inbound.text)
        }
    }

    @Test
    fun `la commande du test automatique est du protocole v1 et tient dans la borne`() {
        assertEquals("""{"v":1,"type":"command","command":"selftest"}""", BridgeMessages.COMMAND_SELFTEST)
        assertTrue(BridgeMessages.fitsBound(BridgeMessages.COMMAND_SELFTEST))
    }

    @Test
    fun `la commande de diagnostic est du protocole v1 et tient dans la borne`() {
        assertEquals("""{"v":1,"type":"command","command":"diagnostic"}""", BridgeMessages.COMMAND_DIAGNOSTIC)
        assertTrue(BridgeMessages.fitsBound(BridgeMessages.COMMAND_DIAGNOSTIC))
    }
}

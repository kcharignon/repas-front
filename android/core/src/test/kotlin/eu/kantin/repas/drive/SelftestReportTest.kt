package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

/** Le rapport du test automatique (DRV-318) : sa forme, ce qui est masqué, et le fait qu'on ne l'accepte que s'il a été demandé. */
class SelftestReportTest {
    private fun message(report: String = "Verdict : OK", ok: Any = true, version: Any = "0.6.0", type: String = "selftest-result", v: Int = 1) =
        JSONObject().put("v", v).put("type", type).put("ok", ok).put("agentVersion", version).put("report", report).toString()

    @Test
    fun `un rapport du protocole est rendu tel quel`() {
        assertEquals("Verdict : OK\n1. [OK] Diagnostic", SelftestReport.render(message("Verdict : OK\n1. [OK] Diagnostic")))
    }

    @Test
    fun `un message qui n'a pas la forme du protocole est illisible`() {
        listOf(
            "pas du json",
            message(type = "result"),
            message(v = 2),
            message(report = ""),
            message(report = "   "),
            message(ok = "oui"),
            message(version = "0.6"),
            message(report = "x".repeat(SelftestReport.MAX_CHARS + 1)),
            """{"v":1,"type":"selftest-result","ok":true,"agentVersion":"0.6.0"}""",
            """{"v":1,"type":"selftest-result","ok":true,"agentVersion":"0.6.0","report":42}""",
        ).forEach { assertNull(it, SelftestReport.render(it)) }
    }

    @Test
    fun `un rapport de la taille maximale passe`() {
        assertEquals(SelftestReport.MAX_CHARS, SelftestReport.render(message("x".repeat(SelftestReport.MAX_CHARS)))!!.length)
    }

    @Test
    fun `les adresses web et les e-mails sont masques`() {
        val text = SelftestReport.mask("a https://fd0-courses.leclercdrive.fr/magasin-1 b www.exemple.invalid/x c jean.dupont@exemple.invalid d")

        assertFalse(text.contains("leclercdrive"))
        assertFalse(text.contains("exemple"))
        assertFalse(text.contains("@"))
        assertEquals("a [adresse masquée] b [adresse masquée] c [adresse masquée] d", text)
    }

    @Test
    fun `un numero de six chiffres ou plus est reduit a ses trois derniers chiffres`() {
        assertEquals("magasin …456, produit 12345, 4,6 s", SelftestReport.mask("magasin 123456, produit 12345, 4,6 s"))
        assertEquals("…901", SelftestReport.mask("12345678901"))
    }

    @Test
    fun `un rapport propre n'est pas change par le masquage`() {
        val clean = "Hôte : fd0\nMagasin : …456\n   - farine : OK, 24 produits, contenu net lu 22, prix lus 24, 1,2 s\ntotal : 9,47 € avant"

        assertEquals(clean, SelftestReport.mask(clean))
    }

    @Test
    fun `le rapport recu est masque avant d'etre montre`() {
        val shown = SelftestReport.render(message("Magasin 123456 jean@exemple.invalid"))!!

        assertEquals("Magasin …456 [adresse masquée]", shown)
    }

    @Test
    fun `le rapport n'est accepte que si l'application vient de le demander`() {
        val shown = mutableListOf<String>()
        val run = SelftestRun(send = { true }, show = { shown += it })

        assertFalse(run.onAgentMessage("selftest-result", message()))
        assertTrue(shown.isEmpty())

        assertTrue(run.start())
        assertFalse(run.onAgentMessage("result", """{"v":1,"type":"result"}"""))
        assertTrue(run.onAgentMessage("selftest-result", message("Verdict : OK")))
        assertEquals(listOf("Verdict : OK"), shown)

        // Un seul rapport par demande : le suivant, non demandé, est refusé.
        assertFalse(run.onAgentMessage("selftest-result", message("autre")))
        assertEquals(1, shown.size)
    }

    @Test
    fun `une commande qui ne part pas n'attend rien`() {
        val shown = mutableListOf<String>()
        val run = SelftestRun(send = { false }, show = { shown += it })

        assertFalse(run.start())
        assertFalse(run.onAgentMessage("selftest-result", message()))
        assertTrue(shown.isEmpty())
    }

    @Test
    fun `un rapport illisible attendu est montre comme tel`() {
        val shown = mutableListOf<String>()
        val run = SelftestRun(send = { true }, show = { shown += it })
        run.start()

        run.onAgentMessage("selftest-result", message(report = ""))

        assertEquals(listOf(SelftestReport.UNREADABLE), shown)
    }
}

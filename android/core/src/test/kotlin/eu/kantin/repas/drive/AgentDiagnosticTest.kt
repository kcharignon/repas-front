package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La boîte de diagnostic de l'écran du drive (DRV-759), lisible hors de la page (une WebView ne se lit pas) : ce que l'application sait (la CATÉGORIE de la page, jamais son adresse),
 * puis les deux lignes que l'agent dit. Adresses SYNTHÉTIQUES : aucune ne doit se retrouver dans le rapport.
 */
class AgentDiagnosticTest {
    private val site = RetailerSites.DEFAULT.legacy

    @Test
    fun `la categorie dit le genre d'hote et de chemin, jamais l'adresse ni un numero ni la ville`() {
        val category = AgentDiagnostic.pageCategory(site, "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000001-000001-Ville-Test/authentification.aspx?s=600&t=secret")

        assertEquals("hôte fd<N>-espace-client avec agent ; chemin /drive/magasin-<N>-<N>-<ville>/authentification.aspx, avec requête", category)
        assertFalse(category.contains("000001"))
        assertFalse(category.contains("Ville-Test"))
        assertFalse(category.contains("secret"))
    }

    @Test
    fun `un segment qui n'est ni un magasin ni une page connue est masque`() {
        assertEquals(
            "hôte www avec agent ; chemin /<x>/<x>, sans requête",
            AgentDiagnostic.pageCategory(site, "https://www.leclercdrive.fr/produit-farine-de-ble/dupont-12345"),
        )
        assertEquals("hôte www avec agent ; chemin /, sans requête", AgentDiagnostic.pageCategory(site, "https://www.leclercdrive.fr/"))
    }

    @Test
    fun `une page sans pont est dite sans agent, un hote etranger n'est pas decrit`() {
        assertEquals("aucune page", AgentDiagnostic.pageCategory(site, null))
        assertEquals("page hors du drive", AgentDiagnostic.pageCategory(site, "https://exemple-etranger.test/secret/chemin?x=1"))
        assertEquals("page hors du drive", AgentDiagnostic.pageCategory(site, "http://www.leclercdrive.fr/"))
    }

    @Test
    fun `les lignes de l'agent sont lues comme une entree non fiable, bornees et nettoyees`() {
        val text = """{"v":1,"type":"log","lines":["Session : connecté (aucun signe)","Fenêtre au premier plan : rien","${"x".repeat(1_000)}","a","b","c","d"]}"""

        val lines = AgentDiagnostic.agentLines(text)

        assertEquals(4, lines.size)
        assertEquals("Session : connecté (aucun signe)", lines[0])
        assertEquals(AgentDiagnostic.MAX_LINE, lines[2].length)
    }

    @Test
    fun `des lignes illisibles ou d'un autre genre ne donnent rien`() {
        assertTrue(AgentDiagnostic.agentLines("pas du json").isEmpty())
        assertTrue(AgentDiagnostic.agentLines("""{"v":1,"type":"log","lines":"texte"}""").isEmpty())
        assertTrue(AgentDiagnostic.agentLines("""{"v":1,"type":"log","lines":[1,null,{"a":1}]}""").isEmpty())
        assertEquals(listOf("a b"), AgentDiagnostic.agentLines("""{"v":1,"type":"log","lines":["a\u0000\n\tb"]}"""))
    }

    @Test
    fun `le rapport rassemble ce que l'application sait puis ce que l'agent a dit`() {
        val report = AgentDiagnostic.report(
            page = "hôte www avec agent ; chemin /, sans requête",
            agentHellos = 2,
            pagesStarted = 3,
            pass = "plan",
            banner = "NONE",
            agentLines = listOf("Session : indéterminé (aucun signe)"),
        )

        assertEquals(
            listOf(
                "Page : hôte www avec agent ; chemin /, sans requête",
                "Agent annoncé : 2 fois, pages chargées : 3",
                "Passage : plan",
                "Bandeau : NONE",
                "Session : indéterminé (aucun signe)",
            ),
            report,
        )
        assertEquals("Agent : aucune ligne reçue (absent de cette page, ou trop ancien)", AgentDiagnostic.report("p", 0, 1, "aucun", "NONE", emptyList())[4])
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le résultat de l'agent en texte à copier : jamais de numéro de magasin entier, ni d'adresse. Données SYNTHÉTIQUES. */
class ResultReportTest {
    private val result = """
        {"v":1,"type":"result","runId":"8f14e45f-ceea-467a-9575-8e6b8c0a1b2c","agentVersion":"1.0.0","outcome":"partial",
         "store":{"id":"123456"},
         "error":{"code":"BLOCKED","message":"Le site bloque les requêtes."},
         "lines":[
          {"ingredientSlug":"farine","outcome":"CHOSEN","quantity":2,"placement":"PRIMARY",
           "product":{"id":"1000001","label":"Farine de test 1 kg","price":{"cents":249}}},
          {"ingredientSlug":"sucre","outcome":"ADDED","productId":"1000002","quantity":1,"usedRank":2,"price":{"cents":105}},
          {"ingredientSlug":"sel","outcome":"HAVE_AT_HOME"},
          {"ingredientSlug":"huile","outcome":"FAILED","error":"NETWORK"}
         ]}
    """.trimIndent()

    @Test
    fun `le numero de magasin n'est montre que par ses trois derniers chiffres`() {
        assertEquals("…456", ResultReport.storeTail("123456"))
        assertEquals("…", ResultReport.storeTail("123"))
        assertEquals("…", ResultReport.storeTail(""))
        val report = ResultReport.render(result)
        assertFalse(report.contains("123456"))
        assertTrue(report.contains("Magasin : …456"))
    }

    @Test
    fun `un resultat montre l'issue, la version, l'erreur et chaque ligne`() {
        val report = ResultReport.render(result)

        assertTrue(report.contains("Issue : partial"))
        assertTrue(report.contains("Version de l'agent : 1.0.0"))
        assertTrue(report.contains("Erreur : BLOCKED (Le site bloque les requêtes.)"))
        assertTrue(report.contains("Lignes : 4"))
        assertTrue(report.contains("- farine : CHOSEN, produit 1000001 « Farine de test 1 kg », quantité 2, placement PRIMARY, prix 2,49 €"))
        assertTrue(report.contains("- sucre : ADDED, produit 1000002, quantité 1, rang 2, prix 1,05 €"))
        assertTrue(report.contains("- sel : HAVE_AT_HOME"))
        assertTrue(report.contains("- huile : FAILED, erreur NETWORK"))
    }

    /** Ticket L : les compteurs du passage (des nombres) sont dans le rapport quand le résultat en porte, et seulement alors. */
    @Test
    fun `un resultat qui porte des compteurs les montre, un autre n'en dit rien`() {
        val counted = result.replace("\"store\":{\"id\":\"123456\"},", "\"store\":{\"id\":\"123456\"},\"stats\":{\"requests\":42,\"errors\":1,\"blocks\":2},")

        assertTrue(ResultReport.render(counted).contains("Requêtes : 42 (erreurs 1, blocages 2)"))
        assertFalse(ResultReport.render(result).contains("Requêtes"))
    }

    @Test
    fun `le magasin lu montre l'hote mais ni le numero entier, ni l'adresse, ni le libelle`() {
        val setup = """{"v":1,"type":"setup-result","agentVersion":"1.0.0","store":{"id":"123456","host":"fd0-courses.leclercdrive.fr","baseUrl":"https://fd0-courses.leclercdrive.fr/magasin-123456-123456","label":"Ville-Test"}}"""

        val report = ResultReport.render(setup)

        assertTrue(report.contains("Hôte : fd0-courses.leclercdrive.fr"))
        assertTrue(report.contains("Magasin : …456"))
        assertTrue(report.contains("Libellé : présent"))
        listOf("123456", "magasin-", "https://", "Ville-Test").forEach { assertFalse(it, report.contains(it)) }
        assertTrue(ResultReport.render(setup.replace("\"Ville-Test\"", "null")).contains("Libellé : absent"))
    }

    @Test
    fun `un texte qui n'est pas un resultat est dit illisible, sans le recopier`() {
        listOf("pas du json", """{"type":"autre"}""", "[]").forEach {
            assertEquals("Résultat illisible : l'agent a répondu autrement qu'attendu.", ResultReport.render(it))
        }
    }

    @Test
    fun `un resultat sans lignes ni magasin reste lisible`() {
        val report = ResultReport.render("""{"v":1,"type":"result"}""")

        assertTrue(report.contains("Lignes : 0"))
        assertTrue(report.contains("Magasin : …"))
    }
}

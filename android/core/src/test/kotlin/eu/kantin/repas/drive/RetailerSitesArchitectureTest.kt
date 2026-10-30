package eu.kantin.repas.drive

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le registre des enseignes est le seul endroit du cœur qui nomme une enseigne (DRV-706, ADR 0027 du back) : le nom de CHAQUE enseigne inscrite
 * (« leclerc », « auchan » : son identifiant, son nom, son domaine, ses formes d'adresse) ne se lit dans le code d'aucun autre fichier du cœur. Ajouter
 * une enseigne, c'est ajouter une entrée à `RetailerSites`, pas un `if` ailleurs ; et la règle de sécurité (quelle page garde l'agent et reçoit un plan)
 * ne dépend d'aucun nom propre. Les noms viennent du registre lui-même : une enseigne de plus est gardée sans toucher à ce test.
 *
 * Seul le **code** compte (chaînes comprises), pas les commentaires : une phrase qui explique un constat sur un site peut nommer l'enseigne. Les tests
 * sont libres. Le test tourne dans le dossier `android/core`.
 */
class RetailerSitesArchitectureTest {
    private val registry = "RetailerSites.kt"

    private val main = File("src/main/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }.sortedBy { it.path }.toList()

    @Test
    fun `le test regarde bien les sources du coeur, dont le registre`() {
        assertTrue(main.size >= 15)
        assertTrue(main.any { it.name == registry })
    }

    /** Les noms de chaque enseigne inscrite (allumée ou éteinte), en minuscules : leur identifiant et leur nom. */
    private val names: List<String> = RetailerSites.REGISTERED.all.flatMap { listOf(it.id, it.name.lowercase()) }.distinct()

    @Test
    fun `le test connait chaque enseigne inscrite, allumee ou eteinte`() {
        assertTrue(names.containsAll(listOf("leclerc", "auchan")))
        assertEquals(RetailerSites.REGISTERED.all.size, RetailerSites.DEFAULT.all.size + RetailerSites.SWITCHED_OFF.size)
    }

    @Test
    fun `aucun fichier du coeur hors le registre ne nomme une enseigne dans son code`() {
        val offenders = main.filter { it.name != registry }.flatMap { file ->
            CoreRules.code(file.readText()).filter { line -> names.any { line.contains(it, ignoreCase = true) } }.map { "${file.path} : ${it.trim()}" }
        }

        assertEquals(
            "Une enseigne se nomme dans l'entrée du registre (RetailerSites.kt) et nulle part ailleurs dans le cœur. Passe par RetailerSite (id, name, " +
                "startUrl, hosts, storePages…) :\n" + offenders.joinToString("\n"),
            emptyList<String>(),
            offenders,
        )
    }

    @Test
    fun `le registre, lui, porte l'entree de chaque enseigne inscrite`() {
        val code = CoreRules.code(File("src/main/kotlin/eu/kantin/repas/drive/$registry").readText())

        RetailerSites.REGISTERED.all.forEach { site ->
            assertTrue("l'entrée de ${site.id} est dans le registre", code.any { it.contains("id = \"${site.id}\"") })
        }
    }

    @Test
    fun `la regle de securite ne contient aucun joker ecrit a la main`() {
        // Les règles d'origine se déduisent de HostPattern.origin : aucun fichier hors de RetailerSite.kt n'écrit de règle « https://* ».
        val offenders = main.filter { it.name != "RetailerSite.kt" }.flatMap { file ->
            CoreRules.code(file.readText()).filter { it.contains("\"https://*") }.map { "${file.path} : ${it.trim()}" }
        }

        assertEquals(emptyList<String>(), offenders)
    }
}

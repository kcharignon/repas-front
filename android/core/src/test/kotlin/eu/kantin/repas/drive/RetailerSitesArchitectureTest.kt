package eu.kantin.repas.drive

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le registre des enseignes est le seul endroit du cœur qui nomme une enseigne (DRV-706, ADR 0027 du back) : « leclerc » (son identifiant, son nom, son
 * domaine, ses formes d'adresse) ne se lit dans le code d'aucun autre fichier du cœur. Ajouter une enseigne, c'est ajouter une entrée à
 * `RetailerSites`, pas un `if` ailleurs ; et la règle de sécurité (quelle page garde l'agent et reçoit un plan) ne dépend d'aucun nom propre.
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

    @Test
    fun `aucun fichier du coeur hors le registre ne nomme une enseigne dans son code`() {
        val offenders = main.filter { it.name != registry }.flatMap { file ->
            CoreRules.code(file.readText()).filter { it.contains("leclerc", ignoreCase = true) }.map { "${file.path} : ${it.trim()}" }
        }

        assertEquals(
            "Une enseigne se nomme dans l'entrée du registre (RetailerSites.kt) et nulle part ailleurs dans le cœur. Passe par RetailerSite (id, name, " +
                "startUrl, hosts, storePages…) :\n" + offenders.joinToString("\n"),
            emptyList<String>(),
            offenders,
        )
    }

    @Test
    fun `le registre, lui, porte bien l'entree d'aujourd'hui`() {
        val entry = CoreRules.code(File("src/main/kotlin/eu/kantin/repas/drive/$registry").readText()).filter { it.contains("leclerc", ignoreCase = true) }

        assertTrue(entry.isNotEmpty())
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

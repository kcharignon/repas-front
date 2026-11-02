package eu.kantin.repas.drive

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le câblage de l'écriture des cookies de Repas (DRV-765), lu dans les sources de l'application (les écrans ne se jouent pas sur la JVM) : l'installateur d'Android n'est ouvert
 * que par [SessionCookies.beforeInstaller], et la coquille écrit les cookies quand elle passe en pause (en boucle), est cachée, revient ou a fini de charger une page. Seul le CÂBLAGE est
 * lu ici (les appels sont cherchés dans le code des fonctions, commentaires retirés) ; le comportement est prouvé par `SessionCookiesTest` (cœur) et par le scénario 22 de `make android-e2e`.
 */
class SessionCookiesWiringTest {
    private fun source(path: String) = File("src/$path/kotlin/eu/kantin/repas/drive").listFiles { f -> f.extension == "kt" }.orEmpty().sortedBy { it.name }

    @Test
    fun `l'installateur n'est ouvert que derriere l'ecriture des cookies`() {
        val opening = Regex("""startActivityForResult\(""")
        val lines = source("direct")
            .flatMap { it.readLines().map { line -> it.name to line } }
            .filter { !it.second.trim().startsWith("//") && opening.containsMatchIn(it.second) }

        assertEquals("un seul endroit ouvre l'installateur : $lines", 1, lines.size)
        assertTrue("l'ouverture passe par beforeInstaller : ${lines[0].second}", lines[0].second.contains("cookies.beforeInstaller {"))
    }

    @Test
    fun `la coquille ecrit les cookies en pause, une fois cachee, au retour et apres chaque page`() {
        val shell = File("src/main/kotlin/eu/kantin/repas/drive/MainActivity.kt").readText()
        // le code d'une fonction, sans ses commentaires : jusqu'à son accolade fermante, au même retrait que sa déclaration
        fun body(signature: String): String {
            val from = shell.indexOf(signature)
            assertTrue("$signature est introuvable", from >= 0)
            val indent = shell.substring(shell.lastIndexOf("\n", from) + 1, from)
            return shell.substring(from).substringBefore("\n$indent}\n").lines().filterNot { it.trim().startsWith("//") }.joinToString("\n")
        }

        assertTrue(body("override fun onPause()").contains("cookies.paused()"))
        assertTrue(body("override fun onStop()").contains("cookies.flushNow()"))
        assertTrue(body("override fun onPageFinished(").contains("cookies.flushSoon()"))
        assertTrue(body("override fun onResume()").contains("cookies.resumed()"))
        assertTrue(body("override fun onResume()").contains("cookies.flushSoon()"))
        assertTrue(body("override fun onDestroy()").contains("cookies.close()"))
    }
}

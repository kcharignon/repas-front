package eu.kantin.repas.drive

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La règle d'or du cœur (AUTH-015, `android/ARCHITECTURE.md`) : **le cœur n'importe rien d'Android**. Elle est tenue deux fois :
 * - par la construction : le module `core` n'a ni le plugin Android ni le SDK, un `import android.…` ne compile pas ;
 * - par ce test, qui le dit en clair, et qui garde fermée la liste de ce que le cœur emprunte à la JVM (ce qu'un futur module Kotlin
 *   Multiplatform devra remplacer).
 *
 * Ce fichier parle forcément d'Android (il en donne des exemples) : il est le seul que l'analyse ne lit pas. Le test tourne dans le dossier
 * `android/core`.
 */
class CoreArchitectureTest {
    private val ownFile = "CoreArchitectureTest.kt"

    private fun kotlinFiles(dir: String): List<File> =
        File(dir).walkTopDown().filter { it.isFile && it.extension == "kt" && it.name != ownFile }.sortedBy { it.path }.toList()

    private val main = kotlinFiles("src/main/kotlin")
    private val tests = kotlinFiles("src/test/kotlin")

    @Test
    fun `le test regarde bien les sources du coeur`() {
        assertTrue("sources du cœur introuvables depuis ${File(".").absoluteFile}", main.size >= 15)
        assertTrue(tests.size >= 15)
        assertTrue(File("src/main/kotlin/eu/kantin/repas/drive/NavigationPolicy.kt").isFile)
    }

    @Test
    fun `aucun fichier du coeur n'importe ni ne nomme Android ou AndroidX`() {
        val offenders = (main + tests).flatMap { file ->
            CoreRules.androidReferences(CoreRules.code(file.readText())).map { "${file.path} : ${it.trim()}" }
        }

        assertTrue(
            "Le cœur n'importe rien d'Android (android/ARCHITECTURE.md). Mets ce code dans l'application (android/app), derrière une interface " +
                "du cœur si le cœur en a besoin :\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

    @Test
    fun `le coeur n'emprunte a la JVM que la liste fermee`() {
        val unlisted = main.flatMap { file ->
            (CoreRules.foreignReferences(CoreRules.code(file.readText())) - CoreRules.BORROWED_FROM_THE_JVM).map { "${file.path} : $it" }
        }

        assertTrue(
            "Cet emprunt à la JVM n'est pas dans la liste du cœur. S'il est voulu, l'ajouter à CoreRules.BORROWED_FROM_THE_JVM ET à " +
                "android/ARCHITECTURE.md (« Ce que Kotlin Multiplatform demandera ») ; sinon, le garder dans l'application :\n" +
                unlisted.joinToString("\n"),
            unlisted.isEmpty(),
        )
    }

    @Test
    fun `chaque emprunt de la liste est encore utilise`() {
        val used = main.flatMap { CoreRules.foreignReferences(CoreRules.code(it.readText())) }.toSet()

        assertEquals("emprunts listés mais plus utilisés : à retirer de la liste", emptySet<String>(), CoreRules.BORROWED_FROM_THE_JVM - used)
    }

    @Test
    fun `la construction du coeur n'a ni plugin Android, ni bibliotheque Android, ni dependance vers l'application`() {
        // Sans les commentaires : celui du fichier parle d'Android pour dire qu'il n'en veut pas.
        val build = CoreRules.code(File("build.gradle.kts").readText()).joinToString("\n")

        assertTrue(build.contains("""id("org.jetbrains.kotlin.jvm")"""))
        listOf("com.android", "org.jetbrains.kotlin.android", "androidx", "project(\":app\")").forEach {
            assertFalse("build.gradle.kts du cœur ne doit pas contenir « $it »", build.contains(it))
        }
    }

    // —— la règle se prouve elle-même : elle voit ce qu'elle doit voir, et pas plus ————————————————————————————————————————

    @Test
    fun `un import d'Android ou d'AndroidX est vu`() {
        val code = CoreRules.code("package x\n\nimport android.util.Log\nimport androidx.webkit.WebViewCompat\nimport kotlin.math.abs\n")

        assertEquals(listOf("import android.util.Log", "import androidx.webkit.WebViewCompat"), CoreRules.androidReferences(code))
    }

    @Test
    fun `un nom complet d'Android sans import est vu`() {
        val code = CoreRules.code("fun f() = android.net.Uri.parse(\"x\")\nval b = Build.VERSION.SDK_INT\n")

        assertEquals(1, CoreRules.androidReferences(code).size)
    }

    @Test
    fun `une mention d'Android dans un commentaire ne compte pas`() {
        val code = CoreRules.code(
            "/** Sans `android.net.Uri`. */\n// import android.util.Log\n/*\n * import androidx.webkit.WebViewCompat\n */\nval x = 1 // android.os.Build\n",
        )

        assertTrue(CoreRules.androidReferences(code).isEmpty())
    }

    @Test
    fun `une adresse web dans une chaine n'est pas prise pour un commentaire`() {
        val code = CoreRules.code("val a = \"https://exemple.test\"; val b = android.os.Build.MODEL\n")

        assertEquals(1, CoreRules.androidReferences(code).size)
    }

    @Test
    fun `les emprunts a la JVM sont les imports et les noms complets hors Kotlin`() {
        val code = CoreRules.code("import java.util.Base64\nimport kotlin.math.abs\nval d = java.security.MessageDigest.getInstance(\"SHA-384\")\n")

        assertEquals(setOf("java.util.Base64", "java.security.MessageDigest"), CoreRules.foreignReferences(code))
    }
}

/** Les règles d'architecture du cœur, en fonctions pures (pour qu'elles se testent elles-mêmes). */
internal object CoreRules {
    /**
     * Ce que le cœur emprunte à la JVM, et que Kotlin Multiplatform ne fournit pas : `MessageDigest` et `Base64` d'`AgentAsset` (empreinte SHA-384),
     * `Normalizer` et `Locale` de `DriveEntry` (le titre « introuvable » sans accents ni majuscules, DRV-631), `org.json` (le JSON du pont). Chacun se remplace par un `expect`/`actual` ou une bibliothèque multiplateforme (`android/ARCHITECTURE.md`).
     */
    val BORROWED_FROM_THE_JVM: Set<String> = setOf(
        "java.security.MessageDigest",
        "java.text.Normalizer",
        "java.util.Base64",
        "java.util.Locale",
        "org.json.JSONArray",
        "org.json.JSONException",
        "org.json.JSONObject",
    )

    private val ANDROID = Regex("""\b(android|androidx)\.[a-z]""")
    private val IMPORT = Regex("""^\s*import\s+([\w.]+)""")
    private val QUALIFIED = Regex("""\b((?:java|javax|org|com|net|io)(?:\.[a-z][a-z0-9_]*)+\.[A-Z]\w*)""")

    /** Les lignes de code d'un fichier, sans commentaires (KDoc compris), pour que « sans `android.net.Uri` » dans un commentaire ne compte pas. */
    fun code(text: String): List<String> {
        var inBlock = false
        return text.lines().mapNotNull { raw ->
            var line = raw
            val kept = StringBuilder()
            while (line.isNotEmpty()) {
                if (inBlock) {
                    val end = line.indexOf("*/")
                    if (end < 0) {
                        line = ""
                    } else {
                        inBlock = false
                        line = line.substring(end + 2)
                    }
                } else {
                    val start = line.indexOf("/*")
                    if (start < 0) {
                        kept.append(line)
                        line = ""
                    } else {
                        kept.append(line, 0, start)
                        inBlock = true
                        line = line.substring(start + 2)
                    }
                }
            }
            // Un commentaire de fin de ligne commence par une espace : `https://…` dans une chaîne n'en est pas un.
            kept.toString().substringBefore(" //").takeIf { !it.trimStart().startsWith("//") && it.isNotBlank() }
        }
    }

    /** Les lignes qui importent ou nomment Android ou AndroidX. */
    fun androidReferences(code: List<String>): List<String> = code.filter { ANDROID.containsMatchIn(it) }.map { it.trim() }

    /** Ce que ce code prend hors de Kotlin : les cibles de ses `import` (hors `kotlin.`) et ses noms complets de la JVM. */
    fun foreignReferences(code: List<String>): Set<String> = code.flatMap { line ->
        val imported = IMPORT.find(line)?.groupValues?.get(1)?.takeUnless { it.startsWith("kotlin.") }
        listOfNotNull(imported) + QUALIFIED.findAll(line).map { it.groupValues[1] }.filter { it != imported }
    }.toSet()
}

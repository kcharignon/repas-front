package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** L'origine de Repas et la règle de navigation de la coquille (DRV-317). Adresses SYNTHÉTIQUES. */
class ShellNavigationTest {
    private val origin = "https://repas.exemple.test"
    private val navigation = ShellNavigation(origin)

    @Test
    fun `une origine s'ecrit https hote avec ou sans barre finale`() {
        assertEquals("https://kantin.eu", RepasOrigin.parse("https://kantin.eu"))
        assertEquals("https://kantin.eu", RepasOrigin.parse("https://kantin.eu/"))
        assertEquals("https://kantin.eu", RepasOrigin.parse("https://KANTIN.eu:443"))
        assertEquals("kantin.eu", RepasOrigin.hostOf("https://kantin.eu"))
    }

    @Test
    fun `tout le reste n'est pas une origine`() {
        listOf(
            null,
            "",
            "kantin.eu",
            "http://kantin.eu",
            "https://",
            "https://kantin.eu//",
            "https://kantin.eu/chemin",
            "https://kantin.eu?x=1",
            "https://kantin.eu:8443",
            "https://nom@kantin.eu",
            "https://kantin.eu\\@exemple.invalid",
        ).forEach { assertNull("$it", RepasOrigin.parse(it)) }
        assertThrows(IllegalArgumentException::class.java) { ShellNavigation("http://kantin.eu") }
    }

    @Test
    fun `l'origine d'un message n'est reconnue que si elle est exactement celle de Repas`() {
        assertTrue(RepasOrigin.matches("https://repas.exemple.test", origin))
        assertTrue(RepasOrigin.matches("https://repas.exemple.test:443", origin))
        listOf(
            null,
            "null",
            "https://autre.exemple.test",
            "http://repas.exemple.test",
            "https://repas.exemple.test.invalide.test",
            "https://sous.repas.exemple.test",
            "https://repas.exemple.test/page",
            "https://www.leclercdrive.fr",
        ).forEach { assertEquals("$it", false, RepasOrigin.matches(it, origin)) }
    }

    @Test
    fun `les pages de Repas restent dans la WebView`() {
        listOf("https://repas.exemple.test/", "https://repas.exemple.test/listes/12?a=b#c", "HTTPS://Repas.Exemple.Test/x", "https://repas.exemple.test:443/")
            .forEach { assertEquals(it, Decision.ALLOW, navigation.decide(it)) }
    }

    @Test
    fun `une autre page web s'ouvre dans le navigateur du telephone`() {
        listOf(
            "https://autre.exemple.test/",
            "http://repas.exemple.test/",
            "https://repas.exemple.test.invalide.test/",
            "https://sous.repas.exemple.test/",
            "https://repas.exemple.test:8443/",
            "https://nom@repas.exemple.test/",
            "https://repas.exemple.test\\@invalide.test/",
        ).forEach { assertEquals(it, Decision.OPEN_EXTERNALLY, navigation.decide(it)) }
    }

    @Test
    fun `aucun lien vers le drive ne s'ouvre dans la WebView de Repas`() {
        listOf("https://www.leclercdrive.fr/", "https://fd0-courses.leclercdrive.fr/magasin-000000-000000/", "https://leclercdrive.fr/")
            .forEach { assertEquals(it, Decision.OPEN_EXTERNALLY, navigation.decide(it)) }
    }

    @Test
    fun `les autres types d'adresse sont ignores`() {
        listOf(null, "", "javascript:alert(1)", "intent://x#Intent;end", "file:///data/x", "tel:0102030405", "mailto:a@exemple.test", "data:text/html,x")
            .forEach { assertEquals("$it", Decision.BLOCK, navigation.decide(it)) }
    }

    @Test
    fun `un schema qui n'est https qu'une fois mis en majuscules par Unicode n'est pas https`() {
        // « \u017F » (s long) devient « S » en majuscule : http\u017F://hote ne doit pas rester dans la coquille.
        listOf("http\u017F://repas.exemple.test/", "http\u017F://autre.exemple.test/").forEach {
            assertEquals(it, Decision.BLOCK, navigation.decide(it))
            assertNull(it, navigation.entryUrl(it))
        }
    }

    @Test
    fun `un lien entrant n'est repris que s'il est de l'origine de Repas`() {
        assertEquals("https://repas.exemple.test/confirmation-email?token=x", navigation.entryUrl("https://repas.exemple.test/confirmation-email?token=x"))
        assertNull(navigation.entryUrl("https://autre.exemple.test/"))
        assertNull(navigation.entryUrl("javascript:alert(1)"))
        assertNull(navigation.entryUrl(null))
    }
}

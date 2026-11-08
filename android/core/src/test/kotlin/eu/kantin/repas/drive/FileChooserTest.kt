package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le sélecteur de fichiers de la coquille : quoi ouvrir, quoi rendre à la page, une demande à la fois, toujours une réponse. */
class FileChooserTest {
    private val png = "image/png"
    private val webp = "image/webp"
    private val svg = "image/svg+xml"
    private val everything = listOf(png, webp, svg)
    private val own = "eu.kantin.repas.drive"

    private fun types(plan: FileChooserPlan) = (plan as FileChooserPlan.Pick).mimeTypes

    // ----- Les types demandés par la page -----

    @Test
    fun `le champ d'image de l'administrateur ouvre un selecteur limite aux trois formats`() {
        // Ce qu'Android rend pour accept="image/png,image/webp,image/svg+xml" : un élément par type.
        assertEquals(everything, types(FileChooserRules.plan(listOf(png, webp, svg), FileChooserRules.MODE_OPEN)))
        // Ou une seule chaîne avec des virgules.
        assertEquals(everything, types(FileChooserRules.plan(listOf("image/png,image/webp,image/svg+xml"), FileChooserRules.MODE_OPEN)))
    }

    @Test
    fun `les jokers et les extensions se ramenent aux seuls formats permis, dans l'ordre fixe`() {
        assertEquals(everything, types(FileChooserRules.plan(listOf("image/*"), FileChooserRules.MODE_OPEN)))
        assertEquals(listOf(webp, svg), types(FileChooserRules.plan(listOf(".SVG", " .webp "), FileChooserRules.MODE_OPEN)))
        assertEquals(listOf(png), types(FileChooserRules.plan(listOf("IMAGE/PNG", "image/png"), FileChooserRules.MODE_OPEN)))
    }

    @Test
    fun `un format non permis est laisse de cote, et sans aucun format permis rien ne s'ouvre`() {
        assertEquals(listOf(png), types(FileChooserRules.plan(listOf("image/jpeg", png, ".pdf"), FileChooserRules.MODE_OPEN)))
        listOf(
            listOf("image/jpeg"),
            listOf(".jpg", ".pdf"),
            listOf("application/pdf"),
            listOf("*/*"),
            listOf("video/*"),
            listOf("image/"),
            listOf(""),
            emptyList(),
        ).forEach { assertEquals("$it", FileChooserPlan.Refuse, FileChooserRules.plan(it, FileChooserRules.MODE_OPEN)) }
        assertEquals(FileChooserPlan.Refuse, FileChooserRules.plan(null, FileChooserRules.MODE_OPEN))
    }

    @Test
    fun `seul le mode un fichier ouvre le selecteur`() {
        // FileChooserParams : MODE_OPEN 0, MODE_OPEN_MULTIPLE 1, MODE_SAVE 3.
        listOf(1, 2, 3, -1).forEach { assertEquals("$it", FileChooserPlan.Refuse, FileChooserRules.plan(everything, it)) }
    }

    // ----- Ce que le selecteur rend -----

    @Test
    fun `l'annulation et l'absence de resultat rendent aucun fichier`() {
        assertNull(FileChooserRules.choice(null, own))
        assertNull(FileChooserRules.choice(emptyList(), own))
        assertNull(FileChooserRules.choice(listOf(""), own))
    }

    @Test
    fun `une adresse content est rendue telle quelle`() {
        val uri = "content://com.exemple.documents/document/image%3A42"
        assertEquals(uri, FileChooserRules.choice(listOf(uri), own))
        assertEquals("content://media/picker/0/com.exemple.photopicker/media/42", FileChooserRules.choice(listOf("content://media/picker/0/com.exemple.photopicker/media/42"), own))
        assertEquals("CONTENT://media/x", FileChooserRules.choice(listOf("CONTENT://media/x"), own))
    }

    @Test
    fun `un seul fichier est demande, plusieurs ne sont jamais rendus`() {
        val a = "content://media/1"
        val b = "content://media/2"
        assertNull(FileChooserRules.choice(listOf(a, b), own))
    }

    @Test
    fun `ce qui n'est pas un content est refuse`() {
        listOf(
            "file:///data/data/eu.kantin.repas.drive/shared_prefs/x.xml",
            "file:///sdcard/image.png",
            "https://exemple.test/image.png",
            "http://exemple.test/image.png",
            "javascript:alert(1)",
            "intent://x#Intent;end",
            "/sdcard/image.png",
            "content:/media/1",
            "content://",
            "content:///media/1",
            "content://user@media/1",
            "content://media:80/1",
        ).forEach { assertNull(it, FileChooserRules.choice(listOf(it), own)) }
    }

    @Test
    fun `un fournisseur de l'application elle-meme est refuse`() {
        listOf(
            "content://eu.kantin.repas.drive/x",
            "content://eu.kantin.repas.drive.updates/update/repas.apk",
            "content://EU.KANTIN.REPAS.DRIVE.fileprovider/x",
            "content://eu.kantin.repas.drive?x=1",
        ).forEach { assertNull(it, FileChooserRules.choice(listOf(it), own)) }
        // Un autre paquet dont le nom commence pareil n'est pas le nôtre.
        assertEquals("content://eu.kantin.repas.drivetwo/x", FileChooserRules.choice(listOf("content://eu.kantin.repas.drivetwo/x"), own))
    }

    // ----- Une demande à la fois, toujours une réponse -----

    @Test
    fun `une demande unique recoit sa reponse une seule fois`() {
        val choice = PendingFileChoice<String>()
        assertFalse(choice.isWaiting)
        val started = choice.begin("a")
        assertNull(started.replaced)
        assertTrue(choice.isWaiting)
        assertTrue(choice.owns(started.requestCode))
        assertEquals("a", choice.take(started.requestCode))
        assertFalse(choice.isWaiting)
        assertNull(choice.take(started.requestCode))
    }

    @Test
    fun `une seconde demande annule la premiere, qui doit etre fermee`() {
        val choice = PendingFileChoice<String>()
        val first = choice.begin("a")
        val second = choice.begin("b")
        assertEquals("a", second.replaced)
        assertEquals(first.requestCode, second.replacedRequestCode)
        assertNull(first.replacedRequestCode)
        assertNotEquals(first.requestCode, second.requestCode)
        // Le résultat du premier sélecteur (fermé) arrive après : il ne répond pas à la seconde demande.
        assertNull(choice.take(first.requestCode))
        assertTrue(choice.isWaiting)
        assertEquals("b", choice.take(second.requestCode))
        assertFalse(choice.isWaiting)
    }

    @Test
    fun `abandonner rend la demande en cours, une fois`() {
        val choice = PendingFileChoice<String>()
        assertNull(choice.abandon())
        val started = choice.begin("a")
        assertEquals("a", choice.abandon())
        assertNull(choice.abandon())
        assertNull(choice.take(started.requestCode))
    }

    @Test
    fun `les numeros de demande ne rencontrent pas ceux de la mise a jour et reviennent apres un tour`() {
        val choice = PendingFileChoice<Any>()
        val codes = (1..PendingFileChoice.WINDOW * 2).map { choice.begin(Any()).requestCode }
        val installRequest = 0x7e01
        assertFalse(choice.owns(installRequest))
        assertTrue(codes.all(choice::owns))
        assertEquals(PendingFileChoice.WINDOW, codes.toSet().size)
        assertFalse(choice.owns(PendingFileChoice.FIRST_REQUEST_CODE - 1))
        assertFalse(choice.owns(PendingFileChoice.FIRST_REQUEST_CODE + PendingFileChoice.WINDOW))
    }

    @Test
    fun `la reponse rendue est bien l'objet de la demande`() {
        val callback = Any()
        val choice = PendingFileChoice<Any>()
        val started = choice.begin(callback)
        assertSame(callback, choice.take(started.requestCode))
    }
}

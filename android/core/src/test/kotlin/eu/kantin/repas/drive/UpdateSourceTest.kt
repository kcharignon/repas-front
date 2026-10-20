package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Les seules adresses de la mise à jour (DRV-639) : celles du code, et les redirections permises. Adresses SYNTHÉTIQUES sauf les deux constantes. */
class UpdateSourceTest {
    private val cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/1419838527/c4bdb0b4-e862-4687-980d-539e019df762" +
        "?sp=r&sv=2018-11-09&sr=b&spr=https&se=2026-10-20T13%3A48%3A36Z&rscd=attachment%3B+filename%3Dversion.json&sig=Ik9hcSbS1kVn2MzHQhReCI8TvrngMdGer05%2BLdvlfH0%3D" +
        "&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIn0.PBRlYARlysEwMxbEwAP1K-rOuQQA_hoJY7c6uGkQTBM"

    @Test
    fun `les deux adresses fixes sont celles de la release roulante`() {
        assertEquals("https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json", UpdateSource.VERSION_JSON_URL)
        assertEquals("https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk", UpdateSource.INSTALL_APK_URL)
    }

    @Test
    fun `les adresses fixes sont acceptees comme premieres demandes`() {
        assertTrue(UpdateSource.isReleaseFile(UpdateSource.VERSION_JSON_URL))
        assertTrue(UpdateSource.isReleaseFile(UpdateSource.INSTALL_APK_URL))
    }

    @Test
    fun `l'APK d'une version est celui de sa release, calcule du nom de version`() {
        assertEquals("https://github.com/kcharignon/repas-front/releases/download/android-v0.1.30/repas-drive.apk", UpdateSource.apkUrl("0.1.30"))
        assertTrue(UpdateSource.isReleaseFile(UpdateSource.apkUrl("12.3.45")!!))
    }

    @Test
    fun `un nom de version qui n'en est pas un ne donne aucune adresse`() {
        listOf("", "0.1", "0.1.30/../../x", "0.1.30?x=1", "01.2.3", "1.2.3.4", "../1.2.3", "1.2.3 ", "2100.0.0", "0.0.0", "a.b.c").forEach {
            assertNull(it, UpdateSource.apkUrl(it))
        }
    }

    @Test
    fun `une premiere demande ailleurs que sur un fichier de release du depot est refusee`() {
        listOf(
            "http://github.com/kcharignon/repas-front/releases/download/android-latest/version.json",
            "https://github.com/autre/repas-front/releases/download/android-latest/version.json",
            "https://github.com/kcharignon/autre/releases/download/android-latest/version.json",
            "https://github.com/kcharignon/repas-front/releases/download/v0.5.22/version.json",
            "https://github.com/kcharignon/repas-front/releases/download/android-dev-2026-10-18/repas-drive.apk",
            "https://github.com/kcharignon/repas-front/releases/download/android-latest/autre.apk",
            "https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json?x=1",
            "https://github.com:443/kcharignon/repas-front/releases/download/android-latest/version.json",
            "https://user@github.com/kcharignon/repas-front/releases/download/android-latest/version.json",
            "https://github.com.evil.test/kcharignon/repas-front/releases/download/android-latest/version.json",
            "https://github.com/kcharignon/repas-front/releases/download/android-latest/../../../../x/version.json",
            "https://GitHub.com/kcharignon/repas-front/releases/download/android-latest/version.json",
            " https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json",
            "",
        ).forEach { assertFalse(it, UpdateSource.isReleaseFile(it)) }
    }

    @Test
    fun `la redirection vers l'hote des pieces jointes de GitHub est suivie`() {
        assertTrue(UpdateSource.isTrustedRedirect(cdn))
        UpdateSource.DOWNLOAD_HOSTS.forEach { assertTrue(it, UpdateSource.isTrustedRedirect("https://$it/chemin/fichier?sig=abc%2B")) }
    }

    @Test
    fun `une redirection vers un fichier de release du depot est suivie`() {
        assertTrue(UpdateSource.isTrustedRedirect(UpdateSource.apkUrl("0.1.30")))
    }

    @Test
    fun `la liste des hotes est fermee`() {
        assertEquals(
            setOf("release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"),
            UpdateSource.DOWNLOAD_HOSTS,
        )
    }

    @Test
    fun `une redirection hors de la liste est refusee`() {
        listOf(
            null,
            "",
            // d'un autre hôte
            "https://evil.example/fichier.apk",
            "https://githubusercontent.com/x",
            "https://raw.githubusercontent.com/kcharignon/repas-front/main/x.apk",
            "https://avatars.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com.evil.example/x",
            "https://evil.example/release-assets.githubusercontent.com/x",
            "https://notrelease-assets.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com./x",
            // un identifiant devant l'hôte (confusion d'hôte), un port, une barre oblique inverse
            "https://release-assets.githubusercontent.com@evil.example/x",
            "https://release-assets.githubusercontent.com:evil@evil.example/x",
            "https://evil.example\\@release-assets.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com:8443/x",
            "https://release-assets.githubusercontent.com:443/x",
            "https://release-assets.githubusercontent.com\\x",
            // pas https, relatif, autre schéma
            "http://release-assets.githubusercontent.com/x",
            "//release-assets.githubusercontent.com/x",
            "/github-production-release-asset/x",
            "x/y",
            "ftp://release-assets.githubusercontent.com/x",
            "file:///data/data/x",
            "content://x",
            "javascript:alert(1)",
            "data:text/html,x",
            // casse, espace, caractères inattendus, fragment
            "HTTPS://release-assets.githubusercontent.com/x",
            "https://Release-Assets.githubusercontent.com/x",
            " https://release-assets.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com/x y",
            "https://release-assets.githubusercontent.com/x\n",
            "https://release-assets.githubusercontent.com/é",
            "https://release-assets.githubusercontent.com/x#a",
            "https://release-assets.githubusercontent.com/x?a=<b>",
            // un fichier de github.com qui n'est pas une release du dépôt
            "https://github.com/kcharignon/repas-front/archive/main.zip",
            "https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json?x",
        ).forEach { assertFalse("« $it »", UpdateSource.isTrustedRedirect(it)) }
    }

    @Test
    fun `une adresse trop longue est refusee`() {
        assertFalse(UpdateSource.isTrustedRedirect("https://release-assets.githubusercontent.com/" + "a".repeat(5000)))
    }
}

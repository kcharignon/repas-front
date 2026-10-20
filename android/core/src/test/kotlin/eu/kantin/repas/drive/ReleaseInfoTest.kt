package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** `version.json` et la règle « seule une version strictement plus récente est proposée » (DRV-639). */
class ReleaseInfoTest {
    private val sha = "3af172fb7111efc2db74479a9571c3bdab2e9a84dd933109eeea41ca05ae4e21"

    @Test
    fun `le fichier publie par le workflow est lu`() {
        val text = """
            {
              "versionName": "0.1.26",
              "versionCode": 1026,
              "apkUrl": "https://github.com/kcharignon/repas-front/releases/download/android-v0.1.26/repas-drive.apk",
              "sha256": "$sha",
              "minAndroid": 26
            }
        """.trimIndent()

        val info = ReleaseInfo.parse(text)!!

        assertEquals("0.1.26", info.versionName)
        assertEquals(1026L, info.versionCode)
        assertEquals(sha, info.sha256)
        assertEquals(26, info.minAndroid)
    }

    @Test
    fun `l'adresse de l'APK du fichier est ignoree`() {
        // apkUrl n'est pas un champ de ReleaseInfo : une adresse hostile n'a nulle part où aller, l'adresse vient de UpdateSource.apkUrl(nom).
        val hostile = """{"versionName":"0.1.30","versionCode":1030,"apkUrl":"https://evil.example/x.apk","sha256":"$sha","minAndroid":26}"""

        val info = ReleaseInfo.parse(hostile)!!

        assertEquals("https://github.com/kcharignon/repas-front/releases/download/android-v0.1.30/repas-drive.apk", UpdateSource.apkUrl(info.versionName))
    }

    @Test
    fun `le code se calcule comme la construction`() {
        assertEquals(1_002_003L, ReleaseInfo.codeOf("1.2.3"))
        assertEquals(1026L, ReleaseInfo.codeOf("0.1.26"))
        assertEquals(2_099_999_999L, ReleaseInfo.codeOf("2099.999.999"))
        assertEquals(1L, ReleaseInfo.codeOf("0.0.1"))
        assertNull(ReleaseInfo.codeOf("0.0.0"))
        assertNull(ReleaseInfo.codeOf("2100.0.0"))
        assertNull(ReleaseInfo.codeOf("1.1000.0"))
    }

    @Test
    fun `un code qui contredit le nom est refuse`() {
        assertNull(ReleaseInfo.parse(versionJson("0.1.30", code = 1031)))
        assertNull(ReleaseInfo.parse(versionJson("0.1.30", code = 99)))
    }

    @Test
    fun `un fichier mal forme est refuse en entier`() {
        listOf(
            null,
            "",
            "pas du json",
            "[]",
            "\"texte\"",
            "{}",
            // nom
            """{"versionName":"0.1","versionCode":1,"sha256":"$sha"}""",
            """{"versionName":"v0.1.30","versionCode":1030,"sha256":"$sha"}""",
            """{"versionName":"0.1.30-dev","versionCode":1030,"sha256":"$sha"}""",
            """{"versionName":130,"versionCode":1030,"sha256":"$sha"}""",
            """{"versionName":null,"versionCode":1030,"sha256":"$sha"}""",
            // code
            """{"versionName":"0.1.30","versionCode":"1030","sha256":"$sha"}""",
            """{"versionName":"0.1.30","versionCode":1030.0,"sha256":"$sha"}""",
            """{"versionName":"0.1.30","versionCode":null,"sha256":"$sha"}""",
            """{"versionName":"0.1.30","sha256":"$sha"}""",
            // empreinte
            """{"versionName":"0.1.30","versionCode":1030}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"${sha.uppercase()}"}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"${sha.take(63)}"}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"${sha}0"}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"${"g".repeat(64)}"}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":12}""",
            // version d'Android
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha","minAndroid":"26"}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha","minAndroid":25}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha","minAndroid":null}""",
            """{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha","minAndroid":1000}""",
        ).forEach { assertNull("« $it »", ReleaseInfo.parse(it)) }
    }

    @Test
    fun `sans minAndroid c'est le plancher de l'application`() {
        assertEquals(26, ReleaseInfo.parse("""{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha"}""")!!.minAndroid)
    }

    @Test
    fun `seule une version strictement plus recente est proposee`() {
        val info = ReleaseInfo.parse(versionJson("0.1.30", sha256 = sha))!!

        assertTrue(info.isNewerThan(1029))
        assertTrue(info.isNewerThan(1))
        assertFalse("la même version", info.isNewerThan(1030))
        assertFalse("une version plus récente est déjà installée", info.isNewerThan(1031))
        assertFalse(info.isNewerThan(Long.MAX_VALUE))
    }

    @Test
    fun `la comparaison est numerique, pas alphabetique`() {
        val ten = ReleaseInfo.parse(versionJson("0.1.10", sha256 = sha))!!
        val nine = ReleaseInfo.codeOf("0.1.9")!!

        assertTrue(ten.isNewerThan(nine))
    }

    @Test
    fun `une version d'Android trop ancienne ne peut pas l'installer`() {
        val info = ReleaseInfo.parse("""{"versionName":"0.1.30","versionCode":1030,"sha256":"$sha","minAndroid":34}""")!!

        assertFalse(info.canInstallOn(33))
        assertTrue(info.canInstallOn(34))
        assertTrue(info.canInstallOn(36))
    }
}

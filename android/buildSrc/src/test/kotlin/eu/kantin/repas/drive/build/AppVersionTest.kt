package eu.kantin.repas.drive.build

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** La dérivation de la version. Étiquettes et compteurs SYNTHÉTIQUES. */
class AppVersionTest {
    @Test
    fun `le nom vient de l'etiquette et le code du compteur quand il est donne`() {
        assertEquals(AppVersion("1.2.3", 42), AppVersion.derive("android-v1.2.3", "42"))
        assertEquals(AppVersion("0.1.0", 7), AppVersion.derive("android-v0.1.0", "7"))
        assertEquals(AppVersion("10.20.30", 2_100_000_000), AppVersion.derive("android-v10.20.30", "2100000000"))
    }

    @Test
    fun `sans compteur, le code vient de l'etiquette`() {
        assertEquals(AppVersion("1.2.3", 1_002_003), AppVersion.derive("android-v1.2.3", null))
        assertEquals(AppVersion("0.1.0", 1_000), AppVersion.derive("android-v0.1.0", null))
        assertEquals(AppVersion("0.0.1", 1), AppVersion.derive("android-v0.0.1", null))
        assertEquals(AppVersion("10.20.30", 10_020_030), AppVersion.derive("android-v10.20.30", ""))
        assertEquals(AppVersion("2099.999.999", 2_099_999_999), AppVersion.derive("android-v2099.999.999", null))
    }

    @Test
    fun `sans etiquette ni compteur, la version est celle de developpement`() {
        assertEquals(AppVersion("0.0.0-dev", 1), AppVersion.derive(null, null))
        assertEquals(AppVersion("0.0.0-dev", 1), AppVersion.derive("", "  "))
    }

    @Test
    fun `l'etiquette et le compteur sont independants`() {
        assertEquals(AppVersion("0.0.0-dev", 9), AppVersion.derive(null, "9"))
        assertEquals(AppVersion("2.0.1", 2_000_001), AppVersion.derive("android-v2.0.1", null))
    }

    @Test
    fun `les espaces autour des valeurs sont ignores`() {
        assertEquals(AppVersion("1.2.3", 5), AppVersion.derive(" android-v1.2.3\n", " 5 "))
    }

    @Test
    fun `une etiquette qui n'a pas la forme android-vX_Y_Z est refusee`() {
        val refused = listOf(
            "v1.2.3",
            "1.2.3",
            "android-1.2.3",
            "android-v1.2",
            "android-v1.2.3.4",
            "android-v1.2.3-rc1",
            "android-v1.2.3+build",
            "android-v01.2.3",
            "android-v1.02.3",
            "android-v1.2.x",
            "android-v-1.2.3",
            "android-v12345.0.0",
            "android-v1.1000.0",
            "android-v1.0.1000",
            "refs/tags/android-v1.2.3",
            "android-V1.2.3",
            "Android-v1.2.3",
            "android-v1.2.3 ; rm -rf /",
            "android-v",
        )
        refused.forEach {
            val error = assertThrows("devrait etre refusee : $it", IllegalArgumentException::class.java) { AppVersion.derive(it, "1") }
            assertTrue(error.message!!.contains("android-vX.Y.Z"))
        }
    }

    @Test
    fun `un compteur qui n'est pas un entier de 1 a 2 100 000 000 est refuse`() {
        val refused = listOf("0", "-1", "01", "1.5", "abc", "1e3", "2100000001", "99999999999", "1 2", "+3")
        refused.forEach {
            val error = assertThrows("devrait etre refuse : $it", IllegalArgumentException::class.java) { AppVersion.derive("android-v1.0.0", it) }
            assertTrue(error.message!!.contains("Compteur de version invalide"))
        }
    }

    @Test
    fun `une valeur invalide est refusee meme hors publication`() {
        assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("n'importe quoi", null) }
        assertThrows(IllegalArgumentException::class.java) { AppVersion.derive(null, "n'importe quoi") }
    }

    fun `une publication exige l'etiquette et en tire le code`() {
        assertEquals(AppVersion("1.0.0", 1_000_000), AppVersion.derive("android-v1.0.0", null, forRelease = true))
        assertEquals(AppVersion("0.1.0", 1_000), AppVersion.derive("android-v0.1.0", "", forRelease = true))

        val withoutTag = assertThrows(IllegalArgumentException::class.java) { AppVersion.derive(null, null, forRelease = true) }
        assertTrue(withoutTag.message!!.contains("ANDROID_VERSION_TAG"))
        assertThrows(IllegalArgumentException::class.java) { AppVersion.derive(null, "3", forRelease = true) }
        assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("", "", forRelease = true) }
    }

    @Test
    fun `un compteur donne en plus d'une publication doit etre celui de l'etiquette`() {
        assertEquals(AppVersion("1.2.3", 1_002_003), AppVersion.derive("android-v1.2.3", "1002003", forRelease = true))

        val contradicts = assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("android-v1.2.3", "42", forRelease = true) }
        assertTrue(contradicts.message!!.contains("contredit"))
        assertTrue(contradicts.message!!.contains("1002003"))
    }

    @Test
    fun `le code d'une etiquette monte avec le numero de version`() {
        val tags = listOf("0.0.1", "0.0.2", "0.0.10", "0.1.0", "0.9.0", "0.10.0", "1.0.0", "1.9.0", "1.10.0", "2.0.0", "10.0.0")
        val codes = tags.map { AppVersion.derive("android-v$it", null).code }
        assertEquals(codes.sorted(), codes)
        assertEquals(codes.size, codes.toSet().size)
    }

    @Test
    fun `une etiquette qui donnerait un code hors limites est refusee`() {
        val zero = assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("android-v0.0.0", null) }
        assertTrue(zero.message!!.contains("android-v0.0.1"))
        val tooBig = assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("android-v2100.0.0", null) }
        assertTrue(tooBig.message!!.contains("2099"))
        // Avec un compteur explicite (constructions de debogage), l'etiquette ne donne que le nom.
        assertEquals(AppVersion("0.0.0", 5), AppVersion.derive("android-v0.0.0", "5"))
        assertThrows(IllegalArgumentException::class.java) { AppVersion.derive("android-v0.0.0", "5", forRelease = true) }
    }

    @Test
    fun `un compteur de debogage monte avec le compteur, jamais avec le nom`() {
        val older = AppVersion.derive("android-v1.10.0", "5")
        val newer = AppVersion.derive("android-v1.9.0", "6")
        assertTrue(newer.code > older.code)
    }

    @Test
    fun `l'empreinte du commit est raccourcie a 7 caracteres`() {
        assertEquals("0123abc", AppVersion.shortCommit("0123abcdef0123456789abcdef0123456789abcd"))
        assertEquals("0123abc", AppVersion.shortCommit("0123abc"))
    }

    @Test
    fun `sans commit, ou hors CI, la construction est dite locale`() {
        assertEquals("local", AppVersion.shortCommit(null))
        assertEquals("local", AppVersion.shortCommit(" "))
        assertEquals("local", AppVersion.shortCommit("local"))
    }

    @Test
    fun `une valeur qui n'est pas une empreinte Git est refusee`() {
        listOf("zzzzzzz", "0123ab", "0123ABC", "0123abc<", "0123abc\"x", "0123abc&amp;").forEach {
            assertThrows("devrait etre refusee : $it", IllegalArgumentException::class.java) { AppVersion.shortCommit(it) }
        }
    }
}

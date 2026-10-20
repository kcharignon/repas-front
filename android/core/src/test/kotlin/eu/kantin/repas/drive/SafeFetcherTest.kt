package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Le téléchargement à travers les règles d'adresses : redirections jugées une à une, taille bornée, annulation (DRV-639). Faux serveur, aucun réseau. */
class SafeFetcherTest {
    private val json = UpdateSource.VERSION_JSON_URL
    private val apk = UpdateSource.apkUrl("0.1.30")!!
    private val cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sig=x%2B&jwt=a.b-c_d"

    private class Sink : ByteSink {
        var size = 0L
        override fun write(buffer: ByteArray, length: Int) {
            size += length
        }
    }

    private fun failureOf(block: () -> Unit): UpdateError {
        try {
            block()
        } catch (failure: UpdateFailure) {
            return failure.error
        }
        fail("une UpdateFailure était attendue")
        throw AssertionError()
    }

    @Test
    fun `lit un texte en suivant la redirection vers l'hote des pieces jointes`() {
        val hop = FakeHop().redirect(json, cdn).text(cdn, """{"a":"é"}""")

        assertEquals("""{"a":"é"}""", SafeFetcher(hop).fetchText(json, 1024))
        assertEquals(listOf(json, cdn), hop.requested)
        assertTrue("les corps sont tous fermés", hop.bodies.all { it.closed })
    }

    @Test
    fun `telecharge un fichier et rend la progression`() {
        val hop = FakeHop().redirect(apk, cdn, 307).body(cdn, FAKE_APK)
        val sink = Sink()
        val progress = mutableListOf<Long>()

        SafeFetcher(hop).download(apk, UpdateSource.MAX_APK_BYTES, sink, { received, total ->
            progress += received
            assertEquals(FAKE_APK.size.toLong(), total)
        })

        assertEquals(FAKE_APK.size.toLong(), sink.size)
        assertEquals(FAKE_APK.size.toLong(), progress.last())
        assertTrue(progress.zipWithNext().all { (a, b) -> b > a })
    }

    @Test
    fun `chaque code de redirection permis est suivi`() {
        listOf(301, 302, 303, 307, 308).forEach { status ->
            val hop = FakeHop().redirect(json, cdn, status).text(cdn, "{}")
            assertEquals("{}", SafeFetcher(hop).fetchText(json, 1024))
        }
    }

    @Test
    fun `une premiere adresse hors du depot n'est meme pas demandee`() {
        val hop = FakeHop()

        assertEquals(UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText("https://evil.example/version.json", 1024) })
        assertEquals(UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText("http://github.com/kcharignon/repas-front/releases/download/android-latest/version.json", 1024) })
        assertTrue(hop.requested.isEmpty())
    }

    @Test
    fun `une redirection vers un hote tiers est refusee et jamais demandee`() {
        listOf(
            "https://evil.example/x.apk",
            "http://release-assets.githubusercontent.com/x",
            "https://release-assets.githubusercontent.com@evil.example/x",
            "/relatif/x",
            "https://github.com/autre/depot/releases/download/android-latest/version.json",
        ).forEach { target ->
            val hop = FakeHop().redirect(json, target).text(target, "pas ça")

            assertEquals(target, UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
            assertEquals("seule la première adresse est demandée : $target", listOf(json), hop.requested)
            assertTrue(hop.bodies.all { it.closed })
        }
    }

    @Test
    fun `une redirection sans adresse est refusee`() {
        val hop = FakeHop().redirect(json, null)

        assertEquals(UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
    }

    @Test
    fun `une redirection depuis l'hote des pieces jointes vers un tiers est refusee aussi`() {
        val hop = FakeHop().redirect(json, cdn).redirect(cdn, "https://evil.example/x").text("https://evil.example/x", "{}")

        assertEquals(UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
        assertFalse(hop.requested.contains("https://evil.example/x"))
    }

    @Test
    fun `une boucle de redirections s'arrete`() {
        val hop = FakeHop().redirect(json, cdn).redirect(cdn, cdn)

        assertEquals(UpdateError.UNTRUSTED_ADDRESS, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
        assertEquals(1 + UpdateSource.MAX_REDIRECTS, hop.requested.size)
    }

    @Test
    fun `un code autre que 200 est un echec du telechargement`() {
        listOf(204, 304, 400, 403, 404, 429, 500, 503).forEach { status ->
            val hop = FakeHop().status(json, status)

            assertEquals("$status", UpdateError.DOWNLOAD_FAILED, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
            assertTrue(hop.bodies.all { it.closed })
        }
    }

    @Test
    fun `hors connexion le port le dit`() {
        val hop = FakeHop().offline(json)

        assertEquals(UpdateError.OFFLINE, failureOf { SafeFetcher(hop).fetchText(json, 1024) })
    }

    @Test
    fun `un fichier annonce plus gros que la borne est refuse avant d'etre lu`() {
        val hop = FakeHop().body(apk, FAKE_APK, announced = UpdateSource.MAX_APK_BYTES + 1)
        val sink = Sink()

        assertEquals(UpdateError.TOO_LARGE, failureOf { SafeFetcher(hop).download(apk, UpdateSource.MAX_APK_BYTES, sink, { _, _ -> }) })
        assertEquals(0L, sink.size)
        assertTrue(hop.bodies.all { it.closed })
    }

    @Test
    fun `un fichier qui depasse la borne sans l'annoncer est coupe a la reception`() {
        val hop = FakeHop().body(apk, FAKE_APK, announced = null)
        val sink = Sink()

        assertEquals(UpdateError.TOO_LARGE, failureOf { SafeFetcher(hop).download(apk, 10_000, sink, { _, _ -> }) })
        assertTrue("on n'a pas tout reçu : ${sink.size}", sink.size <= 10_000)
        assertTrue(hop.bodies.all { it.closed })
    }

    @Test
    fun `une annonce menteuse trop courte ou une coupure en route est un echec`() {
        val truncated = FakeHop().body(apk, FAKE_APK, announced = FAKE_APK.size.toLong() + 10)
        assertEquals(UpdateError.DOWNLOAD_FAILED, failureOf { SafeFetcher(truncated).download(apk, UpdateSource.MAX_APK_BYTES, Sink(), { _, _ -> }) })

        val cut = FakeHop().body(apk, FAKE_APK, failAfter = 9_000)
        assertEquals(UpdateError.DOWNLOAD_FAILED, failureOf { SafeFetcher(cut).download(apk, UpdateSource.MAX_APK_BYTES, Sink(), { _, _ -> }) })
    }

    @Test
    fun `un texte trop long est refuse`() {
        val hop = FakeHop().text(json, "x".repeat(UpdateSource.MAX_VERSION_JSON_BYTES + 1))

        assertEquals(UpdateError.TOO_LARGE, failureOf { SafeFetcher(hop).fetchText(json, UpdateSource.MAX_VERSION_JSON_BYTES) })
    }

    @Test
    fun `une annulation arrete la lecture et ferme la connexion`() {
        val hop = FakeHop().body(apk, FAKE_APK)
        var reads = 0

        val error = failureOf {
            SafeFetcher(hop).download(apk, UpdateSource.MAX_APK_BYTES, Sink(), { _, _ -> reads++ }, isCancelled = { reads >= 2 })
        }

        assertEquals(UpdateError.CANCELLED, error)
        assertEquals(2, reads)
        assertTrue(hop.bodies.all { it.closed })
    }

    @Test
    fun `une annulation avant la premiere demande ne contacte personne`() {
        val hop = FakeHop().body(apk, FAKE_APK)

        assertEquals(UpdateError.CANCELLED, failureOf { SafeFetcher(hop).download(apk, UpdateSource.MAX_APK_BYTES, Sink(), { _, _ -> }, isCancelled = { true }) })
        assertTrue(hop.requested.isEmpty())
    }
}

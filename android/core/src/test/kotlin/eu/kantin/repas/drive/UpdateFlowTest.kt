package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** La mise à jour pas à pas : chercher, proposer, télécharger, vérifier, effacer (DRV-639). Faux serveur, faux dossier, aucun Android. */
class UpdateFlowTest {
    private val installedCode = ReleaseInfo.codeOf("0.1.26")!!
    private val apk = UpdateSource.apkUrl("0.1.30")!!
    private val cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sig=x"

    private val hop = FakeHop()
    private val storage = FakeStorage()
    private val platform = FakePlatform()
    private val states = mutableListOf<UpdateState>()
    private val flow = UpdateFlow(SafeFetcher(hop), storage, platform, InstalledApp(installedCode, sdkInt = 34)) { states += it }

    private fun publishRelease(name: String = "0.1.30", sha: String = FAKE_APK_SHA256) {
        hop.redirect(UpdateSource.VERSION_JSON_URL, cdn + "&f=version").text(cdn + "&f=version", versionJson(name, sha256 = sha))
    }

    private fun serveApk(bytes: ByteArray = FAKE_APK, announced: Long? = bytes.size.toLong(), failAfter: Int? = null) {
        hop.redirect(apk, cdn).body(cdn, bytes, announced, failAfter)
    }

    private fun available(): UpdateFlow {
        publishRelease()
        flow.check()
        assertEquals(UpdateState.Available("0.1.30"), flow.state)
        return flow
    }

    // —— chercher ————————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `une version plus recente est proposee`() {
        publishRelease()

        flow.check()

        assertEquals(listOf(UpdateState.Checking, UpdateState.Available("0.1.30")), states)
    }

    @Test
    fun `la meme version ou une plus ancienne n'est pas proposee`() {
        listOf("0.1.26", "0.1.25", "0.0.9").forEach {
            states.clear()
            publishRelease(it)

            flow.check()

            assertEquals(it, UpdateState.UpToDate, flow.state)
            assertEquals(StartGate.NOTHING_TO_DO, flow.gate())
        }
    }

    @Test
    fun `une version qui demande un Android plus recent n'est pas proposee`() {
        hop.text(UpdateSource.VERSION_JSON_URL, """{"versionName":"0.1.30","versionCode":1030,"sha256":"$FAKE_APK_SHA256","minAndroid":35}""")

        flow.check()

        assertEquals(UpdateState.UpToDate, flow.state)
    }

    @Test
    fun `hors connexion une phrase suffit et rien d'autre ne bouge`() {
        hop.offline(UpdateSource.VERSION_JSON_URL)

        flow.check()

        assertEquals(UpdateState.Failed(UpdateError.OFFLINE, null), flow.state)
        assertFalse(storage.present)
        assertEquals(listOf(UpdateState.Checking, UpdateState.Failed(UpdateError.OFFLINE, null)), states)
    }

    @Test
    fun `un version json absent, illisible ou incoherent est une erreur de verification`() {
        listOf(null, "pas du json", versionJson("0.1.30", code = 1), "{}").forEach { body ->
            val server = FakeHop().also { if (body != null) it.text(UpdateSource.VERSION_JSON_URL, body) }
            val local = UpdateFlow(SafeFetcher(server), FakeStorage(), FakePlatform(), InstalledApp(installedCode, 34)) {}

            local.check()

            assertEquals("« $body »", UpdateState.Failed(UpdateError.CHECK_FAILED, null), local.state)
        }
    }

    @Test
    fun `une redirection vers un hote tiers pendant la verification est signalee`() {
        hop.redirect(UpdateSource.VERSION_JSON_URL, "https://evil.example/version.json").text("https://evil.example/version.json", versionJson())

        flow.check()

        assertEquals(UpdateState.Failed(UpdateError.UNTRUSTED_ADDRESS, null), flow.state)
        assertEquals(listOf(UpdateSource.VERSION_JSON_URL), hop.requested)
    }

    // —— télécharger et vérifier ——————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `le fichier de la bonne empreinte est pret a installer, depuis l'adresse de sa release`() {
        available()
        serveApk()

        val ready = flow.download()

        assertTrue(ready)
        assertEquals(UpdateState.Ready("0.1.30"), flow.state)
        assertTrue(storage.present)
        assertEquals("l'APK est demandé à l'adresse calculée de la version annoncée", apk, hop.requested.first { it.endsWith(".apk") })
        assertEquals(1030L, platform.checkedCode)
        assertTrue(states.any { it is UpdateState.Downloading })
        assertTrue(states.filterIsInstance<UpdateState.Downloading>().all { it.percent in 0..99 })
    }

    @Test
    fun `une mauvaise empreinte n'installe rien et le fichier est efface`() {
        publishRelease(sha = "0".repeat(64))
        flow.check()
        serveApk()

        val ready = flow.download()

        assertFalse(ready)
        assertEquals(UpdateState.Failed(UpdateError.DIGEST_MISMATCH, "0.1.30"), flow.state)
        assertFalse("le fichier est supprimé", storage.present)
        assertFalse(flow.revalidate())
    }

    @Test
    fun `un fichier modifie sur le disque apres l'ecriture est refuse et efface`() {
        available()
        serveApk()
        storage.corruptOnClose = true

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.DIGEST_MISMATCH, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `un fichier qui n'est pas une version plus recente de l'application est refuse et efface`() {
        available()
        serveApk()
        platform.packageOk = false

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.INVALID_PACKAGE, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `un fichier trop gros est abandonne et efface`() {
        available()
        serveApk(announced = UpdateSource.MAX_APK_BYTES + 1)

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.TOO_LARGE, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `une coupure en route efface le fichier a moitie recu`() {
        available()
        serveApk(failAfter = 12_000)

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.DOWNLOAD_FAILED, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `la connexion perdue au debut du telechargement le dit et ne laisse rien`() {
        available()
        hop.offline(apk)

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.OFFLINE, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `une erreur inattendue pendant l'ecriture efface aussi le fichier`() {
        available()
        serveApk()
        storage.failOnWrite = true

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.DOWNLOAD_FAILED, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `une redirection de l'APK vers un tiers est refusee et le fichier efface`() {
        available()
        hop.redirect(apk, "https://evil.example/repas-drive.apk").body("https://evil.example/repas-drive.apk", FAKE_APK)

        assertFalse(flow.download())

        assertEquals(UpdateState.Failed(UpdateError.UNTRUSTED_ADDRESS, "0.1.30"), flow.state)
        assertFalse(storage.present)
        assertFalse(hop.requested.contains("https://evil.example/repas-drive.apk"))
    }

    @Test
    fun `annuler le telechargement efface le fichier et la mise a jour reste proposee`() {
        available()
        serveApk()
        var calls = 0
        states.clear()
        // l'annulation arrive après quelques morceaux
        val ready = flow.download(isCancelled = { ++calls > 5 })

        assertFalse(ready)
        assertEquals(UpdateState.Available("0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `chaque telechargement repart d'un dossier vide`() {
        available()
        serveApk()
        val before = storage.purges

        flow.download()

        assertTrue("purgé avant d'écrire", storage.purges > before)
    }

    // —— installer ———————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `l'autorisation d'installer est demandee avant de telecharger`() {
        available()
        platform.mayInstall = false

        assertEquals(StartGate.NEEDS_PERMISSION, flow.gate())

        flow.permissionRefused()
        assertEquals(UpdateState.Failed(UpdateError.PERMISSION_DENIED, "0.1.30"), flow.state)
        assertFalse(storage.present)
        // elle accordée, on peut recommencer
        platform.mayInstall = true
        assertEquals(StartGate.GO, flow.gate())
    }

    @Test
    fun `rien a faire sans version proposee, ni pendant un telechargement`() {
        assertEquals(StartGate.NOTHING_TO_DO, flow.gate())
        assertFalse(flow.download())
        available()
        serveApk()
        flow.download()
        assertEquals(StartGate.NOTHING_TO_DO, flow.gate())
    }

    @Test
    fun `juste avant l'installateur le fichier est relu et reverifie`() {
        available()
        serveApk()
        flow.download()

        assertTrue(flow.revalidate())
        assertEquals(UpdateState.Ready("0.1.30"), flow.state)

        storage.tamper()
        assertFalse("modifié depuis la vérification", flow.revalidate())
        assertEquals(UpdateState.Failed(UpdateError.DIGEST_MISMATCH, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }

    @Test
    fun `apres l'installateur, installe ou annule, le fichier est efface`() {
        available()
        serveApk()
        flow.download()
        assertTrue(storage.present)

        flow.installerClosed()

        assertFalse("il ne reste jamais de fichier", storage.present)
        assertEquals(UpdateState.Available("0.1.30"), flow.state)
    }

    @Test
    fun `pas d'ecran d'installation, le fichier est efface`() {
        available()
        serveApk()
        flow.download()

        flow.installerUnavailable()

        assertFalse(storage.present)
        assertEquals(UpdateState.Failed(UpdateError.INSTALLER_UNAVAILABLE, "0.1.30"), flow.state)
    }

    @Test
    fun `renoncer efface le fichier`() {
        available()
        serveApk()
        flow.download()

        flow.discard()

        assertFalse(storage.present)
        assertEquals(UpdateState.Available("0.1.30"), flow.state)
    }

    @Test
    fun `rechercher pendant que le fichier est pret ne change rien`() {
        available()
        serveApk()
        flow.download()
        states.clear()

        flow.check()

        assertEquals(UpdateState.Ready("0.1.30"), flow.state)
        assertTrue(states.isEmpty())
        assertTrue(storage.present)
    }

    @Test
    fun `apres une erreur on peut recommencer`() {
        available()
        serveApk(failAfter = 5_000)
        assertFalse(flow.download())
        assertEquals(StartGate.GO, flow.gate())

        serveApk()

        assertTrue(flow.download())
        assertEquals(UpdateState.Ready("0.1.30"), flow.state)
    }

    @Test
    fun `l'empreinte de version json fait foi, pas celle d'un autre fichier`() {
        // version.json annonce l'empreinte d'un autre fichier : l'APK servi, même valide, n'est pas installé
        publishRelease(sha = UpdateIntegrity.sha256Hex(byteArrayOf(1, 2, 3)))
        flow.check()
        serveApk()

        assertFalse(flow.download())
        assertEquals(UpdateState.Failed(UpdateError.DIGEST_MISMATCH, "0.1.30"), flow.state)
        assertFalse(storage.present)
    }
}

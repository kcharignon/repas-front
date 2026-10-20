package eu.kantin.repas.drive

/** Les doubles de la mise à jour (DRV-639) : un faux HTTP, un faux dossier privé, une fausse plateforme. Tout est SYNTHÉTIQUE, aucun réseau. */

/** Un corps de réponse en mémoire ; [failAfter] coupe le flux au bout de ce nombre d'octets (réseau perdu en route). */
internal class FakeBody(private val bytes: ByteArray, private val failAfter: Int? = null) : HopBody {
    var closed = false
        private set
    private var position = 0

    override fun read(buffer: ByteArray): Int {
        if (failAfter != null && position >= failAfter) throw UpdateFailure(UpdateError.DOWNLOAD_FAILED)
        if (position >= bytes.size) return -1
        var count = minOf(buffer.size, bytes.size - position, 4096)
        if (failAfter != null) count = minOf(count, failAfter - position)
        bytes.copyInto(buffer, 0, position, position + count)
        position += count
        return count
    }

    override fun close() {
        closed = true
    }
}

/** Les réponses d'un faux serveur, adresse par adresse. L'adresse inconnue répond 404. */
internal class FakeHop : HttpHop {
    private val routes = mutableMapOf<String, () -> HopResponse>()
    val requested = mutableListOf<String>()
    val bodies = mutableListOf<FakeBody>()

    fun body(url: String, bytes: ByteArray, announced: Long? = bytes.size.toLong(), failAfter: Int? = null): FakeHop {
        routes[url] = { respond(200, null, announced ?: -1, FakeBody(bytes, failAfter)) }
        return this
    }

    fun text(url: String, text: String): FakeHop = body(url, text.toByteArray(Charsets.UTF_8))

    fun redirect(url: String, location: String?, status: Int = 302): FakeHop {
        routes[url] = { respond(status, location, 0, FakeBody(ByteArray(0))) }
        return this
    }

    fun status(url: String, status: Int): FakeHop {
        routes[url] = { respond(status, null, 0, FakeBody(ByteArray(0))) }
        return this
    }

    fun offline(url: String): FakeHop {
        routes[url] = { throw UpdateFailure(UpdateError.OFFLINE) }
        return this
    }

    private fun respond(status: Int, location: String?, length: Long, body: FakeBody): HopResponse {
        bodies += body
        return HopResponse(status, location, length, body)
    }

    override fun get(url: String): HopResponse {
        requested += url
        return (routes[url] ?: { respond(404, null, 0, FakeBody(ByteArray(0))) })()
    }
}

/** Le dossier privé : au plus un fichier. [present] dit s'il en reste un, fini ou non. */
internal class FakeStorage : UpdateStorage {
    private var data = ByteArray(0)
    var present = false
        private set
    var purges = 0
        private set
    var corruptOnClose = false
    var failOnWrite = false

    override fun purge() {
        purges++
        present = false
        data = ByteArray(0)
    }

    override fun create(): ApkWriter {
        present = true
        data = ByteArray(0)
        return object : ApkWriter {
            override fun write(buffer: ByteArray, length: Int) {
                if (failOnWrite) throw IllegalStateException("disque plein")
                data += buffer.copyOf(length)
            }

            override fun close() {
                if (corruptOnClose && data.isNotEmpty()) data[0] = (data[0] + 1).toByte()
            }
        }
    }

    override fun stagedSha256(): String? = if (present) UpdateIntegrity.sha256Hex(data) else null

    /** Pour simuler un fichier modifié après la vérification. */
    fun tamper() {
        data = data + byteArrayOf(1)
    }
}

internal class FakePlatform(var mayInstall: Boolean = true, var packageOk: Boolean = true) : UpdatePlatform {
    var checkedCode: Long? = null

    override fun maySelfInstall() = mayInstall

    override fun checkStagedPackage(expectedCode: Long): Boolean {
        checkedCode = expectedCode
        return packageOk
    }
}

internal fun versionJson(name: String = "0.1.30", code: Long? = null, sha256: String = "a".repeat(64), extra: String = ""): String {
    val resolved = code ?: ReleaseInfo.codeOf(name)!!
    return """{"versionName":"$name","versionCode":$resolved,"apkUrl":"https://github.com/kcharignon/repas-front/releases/download/android-v$name/repas-drive.apk","sha256":"$sha256","minAndroid":26$extra}"""
}

internal val FAKE_APK: ByteArray = ByteArray(50_000) { (it * 31 % 251).toByte() }
internal val FAKE_APK_SHA256: String = UpdateIntegrity.sha256Hex(FAKE_APK)

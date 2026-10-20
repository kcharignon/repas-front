package eu.kantin.repas.drive

/** Là où le téléchargement dépose ce qu'il reçoit. */
interface ByteSink {
    /** Écrit les [length] premiers octets de [buffer]. */
    fun write(buffer: ByteArray, length: Int)
}

/**
 * Le corps d'une réponse HTTP. [read] rend le nombre d'octets lus (au moins 1) ou -1 à la fin ; [close] libère la connexion. Port de
 * plateforme : sur Android, un flux d'une connexion HTTPS.
 */
interface HopBody {
    fun read(buffer: ByteArray): Int
    fun close()
}

/**
 * La réponse à UNE demande : le code HTTP, l'en-tête `Location` (redirection), la taille annoncée (-1 si inconnue) et le corps.
 * La plateforme ne suit AUCUNE redirection : c'est [SafeFetcher] qui le fait, en jugeant chaque adresse.
 */
class HopResponse(val status: Int, val location: String?, val contentLength: Long, val body: HopBody)

/**
 * Le port HTTP de la plateforme (DRV-639) : une demande `GET` en `https`, sans suivre de redirection, sans cookie ni identifiant. Un
 * problème de connexion (nom introuvable, réseau coupé, délai dépassé) est une [UpdateFailure] `OFFLINE` ; un flux coupé en route, une
 * [UpdateFailure] `DOWNLOAD_FAILED`.
 */
interface HttpHop {
    fun get(url: String): HopResponse
}

/**
 * Lit et télécharge à travers les règles de [UpdateSource], pour qu'aucune adresse ne vienne d'ailleurs que du code (DRV-639) :
 *
 * - la première adresse est un fichier de release du dépôt ([UpdateSource.isReleaseFile]), sinon [UpdateError.UNTRUSTED_ADDRESS] ;
 * - chaque redirection est jugée avant d'être suivie ([UpdateSource.isTrustedRedirect]) : `https` d'un hôte de la liste fermée, ou fichier
 *   de release ; au plus [UpdateSource.MAX_REDIRECTS] ; une adresse relative, `http` ou d'un autre hôte arrête tout ;
 * - seul le code 200 donne un corps ; tout autre code est un échec ;
 * - la taille est bornée (annoncée, puis comptée à la réception) et une annulation arrête la lecture ;
 * - un fichier plus court que la taille annoncée est un échec.
 *
 * Kotlin pur : le port [HttpHop] est la seule chose que la plateforme apporte.
 */
class SafeFetcher(private val hop: HttpHop) {
    /** Lit un petit texte en UTF-8 (`version.json`) : au plus [maxBytes] octets. */
    fun fetchText(url: String, maxBytes: Int, isCancelled: () -> Boolean = { false }): String {
        val collector = Collector()
        download(url, maxBytes.toLong(), collector, { _, _ -> }, isCancelled)
        return String(collector.bytes(), Charsets.UTF_8)
    }

    /**
     * Télécharge [url] dans [sink]. [onProgress] reçoit les octets reçus et la taille annoncée (-1 si inconnue). Au-delà de [maxBytes] :
     * [UpdateError.TOO_LARGE]. Ce que [sink] a déjà reçu n'est pas défait ici : c'est à l'appelant d'effacer.
     */
    fun download(url: String, maxBytes: Long, sink: ByteSink, onProgress: (received: Long, total: Long) -> Unit, isCancelled: () -> Boolean = { false }) {
        val response = open(url, isCancelled)
        try {
            if (response.contentLength > maxBytes) throw UpdateFailure(UpdateError.TOO_LARGE)
            val buffer = ByteArray(CHUNK)
            var received = 0L
            while (true) {
                if (isCancelled()) throw UpdateFailure(UpdateError.CANCELLED)
                val read = response.body.read(buffer)
                if (read < 0) break
                if (read == 0) throw UpdateFailure(UpdateError.DOWNLOAD_FAILED)
                received += read
                if (received > maxBytes) throw UpdateFailure(UpdateError.TOO_LARGE)
                sink.write(buffer, read)
                onProgress(received, response.contentLength)
            }
            if (response.contentLength >= 0 && received != response.contentLength) throw UpdateFailure(UpdateError.DOWNLOAD_FAILED)
        } finally {
            response.body.close()
        }
    }

    /** Suit les redirections permises jusqu'à une réponse 200, qu'il rend (l'appelant ferme son corps). */
    private fun open(first: String, isCancelled: () -> Boolean): HopResponse {
        if (!UpdateSource.isReleaseFile(first)) throw UpdateFailure(UpdateError.UNTRUSTED_ADDRESS)
        var url = first
        var followed = 0
        while (true) {
            if (isCancelled()) throw UpdateFailure(UpdateError.CANCELLED)
            val response = hop.get(url)
            when (response.status) {
                200 -> return response
                in REDIRECTS -> {
                    response.body.close()
                    if (followed >= UpdateSource.MAX_REDIRECTS) throw UpdateFailure(UpdateError.UNTRUSTED_ADDRESS)
                    followed++
                    val next = response.location
                    if (next == null || !UpdateSource.isTrustedRedirect(next)) throw UpdateFailure(UpdateError.UNTRUSTED_ADDRESS)
                    url = next
                }
                else -> {
                    response.body.close()
                    throw UpdateFailure(UpdateError.DOWNLOAD_FAILED)
                }
            }
        }
    }

    /** Ramasse les octets d'un petit texte. */
    private class Collector : ByteSink {
        private var data = ByteArray(1024)
        private var size = 0

        override fun write(buffer: ByteArray, length: Int) {
            if (size + length > data.size) data = data.copyOf(maxOf(data.size * 2, size + length))
            buffer.copyInto(data, size, 0, length)
            size += length
        }

        fun bytes(): ByteArray = data.copyOf(size)
    }

    private companion object {
        const val CHUNK = 16 * 1024
        val REDIRECTS = setOf(301, 302, 303, 307, 308)
    }
}

package eu.kantin.repas.drive

import java.security.MessageDigest

/** L'écriture du fichier téléchargé. [close] termine l'écriture ; une erreur d'écriture est une [UpdateFailure] `DOWNLOAD_FAILED`. */
interface ApkWriter : ByteSink {
    fun close()
}

/**
 * Où le fichier téléchargé est posé : un dossier PRIVÉ de l'application (jamais « Téléchargements »), qui ne contient qu'un fichier à la fois.
 * Port de plateforme.
 */
interface UpdateStorage {
    /** Efface tout ce que la mise à jour a laissé (fichier fini ou à moitié). Ne lève jamais d'erreur. */
    fun purge()

    /** Ouvre un fichier neuf pour le téléchargement (le dossier est vide avant). */
    fun create(): ApkWriter

    /** L'empreinte SHA-256 du fichier tel qu'il est sur le disque MAINTENANT (relu en entier), ou `null` s'il n'y en a pas. */
    fun stagedSha256(): String?
}

/** Ce que seule la plateforme sait dire ou faire. */
interface UpdatePlatform {
    /** Android autorise-t-il cette application à installer des applications (« Installer des applications inconnues ») ? */
    fun maySelfInstall(): Boolean

    /**
     * Le fichier posé est-il bien une version plus récente de CETTE application ([expectedCode] : le code annoncé) ? Contrôle son nom de
     * paquet, son code de version et, quand Android le dit, le certificat qui le signe. Faux = on n'ouvre pas l'installateur. Ce
     * contrôle s'ajoute à celui d'Android (qui refuse un autre certificat) sans jamais le remplacer ni l'assouplir.
     */
    fun checkStagedPackage(expectedCode: Long): Boolean
}

/** Ce que la construction sait de l'application installée. */
class InstalledApp(val versionCode: Long, val sdkInt: Int)

/** Ce que [UpdateFlow.gate] répond quand on demande de commencer. */
enum class StartGate {
    /** On peut télécharger tout de suite. */
    GO,

    /** Android doit d'abord autoriser l'application à installer des applications (une seule fois). */
    NEEDS_PERMISSION,

    /** Rien à faire : pas de version proposée, ou un téléchargement est déjà en cours. */
    NOTHING_TO_DO,
}

/** L'empreinte SHA-256 : calcul et comparaison. */
object UpdateIntegrity {
    /** Un calcul en cours, alimenté par les morceaux reçus. */
    class Digest {
        private val digest = MessageDigest.getInstance("SHA-256")

        fun update(buffer: ByteArray, length: Int) = digest.update(buffer, 0, length)

        /** L'empreinte, en 64 caractères hexadécimaux minuscules. */
        fun finishHex(): String = hex(digest.digest())
    }

    fun hex(bytes: ByteArray): String {
        val out = StringBuilder(bytes.size * 2)
        for (byte in bytes) {
            val value = byte.toInt() and 0xff
            out.append(HEX[value ushr 4]).append(HEX[value and 0x0f])
        }
        return out.toString()
    }

    fun sha256Hex(bytes: ByteArray): String = Digest().also { it.update(bytes, bytes.size) }.finishHex()

    /** Deux empreintes sont les mêmes. Une empreinte absente n'est jamais la même qu'une autre. */
    fun same(expected: String?, actual: String?): Boolean {
        if (expected == null || actual == null || expected.length != actual.length) return false
        var difference = 0
        for (index in expected.indices) difference = difference or (expected[index].code xor actual[index].code)
        return difference == 0
    }

    private const val HEX = "0123456789abcdef"
}

/**
 * La mise à jour de l'application, pas à pas (DRV-639) : chercher une version plus récente, la télécharger, la vérifier. L'installation
 * elle-même est celle d'Android et se fait ailleurs ([UpdatePlatform], l'écran du système).
 *
 * Règles :
 * - une version n'est proposée que si son code est STRICTEMENT plus grand que celui de l'application installée ([ReleaseInfo.isNewerThan]) ;
 * - l'APK est téléchargé à l'adresse calculée de la version annoncée ([UpdateSource.apkUrl]), dans un dossier privé ;
 * - son empreinte SHA-256 est celle de `version.json`, calculée à la réception PUIS relue sur le disque, AVANT tout (sinon [UpdateError.DIGEST_MISMATCH]) ;
 * - le fichier est une version plus récente de cette application ([UpdatePlatform.checkStagedPackage]) ;
 * - **le fichier est effacé dans tous les cas où il n'est pas encore entre les mains de l'installateur** : erreur de réseau, trop gros,
 *   empreinte fausse, paquet refusé, annulation, exception inattendue, et après l'installateur (installé ou non) ;
 * - la signature d'Android (même clé de publication) n'est jamais contournée : rien ici n'installe quoi que ce soit.
 *
 * Les méthodes bloquent : l'application les appelle l'une après l'autre sur un fil à part. Kotlin pur, testé sur la JVM avec des doubles.
 */
class UpdateFlow(
    private val fetcher: SafeFetcher,
    private val storage: UpdateStorage,
    private val platform: UpdatePlatform,
    private val installed: InstalledApp,
    private val publish: (UpdateState) -> Unit,
) {
    @Volatile
    var state: UpdateState = UpdateState.Unknown
        private set

    private var release: ReleaseInfo? = null

    private fun move(next: UpdateState) {
        state = next
        publish(next)
    }

    private fun fail(error: UpdateError) = move(UpdateState.Failed(error, release?.versionName))

    /** Cherche une version plus récente (`version.json`). Sans effet pendant un téléchargement ou quand le fichier est prêt. */
    fun check(isCancelled: () -> Boolean = { false }) {
        if (state is UpdateState.Downloading || state is UpdateState.Ready) return
        move(UpdateState.Checking)
        val info = try {
            ReleaseInfo.parse(fetcher.fetchText(UpdateSource.VERSION_JSON_URL, UpdateSource.MAX_VERSION_JSON_BYTES, isCancelled))
                ?: throw UpdateFailure(UpdateError.CHECK_FAILED)
        } catch (failure: UpdateFailure) {
            release = null
            when (failure.error) {
                UpdateError.CANCELLED -> move(UpdateState.Unknown)
                UpdateError.OFFLINE, UpdateError.UNTRUSTED_ADDRESS -> fail(failure.error)
                else -> fail(UpdateError.CHECK_FAILED)
            }
            return
        } catch (_: Exception) {
            release = null
            fail(UpdateError.CHECK_FAILED)
            return
        }
        if (info.isNewerThan(installed.versionCode) && info.canInstallOn(installed.sdkInt)) {
            release = info
            move(UpdateState.Available(info.versionName))
        } else {
            release = null
            move(UpdateState.UpToDate)
        }
    }

    /** Peut-on commencer le téléchargement ? */
    fun gate(): StartGate = when {
        release == null || state is UpdateState.Downloading || state is UpdateState.Ready || state is UpdateState.Checking -> StartGate.NOTHING_TO_DO
        platform.maySelfInstall() -> StartGate.GO
        else -> StartGate.NEEDS_PERMISSION
    }

    /** L'utilisateur n'a pas autorisé l'installation : l'état le dit, rien n'est téléchargé. */
    fun permissionRefused() {
        if (release != null) fail(UpdateError.PERMISSION_DENIED)
    }

    /**
     * Télécharge l'APK de la version proposée, le vérifie et le garde dans le dossier privé. Rend vrai quand il est prêt à être confié à
     * l'installateur d'Android (état « prêt à installer ») ; faux sinon, avec l'état « erreur » ou « mise à jour disponible » (annulation).
     * Dans tous les cas où il rend faux, le dossier est vidé.
     */
    fun download(isCancelled: () -> Boolean = { false }): Boolean {
        val info = release ?: return false
        val url = UpdateSource.apkUrl(info.versionName)
        if (url == null) {
            fail(UpdateError.CHECK_FAILED)
            return false
        }
        storage.purge()
        move(UpdateState.Downloading(info.versionName, 0))
        val digest = UpdateIntegrity.Digest()
        var writer: ApkWriter? = null
        var ready = false
        try {
            val target = storage.create()
            writer = target
            var lastPercent = 0
            val sink = object : ByteSink {
                override fun write(buffer: ByteArray, length: Int) {
                    digest.update(buffer, length)
                    target.write(buffer, length)
                }
            }
            fetcher.download(url, UpdateSource.MAX_APK_BYTES, sink, { received, total ->
                val percent = if (total > 0) (received * 100 / total).toInt().coerceIn(0, 99) else 0
                if (percent != lastPercent) {
                    lastPercent = percent
                    move(UpdateState.Downloading(info.versionName, percent))
                }
            }, isCancelled)
            target.close()
            writer = null
            // Avant tout : l'empreinte annoncée par version.json, celle du flux reçu puis celle du fichier relu sur le disque.
            if (!UpdateIntegrity.same(info.sha256, digest.finishHex())) throw UpdateFailure(UpdateError.DIGEST_MISMATCH)
            if (!UpdateIntegrity.same(info.sha256, storage.stagedSha256())) throw UpdateFailure(UpdateError.DIGEST_MISMATCH)
            if (!platform.checkStagedPackage(info.versionCode)) throw UpdateFailure(UpdateError.INVALID_PACKAGE)
            ready = true
        } catch (failure: UpdateFailure) {
            closeQuietly(writer)
            storage.purge()
            if (failure.error == UpdateError.CANCELLED) move(UpdateState.Available(info.versionName)) else fail(failure.error)
            return false
        } catch (_: Exception) {
            closeQuietly(writer)
            storage.purge()
            fail(UpdateError.DOWNLOAD_FAILED)
            return false
        } finally {
            // Quoi qu'il arrive (même une erreur que rien n'attendait), un fichier qui n'est pas prêt n'est pas gardé.
            if (!ready) {
                closeQuietly(writer)
                storage.purge()
            }
        }
        move(UpdateState.Ready(info.versionName))
        return true
    }

    /**
     * À appeler JUSTE avant d'ouvrir l'installateur : le fichier est relu et ses empreintes revérifiées (il a pu rester un moment sur le
     * disque). Faux : il est effacé et l'état dit l'erreur. Vrai seulement à l'état « prêt à installer ».
     */
    fun revalidate(): Boolean {
        val info = release
        if (info == null || state !is UpdateState.Ready) return false
        val sound = try {
            UpdateIntegrity.same(info.sha256, storage.stagedSha256()) && platform.checkStagedPackage(info.versionCode)
        } catch (_: Exception) {
            false
        }
        if (!sound) {
            storage.purge()
            fail(UpdateError.DIGEST_MISMATCH)
        }
        return sound
    }

    /** Android n'a pas d'écran pour installer : le fichier est effacé et l'état dit l'erreur. */
    fun installerUnavailable() {
        storage.purge()
        fail(UpdateError.INSTALLER_UNAVAILABLE)
    }

    /**
     * L'écran d'installation d'Android s'est refermé sans que l'application soit remplacée (annulé, refusé ou échec), ou l'application
     * redémarre : le fichier est effacé, on peut recommencer. (Quand l'installation réussit, le processus est arrêté par Android ;
     * le démarrage suivant efface ce qui reste.)
     */
    fun installerClosed() {
        storage.purge()
        val info = release
        move(if (info != null) UpdateState.Available(info.versionName) else UpdateState.Unknown)
    }

    /** L'utilisateur renonce : tout est effacé. */
    fun discard() {
        storage.purge()
        val info = release
        if (info != null && (state is UpdateState.Ready || state is UpdateState.Downloading)) move(UpdateState.Available(info.versionName))
    }

    private fun closeQuietly(writer: ApkWriter?) {
        try {
            writer?.close()
        } catch (_: Exception) {
            // Le fichier va être effacé.
        }
    }
}

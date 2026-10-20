package eu.kantin.repas.drive

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLException

/**
 * Les services d'Android derrière les ports de la mise à jour du cœur (DRV-639), variante « direct » seulement. Rien de décisif ici : les règles
 * (adresses permises, taille, empreinte, états, effacement) sont dans le cœur et se testent sans téléphone ; ce fichier ne fait que parler à
 * Android.
 */

/** Le dossier privé des mises à jour : `files/update/`, jamais « Téléchargements ». Au plus un fichier à la fois. */
internal class PrivateUpdateStorage(private val directory: File) : UpdateStorage {
    /** L'APK téléchargé. C'est le seul fichier que le fournisseur de fichiers montre à l'installateur (`res/xml/update_file_paths.xml`). */
    val file = File(directory, FILE_NAME)

    override fun purge() {
        try {
            directory.deleteRecursively()
        } catch (_: Exception) {
            // Rien à faire de plus : le prochain démarrage recommencera.
        }
    }

    override fun create(): ApkWriter {
        try {
            directory.mkdirs()
            val stream = FileOutputStream(file)
            return object : ApkWriter {
                override fun write(buffer: ByteArray, length: Int) {
                    try {
                        stream.write(buffer, 0, length)
                    } catch (error: IOException) {
                        throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
                    }
                }

                override fun close() {
                    try {
                        stream.fd.sync()
                    } catch (_: IOException) {
                        // La fermeture suffit : la relecture de l'empreinte dira si le fichier est complet.
                    } finally {
                        try {
                            stream.close()
                        } catch (error: IOException) {
                            throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
                        }
                    }
                }
            }
        } catch (error: IOException) {
            throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
        }
    }

    override fun stagedSha256(): String? {
        if (!file.isFile) return null
        return try {
            val digest = UpdateIntegrity.Digest()
            FileInputStream(file).use { input ->
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, read)
                }
            }
            digest.finishHex()
        } catch (_: IOException) {
            null
        }
    }

    companion object {
        const val DIRECTORY_NAME = "update"
        const val FILE_NAME = "repas-drive.apk"
    }
}

/** Le port HTTP : `HttpsURLConnection`, sans suivre aucune redirection, sans cookie, sans identifiant, en `https` seulement. */
internal class HttpsHop : HttpHop {
    override fun get(url: String): HopResponse {
        // Le cœur n'envoie ici que des adresses qu'il a jugées ; cette garde est la dernière porte.
        if (!url.startsWith("https://")) throw UpdateFailure(UpdateError.UNTRUSTED_ADDRESS)
        val connection: HttpsURLConnection
        val status: Int
        try {
            connection = URL(url).openConnection() as HttpsURLConnection
            connection.instanceFollowRedirects = false
            connection.requestMethod = "GET"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.useCaches = false
            // Sans compression, la taille annoncée est celle du fichier : le contrôle de taille et de troncature en dépend.
            connection.setRequestProperty("Accept-Encoding", "identity")
            status = connection.responseCode
        } catch (error: SSLException) {
            throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
        } catch (error: IOException) {
            throw UpdateFailure(UpdateError.OFFLINE, error)
        }
        val stream: InputStream? = if (status == 200) {
            try {
                connection.inputStream
            } catch (error: IOException) {
                connection.disconnect()
                throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
            }
        } else {
            null
        }
        val body = object : HopBody {
            override fun read(buffer: ByteArray): Int {
                val input = stream ?: return -1
                try {
                    return input.read(buffer)
                } catch (error: IOException) {
                    throw UpdateFailure(UpdateError.DOWNLOAD_FAILED, error)
                }
            }

            override fun close() {
                try {
                    stream?.close()
                } catch (_: IOException) {
                    // Rien à faire.
                } finally {
                    connection.disconnect()
                }
            }
        }
        return HopResponse(status, connection.getHeaderField("Location"), connection.contentLengthLong, body)
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
    }
}

/**
 * Ce que seul Android sait dire : l'autorisation d'installer (réglage « Installer des applications inconnues » de CETTE application) et le
 * contrôle du fichier posé. Le contrôle s'ajoute à celui d'Android et ne le remplace pas : Android refuse de toute façon un fichier signé
 * d'une autre clé, ou d'un code de version plus bas.
 */
internal class AndroidUpdatePlatform(private val context: Context, private val staged: File) : UpdatePlatform {
    override fun maySelfInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    override fun checkStagedPackage(expectedCode: Long): Boolean {
        val manager = context.packageManager
        val withCertificates = signingFlags()
        var certificatesKnown = true
        val archive = manager.getPackageArchiveInfo(staged.path, withCertificates)
            ?: manager.getPackageArchiveInfo(staged.path, 0).also { certificatesKnown = false }
            ?: return false
        if (archive.packageName != context.packageName) return false
        val archiveCode = codeOf(archive)
        if (archiveCode != expectedCode) return false
        val installed = try {
            manager.getPackageInfo(context.packageName, withCertificates)
        } catch (_: PackageManager.NameNotFoundException) {
            return false
        }
        // Une mise à jour est strictement plus récente que ce qui est installé ; jamais une version de débogage.
        if (archiveCode <= codeOf(installed)) return false
        if ((archive.applicationInfo?.flags ?: 0) and ApplicationInfo.FLAG_DEBUGGABLE != 0) return false
        if (!certificatesKnown) return true
        // Même signataire quand Android le dit : le certificat installé doit être l'un de ceux du fichier (ou de son historique de rotation).
        val wanted = signers(installed, history = false) ?: return true
        val offered = signers(archive, history = true) ?: return true
        return offered.containsAll(wanted)
    }

    private fun signingFlags(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
    } else {
        @Suppress("DEPRECATION")
        PackageManager.GET_SIGNATURES
    }

    @Suppress("DEPRECATION")
    private fun codeOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

    /** Les empreintes SHA-256 des certificats du signataire (et, pour [history], de ses prédécesseurs), ou `null` si Android ne les donne pas. */
    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo, history: Boolean): Set<String>? {
        val signatures: List<Signature>? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signing = info.signingInfo ?: return null
            val current = signing.apkContentsSigners.orEmpty().toList()
            if (history && !signing.hasMultipleSigners()) current + signing.signingCertificateHistory.orEmpty().toList() else current
        } else {
            info.signatures?.toList()
        }
        if (signatures.isNullOrEmpty()) return null
        return signatures.map { UpdateIntegrity.sha256Hex(it.toByteArray()) }.toSet()
    }
}

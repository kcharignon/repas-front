package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * La variante « direct » (l'APK de la release GitHub, installé à la main) : l'application se met à jour elle-même (DRV-639).
 *
 * Le parcours, pour l'utilisateur : « Mettre à jour » dans Repas → (une seule fois, une phrase puis les réglages d'Android pour autoriser
 * l'installation) → le téléchargement avance → l'écran d'installation d'Android s'ouvre → « Installer ». L'APK est déposé dans le dossier
 * PRIVÉ de l'application, jamais dans « Téléchargements », et effacé après coup. Toutes les règles sont dans le cœur ([UpdateFlow],
 * [SafeFetcher], [UpdateSource]) ; ici : le fil de travail, la fenêtre d'autorisation, le fournisseur de fichiers et l'intention d'installation.
 *
 * La signature d'Android n'est jamais contournée : l'installateur du système compare le certificat du fichier à celui de l'application
 * installée (même clé de publication) et refuse un autre, ou un code de version plus bas.
 *
 * Une construction de débogage ne se met jamais à jour ainsi : sa clé de signature est publique, les versions publiées ne s'installeraient pas
 * par-dessus (`supported` est faux, la page garde l'ancien comportement).
 */
internal class DirectSelfUpdate(private val activity: Activity, private val post: (String) -> Unit) : SelfUpdate {
    override val supported: Boolean = !BuildConfig.DEBUG

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val storage = PrivateUpdateStorage(File(activity.filesDir, PrivateUpdateStorage.DIRECTORY_NAME))
    private val flow = UpdateFlow(
        fetcher = SafeFetcher(HttpsHop()),
        storage = storage,
        platform = AndroidUpdatePlatform(activity, storage.file),
        installed = InstalledApp(activity.installedVersion().code, Build.VERSION.SDK_INT),
        publish = ::publish,
    )

    /** Mis à vrai pour arrêter le téléchargement en cours (`update.cancel`) ; remis à faux au début de chaque téléchargement. */
    private val downloadCancelled = AtomicBoolean(false)

    @Volatile
    private var closed = false

    @Volatile
    private var lastCheckAt = 0L

    /** Fil principal seulement : l'utilisateur est allé autoriser l'installation dans les réglages d'Android, on attend son retour. */
    private var awaitingPermission = false

    init {
        // Le démarrage de la coquille (et non du processus : le fournisseur de fichiers peut le provoquer pendant qu'Android installe) efface
        // ce qu'une mise à jour précédente a laissé : l'installation réussie ou un écran d'installation fermé sans résultat.
        if (supported) submit { storage.purge() }
    }

    private fun publish(state: UpdateState) {
        activity.runOnUiThread { if (!closed) post(state.toMessage()) }
    }

    private fun submit(task: () -> Unit) {
        try {
            executor.execute(task)
        } catch (_: RejectedExecutionException) {
            // La coquille est fermée : plus rien à faire.
        }
    }

    override fun status() {
        if (supported) post(flow.state.toMessage())
    }

    override fun check() {
        if (!supported) return
        val state = flow.state
        val settled = state is UpdateState.UpToDate || state is UpdateState.Available
        val fresh = settled && System.currentTimeMillis() - lastCheckAt < CHECK_TTL_MS
        if (fresh || state is UpdateState.Checking || state is UpdateState.Downloading || state is UpdateState.Ready) {
            post(state.toMessage())
            return
        }
        submit {
            flow.check { closed }
            if (flow.state is UpdateState.UpToDate || flow.state is UpdateState.Available) lastCheckAt = System.currentTimeMillis()
        }
    }

    override fun start() {
        if (!supported) return
        submit {
            when (flow.gate()) {
                StartGate.NOTHING_TO_DO -> publish(flow.state)
                StartGate.NEEDS_PERMISSION -> activity.runOnUiThread { askPermission() }
                StartGate.GO -> downloadAndInstall()
            }
        }
    }

    override fun cancel() {
        if (!supported) return
        downloadCancelled.set(true)
        submit {
            // Un téléchargement en cours se voit annulé par son propre fil ; un fichier prêt, que l'installateur n'a pas encore pris, s'efface.
            if (flow.state is UpdateState.Ready) flow.discard() else storage.purge()
        }
    }

    override fun onResume() {
        if (!awaitingPermission) return
        awaitingPermission = false
        submit {
            when (flow.gate()) {
                StartGate.GO -> downloadAndInstall()
                StartGate.NEEDS_PERMISSION -> flow.permissionRefused()
                StartGate.NOTHING_TO_DO -> publish(flow.state)
            }
        }
    }

    override fun onInstallerResult(requestCode: Int, resultCode: Int) {
        if (requestCode != REQUEST_INSTALL) return
        // Installée ou non, l'application a fini avec ce fichier : il est effacé (quand l'installation réussit, Android arrête l'application
        // avant de rendre la main, et le démarrage suivant efface ce qui reste).
        submit { flow.installerClosed() }
    }

    override fun close() {
        closed = true
        downloadCancelled.set(true)
        executor.shutdown()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Sur le fil de travail

    private fun downloadAndInstall() {
        downloadCancelled.set(false)
        if (!flow.download { downloadCancelled.get() || closed }) return
        // Juste avant d'ouvrir l'installateur : le fichier est relu et ses empreintes revérifiées.
        if (!flow.revalidate()) return
        activity.runOnUiThread {
            if (closed) {
                submit { flow.discard() }
            } else if (!openInstaller()) {
                submit { flow.installerUnavailable() }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Sur le fil principal

    /** Une phrase, une seule fois : Android veut l'accord de l'utilisateur pour qu'une application en installe une autre (elle-même ici). */
    private fun askPermission() {
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_permission_title)
            .setMessage(R.string.update_permission_message)
            .setPositiveButton(R.string.update_permission_continue) { _, _ -> openPermissionSettings() }
            .setNegativeButton(R.string.update_permission_later) { _, _ -> submit { publish(flow.state) } }
            .setOnCancelListener { submit { publish(flow.state) } }
            .show()
    }

    private fun openPermissionSettings() {
        awaitingPermission = true
        try {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
        } catch (_: ActivityNotFoundException) {
            awaitingPermission = false
            submit { flow.installerUnavailable() }
        }
    }

    /** Ouvre l'écran d'installation d'Android sur le fichier, par le fournisseur de fichiers privé. Faux si Android n'en a pas. */
    @Suppress("DEPRECATION")
    private fun openInstaller(): Boolean {
        val uri = try {
            FileProvider.getUriForFile(activity, "${activity.packageName}.updates", storage.file)
        } catch (_: IllegalArgumentException) {
            return false
        }
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE)
            .setDataAndType(uri, APK_MIME_TYPE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // Le résultat dit si l'écran d'installation s'est refermé : le fichier est alors effacé dans tous les cas.
            .putExtra(Intent.EXTRA_RETURN_RESULT, true)
        return try {
            activity.startActivityForResult(intent, REQUEST_INSTALL)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    private companion object {
        const val REQUEST_INSTALL = 0x7e01
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"

        /** Une recherche faite il y a moins longtemps n'est pas refaite (l'écran « Moi » et l'aide la demandent à chaque ouverture). */
        const val CHECK_TTL_MS = 5 * 60 * 1000L
    }
}

internal fun createSelfUpdate(activity: Activity, post: (String) -> Unit): SelfUpdate = DirectSelfUpdate(activity, post)

package eu.kantin.repas.drive

import android.app.Activity

/**
 * La variante de Google Play (DRV-639) : AUCUNE mise à jour dans l'application (Google s'en charge), donc ni permission d'installer, ni
 * fournisseur de fichiers, ni téléchargement. `build.sh test` vérifie que cette variante n'en contient rien.
 */
internal object NoSelfUpdate : SelfUpdate {
    override val supported = false

    override fun status() = Unit

    override fun check() = Unit

    override fun start() = Unit

    override fun cancel() = Unit

    override fun onResume() = Unit

    override fun onInstallerResult(requestCode: Int, resultCode: Int) = Unit

    override fun close() = Unit
}

@Suppress("UNUSED_PARAMETER")
internal fun createSelfUpdate(activity: Activity, post: (String) -> Unit): SelfUpdate = NoSelfUpdate


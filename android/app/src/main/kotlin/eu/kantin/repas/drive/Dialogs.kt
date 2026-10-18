package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog

/** Les fenêtres que la coquille et l'écran du drive ont en commun. */

/** « Version et mode d'emploi » : la ligne de version, l'état de l'agent, puis le mode d'emploi. */
internal fun Activity.showAbout(agentLine: String) {
    AlertDialog.Builder(this)
        .setTitle(R.string.app_name)
        .setMessage(installedVersion().line + "\n" + agentLine + "\n\n" + getString(R.string.about_manual))
        .setPositiveButton(R.string.close, null)
        .show()
}

/**
 * Demande confirmation avant d'effacer les données du drive (cookies de Leclerc, stockage du site, cache, historique). Sans profils de WebView
 * ([DriveProfile.isolated]), la session de Repas part aussi, et la fenêtre le dit.
 */
internal fun Activity.confirmClearDriveData(onConfirm: () -> Unit) {
    AlertDialog.Builder(this)
        .setMessage(if (DriveProfile.isolated) R.string.clear_message else R.string.clear_message_shared)
        .setPositiveButton(R.string.clear_confirm) { _, _ -> onConfirm() }
        .setNegativeButton(R.string.cancel, null)
        .show()
}

/** Une liste d'entrées de menu dans une fenêtre. */
internal fun Activity.showMenu(entries: List<Pair<Int, () -> Unit>>) {
    AlertDialog.Builder(this)
        .setItems(entries.map { getString(it.first) }.toTypedArray()) { _, which -> entries[which].second() }
        .show()
}

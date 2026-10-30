package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog

/** Les fenêtres que la coquille et l'écran du drive ont en commun. */

/**
 * « Version et mode d'emploi » : la ligne de version, l'état de l'agent, la forme du dernier « Finaliser » de [site] s'il y en a eu un, puis le mode
 * d'emploi, qui parle de [site] (son nom et sa forme avec « de », DRV-707).
 */
internal fun Activity.showAbout(agentLine: String, site: RetailerSite, lastFinalize: FinalizeOutcome? = null) {
    // La forme du dernier « Finaliser » (DRV-631), pour un signalement : un mot, jamais une adresse ni un numéro.
    val finalizeLine = lastFinalize?.let { "\n" + getString(R.string.about_finalize, site.name, it.name) }.orEmpty()
    AlertDialog.Builder(this)
        .setTitle(R.string.app_name)
        .setMessage(installedVersion().line + "\n" + agentLine + finalizeLine + "\n\n" + getString(R.string.about_manual, site.name, site.nameDe))
        .setPositiveButton(R.string.close, null)
        .show()
}

/**
 * Demande confirmation avant d'effacer les données du drive de [site] (cookies, stockage du site, cache, historique) ; elle nomme l'enseigne. Sans
 * profils de WebView ([DriveProfile.isolated]), la session de Repas part aussi, et la fenêtre le dit.
 */
internal fun Activity.confirmClearDriveData(site: RetailerSite, onConfirm: () -> Unit) {
    AlertDialog.Builder(this)
        .setMessage(getString(if (DriveProfile.isolated) R.string.clear_message else R.string.clear_message_shared, site.name, site.nameDe))
        .setPositiveButton(R.string.clear_confirm) { _, _ -> onConfirm() }
        .setNegativeButton(R.string.cancel, null)
        .show()
}

/** Une liste d'entrées de menu dans une fenêtre : le texte déjà composé (il nomme au besoin l'enseigne) et ce qu'elle fait. */
internal fun Activity.showMenu(entries: List<Pair<String, () -> Unit>>) {
    AlertDialog.Builder(this)
        .setItems(entries.map { it.first }.toTypedArray()) { _, which -> entries[which].second() }
        .show()
}

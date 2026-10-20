package eu.kantin.repas.drive

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/**
 * Les services de plateforme d'Android derrière les interfaces du cœur (AUTH-015, `android/ARCHITECTURE.md`) : le cœur ne connaît que l'interface,
 * l'application apporte ce qui touche à Android. Une implémentation iPhone, un jour, écrirait les mêmes interfaces à sa manière.
 */

/** [LinkOpener] d'Android : une page web dans le navigateur du téléphone ; sans navigateur, un message le dit. */
internal class AndroidLinkOpener(private val activity: Activity) : LinkOpener {
    override fun open(url: String): Boolean = try {
        activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        true
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(activity, R.string.no_browser, Toast.LENGTH_LONG).show()
        false
    }
}

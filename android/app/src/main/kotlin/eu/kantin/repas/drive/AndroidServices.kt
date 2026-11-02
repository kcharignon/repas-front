package eu.kantin.repas.drive

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.widget.Toast

/**
 * Les services de plateforme d'Android derrière les interfaces du cœur (AUTH-015, `android/ARCHITECTURE.md`) : le cœur ne connaît que l'interface,
 * l'application apporte ce qui touche à Android. Une implémentation iPhone, un jour, écrirait les mêmes interfaces à sa manière.
 */

/** [Delay] d'Android : le fil principal. La fonction rendue annule le rappel. */
internal object MainThreadDelay : Delay {
    override fun after(millis: Long, action: () -> Unit): () -> Unit {
        val handler = Handler(Looper.getMainLooper())
        val task = Runnable(action)
        handler.postDelayed(task, millis)
        return { handler.removeCallbacks(task) }
    }
}

/** [CookieFlusher] de la coquille (DRV-765) : les cookies du profil par défaut de la WebView, ceux de Repas, écrits sur le disque (l'appel attend la fin de l'écriture). */
internal object RepasCookieFlusher : CookieFlusher {
    override fun flush() = CookieManager.getInstance().flush()
}

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

package eu.kantin.repas.drive

import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Les données du drive (cookies, stockage du site, cache) dans un profil de WebView à part (DRV-317) : celles de Repas (le cookie de
 * rafraîchissement du jeton, le stockage du front) sont dans le profil par défaut. Se déconnecter de Leclerc n'efface donc que le drive.
 *
 * Les profils demandent une WebView récente (fonction `MULTI_PROFILE`). Sans eux, le drive partage les données de Repas : se déconnecter
 * de Leclerc efface alors aussi la session de Repas, et le menu le dit.
 */
internal object DriveProfile {
    const val NAME = "drive"

    val isolated: Boolean get() = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    /** Range la WebView du drive dans son profil ; à appeler avant tout chargement. */
    fun attach(webView: WebView) {
        if (isolated) WebViewCompat.setProfile(webView, NAME)
    }

    /** Les cookies du drive : ceux de son profil, ou ceux de l'application sans profils. */
    fun cookieManager(): CookieManager =
        if (isolated) ProfileStore.getInstance().getOrCreateProfile(NAME).cookieManager else CookieManager.getInstance()

    /** Efface les cookies, le stockage du site, le cache et l'historique du drive (et de Repas aussi, si les profils manquent). */
    fun clear(webView: WebView?) {
        cookieManager().apply {
            removeAllCookies(null)
            flush()
        }
        if (isolated) ProfileStore.getInstance().getOrCreateProfile(NAME).webStorage.deleteAllData() else WebStorage.getInstance().deleteAllData()
        webView?.clearCache(true)
        webView?.clearHistory()
    }
}

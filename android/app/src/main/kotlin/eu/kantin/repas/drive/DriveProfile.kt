package eu.kantin.repas.drive

import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import androidx.webkit.Profile
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Les données d'une enseigne du drive (cookies, stockage du site, cache) dans un profil de WebView à part (DRV-317, DRV-707) : celles de Repas (le
 * cookie de rafraîchissement du jeton, le stockage du front) sont dans le profil par défaut, et **chaque enseigne a le sien** ([DriveProfileName]) :
 * se déconnecter d'une enseigne n'efface ni Repas ni une autre enseigne. L'enseigne d'avant garde le profil `drive` des installations existantes.
 *
 * Les profils demandent une WebView récente (fonction `MULTI_PROFILE`). Sans eux, le drive partage les données de Repas : se déconnecter
 * d'une enseigne efface alors aussi la session de Repas (et celles des autres enseignes), et le menu le dit.
 */
internal object DriveProfile {
    val isolated: Boolean get() = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    private fun profile(site: RetailerSite, sites: RetailerSites): Profile =
        ProfileStore.getInstance().getOrCreateProfile(DriveProfileName.of(site, sites))

    /** Range la WebView de [site] dans son profil ; à appeler avant tout chargement. */
    fun attach(webView: WebView, site: RetailerSite, sites: RetailerSites) {
        if (isolated) WebViewCompat.setProfile(webView, DriveProfileName.of(site, sites))
    }

    /** Les cookies de [site] : ceux de son profil, ou ceux de l'application sans profils. */
    fun cookieManager(site: RetailerSite, sites: RetailerSites): CookieManager =
        if (isolated) profile(site, sites).cookieManager else CookieManager.getInstance()

    /** Efface les cookies, le stockage du site, le cache et l'historique de [site] (et de Repas aussi, si les profils manquent). */
    fun clear(webView: WebView?, site: RetailerSite, sites: RetailerSites) {
        cookieManager(site, sites).apply {
            removeAllCookies(null)
            flush()
        }
        if (isolated) profile(site, sites).webStorage.deleteAllData() else WebStorage.getInstance().deleteAllData()
        webView?.clearCache(true)
        webView?.clearHistory()
    }
}

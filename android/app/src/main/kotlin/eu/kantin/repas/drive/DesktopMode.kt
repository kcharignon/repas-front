package eu.kantin.repas.drive

import android.content.Context
import android.util.Log
import android.webkit.WebSettings
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/**
 * Le mode ordinateur permanent (DRV-312) : agent utilisateur de bureau, indications client cohérentes (plateforme Linux, mobile
 * faux), fenêtre large et zoom au pincement. La décision est dans [UserAgents.identity] (testée sans téléphone) ; ici, seulement
 * l'application à la WebView. Une faiblesse est notée au journal de l'application, sans adresse ni contenu, et l'application continue.
 */
internal object DesktopMode {
    private const val TAG = "RepasDrive"

    fun apply(context: Context, settings: WebSettings) {
        val supported = WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)
        val identity = UserAgents.identity(WebSettings.getDefaultUserAgent(context), supported)
        settings.userAgentString = identity.userAgent
        // Une mise en page large que l'on agrandit au pincement, comme la « version pour ordinateur » de Chrome. La fenêtre de la page fait alors
        // ~980 px CSS, affichée sur ~411 dp d'écran (un Pixel 9) : le texte du site y est petit, comme sur Chrome en « version pour ordinateur ».
        // Ce qu'on lit à l'écran se rattrape par le pincement, le double toucher (zoom sur le bloc touché) et le menu « Agrandir la page ».
        // Volontairement PAS de `textZoom`, de `LayoutAlgorithm.TEXT_AUTOSIZING` ni de `setInitialScale` : les deux premiers changent la taille
        // du texte de l'interface de l'agent elle-même (qui se mesure et se corrige, `drive-agent/src/ui/scale.ts`) et refont la mise en page d'un
        // site que l'on ne peut pas ouvrir ici (débordements, texte coupé) ; le troisième cache une partie de la largeur de la page derrière un
        // défilement horizontal, sur une mise en page inconnue. Le zoom de la page est donc toujours un geste de l'utilisateur, jamais un réglage.
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        var note = identity.note
        if (identity.clientHints && !applyClientHints(settings, UserAgents.chromeMajorOf(identity.userAgent))) {
            note = "Indications client refusées par la WebView : agent utilisateur seul."
        }
        if (note != null) Log.w(TAG, note)
    }

    /** Plateforme Linux, pas mobile, modèle vide, marques de la WebView (Android WebView devient Google Chrome). */
    private fun applyClientHints(settings: WebSettings, chromeMajor: Int?): Boolean = try {
        val original = WebSettingsCompat.getUserAgentMetadata(settings)
        val brands = UserAgents.desktopBrands(
            original.brandVersionList.map { Brand(it.brand, it.majorVersion, it.fullVersion) },
            chromeMajor,
        )
        val builder = UserAgentMetadata.Builder(original)
            .setBrandVersionList(
                brands.map {
                    UserAgentMetadata.BrandVersion.Builder()
                        .setBrand(it.name)
                        .setMajorVersion(it.majorVersion)
                        .setFullVersion(it.fullVersion)
                        .build()
                },
            )
            .setPlatform("Linux")
            .setPlatformVersion("")
            .setModel("")
            .setMobile(false)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA_FORM_FACTORS)) {
            builder.setFormFactors(listOf(UserAgentMetadata.FORM_FACTOR_DESKTOP))
        }
        WebSettingsCompat.setUserAgentMetadata(settings, builder.build())
        true
    } catch (_: RuntimeException) {
        false
    }
}

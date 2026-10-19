package eu.kantin.repas.drive

import android.app.Activity

/**
 * (débogage) Le fournisseur d'identité de l'APK de débogage : le fournisseur factice [FakeGoogleIdentity] (AUTH-011). L'APK de débogage n'a pas
 * de vraie connexion avec Google : sa clé de signature est publique, et son empreinte n'est jamais enregistrée dans le projet Google de
 * production. Le fichier du même nom de la variante de publication (`src/release`) donne la vraie connexion.
 */
internal object IdentityProviders {
    @Suppress("UNUSED_PARAMETER")
    fun create(activity: Activity): IdentityProvider = FakeGoogleIdentity()
}

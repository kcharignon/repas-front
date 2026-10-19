package eu.kantin.repas.drive

import android.app.Activity

/**
 * (publication) Le fournisseur d'identité de l'APK de publication : la vraie connexion avec Google, par Credential Manager (AUTH-011). Le fichier
 * du même nom de la variante de débogage (`src/debug`) donne le fournisseur factice, qui n'existe donc pas dans cet APK
 * (`build.sh verify-release` le vérifie).
 */
internal object IdentityProviders {
    fun create(activity: Activity): IdentityProvider = CredentialManagerGoogleIdentity(activity)
}

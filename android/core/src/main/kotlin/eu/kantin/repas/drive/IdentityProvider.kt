package eu.kantin.repas.drive

/**
 * Pourquoi la plateforme n'a pas remis de jeton d'identité (connexion avec Google, AUTH-011). Les noms sont ceux du contrat du pont
 * (`google.error`, champ `code`) : ne pas en renommer un sans changer le contrat avec la page. Jamais le texte d'une exception de la plateforme.
 */
enum class IdentityError {
    /** L'utilisateur a fermé la feuille de choix du compte. Aucune relance automatique. */
    CANCELLED,

    /** Aucun compte utilisable n'est connu du téléphone. */
    NO_ACCOUNT,

    /** Le service d'identité de la plateforme est absent, trop ancien, ou ne prend pas cette demande en charge. */
    UNAVAILABLE,

    /** Tout autre échec (réponse illisible, erreur du service…). */
    FAILED,
}

/** La réponse à une demande de jeton d'identité : le jeton, ou la raison pour laquelle il n'y en a pas. */
sealed interface IdentityResult {
    /**
     * Le jeton d'identité signé par le fournisseur, à remettre tel quel à la page, qui le poste au back. Son texte ne s'écrit jamais au journal
     * ni dans une préférence : [toString] ne le montre donc pas.
     */
    data class Token(val idToken: String) : IdentityResult {
        override fun toString(): String = "Token(…)"
    }

    /** Pas de jeton : [error] dit pourquoi. */
    data class Failure(val error: IdentityError) : IdentityResult
}

/** Une demande en cours que l'on peut abandonner (l'écran se ferme pendant que la feuille de choix du compte est ouverte). */
fun interface Cancellation {
    fun cancel()
}

/**
 * Le service de plateforme « obtenir un jeton d'identité » (AUTH-015, décision D5 de l'ADR 0024). Google refuse la connexion dans une WebView :
 * c'est la plateforme qui la mène, avec sa propre feuille de choix du compte (Android : Credential Manager, AUTH-011 ; iPhone : le jour venu,
 * son équivalent). Le cœur ne connaît que cette interface ; il ne sait pas comment le jeton est obtenu.
 *
 * Le contrat que toute implémentation tient :
 * - [signIn] ne lève jamais d'exception : un échec arrive par [IdentityResult.Failure] ;
 * - [callback] est appelé **une seule fois**, sur le fil de l'interface de la plateforme, et **jamais après** [Cancellation.cancel] ;
 * - ni [clientId], ni [nonce], ni le jeton ne sont écrits au journal ;
 * - une seule demande à la fois : c'est à l'appelant d'y veiller (code `BUSY` du contrat du pont).
 */
interface IdentityProvider {
    /**
     * Demande un jeton d'identité.
     *
     * @param clientId l'identifiant du client Web du fournisseur (l'audience du jeton), reçu de la page
     * @param nonce la valeur à usage unique donnée par le serveur, que le jeton doit porter
     */
    fun signIn(clientId: String, nonce: String, callback: (IdentityResult) -> Unit): Cancellation
}

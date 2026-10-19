package eu.kantin.repas.drive

/**
 * Le relais de la connexion avec Google (AUTH-011) entre la page de Repas et le service de plateforme [IdentityProvider] : la page demande
 * (`google.signIn`, déjà validé par [NativeBridge.screen]), la plateforme mène la connexion avec sa propre feuille de choix du compte, et la
 * réponse (`google.result` ou `google.error`) revient à la page qui l'a demandée. Kotlin pur, pour se tester sans téléphone.
 *
 * - **Une seule demande à la fois** : une deuxième pendant la première reçoit `google.error` `BUSY`, sans appel à la plateforme.
 * - **Une seule réponse par demande**, et **aucune après [cancel]** (l'écran se ferme pendant que la feuille est ouverte), même d'un fournisseur
 *   qui ne tiendrait pas son contrat.
 * - **Aucune relance** : une annulation de l'utilisateur (`CANCELLED`) est rendue telle quelle ; c'est la page qui décide de redemander.
 * - **Rien n'est gardé** : le jeton passe de la plateforme à la page sans être conservé ni écrit au journal (le relais n'écrit rien au journal).
 *
 * À appeler sur le fil de l'interface, comme le fournisseur rappelle.
 */
class SignInRelay(private val provider: IdentityProvider) {
    /** La demande en cours : sa réponse ne passe que tant qu'elle est [open]. */
    private class Pending {
        var open = true
        var cancellation: Cancellation? = null
    }

    private var pending: Pending? = null

    /** Une demande attend la réponse de la plateforme. */
    val isBusy: Boolean get() = pending != null

    /** Mène la demande [request] ; [reply] reçoit, une seule fois, le message à rendre à la page qui l'a faite. */
    fun request(request: NativeRequest.GoogleSignIn, reply: (String) -> Unit) {
        if (pending != null) return reply(NativeBridge.googleError(NativeBridge.BUSY))
        val current = Pending()
        pending = current
        val answer = { result: IdentityResult ->
            if (current.open) {
                current.open = false
                if (pending === current) pending = null
                reply(NativeBridge.googleAnswer(result))
            }
        }
        current.cancellation = try {
            provider.signIn(request.clientId, request.nonce, answer)
        } catch (_: RuntimeException) {
            // Le contrat dit que le fournisseur ne lève jamais ; s'il le fait quand même, la page reçoit un échec et la demande suivante passe.
            answer(IdentityResult.Failure(IdentityError.FAILED))
            null
        }
    }

    /** L'écran se ferme : la demande en cours est abandonnée auprès de la plateforme, et sa réponse ne sera pas rendue. */
    fun cancel() {
        val current = pending ?: return
        pending = null
        current.open = false
        current.cancellation?.cancel()
    }
}

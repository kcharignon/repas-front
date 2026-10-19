package eu.kantin.repas.drive

import android.os.Handler
import android.os.Looper

/**
 * (débogage seulement) Le fournisseur d'identité factice (AUTH-011), pour l'émulateur (`make android-smoke`, `make android-e2e`) et tout APK de
 * débogage : aucune feuille, aucun appel à Google. Il répond après [delayMs], comme la feuille de choix du compte qui se ferme :
 * - le jeton d'essai fixe [TOKEN], qui n'est pas un jeton de Google : aucun vrai back ne l'accepte ;
 * - ou, si le nonce commence par le nom d'un code d'échec suivi d'un tiret (`CANCELLED-…`, `NO_ACCOUNT-…`, `UNAVAILABLE-…`, `FAILED-…`), cet
 *   échec, pour que l'émulateur essaie chaque chemin.
 *
 * Il n'existe que dans `src/debug` : l'APK de publication ne l'embarque pas (`build.sh verify-release` refuse un APK qui le contient).
 */
internal class FakeGoogleIdentity(private val delayMs: Long = DELAY_MS) : IdentityProvider {
    private val main = Handler(Looper.getMainLooper())

    override fun signIn(clientId: String, nonce: String, callback: (IdentityResult) -> Unit): Cancellation {
        val answer = answerFor(nonce)
        val task = Runnable { callback(answer) }
        main.postDelayed(task, delayMs)
        return Cancellation { main.removeCallbacks(task) }
    }

    companion object {
        /** Le jeton d'essai : du texte qui n'a pas la forme d'un jeton de Google (trois parties signées), jamais accepté par un vrai back. */
        const val TOKEN = "jeton-d-essai-de-debogage-jamais-accepte-par-un-vrai-back"

        /** Le temps que la fausse feuille reste ouverte : assez pour qu'une seconde demande arrive pendant la première (`BUSY`). */
        const val DELAY_MS = 1500L

        /** Ce que répond le fournisseur factice à ce nonce. */
        fun answerFor(nonce: String): IdentityResult =
            IdentityError.entries.firstOrNull { nonce.startsWith("${it.name}-") }?.let { IdentityResult.Failure(it) }
                ?: IdentityResult.Token(TOKEN)
    }
}

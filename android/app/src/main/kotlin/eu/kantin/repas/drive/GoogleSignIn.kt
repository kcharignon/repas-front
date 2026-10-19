package eu.kantin.repas.drive

import android.app.Activity
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/**
 * La connexion avec Google d'Android (AUTH-011), derrière l'interface du cœur [IdentityProvider] : Credential Manager affiche sa feuille native de
 * choix du compte par-dessus la coquille (flux « bouton », `GetSignInWithGoogleOption`, déclenché par un toucher de l'utilisateur sur la page) et
 * rend un jeton d'identité signé par Google. Aucune page de Google ne s'ouvre dans une WebView, aucun secret n'est en jeu : l'ID client Web est
 * public et vient de la page (donc du back), le nonce aussi. Le jeton n'est ni gardé ni écrit au journal ; rien de ce fichier n'écrit au journal.
 *
 * Version à rappel de Credential Manager (pas de coroutines côté application). Le rappel arrive sur le fil de l'interface, une seule fois, jamais
 * après [Cancellation.cancel] (qui abandonne aussi la demande auprès de Credential Manager).
 */
internal class CredentialManagerGoogleIdentity(private val activity: Activity) : IdentityProvider {
    private val credentialManager by lazy { CredentialManager.create(activity) }
    private val main = Handler(Looper.getMainLooper())
    private val onMainThread = Executor { main.post(it) }

    override fun signIn(clientId: String, nonce: String, callback: (IdentityResult) -> Unit): Cancellation {
        val open = AtomicBoolean(true)
        val signal = CancellationSignal()
        val deliver = { result: IdentityResult -> if (open.compareAndSet(true, false)) callback(result) }
        try {
            val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
            val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
            credentialManager.getCredentialAsync(
                activity,
                request,
                signal,
                onMainThread,
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) = deliver(identityResultOf(result.credential))

                    override fun onError(e: GetCredentialException) = deliver(IdentityResult.Failure(identityErrorOf(e)))
                },
            )
        } catch (e: RuntimeException) {
            // Une demande que Credential Manager refuse d'emblée : la réponse arrive quand même par le rappel, sur le fil de l'interface.
            main.post { deliver(IdentityResult.Failure(identityErrorOf(e))) }
        }
        return Cancellation { if (open.getAndSet(false)) signal.cancel() }
    }
}

/**
 * La raison d'un échec de Credential Manager, en code du contrat du pont (fonction pure, jouée par `GoogleSignInTest`). Jamais le texte de
 * l'exception : il ne quitte pas l'application.
 * - l'utilisateur a fermé la feuille : `CANCELLED` ;
 * - aucun compte utilisable sur le téléphone : `NO_ACCOUNT` ;
 * - pas de fournisseur (services Google absents ou trop anciens) ou demande non prise en charge : `UNAVAILABLE` ;
 * - tout le reste (jeton illisible, interruption, erreur inconnue) : `FAILED`.
 */
internal fun identityErrorOf(error: Throwable): IdentityError = when (error) {
    is GetCredentialCancellationException -> IdentityError.CANCELLED
    is NoCredentialException -> IdentityError.NO_ACCOUNT
    is GetCredentialProviderConfigurationException, is GetCredentialUnsupportedException -> IdentityError.UNAVAILABLE
    is GoogleIdTokenParsingException -> IdentityError.FAILED
    else -> IdentityError.FAILED
}

/**
 * Les deux sortes de réponse de `googleid` qui portent un jeton d'identité Google : celle de toujours, et celle que la bibliothèque réserve au flux
 * « Se connecter avec Google » (`…_SIWG_…`). Les deux se lisent de la même façon.
 */
private val GOOGLE_ID_TOKEN_TYPES = setOf(
    GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL,
    GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL,
)

/** Le jeton d'identité d'une réponse de Credential Manager ; une autre sorte de réponse, ou un jeton illisible, est un échec (`FAILED`). */
internal fun identityResultOf(credential: Credential): IdentityResult {
    if (credential !is CustomCredential || credential.type !in GOOGLE_ID_TOKEN_TYPES) {
        return IdentityResult.Failure(IdentityError.FAILED)
    }
    return try {
        IdentityResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
    } catch (e: GoogleIdTokenParsingException) {
        IdentityResult.Failure(identityErrorOf(e))
    }
}

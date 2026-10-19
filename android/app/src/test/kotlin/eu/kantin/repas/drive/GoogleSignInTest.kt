package eu.kantin.repas.drive

import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialCustomException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * La connexion avec Google d'Android (AUTH-011) : la traduction des réponses de Credential Manager en codes du contrat du pont, en fonctions pures.
 * Aucun appel à Google ni à Credential Manager : les exceptions sont construites ici, comme Credential Manager les rend.
 */
class GoogleSignInTest {
    @Test
    fun `l'utilisateur ferme la feuille, CANCELLED`() {
        assertEquals(IdentityError.CANCELLED, identityErrorOf(GetCredentialCancellationException()))
        assertEquals(IdentityError.CANCELLED, identityErrorOf(GetCredentialCancellationException("fermée")))
    }

    @Test
    fun `aucun compte utilisable, NO_ACCOUNT`() {
        assertEquals(IdentityError.NO_ACCOUNT, identityErrorOf(NoCredentialException()))
    }

    @Test
    fun `pas de services Google, ou demande non prise en charge, UNAVAILABLE`() {
        assertEquals(IdentityError.UNAVAILABLE, identityErrorOf(GetCredentialProviderConfigurationException()))
        assertEquals(IdentityError.UNAVAILABLE, identityErrorOf(GetCredentialUnsupportedException()))
    }

    @Test
    fun `jeton illisible et tout le reste, FAILED`() {
        listOf(
            // Le constructeur sans argument de Kotlin (valeur par défaut) n'existe pas dans la bibliothèque publiée : on passe la cause.
            GoogleIdTokenParsingException(null as Throwable?),
            GoogleIdTokenParsingException(IllegalArgumentException("Invalid token format")),
            GetCredentialInterruptedException(),
            GetCredentialUnknownException(),
            GetCredentialCustomException("TYPE_DE_TEST"),
            IllegalArgumentException("serverClientId vide"),
            IllegalStateException(),
            RuntimeException(),
        ).forEach { assertEquals(it.javaClass.simpleName, IdentityError.FAILED, identityErrorOf(it)) }
    }

    @Test
    fun `une reponse qui n'est pas un jeton Google est un echec`() {
        assertEquals(IdentityResult.Failure(IdentityError.FAILED), identityResultOf(PasswordCredential("compte-synthetique", "valeur-synthetique")))
    }

    @Test
    fun `chaque traduction donne un code du contrat du pont`() {
        val contract = setOf("CANCELLED", "NO_ACCOUNT", "UNAVAILABLE", "BUSY", "INVALID_REQUEST", "FAILED")
        IdentityError.entries.forEach { assertEquals(it.name, true, it.name in contract) }
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le service de plateforme « jeton d'identité » (AUTH-015) : ce que le cœur en sait, sans aucune plateforme. Valeurs SYNTHÉTIQUES.
 *
 * [ScriptedIdentityProvider] montre aussi comment écrire contre l'interface (le pont de connexion, AUTH-011, s'essaie ainsi, sans WebView ni
 * Credential Manager) : un fournisseur de test qui répond ce qu'on lui a écrit, à la demande, et qui tient le contrat de [IdentityProvider].
 */
class IdentityProviderTest {
    private class ScriptedIdentityProvider(private val answer: IdentityResult) : IdentityProvider {
        val requests = mutableListOf<Pair<String, String>>()
        private var pending: ((IdentityResult) -> Unit)? = null

        override fun signIn(clientId: String, nonce: String, callback: (IdentityResult) -> Unit): Cancellation {
            requests += clientId to nonce
            pending = callback
            return Cancellation { pending = null }
        }

        /** La plateforme répond (la feuille de choix du compte se ferme) : une seule fois, et plus du tout après l'annulation. */
        fun respond() {
            val callback = pending ?: return
            pending = null
            callback(answer)
        }
    }

    private val clientId = "123456789-exemple.apps.googleusercontent.com"
    private val nonce = "nonce-synthetique-0123456789"

    @Test
    fun `les codes d'erreur sont ceux du contrat du pont`() {
        assertEquals(listOf("CANCELLED", "NO_ACCOUNT", "UNAVAILABLE", "FAILED"), IdentityError.entries.map { it.name })
    }

    @Test
    fun `le jeton ne s'ecrit pas quand on affiche le resultat`() {
        val secret = "eyJhbGciOiJSUzI1NiJ9.contenu-du-jeton.signature"

        assertFalse(IdentityResult.Token(secret).toString().contains(secret))
        assertFalse(IdentityResult.Token(secret).toString().contains("eyJ"))
        assertEquals(secret, IdentityResult.Token(secret).idToken)
    }

    @Test
    fun `une erreur se compare et s'affiche par son code`() {
        assertEquals(IdentityResult.Failure(IdentityError.CANCELLED), IdentityResult.Failure(IdentityError.CANCELLED))
        assertEquals("Failure(error=NO_ACCOUNT)", IdentityResult.Failure(IdentityError.NO_ACCOUNT).toString())
    }

    @Test
    fun `l'appelant recoit le jeton une seule fois`() {
        val provider = ScriptedIdentityProvider(IdentityResult.Token("jeton"))
        val received = mutableListOf<IdentityResult>()

        provider.signIn(clientId, nonce) { received += it }
        provider.respond()
        provider.respond()

        assertEquals(listOf(clientId to nonce), provider.requests)
        assertEquals(listOf<IdentityResult>(IdentityResult.Token("jeton")), received)
    }

    @Test
    fun `apres l'annulation, la reponse n'arrive plus`() {
        val provider = ScriptedIdentityProvider(IdentityResult.Failure(IdentityError.CANCELLED))
        val received = mutableListOf<IdentityResult>()

        val cancellation = provider.signIn(clientId, nonce) { received += it }
        cancellation.cancel()
        provider.respond()

        assertTrue(received.isEmpty())
    }
}

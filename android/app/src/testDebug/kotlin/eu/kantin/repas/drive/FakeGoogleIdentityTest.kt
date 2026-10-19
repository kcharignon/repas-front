package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** (débogage) Le fournisseur d'identité factice (AUTH-011) : ce qu'il répond, selon le nonce. Il n'existe que dans la variante de débogage. */
class FakeGoogleIdentityTest {
    @Test
    fun `un nonce ordinaire recoit le jeton d'essai fixe`() {
        assertEquals(IdentityResult.Token(FakeGoogleIdentity.TOKEN), FakeGoogleIdentity.answerFor("nonce_synthetique-0123456789"))
    }

    @Test
    fun `un nonce qui commence par un code d'echec recoit cet echec`() {
        IdentityError.entries.forEach {
            assertEquals(IdentityResult.Failure(it), FakeGoogleIdentity.answerFor("${it.name}-0123456789abcdef"))
        }
        // Le code doit être suivi d'un tiret : un nonce qui commence seulement par les mêmes lettres reçoit le jeton.
        assertEquals(IdentityResult.Token(FakeGoogleIdentity.TOKEN), FakeGoogleIdentity.answerFor("CANCELLEDX0123456789"))
    }

    @Test
    fun `le jeton d'essai n'a pas la forme d'un jeton de Google`() {
        assertFalse(FakeGoogleIdentity.TOKEN.contains('.'))
        assertFalse(FakeGoogleIdentity.TOKEN.startsWith("eyJ"))
        assertTrue(FakeGoogleIdentity.TOKEN.length in 1..NativeBridge.MAX_ID_TOKEN_CHARS)
    }

    @Test
    fun `la fausse feuille reste ouverte assez longtemps pour qu'une seconde demande recoive BUSY`() {
        assertTrue(FakeGoogleIdentity.DELAY_MS >= 1000)
    }
}

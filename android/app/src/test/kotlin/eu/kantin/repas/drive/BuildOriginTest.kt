package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * L'origine de Repas écrite à la construction (`BuildConfig`, générée pour l'application) est lue par la règle du cœur ([RepasOrigin]). Ce test
 * reste dans l'application : le cœur ne connaît pas `BuildConfig`.
 */
class BuildOriginTest {
    @Test
    fun `l'origine de la construction est une origine valide`() {
        assertNotNull(RepasOrigin.parse(BuildConfig.REPAS_ORIGIN))
        assertEquals("https://kantin.eu", RepasOrigin.parse(RepasOrigin.PRODUCTION))
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le vrai `injection.js` de l'application, joué avec les règles du cœur ([AgentAsset]). Le fichier est un actif de l'application, pas du cœur :
 * ce test reste donc ici ; il tourne dans le dossier `android/app`.
 */
class InjectionAssetTest {
    private val agent = "/*! Repas Drive agent 1.2.3 */\n(()=>{var a='\$&';})();\n"

    @Test
    fun `le fichier injection de l'application porte le marqueur du mode debogage une seule fois`() {
        val real = java.io.File("src/main/assets/injection.js").readText()

        assertEquals(2, real.split(AgentAsset.DEBUG_PLACEHOLDER).size)
        assertTrue(AgentAsset.assemble(real, agent, debug = true).contains("var DEBUG = true"))
        assertTrue(AgentAsset.assemble(real, agent).contains("var DEBUG = false"))
    }
}

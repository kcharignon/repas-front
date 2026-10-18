package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** L'agent embarqué : empreinte, version, assemblage du script injecté, états. L'« agent » des tests est un texte inventé. */
class AgentAssetTest {
    private val agent = "/*! Repas Drive agent 1.2.3 */\n(()=>{var a='\$&';})();\n"
    private val injection = "if (shim()) {\n  ${AgentAsset.PLACEHOLDER}\n}\n"

    private fun assets(
        agentJs: String? = agent,
        digest: String? = AgentAsset.digestOf(agent.toByteArray()),
        template: String? = injection,
    ): (String) -> ByteArray? = { name ->
        when (name) {
            AgentAsset.AGENT_FILE -> agentJs?.toByteArray()
            AgentAsset.DIGEST_FILE -> digest?.plus("\n")?.toByteArray()
            AgentAsset.INJECTION_FILE -> template?.toByteArray()
            else -> null
        }
    }

    @Test
    fun `l'empreinte est un SHA-384 en base64 au format integrity (vecteur de test officiel de abc)`() {
        assertEquals(
            "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
            AgentAsset.digestOf("abc".toByteArray()),
        )
    }

    @Test
    fun `la version se lit dans la premiere ligne de l'agent`() {
        assertEquals("1.2.3", AgentAsset.versionOf(agent))
        assertEquals("?", AgentAsset.versionOf("(()=>{})();"))
        assertEquals("?", AgentAsset.versionOf("x /*! Repas Drive agent 1.2.3 */"))
    }

    @Test
    fun `l'assemblage remplace le marqueur par l'agent tel quel, meme avec des caracteres speciaux`() {
        val script = AgentAsset.assemble(injection, agent)

        assertEquals("if (shim()) {\n  $agent\n}\n", script)
        assertFalse(script.contains(AgentAsset.PLACEHOLDER))
    }

    @Test
    fun `l'assemblage ecrit le mode debogage dans le script, true pour le debogage et false partout ailleurs`() {
        val template = "var DEBUG = ${AgentAsset.DEBUG_PLACEHOLDER}\n${AgentAsset.PLACEHOLDER}\n"

        assertEquals("var DEBUG = true\n$agent\n", AgentAsset.assemble(template, agent, debug = true))
        assertEquals("var DEBUG = false\n$agent\n", AgentAsset.assemble(template, agent, debug = false))
        assertEquals("var DEBUG = false\n$agent\n", AgentAsset.assemble(template, agent))
    }

    @Test
    fun `le mode debogage de l'application arrive jusqu'au script injecte`() {
        val template = "var DEBUG = ${AgentAsset.DEBUG_PLACEHOLDER}; ${AgentAsset.PLACEHOLDER}"
        val files = assets(template = template)

        assertTrue(AgentAsset.load(files, debug = true).second!!.source.startsWith("var DEBUG = true;"))
        assertTrue(AgentAsset.load(files, debug = false).second!!.source.startsWith("var DEBUG = false;"))
        assertTrue(AgentAsset.load(files).second!!.source.startsWith("var DEBUG = false;"))
    }

    @Test
    fun `le fichier injection de l'application porte le marqueur du mode debogage une seule fois`() {
        val real = java.io.File("src/main/assets/injection.js").readText()

        assertEquals(2, real.split(AgentAsset.DEBUG_PLACEHOLDER).size)
        assertTrue(AgentAsset.assemble(real, agent, debug = true).contains("var DEBUG = true"))
        assertTrue(AgentAsset.assemble(real, agent).contains("var DEBUG = false"))
    }

    @Test
    fun `l'assemblage exige le marqueur une fois exactement`() {
        listOf("sans marqueur", "${AgentAsset.PLACEHOLDER} et ${AgentAsset.PLACEHOLDER}").forEach {
            try {
                AgentAsset.assemble(it, agent)
                fail("aurait dû refuser : $it")
            } catch (_: IllegalArgumentException) {
            }
        }
    }

    @Test
    fun `un agent intact est pret, avec sa version et son empreinte`() {
        val (status, script) = AgentAsset.load(assets())

        assertEquals(AgentStatus.READY, status)
        assertNotNull(script)
        assertEquals("1.2.3", script!!.version)
        assertEquals(AgentAsset.digestOf(agent.toByteArray()), script.digest)
        assertEquals(AgentAsset.assemble(injection, agent), script.source)
    }

    @Test
    fun `un agent dont l'empreinte differe n'est jamais prepare`() {
        val (status, script) = AgentAsset.load(assets(agentJs = agent + "// code ajouté\n"))

        assertEquals(AgentStatus.CORRUPT, status)
        assertNull(script)
    }

    @Test
    fun `une empreinte attendue illisible vaut une empreinte differente`() {
        assertEquals(AgentStatus.CORRUPT, AgentAsset.load(assets(digest = "n'importe quoi")).first)
    }

    @Test
    fun `un fichier manquant donne l'etat absent`() {
        listOf(assets(agentJs = null), assets(digest = null), assets(template = null)).forEach {
            val (status, script) = AgentAsset.load(it)
            assertEquals(AgentStatus.MISSING, status)
            assertNull(script)
        }
        assertTrue(AgentAsset.load({ null }).first == AgentStatus.MISSING)
    }
}

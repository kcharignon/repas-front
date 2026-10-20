package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Les messages `update.state` que la page de Repas reçoit (DRV-639) : les mots du protocole, rien d'autre. */
class UpdateStateTest {
    private fun message(state: UpdateState) = JSONObject(state.toMessage())

    private fun keys(json: JSONObject): Set<String> = json.keys().asSequence().toSet()

    @Test
    fun `les mots du protocole`() {
        assertEquals("inconnu", UpdateState.Unknown.wire)
        assertEquals("verification", UpdateState.Checking.wire)
        assertEquals("aJour", UpdateState.UpToDate.wire)
        assertEquals("miseAJourDisponible", UpdateState.Available("0.1.30").wire)
        assertEquals("telechargement", UpdateState.Downloading("0.1.30", 4).wire)
        assertEquals("pretAInstaller", UpdateState.Ready("0.1.30").wire)
        assertEquals("erreur", UpdateState.Failed(UpdateError.OFFLINE, null).wire)
    }

    @Test
    fun `un etat sans detail ne porte que son mot`() {
        listOf(UpdateState.Unknown, UpdateState.Checking, UpdateState.UpToDate).forEach {
            val json = message(it)
            assertEquals(setOf("v", "type", "state"), keys(json))
            assertEquals(1, json.getInt("v"))
            assertEquals("update.state", json.getString("type"))
            assertEquals(it.wire, json.getString("state"))
        }
    }

    @Test
    fun `une mise a jour disponible dit la version`() {
        val json = message(UpdateState.Available("0.1.30"))

        assertEquals(setOf("v", "type", "state", "version"), keys(json))
        assertEquals("0.1.30", json.getString("version"))
    }

    @Test
    fun `le telechargement dit la progression, entre 0 et 100`() {
        assertEquals(42, message(UpdateState.Downloading("0.1.30", 42)).getInt("progress"))
        assertEquals(0, message(UpdateState.Downloading("0.1.30", -5)).getInt("progress"))
        assertEquals(100, message(UpdateState.Downloading("0.1.30", 400)).getInt("progress"))
        assertEquals(setOf("v", "type", "state", "version", "progress"), keys(message(UpdateState.Downloading("0.1.30", 1))))
    }

    @Test
    fun `une erreur n'a qu'un code en majuscules, jamais un texte ni une adresse`() {
        UpdateError.entries.forEach { error ->
            val json = message(UpdateState.Failed(error, "0.1.30"))

            assertEquals(setOf("v", "type", "state", "code", "version"), keys(json))
            assertTrue(error.code, Regex("^[A-Z][A-Z0-9_]{0,63}$").matches(json.getString("code")))
        }
        assertFalse(message(UpdateState.Failed(UpdateError.OFFLINE, null)).has("version"))
    }

    @Test
    fun `prêt à installer dit la version`() {
        assertEquals("pretAInstaller", message(UpdateState.Ready("1.2.3")).getString("state"))
        assertEquals("1.2.3", message(UpdateState.Ready("1.2.3")).getString("version"))
    }
}

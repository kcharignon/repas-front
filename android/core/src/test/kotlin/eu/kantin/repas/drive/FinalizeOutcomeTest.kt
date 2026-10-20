package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** La forme du dernier « Finaliser sur Leclerc » (DRV-631) : un mot, retenu pour le diagnostic. */
class FinalizeOutcomeTest {
    private class MemoryStore(var value: String? = null) : FinalizeOutcomeStore {
        var writes = 0

        override fun load() = value

        override fun save(value: String?) {
            writes++
            this.value = value
        }
    }

    @Test
    fun `retient la derniere forme, et ne reecrit pas la meme`() {
        val store = MemoryStore()
        val memory = FinalizeOutcomeMemory(store)
        assertNull(memory.last())

        memory.record(FinalizeOutcome.OUVERTE)
        memory.record(FinalizeOutcome.OUVERTE)
        assertEquals(1, store.writes)
        assertEquals(FinalizeOutcome.OUVERTE, memory.last())

        memory.record(FinalizeOutcome.ERREUR_HTTP_4XX)
        assertEquals(FinalizeOutcome.ERREUR_HTTP_4XX, memory.last())
        assertEquals("ERREUR_HTTP_4XX", store.value)
    }

    @Test
    fun `une valeur inconnue ou effacee ne donne rien`() {
        val store = MemoryStore("n'importe quoi")
        val memory = FinalizeOutcomeMemory(store)
        assertNull(memory.last())

        memory.record(FinalizeOutcome.CHEMIN_INCONNU)
        memory.forget()
        assertNull(memory.last())
        assertNull(store.value)
    }

    @Test
    fun `le code HTTP donne la forme 4xx ou 5xx`() {
        listOf(400, 404, 410).forEach { assertEquals(FinalizeOutcome.ERREUR_HTTP_4XX, FinalizeOutcome.ofHttp(it)) }
        listOf(500, 502, 503).forEach { assertEquals(FinalizeOutcome.ERREUR_HTTP_5XX, FinalizeOutcome.ofHttp(it)) }
    }

    @Test
    fun `les formes sont des mots, jamais une adresse ni un numero`() {
        FinalizeOutcome.entries.forEach { assertEquals(it.name, true, Regex("^[A-Z0-9_]+$").matches(it.name)) }
        assertEquals(
            listOf("OUVERTE", "CHEMIN_INCONNU", "ADRESSE_REFUSEE", "ERREUR_HTTP_4XX", "ERREUR_HTTP_5XX", "TITRE_INTROUVABLE"),
            FinalizeOutcome.entries.map { it.name },
        )
    }
}

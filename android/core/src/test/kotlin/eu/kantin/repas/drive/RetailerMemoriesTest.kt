package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Les mémoires par enseigne (DRV-706) : une clé par enseigne (`path.<identifiant>`, `finalize.<identifiant>`), et la valeur unique de l'ancienne version
 * relue, sans perte, comme celle de l'enseigne d'avant. Adresses SYNTHÉTIQUES.
 */
class RetailerMemoriesTest {
    private val leclerc = RetailerSites.DEFAULT.legacy
    private val sites = FictionalSites.WITH_DEFAULT
    private val fictive = FictionalSites.A

    private val host = "m-courses.leclercdrive.fr"
    private val leclercPage = "https://$host/magasin-000000-000000-Ville-Test/recherche.aspx"
    private val leclercHome = "https://$host/magasin-000000-000000-Ville-Test"
    private val fictivePage = "https://boutique.exemple-a.test/depot-000000-000000-Ville-Test/accueil.aspx"
    private val fictiveHome = "https://boutique.exemple-a.test/depot-000000-000000-Ville-Test"

    // —— le chemin du magasin ——————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `un chemin enregistre par l'ancienne version est relu comme celui de l'enseigne d'avant`() {
        val old = MemoryKeyValues(mapOf("path" to leclercHome))
        val memories = StorePathMemories(sites, old)

        assertEquals(leclercHome, memories.of(leclerc).storeHomeUrl(host, "000000", "000000"))
        assertTrue(memories.of(leclerc).hasPath())
        assertEquals(0, old.writes)
        assertEquals(
            DriveEntry.Entry(leclercHome, FinalizeOutcome.OUVERTE),
            DriveEntry.resolve("https://$host/magasin-000000-000000", memories),
        )
    }

    @Test
    fun `l'ancienne valeur n'est jamais celle d'une autre enseigne`() {
        val old = MemoryKeyValues(mapOf("path" to leclercHome))
        val memories = StorePathMemories(sites, old)

        assertFalse(memories.of(fictive).hasPath())
        assertNull(memories.of(fictive).storeHomeUrl(host, "000000", "000000"))
        assertNull(memories.of(fictive).storeHomeUrl("boutique.exemple-a.test", "000000", "000000"))
    }

    @Test
    fun `la premiere ecriture deplace la valeur sous la cle de l'enseigne sans rien perdre des autres`() {
        val old = MemoryKeyValues(mapOf("path" to leclercHome, "finalize" to "OUVERTE"))
        val memories = StorePathMemories(sites, old)

        memories.remember("https://$host/magasin-000000-000000-Autre-Ville/")

        assertEquals("https://$host/magasin-000000-000000-Autre-Ville", old.values["path.leclerc"])
        assertNull("la clé d'avant est retirée", old.values["path"])
        assertEquals("une autre mémoire n'est pas touchée", "OUVERTE", old.values["finalize"])
    }

    @Test
    fun `la meme page que l'ancienne valeur ne reecrit rien, la lecture suffit`() {
        val old = MemoryKeyValues(mapOf("path" to leclercHome))

        StorePathMemories(sites, old).remember(leclercPage)

        assertEquals(0, old.writes)
        assertEquals(mapOf("path" to leclercHome), old.values)
    }

    @Test
    fun `chaque enseigne garde son chemin sous sa propre cle`() {
        val values = MemoryKeyValues()
        val memories = StorePathMemories(sites, values)

        memories.remember(leclercPage)
        memories.remember(fictivePage)
        // Une page d'aucune enseigne ne change rien
        memories.remember("https://evil.test/depot-000000-000000-Ville-Test/")
        memories.remember(null)

        assertEquals(mapOf("path.leclerc" to leclercHome, "path.exemplea" to fictiveHome), values.values)
        assertEquals(fictiveHome, memories.of(fictive).storeHomeUrl("boutique.exemple-a.test", "000000", "000000"))
        assertNull(memories.of(fictive).storeHomeUrl(host, "000000", "000000"))
        assertNull(memories.of(leclerc).storeHomeUrl("boutique.exemple-a.test", "000000", "000000"))
    }

    @Test
    fun `oublier une enseigne laisse les autres, et oublier tout efface tout, ancienne cle comprise`() {
        val values = MemoryKeyValues(mapOf("path" to leclercHome, "path.exemplea" to fictiveHome))
        val memories = StorePathMemories(sites, values)

        memories.forget(fictive)
        assertEquals(mapOf("path" to leclercHome), values.values)
        assertTrue(memories.of(leclerc).hasPath())

        memories.forget(leclerc)
        assertTrue("l'ancienne valeur ne renaît pas", values.values.isEmpty())
        assertFalse(memories.of(leclerc).hasPath())

        memories.remember(leclercPage)
        memories.remember(fictivePage)
        memories.forget()
        assertTrue(values.values.isEmpty())
    }

    @Test
    fun `une valeur gardee qui n'a plus la forme attendue n'est jamais utilisee`() {
        listOf("n'importe quoi", "https://exemple.org/magasin-000000-000000-Ville-Test", fictiveHome, "https://$host/magasin-000000-000000").forEach {
            val memories = StorePathMemories(sites, MemoryKeyValues(mapOf("path" to it)))
            assertNull(it, memories.of(leclerc).storeHomeUrl(host, "000000", "000000"))
        }
        // Une valeur de la clé de A qui est une page de Leclerc n'est pas utilisée par A
        val memories = StorePathMemories(sites, MemoryKeyValues(mapOf("path.exemplea" to leclercHome)))
        assertFalse(memories.of(fictive).hasPath())
    }

    @Test
    fun `une enseigne hors du registre n'a pas de memoire`() {
        val memories = StorePathMemories(RetailerSites.DEFAULT, MemoryKeyValues())

        assertThrows(IllegalArgumentException::class.java) { memories.of(fictive) }
        assertThrows(IllegalArgumentException::class.java) { FinalizeOutcomeMemories(RetailerSites.DEFAULT, MemoryKeyValues()).of(fictive) }
    }

    // —— la forme du dernier « Finaliser » ————————————————————————————————————————————————————————————————————————

    @Test
    fun `une forme enregistree par l'ancienne version est relue comme celle de l'enseigne d'avant`() {
        val memories = FinalizeOutcomeMemories(sites, MemoryKeyValues(mapOf("finalize" to "TITRE_INTROUVABLE")))

        assertEquals(FinalizeOutcome.TITRE_INTROUVABLE, memories.last())
        assertEquals(FinalizeOutcome.TITRE_INTROUVABLE, memories.last(leclerc))
        assertNull(memories.last(fictive))
    }

    @Test
    fun `enregistrer une forme la range sous la cle de son enseigne`() {
        val values = MemoryKeyValues(mapOf("finalize" to "CHEMIN_INCONNU", "path" to leclercHome))
        val memories = FinalizeOutcomeMemories(sites, values)

        memories.record(FinalizeOutcome.OUVERTE)
        memories.record(FinalizeOutcome.ERREUR_HTTP_5XX, fictive)

        assertEquals(mapOf("finalize.leclerc" to "OUVERTE", "finalize.exemplea" to "ERREUR_HTTP_5XX", "path" to leclercHome), values.values)
        assertEquals(FinalizeOutcome.OUVERTE, memories.last())
        assertEquals(FinalizeOutcome.ERREUR_HTTP_5XX, memories.last(fictive))
    }

    @Test
    fun `oublier les formes efface tout, ancienne cle comprise, et une seule enseigne laisse l'autre`() {
        val values = MemoryKeyValues(mapOf("finalize" to "OUVERTE", "finalize.exemplea" to "OUVERTE"))
        val memories = FinalizeOutcomeMemories(sites, values)

        memories.forget(fictive)
        assertEquals(FinalizeOutcome.OUVERTE, memories.last())
        assertNull(memories.last(fictive))

        memories.forget()
        assertTrue(values.values.isEmpty())
        assertNull(memories.last())
    }

    @Test
    fun `une forme inconnue gardee n'est pas lue`() {
        val memories = FinalizeOutcomeMemories(sites, MemoryKeyValues(mapOf("finalize" to "https://$host/", "finalize.exemplea" to "")))

        assertNull(memories.last())
        assertNull(memories.last(fictive))
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** La migration unique vers la version mobile (DRV-757) : un drapeau, une seule fois, l'enseigne d'avant seulement, aucune autre enseigne touchée. Données SYNTHÉTIQUES. */
class SiteModeMigrationTest {
    private val sites = RetailerSites.DEFAULT
    private val leclerc = sites.legacy
    private val other = sites.all.first { it !== leclerc }

    private class Cleaner(var ok: Boolean = true) {
        val cleared = mutableListOf<String>()
        fun clear(site: RetailerSite): Boolean {
            if (!ok) return false
            cleared += site.id
            return true
        }
    }

    @Test
    fun `le premier lancement efface les donnees de l'enseigne d'avant et note le drapeau`() {
        val store = MemoryKeyValues()
        val cleaner = Cleaner()
        val migration = SiteModeMigration(sites, store, cleaner::clear)

        assertTrue(migration.due(leclerc))
        assertTrue(migration.runFor(leclerc))

        assertEquals(listOf(leclerc.id), cleaner.cleared)
        assertFalse(migration.due(leclerc))
        assertEquals("1", store.values["${SiteModeMigration.KEY}.${leclerc.id}"])
    }

    @Test
    fun `elle ne se rejoue jamais, meme apres un redemarrage`() {
        val store = MemoryKeyValues()
        val cleaner = Cleaner()
        SiteModeMigration(sites, store, cleaner::clear).runFor(leclerc)

        val again = SiteModeMigration(sites, store, cleaner::clear)

        assertFalse(again.runFor(leclerc))
        assertFalse(again.runFor(leclerc))
        assertEquals(1, cleaner.cleared.size)
    }

    @Test
    fun `une autre enseigne n'est jamais effacee et n'a pas de drapeau`() {
        val store = MemoryKeyValues()
        val cleaner = Cleaner()
        val migration = SiteModeMigration(sites, store, cleaner::clear)

        assertFalse(migration.due(other))
        assertFalse(migration.runFor(other))

        assertTrue(cleaner.cleared.isEmpty())
        assertTrue(store.values.isEmpty())
    }

    @Test
    fun `sans effacement possible sans toucher aux autres donnees, rien n'est note et elle sera retentee`() {
        val store = MemoryKeyValues()
        val cleaner = Cleaner(ok = false)
        val migration = SiteModeMigration(sites, store, cleaner::clear)

        assertFalse(migration.runFor(leclerc))

        assertTrue(store.values.isEmpty())
        assertTrue(migration.due(leclerc))
        cleaner.ok = true
        assertTrue(migration.runFor(leclerc))
    }

    @Test
    fun `une enseigne en mode ordinateur n'a pas de migration`() {
        val fictive = FictionalSites.A
        val registry = RetailerSites(listOf(fictive), legacy = fictive)

        assertFalse(SiteModeMigration(registry, MemoryKeyValues()) { true }.due(fictive))
    }
}

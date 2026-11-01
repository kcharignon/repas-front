package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La migration unique vers la version mobile (DRV-757) : un drapeau posé APRÈS la fin réelle de l'effacement, une seule fois, l'enseigne d'avant seulement, un message seulement
 * s'il y avait quelque chose à effacer, aucune autre enseigne touchée. Données SYNTHÉTIQUES.
 */
class SiteModeMigrationTest {
    private val sites = RetailerSites.DEFAULT
    private val leclerc = sites.legacy
    private val other = sites.all.first { it !== leclerc }

    /** Un effaceur dont la fin est à la main du test (comme le rappel asynchrone de la WebView). */
    private class Eraser(var data: Boolean = true, var possible: Boolean = true) : SiteDataEraser {
        val erased = mutableListOf<String>()
        var finish: (() -> Unit)? = null

        override fun hasData(site: RetailerSite) = data

        override fun erase(site: RetailerSite, done: () -> Unit): Boolean {
            if (!possible) return false
            erased += site.id
            finish = done
            return true
        }
    }

    private class Result {
        val calls = mutableListOf<MigrationOutcome>()
        fun record(outcome: MigrationOutcome) {
            calls += outcome
        }
    }

    /** Une horloge à la main : le délai de secours sonne quand le test le dit. */
    private class Clock : Delay {
        private var pending: (() -> Unit)? = null
        var cancelled = false

        override fun after(millis: Long, action: () -> Unit): () -> Unit {
            assertEquals(SiteModeMigration.GIVE_UP_MS, millis)
            pending = action
            return {
                cancelled = true
                pending = null
            }
        }

        fun ring() = pending?.invoke()
    }

    @Test
    fun `le drapeau n'est pose qu'APRES la fin reelle de l'effacement`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        val result = Result()
        val migration = SiteModeMigration(sites, store, eraser, Clock())

        assertTrue(migration.runFor(leclerc, result::record))

        assertEquals(listOf(leclerc.id), eraser.erased)
        assertTrue("pas de drapeau tant que l'effacement n'est pas fini", store.values.isEmpty())
        assertTrue(result.calls.isEmpty())
        assertTrue(migration.due(leclerc))

        eraser.finish?.invoke()

        assertEquals("1", store.values["${SiteModeMigration.KEY}.${leclerc.id}"])
        assertEquals(listOf(MigrationOutcome.ERASED), result.calls)
        assertFalse(migration.due(leclerc))
    }

    @Test
    fun `une installation neuve ou deja effacee est effacee sans message`() {
        val store = MemoryKeyValues()
        val eraser = Eraser(data = false)
        val result = Result()

        SiteModeMigration(sites, store, eraser, Clock()).runFor(leclerc, result::record)
        eraser.finish?.invoke()

        assertEquals("le stockage du site est effacé quand même", listOf(leclerc.id), eraser.erased)
        assertEquals("pas de message : personne n'a été déconnecté", listOf(MigrationOutcome.NOTHING_TO_ERASE), result.calls)
        assertEquals("1", store.values["${SiteModeMigration.KEY}.${leclerc.id}"])
    }

    @Test
    fun `elle ne se rejoue jamais, meme apres un redemarrage`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        SiteModeMigration(sites, store, eraser, Clock()).runFor(leclerc) {}
        eraser.finish?.invoke()

        val again = SiteModeMigration(sites, store, eraser, Clock())

        assertFalse(again.runFor(leclerc) {})
        assertFalse(again.runFor(leclerc) {})
        assertEquals(1, eraser.erased.size)
    }

    @Test
    fun `un effacement interrompu avant sa fin se refait au lancement suivant`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        SiteModeMigration(sites, store, eraser, Clock()).runFor(leclerc) {}
        // le processus s'arrête : le rappel n'est jamais venu

        val next = SiteModeMigration(sites, store, eraser, Clock())

        assertTrue(next.due(leclerc))
        assertTrue(next.runFor(leclerc) {})
        assertEquals(2, eraser.erased.size)
    }

    @Test
    fun `deux lancements pendant l'effacement ne l'effacent qu'une fois et ne disent qu'un message`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        val result = Result()
        val migration = SiteModeMigration(sites, store, eraser, Clock())

        assertTrue(migration.runFor(leclerc, result::record))
        assertFalse(migration.runFor(leclerc, result::record))
        eraser.finish?.invoke()

        assertEquals(1, eraser.erased.size)
        assertEquals(1, result.calls.size)
    }

    @Test
    fun `un rappel qui ne vient jamais, au bout de 3 s la page se charge quand meme, pas de drapeau, pas de message, et la migration sera retentee`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        val clock = Clock()
        val result = Result()
        val migration = SiteModeMigration(sites, store, eraser, clock)

        assertTrue(migration.runFor(leclerc, result::record))
        assertTrue("rien avant le délai", result.calls.isEmpty())
        clock.ring()

        assertEquals(listOf(MigrationOutcome.GAVE_UP), result.calls)
        assertTrue("le drapeau n'est PAS posé", store.values.isEmpty())
        assertTrue(migration.due(leclerc))

        // Le rappel tardif de la WebView ne pose rien et ne dit rien
        eraser.finish?.invoke()
        assertEquals(1, result.calls.size)
        assertTrue(store.values.isEmpty())

        // Au lancement suivant, elle est retentée
        val next = SiteModeMigration(sites, store, eraser, Clock())
        assertTrue(next.runFor(leclerc) {})
        assertEquals(2, eraser.erased.size)
    }

    @Test
    fun `un effacement fini a temps annule le delai de secours`() {
        val clock = Clock()
        val eraser = Eraser()
        val migration = SiteModeMigration(sites, MemoryKeyValues(), eraser, clock)
        migration.runFor(leclerc) {}

        eraser.finish?.invoke()

        assertTrue(clock.cancelled)
    }

    @Test
    fun `une autre enseigne n'est jamais effacee et n'a pas de drapeau`() {
        val store = MemoryKeyValues()
        val eraser = Eraser()
        val migration = SiteModeMigration(sites, store, eraser, Clock())

        assertFalse(migration.due(other))
        assertFalse(migration.runFor(other) {})

        assertTrue(eraser.erased.isEmpty())
        assertTrue(store.values.isEmpty())
    }

    @Test
    fun `sans effacement possible sans toucher aux autres donnees, rien n'est note et elle sera retentee`() {
        val store = MemoryKeyValues()
        val eraser = Eraser(possible = false)
        val migration = SiteModeMigration(sites, store, eraser, Clock())

        assertFalse(migration.runFor(leclerc) {})

        assertTrue(store.values.isEmpty())
        assertTrue(migration.due(leclerc))
        eraser.possible = true
        assertTrue(migration.runFor(leclerc) {})
    }

    @Test
    fun `une enseigne en mode ordinateur n'a pas de migration`() {
        val fictive = FictionalSites.A
        val registry = RetailerSites(listOf(fictive), legacy = fictive)

        assertFalse(SiteModeMigration(registry, MemoryKeyValues(), Eraser(), Clock()).due(fictive))
    }
}

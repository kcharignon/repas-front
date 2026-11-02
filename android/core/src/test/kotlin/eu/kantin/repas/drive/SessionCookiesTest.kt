package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Les cookies de Repas sont écrits sur le disque avant qu'un arrêt du processus puisse perdre la dernière rotation de la session (DRV-765) : l'installateur n'est jamais ouvert
 * sans écriture avant, l'écriture retardée se réarme sans se multiplier et s'annule à la destruction. Aucune donnée réelle.
 */
class SessionCookiesTest {
    /** Un journal commun, pour juger de l'ORDRE des gestes. */
    private val events = mutableListOf<String>()

    private val flusher = CookieFlusher { events += "flush" }

    /** Une horloge à la main : les rappels attendent que le test les fasse sonner. */
    private class ManualDelay : Delay {
        val requested = mutableListOf<Long>()
        val live = mutableListOf<() -> Unit>()
        var cancellations = 0

        override fun after(millis: Long, action: () -> Unit): () -> Unit {
            requested += millis
            live += action
            return {
                if (live.remove(action)) cancellations++
            }
        }

        fun ring() = live.toList().also { live.clear() }.forEach { it() }
    }

    private val delay = ManualDelay()
    private val cookies = SessionCookies(flusher, delay)

    @Test
    fun `l'installateur n'est jamais ouvert sans ecriture des cookies avant`() {
        val opened = cookies.beforeInstaller {
            events += "installateur"
            true
        }

        assertTrue(opened)
        assertEquals(listOf("flush", "installateur"), events)
    }

    @Test
    fun `l'ecriture avant l'installateur a lieu meme si l'installateur est introuvable`() {
        val opened = cookies.beforeInstaller {
            events += "installateur"
            false
        }

        assertFalse(opened)
        assertEquals(listOf("flush", "installateur"), events)
    }

    @Test
    fun `l'ecriture immediate ecrit tout de suite`() {
        cookies.flushNow()

        assertEquals(listOf("flush"), events)
        assertTrue(delay.requested.isEmpty())
    }

    @Test
    fun `l'ecriture retardee attend la fin du delai puis ecrit une seule fois`() {
        cookies.flushSoon()

        assertEquals(listOf(SessionCookies.SETTLE_MS), delay.requested)
        assertTrue("rien n'est écrit avant la fin du délai", events.isEmpty())

        delay.ring()
        delay.ring()

        assertEquals(listOf("flush"), events)
    }

    @Test
    fun `chaque page rearme l'attente sans la multiplier`() {
        cookies.flushSoon()
        cookies.flushSoon()
        cookies.flushSoon()

        assertEquals("un seul rappel reste en attente", 1, delay.live.size)
        assertEquals("les deux premiers ont été annulés", 2, delay.cancellations)

        delay.ring()

        assertEquals(listOf("flush"), events)
    }

    @Test
    fun `une ecriture retardee deja sonnee ne bloque pas la suivante`() {
        cookies.flushSoon()
        delay.ring()
        cookies.flushSoon()

        assertEquals(1, delay.live.size)
        assertEquals("rien à annuler : le premier rappel a déjà sonné", 0, delay.cancellations)

        delay.ring()

        assertEquals(listOf("flush", "flush"), events)
    }

    @Test
    fun `l'ecriture immediate laisse l'ecriture retardee armee`() {
        cookies.flushSoon()
        cookies.flushNow()

        assertEquals(listOf("flush"), events)
        assertEquals(1, delay.live.size)

        delay.ring()

        assertEquals(listOf("flush", "flush"), events)
    }

    @Test
    fun `la destruction annule l'ecriture retardee`() {
        cookies.flushSoon()
        cookies.close()
        delay.ring()

        assertTrue(events.isEmpty())
        assertEquals(1, delay.cancellations)
        // fermer deux fois ne fait rien de plus
        cookies.close()
        assertEquals(1, delay.cancellations)
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Quand le plan part vers l'agent : une fois par page, après l'annonce de l'agent ET la fin du chargement, quel que soit l'ordre des événements. */
class PlanDeliveryTest {
    @Test
    fun `le plan part quand l'agent a annonce la page puis que le chargement est fini`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()

        assertFalse(delivery.hello())
        assertTrue(delivery.pageFinished())
    }

    @Test
    fun `le plan part aussi quand le chargement finit avant l'annonce de l'agent`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()

        assertFalse(delivery.pageFinished())
        assertTrue(delivery.hello())
    }

    @Test
    fun `le plan ne part jamais avant la fin du chargement`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()

        assertFalse(delivery.hello())
        assertFalse(delivery.hello())
    }

    @Test
    fun `le plan ne part qu'une fois par page`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()
        delivery.hello()
        assertTrue(delivery.pageFinished())

        assertFalse(delivery.pageFinished())
    }

    @Test
    fun `chaque nouvelle page recoit son plan`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()
        delivery.hello()
        assertTrue(delivery.pageFinished())

        delivery.pageStarted()
        assertFalse(delivery.pageFinished())
        assertTrue(delivery.hello())
    }

    @Test
    fun `le debut d'une page ne fait pas oublier l'annonce de l'agent arrivee juste avant`() {
        // L'ordre entre onPageStarted et le hello d'une page n'est pas garanti : ici le hello passe en premier.
        val delivery = PlanDelivery()
        assertFalse(delivery.hello())
        delivery.pageStarted()

        assertTrue(delivery.pageFinished())
    }

    @Test
    fun `une nouvelle page dont le chargement finit avant l'annonce recoit son plan quand elle l'annonce`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()
        delivery.hello()
        assertTrue(delivery.pageFinished())

        delivery.pageStarted()
        assertFalse("rien ne part vers l'ancienne page : son annonce a déjà reçu son plan", delivery.pageFinished())
        assertTrue("le plan part dès que la nouvelle page s'annonce", delivery.hello())
    }

    @Test
    fun `un envoi manque peut etre redemande`() {
        val delivery = PlanDelivery()
        delivery.pageStarted()
        delivery.hello()
        assertTrue(delivery.pageFinished())

        delivery.failed()
        assertTrue(delivery.pageFinished())
    }
}

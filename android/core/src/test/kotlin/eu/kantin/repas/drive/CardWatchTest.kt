package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le repli quand l'agent est là mais ne montre rien (DRV-760, recette de la 1.6.2 : le mur de cookies de Leclerc, aucune carte pendant plus de 20 s, l'agent présent) : un bandeau natif
 * court dit de continuer dans la page, et disparaît dès qu'un écran de l'agent est à l'écran. Adresses SYNTHETIQUES.
 */
class CardWatchTest {
    private var now = 1_000L
    private val watch = CardWatch(clock = { now })

    @Test
    fun `le plan est parti et rien n'apparait apres le delai, la carte manque`() {
        watch.planSent()
        assertFalse(watch.missing())

        now += CardWatch.GRACE_MS - 1
        assertFalse(watch.missing())

        now += 1
        assertTrue(watch.missing())
    }

    @Test
    fun `un ecran de l'agent a l'ecran arrete le manque, son retrait le fait revenir apres le delai`() {
        watch.planSent()
        now += CardWatch.GRACE_MS + 1
        assertTrue(watch.missing())

        watch.onAgent(true)
        assertFalse(watch.missing())

        watch.onAgent(false)
        assertTrue(watch.missing())
    }

    @Test
    fun `sans plan parti rien ne manque, et une nouvelle page repart de zero`() {
        now += CardWatch.GRACE_MS * 2
        assertFalse(watch.missing())

        watch.planSent()
        watch.onAgent(true)
        watch.pageStarted()
        now += CardWatch.GRACE_MS * 2

        assertFalse(watch.missing())
    }

    @Test
    fun `l'etat de l'ecran se lit dans un message log, entree non fiable`() {
        assertEquals(true, AgentDiagnostic.cardState("""{"v":1,"type":"log","card":true}"""))
        assertEquals(false, AgentDiagnostic.cardState("""{"v":1,"type":"log","card":false}"""))
        assertNull(AgentDiagnostic.cardState("""{"v":1,"type":"log","lines":["Session : x"]}"""))
        assertNull(AgentDiagnostic.cardState("""{"v":1,"type":"log","card":"oui"}"""))
        assertNull(AgentDiagnostic.cardState("pas du json"))
    }

    @Test
    fun `le bandeau de repli ne vaut que pour un plan, apres un autre message nul`() {
        val plan = DrivePlan.parse(ReferencePlans.json())!!
        val site = RetailerSites.DEFAULT.legacy

        assertEquals(StoreBanner.NO_CARD, StoreBanner.of(plan, "https://m-courses.leclercdrive.fr/magasin-000001-000001-Ville-Test", cardMissing = true))
        assertEquals(StoreBanner.NONE, StoreBanner.of(plan, "https://m-courses.leclercdrive.fr/magasin-000001-000001-Ville-Test", cardMissing = false))
        assertEquals(StoreBanner.NONE, StoreBanner.of(null, site.startUrl, cardMissing = true))
        // Un autre message l'emporte : la page refusée garde son bandeau
        assertEquals(StoreBanner.PLAN, StoreBanner.of(plan, "https://m-courses.leclercdrive.fr/magasin-000001-000001-Ville-Test", PageTrouble.HTTP_ERROR, cardMissing = true))
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La page d'arrivée d'un magasin ouvert directement ([StoreArrival], DRV-759 : « Utiliser ce magasin », « Finaliser ») : le site la refuse (4xx, repli sur l'accueil) ou la sert
 * « introuvable » avec un statut 200 (seul le TITRE est lu). Le titre n'est surveillé que pour CETTE page, le temps de son chargement et un court délai ensuite : jamais toute la
 * passe. Adresses SYNTHETIQUES.
 */
class StoreArrivalTest {
    private val site = RetailerSites.DEFAULT.legacy
    private val home = "https://m-courses.leclercdrive.fr/magasin-000001-000001-Ville-Test"
    private var now = 1_000L
    private val arrival = StoreArrival(clock = { now })

    @Test
    fun `une page d'arrivee introuvable servie en 200 est vue par son titre pendant le chargement`() {
        arrival.arm(home, watchTitle = true)

        assertTrue(arrival.titleSaysMissing(home, "Page introuvable", site))
        assertFalse(arrival.titleSaysMissing(home, "Mon magasin", site))
    }

    @Test
    fun `le titre n'est plus surveille quelques secondes apres la fin du chargement de la page`() {
        arrival.arm(home, watchTitle = true)
        arrival.pageFinished(home)

        now += StoreArrival.TITLE_GRACE_MS - 1
        assertTrue(arrival.titleSaysMissing(home, "404", site))

        now += 2
        assertFalse(arrival.titleSaysMissing(home, "404", site))
    }

    @Test
    fun `une page chargee sans refus n'est plus l'adresse d'arrivee`() {
        arrival.arm(home, watchTitle = true)
        assertEquals(home, arrival.homeTarget)

        arrival.pageFinished(home)

        assertNull(arrival.homeTarget)
    }

    @Test
    fun `une autre page qui commence, ou un repli, arrete la surveillance`() {
        arrival.arm(home, watchTitle = true)
        arrival.pageStarted("https://m-courses.leclercdrive.fr/magasin-000001-000001-Ville-Test/recherche.aspx")
        assertFalse(arrival.titleSaysMissing(home, "404", site))

        arrival.arm(home, watchTitle = true)
        arrival.disarm()
        assertFalse(arrival.titleSaysMissing(home, "404", site))
        assertNull(arrival.homeTarget)
    }

    @Test
    fun `sans surveillance du titre rien n'est lu, seul le refus du site compte`() {
        arrival.arm(home, watchTitle = false)

        assertFalse(arrival.titleSaysMissing(home, "404", site))
        assertTrue(DriveEntry.fallsBack(arrival.homeTarget, home, 404))
    }

    @Test
    fun `un slash final de plus ou de moins n'empeche ni la fin du chargement ni le delai de grace`() {
        arrival.arm(home, watchTitle = true)
        arrival.pageStarted("$home/")
        assertTrue(arrival.titleSaysMissing(home, "404", site))

        arrival.pageFinished("$home/")

        assertNull(arrival.homeTarget)
        now += StoreArrival.TITLE_GRACE_MS + 1
        assertFalse(arrival.titleSaysMissing(home, "404", site))
    }

    @Test
    fun `une redirection vers une autre adresse du meme magasin finit quand meme la surveillance apres le delai`() {
        val redirected = "$home/accueil.aspx"
        arrival.arm(home, watchTitle = true)

        arrival.pageFinished(redirected)

        assertNull(arrival.homeTarget)
        now += StoreArrival.TITLE_GRACE_MS + 1
        assertFalse(arrival.titleSaysMissing(redirected, "404", site))
    }

    @Test
    fun `un debut de page sans adresse ne change rien`() {
        arrival.arm(home, watchTitle = true)

        arrival.pageStarted(null)

        assertEquals(home, arrival.homeTarget)
        assertTrue(arrival.titleSaysMissing(home, "404", site))
    }

    @Test
    fun `un rechargement apres le delai ne relance pas la surveillance du titre`() {
        arrival.arm(home, watchTitle = true)
        arrival.pageFinished(home)
        now += StoreArrival.TITLE_GRACE_MS + 1

        arrival.pageStarted(home)
        arrival.pageFinished(home)

        assertFalse(arrival.titleSaysMissing(home, "404", site))
        assertNull(arrival.homeTarget)
    }
}

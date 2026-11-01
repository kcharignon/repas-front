package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Où un passage de plan s'ouvre (DRV-759) : l'accueil de l'enseigne, SAUF quand l'utilisateur vient d'ouvrir le magasin du plan dans l'application : sa page de magasin retenue
 * ([StorePathMemory]). Mesuré : après « Utiliser ce magasin » le parcours repartait de l'accueil (champ du code postal vide) et la personne devait choisir son magasin une
 * seconde fois. Adresses SYNTHÉTIQUES.
 */
class PlanOpeningPageTest {
    private class MemoryStore(var value: String? = null) : StorePathStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    private val plan = DrivePlan.parse(ReferencePlans.json())!!
    private val seenSame = "https://m-courses.leclercdrive.fr/magasin-${plan.storeId}-${plan.storeId}-Ville-Test/recherche.aspx"
    private val seenOther = "https://m-courses.leclercdrive.fr/magasin-000002-000002-Autre-Ville/recherche.aspx"

    private fun memory(seen: String? = null) = StorePathMemory(MemoryStore()).also { if (seen != null) it.remember(seen) }

    @Test
    fun `le magasin du plan vient d'etre ouvert, le passage s'ouvre sur sa page`() {
        assertEquals(
            "https://m-courses.leclercdrive.fr/magasin-${plan.storeId}-${plan.storeId}-Ville-Test",
            plan.openingPage(memory(seenSame)),
        )
    }

    @Test
    fun `un autre magasin retenu, ou aucun, le passage s'ouvre sur l'accueil de l'enseigne comme avant`() {
        assertEquals(plan.startUrl, plan.openingPage(memory(seenOther)))
        assertEquals(plan.startUrl, plan.openingPage(memory()))
        assertEquals(plan.startUrl, plan.openingPage(null))
    }
}

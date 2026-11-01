package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le chemin du magasin avec sa ville, retenu depuis les pages que le drive a chargees (DRV-629). Adresses SYNTHÉTIQUES. */
class StorePathMemoryTest {
    private class MemoryStore(var value: String? = null) : StorePathStore {
        var writes = 0

        override fun load() = value

        override fun save(value: String?) {
            writes++
            this.value = value
        }
    }

    private val host = "m-courses.leclercdrive.fr"

    @Test
    fun `retient le chemin avec la ville d'une page de magasin, sans le reste de l'adresse`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)

        memory.remember("https://$host/magasin-000000-000000-Ville-Test/recherche.aspx?TexteRecherche=sel#haut")

        assertEquals("https://$host/magasin-000000-000000-Ville-Test", store.value)
        assertEquals(
            "https://$host/magasin-000000-000000-Ville-Test",
            memory.storeHomeUrl(host, "000000", "000000"),
        )
    }

    @Test
    fun `la derniere page vue remplace la precedente, et la meme page n'est pas reecrite`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)

        memory.remember("https://$host/magasin-000000-000000-Ville-Test/")
        memory.remember("https://$host/magasin-000000-000000-Ville-Test/accueil.aspx")
        assertEquals(1, store.writes)
        memory.remember("https://$host/magasin-000000-000000-Autre-Ville/")

        assertEquals("https://$host/magasin-000000-000000-Autre-Ville", store.value)
    }

    @Test
    fun `ne retient ni une page sans ville, ni l'accueil, ni la connexion, ni une autre forme`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)

        listOf(
            null,
            "",
            "https://$host/",
            "https://$host/magasin-000000-000000",
            "https://$host/magasin-000000-000000/recherche.aspx",
            "https://$host/magasin-000000-000000-/",
            "https://$host/magasin-000000-000000-Ville Test/",
            "https://$host/magasin-000000-000000-Vi\\lle/",
            "https://$host/magasin-000000-000000-Vi\"lle/",
            "https://fd8-espace-client.leclercdrive.fr/drive/magasin-000000-000000-Ville-Test/authentification.aspx",
            "http://$host/magasin-000000-000000-Ville-Test/",
            "https://www.exemple.org/magasin-000000-000000-Ville-Test/",
            "https://user:secret@$host/magasin-000000-000000-Ville-Test/",
            "https://$host/x/magasin-000000-000000-Ville-Test/",
            "https://www.leclercdrive.fr/connexion.aspx",
        ).forEach { memory.remember(it) }

        assertNull(store.value)
        assertEquals(0, store.writes)
    }

    @Test
    fun `ne donne l'accueil du magasin qu'aux memes numeros`() {
        val memory = StorePathMemory(MemoryStore())
        memory.remember("https://$host/magasin-000000-000456-Ville-Test/")

        assertEquals(
            "https://$host/magasin-000000-000456-Ville-Test",
            memory.storeHomeUrl(host, "000000", "000456"),
        )
        assertNull(memory.storeHomeUrl(host, "000000", "000000"))
        assertNull(memory.storeHomeUrl(host, "000456", "000456"))
    }

    /** DRV-754 : la page retenue est celle de la version mobile (`m-courses`) ; le lien du front porte `fd<N>-courses`. Pour Leclerc seuls les numéros comptent. */
    @Test
    fun `pour Leclerc, la page retenue de la version mobile sert un lien d'un autre hote de l'enseigne au meme magasin`() {
        val memory = StorePathMemory(MemoryStore())
        memory.remember("https://m-courses.leclercdrive.fr/magasin-000000-000456-ville-test")
        val page = "https://m-courses.leclercdrive.fr/magasin-000000-000456-ville-test"

        assertEquals(page, memory.storeHomeUrl("m-courses.leclercdrive.fr", "000000", "000456"))
        assertEquals(page, memory.storeHomeUrl("fd8-courses.leclercdrive.fr", "000000", "000456"))
        // Autres numéros : repli sur l'accueil (rien)
        assertNull(memory.storeHomeUrl("fd8-courses.leclercdrive.fr", "000000", "000457"))
        assertNull(memory.storeHomeUrl("fd8-courses.leclercdrive.fr", "000001", "000456"))
        // Un nom qui n'a pas la forme d'un hôte de magasin de l'enseigne : jamais (domaine nu, autre domaine, majuscules, port)
        listOf("leclercdrive.fr", "fd8-courses.exemple.org", "fd8-courses.leclercdrive.fr.evil.com", "FD8-COURSES.LECLERCDRIVE.FR", "fd8-courses.leclercdrive.fr:8443", "").forEach {
            assertNull(it, memory.storeHomeUrl(it, "000000", "000456"))
        }
    }

    /** Une enseigne qui ne le dit pas ([StorePages.sameStoreOnAnyHost] faux) garde l'exigence du même hôte. */
    @Test
    fun `une enseigne qui ne dit pas que ses hotes se valent exige le meme hote`() {
        val site = FictionalSites.A
        assertFalse(site.storePages!!.sameStoreOnAnyHost)
        val memory = StorePathMemory(MemoryStore(), site)
        memory.remember("https://boutique.exemple-a.test/depot-000000-000456-Ville-Test/")

        assertEquals("https://boutique.exemple-a.test/depot-000000-000456-Ville-Test", memory.storeHomeUrl("boutique.exemple-a.test", "000000", "000456"))
        assertNull(memory.storeHomeUrl("autre.exemple-a.test", "000000", "000456"))
    }

    /** Une mémoire est celle d'UNE enseigne : le même magasin d'une autre enseigne ne la lit jamais. */
    @Test
    fun `la memoire d'une enseigne ne retient ni ne sert la page d'une autre`() {
        val memory = StorePathMemory(MemoryStore())
        memory.remember("https://boutique.exemple-a.test/depot-000000-000456-Ville-Test/")
        memory.remember("https://www.auchan.fr/magasin-000000-000456-Ville-Test")

        assertFalse(memory.hasPath())
        assertNull(memory.storeHomeUrl("boutique.exemple-a.test", "000000", "000456"))
    }

    @Test
    fun `une valeur gardee qui n'a plus la forme attendue n'est jamais utilisee`() {
        listOf("n'importe quoi", "https://exemple.org/magasin-000000-000000-Ville-Test", "https://$host/magasin-000000-000000").forEach {
            assertNull(it, StorePathMemory(MemoryStore(it)).storeHomeUrl(host, "000000", "000000"))
        }
    }

    @Test
    fun `sait si un chemin est retenu, de n'importe quel magasin`() {
        val memory = StorePathMemory(MemoryStore())
        assertFalse(memory.hasPath())

        memory.remember("https://$host/magasin-000000-000456-Ville-Test/")

        assertTrue(memory.hasPath())
    }

    @Test
    fun `oublier efface le chemin`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)
        memory.remember("https://$host/magasin-000000-000000-Ville-Test/")

        memory.forget()

        assertNull(store.value)
        assertNull(memory.storeHomeUrl(host, "000000", "000000"))
    }
}

package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    private val host = "courses-test.leclercdrive.fr"

    @Test
    fun `retient le chemin avec la ville d'une page de magasin, sans le reste de l'adresse`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)

        memory.remember("https://$host/magasin-000000-000000-Ville-Test/recherche.aspx?TexteRecherche=sel#haut")

        assertEquals("https://$host/magasin-000000-000000-Ville-Test", store.value)
        assertEquals(
            "https://$host/magasin-000000-000000-Ville-Test/detail-panier.aspx",
            memory.basketUrl(host, "000000", "000000"),
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
    fun `ne retient ni une page sans ville, ni l'accueil, ni le site mobile, ni une autre forme`() {
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
            "https://m-courses.leclercdrive.fr/magasin-000000-000000-Ville-Test/",
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
    fun `ne donne la page du panier qu'au meme hote et aux memes numeros`() {
        val memory = StorePathMemory(MemoryStore())
        memory.remember("https://$host/magasin-000000-000456-Ville-Test/")

        assertEquals(
            "https://$host/magasin-000000-000456-Ville-Test/detail-panier.aspx",
            memory.basketUrl(host, "000000", "000456"),
        )
        assertNull(memory.basketUrl("autre-courses.leclercdrive.fr", "000000", "000456"))
        assertNull(memory.basketUrl(host, "000000", "000000"))
        assertNull(memory.basketUrl(host, "000456", "000456"))
    }

    @Test
    fun `une valeur gardee qui n'a plus la forme attendue n'est jamais utilisee`() {
        listOf("n'importe quoi", "https://exemple.org/magasin-000000-000000-Ville-Test", "https://$host/magasin-000000-000000").forEach {
            assertNull(it, StorePathMemory(MemoryStore(it)).basketUrl(host, "000000", "000000"))
        }
    }

    @Test
    fun `oublier efface le chemin`() {
        val store = MemoryStore()
        val memory = StorePathMemory(store)
        memory.remember("https://$host/magasin-000000-000000-Ville-Test/")

        memory.forget()

        assertNull(store.value)
        assertNull(memory.basketUrl(host, "000000", "000000"))
    }
}

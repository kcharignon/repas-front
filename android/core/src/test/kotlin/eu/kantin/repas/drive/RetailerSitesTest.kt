package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le registre des enseignes : ses invariants, ce que l'application annonce, et la concordance avec le contrat du back. Adresses FICTIVES. */
class RetailerSitesTest {
    private val leclerc = RetailerSites.DEFAULT.legacy

    @Test
    fun `le registre de cette version ne sert que la seule enseigne d'aujourd'hui`() {
        assertEquals(listOf(leclerc), RetailerSites.DEFAULT.all)
        assertEquals(listOf(leclerc.id), RetailerSites.DEFAULT.announcedRetailers())
        assertEquals(setOf("https://*.leclercdrive.fr"), RetailerSites.DEFAULT.bridgeOrigins())
        assertEquals(RetailerSites.DEFAULT.bridgeOrigins(), BridgeMessages.ORIGIN_RULES)
    }

    @Test
    fun `l'entree d'aujourd'hui garde les valeurs d'avant le multi-enseignes`() {
        assertEquals("Leclerc", leclerc.name)
        assertEquals("de Leclerc", leclerc.nameDe)
        assertEquals("https://www.leclercdrive.fr/", leclerc.startUrl)
        assertEquals(NavigationPolicy.START_URL, leclerc.startUrl)
        assertEquals(SiteMode.DESKTOP, leclerc.siteMode)
        // On navigue sur le domaine et ses sous-domaines ; le pont n'existe que sur les sous-domaines
        assertTrue(leclerc.isNavigable("https://leclercdrive.fr"))
        assertFalse(leclerc.isBridgePage("https://leclercdrive.fr"))
        assertTrue(leclerc.isBridgePage("https://www.leclercdrive.fr"))
    }

    @Test
    fun `l'enseigne est retrouvee par son identifiant exact, jamais autrement`() {
        assertSame(leclerc, RetailerSites.DEFAULT.byId(leclerc.id))
        listOf(null, "", " ", leclerc.id.uppercase(), "${leclerc.id} ", " ${leclerc.id}", "Leclerc", "autre", "${leclerc.id}\u0000").forEach {
            assertNull(it, RetailerSites.DEFAULT.byId(it))
        }
    }

    @Test
    fun `une adresse n'est celle que d'une seule enseigne`() {
        val sites = FictionalSites.ALL
        assertSame(FictionalSites.A, sites.forNavigation("https://www.exemple-a.test/"))
        assertSame(FictionalSites.A, sites.forNavigation("https://exemple-a.test"))
        assertSame(FictionalSites.B, sites.forNavigation("https://x.exemple-b.test/depot-1-1"))
        assertSame(FictionalSites.C, sites.forNavigation("https://compte.exemple-c.test/connexion"))
        assertSame(FictionalSites.C, sites.forNavigation("https://www.exemple-c.test:443/courses"))
        listOf(
            null,
            "",
            "http://www.exemple-a.test/",
            "https://exemple-c.test/",
            "https://exemple-a.test.evil.test/",
            "https://www.exemple-a.test@evil.test/",
            "https://evil.test/www.exemple-a.test",
            "https://leclercdrive.fr/",
        ).forEach { assertNull(it, sites.forNavigation(it)) }
    }

    @Test
    fun `l'application annonce exactement les enseignes de son registre, dans l'ordre, et leurs origines`() {
        assertEquals(listOf("exemplea", "exempleb", "exemplec"), FictionalSites.ALL.announcedRetailers())
        assertEquals(
            setOf("https://*.exemple-a.test", "https://*.exemple-b.test", "https://www.exemple-c.test"),
            FictionalSites.ALL.bridgeOrigins(),
        )
        assertEquals(listOf("exemplec"), RetailerSites(listOf(FictionalSites.C)).announcedRetailers())
        assertEquals(setOf("https://www.exemple-c.test"), RetailerSites(listOf(FictionalSites.C)).bridgeOrigins())
    }

    @Test
    fun `une enseigne fictive peut cohabiter avec l'entree d'aujourd'hui`() {
        val sites = FictionalSites.WITH_DEFAULT
        assertSame(leclerc, sites.legacy)
        assertSame(leclerc, sites.forNavigation("https://www.leclercdrive.fr/"))
        assertSame(FictionalSites.A, sites.forNavigation("https://www.exemple-a.test/"))
        assertEquals(setOf("https://*.leclercdrive.fr", "https://*.exemple-a.test"), sites.bridgeOrigins())
    }

    @Test
    fun `un registre incoherent est refuse`() {
        assertThrows("vide", IllegalArgumentException::class.java) { RetailerSites(emptyList()) }
        assertThrows("même enseigne deux fois", IllegalArgumentException::class.java) { RetailerSites(listOf(FictionalSites.A, FictionalSites.A)) }
        assertThrows("enseigne d'avant absente", IllegalArgumentException::class.java) { RetailerSites(listOf(FictionalSites.A), legacy = FictionalSites.B) }
        // Deux enseignes qui se partagent un nom de site : une adresse serait celle des deux
        val overlapping = RetailerSite(
            id = "autre",
            name = "Autre",
            nameDe = "d’Autre",
            startUrl = "https://www.exemple-a.test/",
            siteMode = SiteMode.AS_IS,
            hosts = listOf(SiteHost(HostPattern.exact("www.exemple-a.test"), bridge = true)),
            storeHost = Regex("www\\.exemple-a\\.test"),
            storeIdPattern = Regex("[0-9]+"),
        )
        assertThrows("nom en commun", IllegalArgumentException::class.java) { RetailerSites(listOf(FictionalSites.A, overlapping)) }
        // La même enseigne sous un autre identifiant partage tous ses noms
        val sameHosts = RetailerSite(
            id = "doublon",
            name = "Doublon",
            nameDe = "du Doublon",
            startUrl = "https://www.exemple-b.test/",
            siteMode = SiteMode.AS_IS,
            hosts = listOf(SiteHost(HostPattern.subdomainsOf("exemple-b.test"), bridge = true)),
            storeHost = Regex("[a-z0-9-]+\\.exemple-b\\.test"),
            storeIdPattern = Regex("[0-9]+"),
        )
        assertThrows("domaines superposés", IllegalArgumentException::class.java) { RetailerSites(listOf(FictionalSites.B, sameHosts)) }
    }

    // —— la concordance avec le contrat des enseignes du back (`retailers.sample.json`, DRV-701) ——————————————————————————

    private val contract = JSONObject(File("src/test/resources/retailers.sample.json").readText()).getJSONArray("retailers")

    @Test
    fun `chaque enseigne de l'application est dans le contrat, avec le meme nom`() {
        val byId = (0 until contract.length()).associate { contract.getJSONObject(it).getString("id") to contract.getJSONObject(it) }
        RetailerSites.DEFAULT.all.forEach { site ->
            val entry = byId[site.id] ?: throw AssertionError("${site.id} n'est pas dans le contrat des enseignes")
            assertEquals(entry.getString("name"), site.name)
            assertEquals(entry.getString("nameDe"), site.nameDe)
        }
    }

    @Test
    fun `l'adresse d'exemple du contrat est une page de magasin de l'enseigne, avec son hote et son identifiant`() {
        // Les champs que le cœur ne connaît pas (identifiant de produit, source de l'identifiant du magasin…) sont tolérés : seuls ceux qu'il connaît se comparent.
        for (index in 0 until contract.length()) {
            val entry = contract.getJSONObject(index)
            val site = RetailerSites.DEFAULT.byId(entry.getString("id")) ?: continue
            val example = entry.optString("storeAddressExample").takeIf { it.isNotEmpty() } ?: continue
            val pattern = Regex(entry.getString("storeAddressPattern"))
            assertTrue("l'exemple suit le motif du contrat", pattern.matches(example))
            assertTrue("l'exemple est une page de magasin de ${site.id}", site.isStorePage(example))
            val host = NavigationPolicy.httpsHostOf(example)
            assertTrue("l'hôte de l'exemple est un hôte de magasin de ${site.id}", site.isStoreHost(host))
            val match = pattern.find(example)!!
            assertTrue("le numéro du magasin a la forme de ${site.id}", site.isStoreId(match.groupValues[1]))
        }
    }
}

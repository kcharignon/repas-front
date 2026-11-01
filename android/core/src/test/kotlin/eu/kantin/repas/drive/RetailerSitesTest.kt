package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le registre des enseignes : ses invariants, ce que l'application annonce, et la concordance avec le contrat du back. Adresses FICTIVES. */
class RetailerSitesTest {
    private val leclerc = RetailerSites.DEFAULT.legacy

    @Test
    fun `le registre de cette version sert Leclerc, l'enseigne d'avant, puis Auchan`() {
        assertEquals(listOf("leclerc", "auchan"), RetailerSites.DEFAULT.all.map { it.id })
        assertSame(leclerc, RetailerSites.DEFAULT.all.first())
        assertEquals(listOf(leclerc.id, "auchan"), RetailerSites.DEFAULT.announcedRetailers())
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), RetailerSites.DEFAULT.bridgeOrigins())
        assertEquals(RetailerSites.DEFAULT.bridgeOrigins(), BridgeMessages.ORIGIN_RULES)
    }

    @Test
    fun `sans drapeau de construction, la version sert le registre par defaut lui-meme, sans enseigne eteinte`() {
        listOf(null, "", " ", ",", " , ").forEach { assertSame("« $it »", RetailerSites.DEFAULT, RetailerSites.serving(it)) }
        assertEquals(listOf("leclerc", "auchan"), RetailerSites.serving("").announcedRetailers())
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr"), RetailerSites.serving("").bridgeOrigins())
        assertTrue("depuis DRV-738 aucune enseigne n'est éteinte : le mécanisme attend la prochaine", RetailerSites.SWITCHED_OFF.isEmpty())
        assertTrue("une enseigne éteinte n'est jamais dans le registre par défaut", RetailerSites.SWITCHED_OFF.none { off -> RetailerSites.DEFAULT.all.any { it.id == off.id } })
    }

    @Test
    fun `le drapeau de construction allume une enseigne eteinte (fictive), sans changer l'enseigne d'avant ni l'ordre`() {
        val served = RetailerSites.DEFAULT
        val sites = RetailerSites.serving("exemplec", served, listOf(FictionalSites.C))

        assertEquals(listOf("leclerc", "auchan", "exemplec"), sites.announcedRetailers())
        assertSame(leclerc, sites.legacy)
        assertEquals(served.bridgeOrigins() + "https://www.exemple-c.test", sites.bridgeOrigins())
        assertSame(FictionalSites.C, sites.forNavigation("https://www.exemple-c.test/courses"))
        assertSame(leclerc, sites.forNavigation("https://www.leclercdrive.fr/"))
        // l'espace et la répétition ne changent rien
        assertEquals(listOf("leclerc", "auchan", "exemplec"), RetailerSites.serving(" exemplec , exemplec ", served, listOf(FictionalSites.C)).announcedRetailers())
        // sans drapeau : le registre servi lui-même
        assertSame(served, RetailerSites.serving("", served, listOf(FictionalSites.C)))
        // le registre par défaut n'est pas modifié par l'allumage d'un autre
        assertEquals(listOf("leclerc", "auchan"), RetailerSites.DEFAULT.announcedRetailers())
    }

    @Test
    fun `un drapeau qui ne designe pas une enseigne eteinte est refuse, rien n'est allume en silence`() {
        val off = listOf(FictionalSites.C)
        // « auchan » et « leclerc » sont servies : ce ne sont plus des enseignes à allumer
        listOf("autre", "Exemplec", "EXEMPLEC", "leclerc", "auchan", "exemplec;leclerc", "exemplec autre", "exemplec,autre", "exemple-c.test", "*", "www.exemple-c.test").forEach {
            assertThrows("« $it »", IllegalArgumentException::class.java) { RetailerSites.serving(it, RetailerSites.DEFAULT, off) }
        }
        // et le drapeau réel, sans enseigne éteinte, n'allume rien : tout identifiant est refusé
        listOf("auchan", "leclerc", "exemplec").forEach { assertThrows("« $it »", IllegalArgumentException::class.java) { RetailerSites.serving(it) } }
    }

    @Test
    fun `toutes les enseignes inscrites cohabitent sans nom de site en commun`() {
        val all = RetailerSites.REGISTERED

        assertEquals(RetailerSites.DEFAULT.all + RetailerSites.SWITCHED_OFF, all.all)
        assertSame(leclerc, all.legacy)
        // une page n'est celle que d'une seule enseigne
        all.all.forEach { site -> all.all.filter { it !== site }.forEach { other -> assertFalse("${site.id} / ${other.id}", site.overlapsNavigation(other)) } }
    }

    @Test
    fun `l'entree d'aujourd'hui garde les valeurs d'avant le multi-enseignes`() {
        assertEquals("Leclerc", leclerc.name)
        assertEquals("de Leclerc", leclerc.nameDe)
        assertEquals("https://www.leclercdrive.fr/", leclerc.startUrl)
        assertEquals(NavigationPolicy.START_URL, leclerc.startUrl)
        // DRV-754 : la version mobile du site, plus de mode ordinateur ni de site mobile refusé
        assertEquals(SiteMode.MOBILE, leclerc.siteMode)
        assertNull(leclerc.mobileSiteLabel)
        assertFalse(leclerc.isMobileSite("https://m-courses.leclercdrive.fr/magasin-000000-000000-ville-test"))
        // On navigue sur le domaine et ses sous-domaines ; le pont n'existe que sur les sous-domaines
        assertTrue(leclerc.isNavigable("https://leclercdrive.fr"))
        assertFalse(leclerc.isBridgePage("https://leclercdrive.fr"))
        assertTrue(leclerc.isBridgePage("https://www.leclercdrive.fr"))
    }

    /** DRV-754 : le `store.host` d'un plan de la version mobile est l'hôte du serveur `fd<N>-courses` ; jamais un autre domaine, un nom en majuscules, un port ni le domaine nu. */
    @Test
    fun `le store host d'un plan de Leclerc est un hote fd-courses en minuscules, jamais un autre domaine`() {
        listOf("fd8-courses.leclercdrive.fr", "fd14-courses.leclercdrive.fr", "m-courses.leclercdrive.fr", "www.leclercdrive.fr").forEach { assertTrue(it, leclerc.isStoreHost(it)) }
        listOf(
            null, "", "leclercdrive.fr", "FD8-COURSES.LECLERCDRIVE.FR", "fd8-courses.leclercdrive.fr:8443", "fd8-courses.leclercdrive.fr:443", "fd8-courses.leclercdrive.fr.evil.com",
            "fd8-courses.exemple.org", "evil.com/fd8-courses.leclercdrive.fr", "fd8-courses.leclercdrive.fr/", " fd8-courses.leclercdrive.fr", "www.auchan.fr",
        ).forEach { assertFalse(it.toString(), leclerc.isStoreHost(it)) }
        assertFalse(RetailerSites.DEFAULT.byId("auchan")!!.isStoreHost("fd8-courses.leclercdrive.fr"))
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
        assertEquals(setOf("https://*.leclercdrive.fr", "https://www.auchan.fr", "https://*.exemple-a.test"), sites.bridgeOrigins())
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
    fun `chaque enseigne inscrite est dans le contrat, avec le meme nom`() {
        val byId = (0 until contract.length()).associate { contract.getJSONObject(it).getString("id") to contract.getJSONObject(it) }
        RetailerSites.REGISTERED.all.forEach { site ->
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
            val site = RetailerSites.REGISTERED.byId(entry.getString("id")) ?: continue
            if (entry.optString("storeIdSource") == "EXPLICIT") continue
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

    @Test
    fun `la source de l'identifiant du magasin du contrat dit si le magasin est dans l'adresse du cœur`() {
        // URL : le magasin est dans l'adresse, le cœur a des pages de magasin. EXPLICIT : l'agent le lit dans la page, le cœur n'en reconnaît aucune.
        for (index in 0 until contract.length()) {
            val entry = contract.getJSONObject(index)
            val site = RetailerSites.REGISTERED.byId(entry.getString("id")) ?: continue
            when (val source = entry.getString("storeIdSource")) {
                "URL" -> assertNotNull("${site.id} : magasin dans l'adresse", site.storePages)
                "EXPLICIT" -> assertNull("${site.id} : magasin explicite", site.storePages)
                else -> throw AssertionError("source inconnue : $source")
            }
        }
    }

    @Test
    fun `l'adresse du magasin d'une enseigne a identifiant explicite est son accueil de pont, et son motif d'identifiant est celui du contrat`() {
        for (index in 0 until contract.length()) {
            val entry = contract.getJSONObject(index)
            val site = RetailerSites.REGISTERED.byId(entry.getString("id")) ?: continue
            if (entry.getString("storeIdSource") != "EXPLICIT") continue
            // L'adresse du magasin est une constante de l'enseigne (le magasin n'est pas dans l'adresse) : un hôte où le pont existe.
            val example = entry.getString("storeAddressExample")
            assertTrue("l'exemple suit le motif du contrat", Regex(entry.getString("storeAddressPattern")).matches(example))
            assertTrue("l'hôte de l'exemple porte le pont de ${site.id}", site.isBridgePage(example))
            assertTrue("et c'est un hôte de magasin", site.isStoreHost(NavigationPolicy.httpsHostOf(example)))
            // Le cœur accepte l'identifiant de magasin que le contrat accepte, et refuse ce qu'il refuse
            val contractId = Regex(entry.getString("storeIdPattern"))
            listOf(
                "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
                "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D",
                "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4",
                "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d0",
                "123456",
                "",
            ).forEach { assertEquals("« $it » pour ${site.id}", contractId.matches(it), site.isStoreId(it)) }
        }
    }
}

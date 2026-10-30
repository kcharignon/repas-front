package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Les noms de site d'une enseigne et ses invariants de construction. Noms FICTIFS (`.test`). */
class RetailerSiteTest {
    @Test
    fun `un nom exact n'est que lui-meme`() {
        val rule = HostPattern.exact("www.exemple-c.test")
        assertTrue(rule.matches("www.exemple-c.test"))
        listOf(
            "exemple-c.test",
            "compte.exemple-c.test",
            "x.www.exemple-c.test",
            "www.exemple-c.test.evil.test",
            "wwwexemple-c.test",
            "xwww.exemple-c.test",
            "www.exemple-c.testx",
            "",
        ).forEach { assertFalse(it, rule.matches(it)) }
        assertEquals("https://www.exemple-c.test", rule.origin)
    }

    @Test
    fun `les sous-domaines ne sont ni le domaine, ni un domaine qui lui ressemble`() {
        val rule = HostPattern.subdomainsOf("exemple-a.test")
        listOf("www.exemple-a.test", "a.b.c.exemple-a.test", "x.exemple-a.test").forEach { assertTrue(it, rule.matches(it)) }
        listOf(
            "exemple-a.test",
            ".exemple-a.test",
            "exemple-a.test.evil.test",
            "evilexemple-a.test",
            "xexemple-a.test",
            "exemple-aXtest",
            "www.exemple-aXtest",
            "www.exemple-a.testx",
            "www.exemple-b.test",
            "",
        ).forEach { assertFalse(it, rule.matches(it)) }
        assertEquals("https://*.exemple-a.test", rule.origin)
    }

    @Test
    fun `un joker trop large ou un nom douteux ne se construit pas`() {
        val refused = listOf(
            "",
            "*",
            "*.test",
            "test",
            "fr",
            "a..test",
            ".exemple.test",
            "exemple.test.",
            "-a.test",
            "a-.test",
            "Exemple.test",
            "exemple_a.test",
            "exemple a.test",
            "exemple.test/chemin",
            "exemple.test:443",
            "https://exemple.test",
            "user@exemple.test",
            "exemple.test\\x",
            "exémple.test",
            "exemple.tеst",
        )
        refused.forEach {
            assertThrows(it, IllegalArgumentException::class.java) { HostPattern.exact(it) }
            assertThrows(it, IllegalArgumentException::class.java) { HostPattern.subdomainsOf(it) }
        }
    }

    @Test
    fun `deux ensembles de noms se recouvrent quand un nom est dans les deux`() {
        val a = HostPattern.subdomainsOf("exemple-a.test")
        val sub = HostPattern.subdomainsOf("sous.exemple-a.test")
        val b = HostPattern.subdomainsOf("exemple-b.test")
        assertTrue(a.overlaps(a))
        assertTrue(a.overlaps(sub) && sub.overlaps(a))
        assertFalse(a.overlaps(b) || b.overlaps(a))
        assertTrue(a.overlaps(HostPattern.exact("www.exemple-a.test")))
        assertTrue(HostPattern.exact("www.exemple-a.test").overlaps(a))
        assertFalse("le domaine nu n'est pas dans ses sous-domaines", a.overlaps(HostPattern.exact("exemple-a.test")))
        assertFalse(HostPattern.exact("exemple-a.test").overlaps(a))
        assertTrue(HostPattern.exact("exemple-a.test").overlaps(HostPattern.exact("exemple-a.test")))
        assertFalse(HostPattern.exact("exemple-a.test").overlaps(HostPattern.exact("www.exemple-a.test")))
        assertTrue(HostPattern.exact("www.exemple-a.test").overlaps(sub.let { HostPattern.subdomainsOf("exemple-a.test") }))
    }

    @Test
    fun `navigation et pont d'une enseigne qui a sa connexion sur un autre hote`() {
        val site = FictionalSites.C

        assertEquals(setOf("https://www.exemple-c.test"), site.bridgeOrigins)
        assertTrue(site.isNavigable("https://www.exemple-c.test/courses"))
        assertTrue(site.isNavigable("https://compte.exemple-c.test/connexion"))
        assertTrue(site.isBridgePage("https://www.exemple-c.test/panier"))
        assertFalse("la page du mot de passe n'a ni pont ni agent", site.isBridgePage("https://compte.exemple-c.test/connexion"))
        assertFalse(site.isBridgeOrigin("https://compte.exemple-c.test"))
        assertTrue(site.isBridgeOrigin("https://www.exemple-c.test"))
        assertTrue(site.isBridgeOrigin("https://www.exemple-c.test:443"))
        listOf("exemple-c.test", "x.www.exemple-c.test", "evil.exemple-c.test", "www.exemple-c.test.evil.test").forEach {
            assertFalse(it, site.isNavigable("https://$it/"))
        }
    }

    @Test
    fun `l'accueil est celui de l'adresse de depart, avec ou sans chemin`() {
        assertTrue(FictionalSites.C.isHomePage("https://www.exemple-c.test/courses"))
        assertTrue(FictionalSites.C.isHomePage("https://www.exemple-c.test/courses?a=1#haut"))
        assertFalse(FictionalSites.C.isHomePage("https://www.exemple-c.test/"))
        assertFalse(FictionalSites.C.isHomePage("https://www.exemple-c.test/courses/panier"))
        assertFalse(FictionalSites.C.isHomePage("https://compte.exemple-c.test/courses"))
        assertTrue(FictionalSites.A.isHomePage("https://www.exemple-a.test"))
        assertTrue(FictionalSites.A.isHomePage("https://www.exemple-a.test/"))
        assertFalse(FictionalSites.A.isHomePage("https://www.exemple-a.test//"))
        assertFalse(FictionalSites.A.isHomePage("https://boutique.exemple-a.test/"))
    }

    @Test
    fun `une enseigne sans pages de magasin n'en reconnait aucune, et n'a ni connexion ni site mobile a refuser`() {
        val site = FictionalSites.C
        listOf(
            "https://www.exemple-c.test/depot-1-1",
            "https://www.exemple-c.test/magasin-1-1-Ville",
            "https://www.exemple-c.test/courses",
        ).forEach { assertFalse(it, site.isStorePage(it)) }
        assertFalse(site.isLoginPage("https://www.exemple-c.test/connexion"))
        assertFalse(site.isMobileSite("https://m-courses.exemple-c.test/"))
        assertEquals(SiteMode.AS_IS, site.siteMode)
    }

    @Test
    fun `une enseigne mal construite est refusee`() {
        fun site(
            id: String = "exemplea",
            startUrl: String = "https://www.exemple-a.test/",
            siteMode: SiteMode = SiteMode.DESKTOP,
            hosts: List<SiteHost> = listOf(SiteHost(HostPattern.subdomainsOf("exemple-a.test"), bridge = true)),
            mobile: Regex? = null,
        ) = RetailerSite(
            id = id,
            name = "A",
            nameDe = "d’A",
            startUrl = startUrl,
            siteMode = siteMode,
            hosts = hosts,
            storeHost = Regex("[a-z0-9-]+\\.exemple-a\\.test"),
            storeIdPattern = Regex("[0-9]+"),
            mobileSiteLabel = mobile,
        )
        // Le modèle valide se construit
        site()
        listOf("", "Leclerc", "leclerc ", "1abc", "a-b", "a".repeat(21), "é").forEach {
            assertThrows("identifiant « $it »", IllegalArgumentException::class.java) { site(id = it) }
        }
        assertThrows("aucun hôte avec pont", IllegalArgumentException::class.java) {
            site(hosts = listOf(SiteHost(HostPattern.subdomainsOf("exemple-a.test"), bridge = false)))
        }
        assertThrows("aucun hôte", IllegalArgumentException::class.java) { site(hosts = emptyList()) }
        listOf(
            "http://www.exemple-a.test/",
            "https://www.exemple-a.test/?a=1",
            "https://www.exemple-a.test/#a",
            "https://www.exemple-a.test@evil.test/",
            "https://www.exemple-b.test/",
            "www.exemple-a.test",
            "",
        ).forEach {
            assertThrows("adresse de départ « $it »", IllegalArgumentException::class.java) { site(startUrl = it) }
        }
        assertThrows("adresse de départ sans pont", IllegalArgumentException::class.java) {
            site(
                startUrl = "https://exemple-a.test/",
                hosts = listOf(SiteHost(HostPattern.exact("exemple-a.test"), bridge = false), SiteHost(HostPattern.subdomainsOf("exemple-a.test"), bridge = true)),
            )
        }
        assertThrows("site mobile à refuser sans mode ordinateur", IllegalArgumentException::class.java) {
            site(siteMode = SiteMode.AS_IS, mobile = Regex("m-.*"))
        }
    }
}

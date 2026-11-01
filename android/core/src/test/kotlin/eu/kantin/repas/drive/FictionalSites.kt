package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject

/**
 * Des enseignes FICTIVES pour prouver l'isolement entre enseignes sans nommer de vraie enseigne ni contacter de vrai site (`.test` est un domaine
 * réservé). Elles ont chacune une forme d'adresse différente :
 * - [A] : des magasins par adresse sous `*.exemple-a.test` (`/depot-N-N[-Ville]`), pont sur tous les sous-domaines, domaine nu navigable sans pont ;
 * - [B] : comme A, sous `*.exemple-b.test`, avec `/point-N-N[-Ville]` ;
 * - [C] : comme l'enseigne qui a son mot de passe sur un autre hôte : on navigue sur `www.exemple-c.test` ET `compte.exemple-c.test`, mais le pont et
 *   l'agent n'existent que sur `www.exemple-c.test` ; le magasin n'est pas dans l'adresse (identifiant explicite).
 */
internal object FictionalSites {
    private const val CITY = "[^/?#\\s\\\\<>\"'\\u0000-\\u001f]+"

    private fun withStores(id: String, domain: String, word: String) = RetailerSite(
        id = id,
        name = "Enseigne $id",
        nameDe = "de l’enseigne $id",
        startUrl = "https://www.$domain/",
        siteMode = SiteMode.DESKTOP,
        hosts = listOf(
            SiteHost(HostPattern.exact(domain), bridge = false),
            SiteHost(HostPattern.subdomainsOf(domain), bridge = true),
        ),
        storeHost = Regex("[a-z0-9-]+\\.${Regex.escape(domain)}"),
        storeIdPattern = Regex("[0-9]{1,12}"),
        storePages = StorePages(
            pagePath = Regex("^/$word-[0-9]{1,12}-[0-9]{1,12}(-[^/]*)?(/|$)", RegexOption.IGNORE_CASE),
            homeSegment = Regex("^/$word-([0-9]{1,12})-([0-9]{1,12})-$CITY$"),
            frontLink = Regex("^/$word-([0-9]{1,12})-([0-9]{1,12})$"),
        ),
        loginPath = Regex("^/connexion(\\.aspx)?(/|$)", RegexOption.IGNORE_CASE),
        mobileSiteLabel = Regex("m(-[a-z0-9-]*)?"),
    )

    val A: RetailerSite = withStores("exemplea", "exemple-a.test", "depot")
    val B: RetailerSite = withStores("exempleb", "exemple-b.test", "point")

    val C: RetailerSite = RetailerSite(
        id = "exemplec",
        name = "Enseigne C",
        nameDe = "d’Enseigne C",
        startUrl = "https://www.exemple-c.test/courses",
        siteMode = SiteMode.AS_IS,
        hosts = listOf(
            SiteHost(HostPattern.exact("www.exemple-c.test"), bridge = true),
            SiteHost(HostPattern.exact("compte.exemple-c.test"), bridge = false, passwordPage = true),
        ),
        storeHost = Regex("www\\.exemple-c\\.test"),
        storeIdPattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
    )

    /** Les trois enseignes fictives ensemble (A est « l'enseigne d'avant »). */
    val ALL = RetailerSites(listOf(A, B, C))

    /** Un registre où la vraie entrée du registre par défaut cohabite avec A : l'enseigne d'avant est la vraie. */
    val WITH_DEFAULT = RetailerSites(RetailerSites.DEFAULT.all + A, legacy = RetailerSites.DEFAULT.legacy)

    const val RUN_ID = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    const val STORE_UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

    /** Le plan de référence (`plan-complet.json`) réécrit pour [site], avec ce magasin (`store.id`, `store.host`). */
    fun plan(site: RetailerSite, storeId: String, storeHost: String): JSONObject =
        JSONObject(File("src/test/resources/plan-complet.json").readText()).put("retailer", site.id).also {
            it.put("store", JSONObject().put("id", storeId).put("host", storeHost))
        }
}

/** Un stockage clé-valeur en mémoire qui compte ses écritures. */
internal class MemoryKeyValues(initial: Map<String, String> = emptyMap()) : KeyValueStore {
    val values: MutableMap<String, String> = initial.toMutableMap()
    var writes = 0

    override fun load(key: String): String? = values[key]

    override fun save(key: String, value: String?) {
        writes++
        if (value == null) values.remove(key) else values[key] = value
    }
}

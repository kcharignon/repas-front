package eu.kantin.repas.drive

/** Comment une enseigne sert son site à un téléphone (`siteMode` du registre, ADR 0027 du back). */
enum class SiteMode {
    /** Un téléphone reçoit un site mobile dont les routes sont autres : l'application impose le mode ordinateur et refuse le site mobile ([RetailerSite.isMobileSite]). */
    DESKTOP,

    /** Le site mobile est celui que l'on veut. */
    MOBILE,

    /** Un seul site adaptatif : on le prend tel quel, il n'y a ni mode à imposer ni site mobile à refuser. */
    AS_IS,
}

/**
 * Un ensemble de noms de site `https` d'une enseigne : **un nom exact** (`www.exemple.test`) ou **tous les sous-domaines** d'un domaine
 * (`*.exemple.test`, à tout niveau, jamais le domaine lui-même). Il n'existe pas d'autre forme : ni joker au milieu d'un nom, ni `*` seul, ni suffixe
 * d'un seul libellé (`*.fr`) : un joker trop large est un défaut de sécurité.
 *
 * Écrit en Kotlin pur (sans `android.net.Uri`). Les noms sont en minuscules, en lettres ASCII, chiffres et tirets : [NavigationPolicy.httpsHostOf]
 * ne rend pas autre chose, et c'est ce nom que l'on compare.
 */
class HostPattern private constructor(val name: String, val subdomains: Boolean) {
    init {
        val labels = name.split('.')
        require(labels.size >= 2 && NavigationPolicy.isPlainHostName(name) && name.none { it in 'A'..'Z' }) { "Nom de site invalide : $name" }
    }

    /** Vrai si [host] (déjà lu et mis en minuscules par [NavigationPolicy.httpsHostOf]) est dans cet ensemble. */
    fun matches(host: String): Boolean =
        if (subdomains) host.length > name.length + 1 && host.endsWith(".$name") else host == name

    /** La règle d'origine donnée à la WebView (`addWebMessageListener`, `addDocumentStartJavaScript`) : `https://<nom>` ou `https://` suivi de `*.<domaine>`. Jamais `*` seul. */
    val origin: String get() = if (subdomains) "https://*.$name" else "https://$name"

    /** Vrai s'il existe un nom de site dans les deux ensembles. */
    fun overlaps(other: HostPattern): Boolean = when {
        !subdomains && !other.subdomains -> name == other.name
        !subdomains -> other.matches(name)
        !other.subdomains -> matches(other.name)
        else -> name == other.name || name.endsWith(".${other.name}") || other.name.endsWith(".$name")
    }

    override fun equals(other: Any?): Boolean = other is HostPattern && other.name == name && other.subdomains == subdomains

    override fun hashCode(): Int = 31 * name.hashCode() + subdomains.hashCode()

    override fun toString(): String = origin

    companion object {
        /** Le seul nom [host]. */
        fun exact(host: String): HostPattern = HostPattern(host, subdomains = false)

        /** Tous les sous-domaines de [domain], pas [domain] lui-même. */
        fun subdomainsOf(domain: String): HostPattern = HostPattern(domain, subdomains = true)
    }
}

/**
 * Des noms de site d'une enseigne et ce que l'application y fait : on y **navigue** toujours ; le pont `repasHost` et l'agent n'y existent que si
 * [bridge]. C'est ce qui permet à une enseigne de naviguer sur plusieurs hôtes (une page de connexion à part, par exemple) sans que le pont ni l'agent
 * existent sur la page du mot de passe.
 */
data class SiteHost(val pattern: HostPattern, val bridge: Boolean)

/**
 * Les règles d'adresse des pages de magasin d'une enseigne qui en a (une adresse par magasin). Les trois sont des expressions régulières sur le
 * **chemin** seul (ni hôte, ni requête, ni fragment).
 */
class StorePages(
    /** Le début du chemin d'une page de magasin : celle où l'agent lit le magasin et où un plan peut partir. */
    val pagePath: Regex,
    /** Le segment du chemin qui désigne un magasin AVEC sa ville, entier, deux groupes (les deux numéros) : ce que [StorePathMemory] retient. */
    val homeSegment: Regex,
    /** Le chemin du lien que le front fait vers un magasin (« Finaliser »), entier, deux groupes (les deux numéros) : sans ville. */
    val frontLink: Regex,
)

/**
 * Une enseigne de drive vue par l'application (DRV-706, ADR 0027 du back) : **une donnée, pas une branche de code**. Elle dit où l'on peut naviguer,
 * où le pont et l'agent existent, comment se reconnaissent ses pages et d'où un plan peut partir. Ajouter une enseigne, c'est ajouter une entrée à
 * [RetailerSites] ; aucun autre fichier du cœur ne la nomme.
 *
 * Kotlin pur, sans `android.net.Uri`, pour se tester sans téléphone. Toutes les règles lisent l'adresse à la main ([NavigationPolicy.httpsHostOf]) et
 * refusent ce qui est ambigu (barre oblique inverse, `@`, port inattendu, point final, caractère hors ASCII) : un refus envoie l'adresse au navigateur du
 * téléphone, ce qui est sans danger ; une acceptation à tort ne l'est pas.
 */
class RetailerSite(
    /** L'identifiant stable du registre et du protocole (`plan.retailer`) : minuscules et chiffres, 20 caractères au plus. */
    val id: String,
    /** Le nom que les proches disent à voix haute. */
    val name: String,
    /** La forme avec « de » (élision comprise) : « de Leclerc », « d’Auchan ». */
    val nameDe: String,
    /** La page où le drive s'ouvre : `https`, sans requête ni fragment, sur un hôte où le pont existe. */
    val startUrl: String,
    val siteMode: SiteMode,
    /** Les noms de site de l'enseigne, avec, pour chacun, la présence du pont et de l'agent. Au moins un porte le pont. */
    val hosts: List<SiteHost>,
    /** L'hôte d'un magasin dans un plan (`store.host`) : un nom entier, en minuscules. Il doit être un hôte du pont. */
    val storeHost: Regex,
    /** La forme de l'identifiant d'un magasin dans un plan (`store.id`), propre à l'enseigne. */
    val storeIdPattern: Regex,
    /** Les pages de magasin, pour une enseigne dont le magasin est dans l'adresse ; `null` sinon (l'agent lit alors le magasin dans la page). */
    val storePages: StorePages? = null,
    /** Le chemin de la page de connexion hors d'un magasin ; `null` si l'enseigne n'en a pas à reconnaître. */
    val loginPath: Regex? = null,
    /** Le premier libellé du nom du site mobile (`m-courses` pour `m-courses.exemple.test`) ; seulement en [SiteMode.DESKTOP]. */
    val mobileSiteLabel: Regex? = null,
) {
    private val navigation: List<HostPattern> = hosts.map { it.pattern }
    private val bridge: List<HostPattern> = hosts.filter { it.bridge }.map { it.pattern }

    /** Les règles d'origine de la WebView pour le pont et l'injection de l'agent : celles des hôtes qui portent le pont, jamais celles des autres. */
    val bridgeOrigins: Set<String> = bridge.mapTo(LinkedHashSet()) { it.origin }

    private val homeHost: String
    private val homePath: String

    init {
        require(ID.matches(id)) { "Identifiant d'enseigne invalide : $id" }
        require(name.isNotBlank() && nameDe.isNotBlank()) { "Nom d'enseigne vide : $id" }
        require(bridge.isNotEmpty()) { "L'enseigne $id n'a aucun hôte où le pont existe." }
        require(siteMode == SiteMode.DESKTOP || mobileSiteLabel == null) { "Seul le mode ordinateur refuse un site mobile : $id" }
        require(startUrl.none { it == '?' || it == '#' }) { "L'adresse de départ de $id ne porte ni requête ni fragment." }
        homeHost = NavigationPolicy.httpsHostOf(startUrl) ?: throw IllegalArgumentException("Adresse de départ invalide : $id")
        require(bridge.any { it.matches(homeHost) }) { "L'adresse de départ de $id n'est pas sur un hôte où le pont existe." }
        homePath = NavigationPolicy.pathOf(startUrl).ifEmpty { "/" }
    }

    /** Vrai si l'application peut naviguer sur ce nom de site (déjà lu et en minuscules). */
    internal fun navigatesTo(host: String): Boolean = navigation.any { it.matches(host) }

    /** Vrai si le pont et l'agent existent sur ce nom de site (déjà lu et en minuscules). */
    internal fun bridgesOn(host: String): Boolean = bridge.any { it.matches(host) }

    /** Les noms de site de l'enseigne : pour comparer deux enseignes entre elles ([RetailerSites]). */
    internal fun overlapsNavigation(other: RetailerSite): Boolean = navigation.any { a -> other.navigation.any { b -> a.overlaps(b) } }

    /** Une page `https` de cette enseigne : l'application la garde dans la WebView. Rien d'autre (autre enseigne, autre site) n'y reste. */
    fun isNavigable(url: String?): Boolean = NavigationPolicy.httpsHostOf(url)?.let(::navigatesTo) ?: false

    /** Une page `https` où le pont `repasHost` et l'agent existent (un sous-ensemble des pages où l'on navigue). */
    fun isBridgePage(url: String?): Boolean = NavigationPolicy.httpsHostOf(url)?.let(::bridgesOn) ?: false

    /**
     * Une origine (`https://<nom>`, port 443 permis, ni chemin, ni requête) où le pont existe : l'origine d'un message reçu de la page, relue à
     * chaque message. Elle compare l'origine **entière** ; jamais un `endsWith` plus lâche.
     */
    fun isBridgeOrigin(origin: String?): Boolean {
        val host = NavigationPolicy.httpsHostOf(origin) ?: return false
        if (!bridgesOn(host)) return false
        return origin!!.lowercase().removeSuffix(":443") == "https://$host"
    }

    /** Un `store.host` valide d'un plan : de la forme de l'enseigne **et** un hôte où le pont existe. Un hôte d'une autre enseigne n'en est jamais un. */
    fun isStoreHost(host: String?): Boolean = host != null && storeHost.matches(host) && isBridgeOrigin("https://$host")

    /** Un `store.id` valide d'un plan. */
    fun isStoreId(value: String?): Boolean = value != null && storeIdPattern.matches(value)

    /**
     * L'adresse est-elle celle du site mobile (`m-courses.exemple.test`) ? Il n'a pas les routes du site ordinateur : l'agent n'y agit pas, et
     * l'application ne lui envoie ni plan ni lecture du magasin. Toujours faux pour une enseigne sans site mobile à refuser.
     */
    fun isMobileSite(url: String?): Boolean {
        val label = mobileSiteLabel ?: return false
        if (!isNavigable(url)) return false
        val host = NavigationPolicy.httpsHostOf(url) ?: return false
        return label.matches(host.substringBefore('.'))
    }

    /**
     * L'adresse est-elle celle d'une page de magasin : une page de l'enseigne dont le chemin commence par la forme d'un magasin ([StorePages.pagePath]) ?
     * L'accueil et la page de connexion n'en sont pas, ni le site mobile ([isMobileSite]), même avec une adresse de cette forme. Toujours faux pour une
     * enseigne dont le magasin n'est pas dans l'adresse.
     */
    fun isStorePage(url: String?): Boolean {
        val pages = storePages ?: return false
        if (!isNavigable(url) || isMobileSite(url)) return false
        return pages.pagePath.containsMatchIn(NavigationPolicy.pathOf(url!!))
    }

    /**
     * L'adresse est-elle l'accueil de l'enseigne ([startUrl]) : le même hôte, sans chemin de plus (la requête et le fragment ne comptent pas) ? C'est
     * là qu'un plan s'ouvre. Ce n'est pas une page de magasin ([isStorePage]).
     */
    fun isHomePage(url: String?): Boolean {
        if (NavigationPolicy.httpsHostOf(url) != homeHost) return false
        return NavigationPolicy.pathOf(url!!).ifEmpty { "/" } == homePath
    }

    /**
     * L'adresse est-elle celle de la page de connexion **hors d'un magasin** : une page de l'enseigne (ni une page de magasin, ni le site mobile) dont le
     * chemin est celui de [loginPath] ? Une lecture de l'adresse seulement : l'application ne lit jamais le contenu des pages.
     */
    fun isLoginPage(url: String?): Boolean {
        val login = loginPath ?: return false
        if (!isNavigable(url) || isMobileSite(url) || isStorePage(url)) return false
        return login.containsMatchIn(NavigationPolicy.pathOf(url!!))
    }

    /**
     * Un plan (ou la lecture du magasin) de **cette** enseigne peut-il partir vers la page [url] ? Seulement vers une page de cette enseigne où le pont et
     * l'agent existent : jamais une page d'une autre enseigne, ni un hôte où l'on navigue sans pont (la page du mot de passe), ni le site mobile.
     * Une enseigne qui a des pages de magasin n'envoie son message que de l'une d'elles, ou de l'accueil quand [entersStore] (l'agent y entre dans le
     * magasin) ; une enseigne sans page de magasin l'envoie de toute page où le pont existe (l'agent lit le magasin lui-même).
     */
    fun acceptsPlanOn(url: String?, entersStore: Boolean = false): Boolean {
        if (!isBridgePage(url) || isMobileSite(url)) return false
        return if (storePages == null) true else isStorePage(url) || (entersStore && isHomePage(url))
    }

    override fun toString(): String = "RetailerSite($id)"

    private companion object {
        val ID = Regex("[a-z][a-z0-9]{0,19}")
    }
}

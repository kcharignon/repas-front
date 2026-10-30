package eu.kantin.repas.drive

/**
 * Le registre des enseignes de l'application (DRV-706, ADR 0027 du back) : **la seule liste**, et avec son entrée ci-dessous le seul endroit du cœur qui
 * nomme une enseigne (`RetailerSitesArchitectureTest` le garde). Ajouter une enseigne : une entrée de plus, aucun `if` ailleurs.
 *
 * Le registre est **injectable** : les règles reçoivent un [RetailerSites] (par défaut [DEFAULT]) pour se tester avec des enseignes fictives. Les
 * enseignes d'un registre sont les enseignes **activées** : un registre ne contient que ce que l'application sait servir. Les noms de site de deux
 * enseignes ne se recouvrent jamais (une adresse n'est celle que d'une seule enseigne), et aucune ne reçoit le pont d'une autre.
 *
 * @property legacy l'enseigne d'avant le multi-enseignes : celle d'un message ou d'un souvenir qui ne dit pas l'enseigne (la lecture du magasin sans
 * `retailer`, la valeur unique gardée par l'ancienne version). Les formes des règles qui ne reçoivent pas d'enseigne ([NavigationPolicy.decide]…) sont les siennes.
 */
class RetailerSites(val all: List<RetailerSite>, val legacy: RetailerSite = all.firstOrNull() ?: throw IllegalArgumentException("Aucune enseigne.")) {
    init {
        require(all.isNotEmpty()) { "Aucune enseigne." }
        require(all.map { it.id }.toSet().size == all.size) { "Deux enseignes ont le même identifiant." }
        require(all.any { it === legacy }) { "L'enseigne d'avant n'est pas dans le registre." }
        for ((index, site) in all.withIndex()) {
            for (other in all.drop(index + 1)) {
                require(!site.overlapsNavigation(other)) { "Les enseignes ${site.id} et ${other.id} ont un nom de site en commun." }
            }
        }
    }

    /** L'enseigne de ce `retailer` du protocole, ou `null`. Comparaison exacte : « Leclerc » n'est pas `leclerc`. */
    fun byId(id: String?): RetailerSite? = all.firstOrNull { it.id == id }

    /** L'enseigne dont l'adresse est une page où l'on navigue, ou `null` : une adresse n'est celle que d'une seule enseigne. */
    fun forNavigation(url: String?): RetailerSite? {
        val host = NavigationPolicy.httpsHostOf(url) ?: return null
        return all.firstOrNull { it.navigatesTo(host) }
    }

    /**
     * Les enseignes que l'application annonce à Repas (`app.info`, DRV-707) : les identifiants de ce registre, dans son ordre. Une fonction pure : l'application
     * y annonce exactement les enseignes qu'elle sait servir, jamais une de plus.
     */
    fun announcedRetailers(): List<String> = all.map { it.id }

    /** Les règles d'origine du pont des enseignes de ce registre (sans doublon) : la réunion de celles de chaque enseigne. Jamais `*`. */
    fun bridgeOrigins(): Set<String> = all.flatMapTo(LinkedHashSet()) { it.bridgeOrigins }

    companion object {
        /**
         * L'entrée de Leclerc : les valeurs d'avant le multi-enseignes. On y navigue sur `leclercdrive.fr` et tous ses sous-domaines ; le pont et l'agent
         * n'existent que sur les sous-domaines (la règle d’origine `*.leclercdrive.fr` en `https`, jamais le domaine nu). Un magasin a une adresse
         * `https://<sous-domaine>.leclercdrive.fr/magasin-N-N[-Ville]/…`, Leclerc exige un magasin choisi avant la connexion, et sert aux téléphones un
         * site mobile (`m-…`) dont les routes sont autres : le mode ordinateur est imposé.
         */
        private val LECLERC = RetailerSite(
            id = "leclerc",
            name = "Leclerc",
            nameDe = "de Leclerc",
            startUrl = "https://www.leclercdrive.fr/",
            siteMode = SiteMode.DESKTOP,
            hosts = listOf(
                SiteHost(HostPattern.exact("leclercdrive.fr"), bridge = false),
                SiteHost(HostPattern.subdomainsOf("leclercdrive.fr"), bridge = true),
            ),
            storeHost = Regex("[a-z0-9-]+\\.leclercdrive\\.fr"),
            storeIdPattern = Regex("[0-9]{1,12}"),
            storePages = StorePages(
                pagePath = Regex("^/magasin-[0-9]{1,12}-[0-9]{1,12}(-[^/]*)?(/|$)", RegexOption.IGNORE_CASE),
                homeSegment = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})-[^/?#\\s\\\\<>\"'\\u0000-\\u001f]+$"),
                frontLink = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})$"),
            ),
            loginPath = Regex("^/connexion(\\.aspx)?(/|$)", RegexOption.IGNORE_CASE),
            mobileSiteLabel = Regex("m(-[a-z0-9-]*)?"),
        )

        /** Les enseignes que cette version de l'application sait servir. */
        val DEFAULT = RetailerSites(listOf(LECLERC))
    }
}

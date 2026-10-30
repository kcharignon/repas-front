package eu.kantin.repas.drive

/**
 * Le registre des enseignes de l'application (DRV-706, ADR 0027 du back) : **la seule liste**, et avec son entrée ci-dessous le seul endroit du cœur qui
 * nomme une enseigne (`RetailerSitesArchitectureTest` le garde). Ajouter une enseigne : une entrée de plus, aucun `if` ailleurs.
 *
 * Le registre est **injectable** : les règles reçoivent un [RetailerSites] (par défaut [DEFAULT]) pour se tester avec des enseignes fictives. Les
 * enseignes d'un registre sont les enseignes **activées** : un registre ne contient que ce que l'application sait servir. Les noms de site de deux
 * enseignes ne se recouvrent jamais (une adresse n'est celle que d'une seule enseigne), et aucune ne reçoit le pont d'une autre.
 *
 * Une enseigne peut être **inscrite sans être servie** (DRV-728) : elle est dans la table ([SWITCHED_OFF]) mais pas dans [DEFAULT], le registre de la
 * version publiée, et une construction ne l'allume que par un drapeau de construction ([serving]). Tant qu'elle n'est pas dans le registre que
 * l'application sert, elle n'a ni menu, ni annonce, ni origine du pont, ni écran : une adresse ou un plan de cette enseigne est traité comme celui de
 * n'importe quel autre site.
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

    /**
     * L'enseigne sur laquelle un écran du drive s'ouvre (DRV-707) : celle de ce `retailer` d'intention ; un identifiant absent, vide ou inconnu est
     * celle d'avant le multi-enseignes ([legacy]), jamais une erreur (le comportement d'aujourd'hui).
     */
    fun forScreen(id: String?): RetailerSite = byId(id) ?: legacy

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

        /**
         * L'entrée d'Auchan (DRV-728, ADR 0027 du back, décision DRV-715) : **inscrite, éteinte**. Le mot de passe est sur un autre hôte que le site :
         * - on **navigue** sur `www.auchan.fr` ET `compte.auchan.fr` (la connexion), jamais sur un autre nom, pas même un sous-domaine d'`auchan.fr` ;
         * - le **pont** `repasHost` et l'agent n'existent QUE sur `https://www.auchan.fr` (nom exact, aucun joker) : `compte.auchan.fr` est la page du mot
         *   de passe, aucun code de Repas n'y vit. Un plan d'Auchan n'est donc livré qu'à une page de `www.auchan.fr` ([RetailerSite.acceptsPlanOn]) ;
         * - le site est adaptatif : pas de mode ordinateur à imposer ni de site mobile à refuser ([SiteMode.AS_IS]) ;
         * - le magasin n'est PAS dans l'adresse (l'agent le lit dans la page) : pas de page de magasin à reconnaître, et un identifiant de magasin
         *   explicite, un UUID (`storeIdPattern` du contrat) ; le `store.host` d'un plan est `www.auchan.fr` ;
         * - la page de connexion n'a pas de forme à reconnaître ([RetailerSite.loginPath] est vide) : « choisis d'abord ton magasin » est une règle de Leclerc,
         *   Auchan garde le magasin choisi en visiteur à la connexion (DRV-715). On y arrive par la navigation, sans pont.
         * Les sous-ressources de la page (`api.auchan.fr`, `cdn.auchan.fr`, `dd.ecom.auchan.fr`, `google.com/recaptcha`) ne sont pas des navigations : elles
         * ne sont pas dans cette liste (leur bon fonctionnement en WebView est vérifié à la recette, DRV-726).
         */
        private val AUCHAN = RetailerSite(
            id = "auchan",
            name = "Auchan",
            nameDe = "d’Auchan",
            startUrl = "https://www.auchan.fr/courses",
            siteMode = SiteMode.AS_IS,
            hosts = listOf(
                SiteHost(HostPattern.exact("www.auchan.fr"), bridge = true),
                SiteHost(HostPattern.exact("compte.auchan.fr"), bridge = false),
            ),
            storeHost = Regex("www\\.auchan\\.fr"),
            storeIdPattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
        )

        /** Les enseignes que cette version de l'application sait servir : celles de la version PUBLIÉE (Leclerc seul). */
        val DEFAULT = RetailerSites(listOf(LECLERC))

        /**
         * Les enseignes **inscrites mais éteintes** (DRV-728) : connues de la table, jamais servies ni annoncées par [DEFAULT]. Une construction les allume
         * par leur identifiant ([serving]) ; la construction de publication n'en allume aucune.
         */
        val SWITCHED_OFF: List<RetailerSite> = listOf(AUCHAN)

        /** Toutes les enseignes inscrites, allumées ou non : pour les tests des règles de chaque enseigne, jamais pour l'application. */
        internal val REGISTERED = RetailerSites(DEFAULT.all + SWITCHED_OFF, legacy = DEFAULT.legacy)

        /**
         * Le registre qu'une construction sert et ANNONCE : [DEFAULT] plus les enseignes éteintes que son drapeau de construction allume ([flag] : des
         * identifiants séparés par des virgules, vide ou absent = aucune). C'est le seul chemin entre ce drapeau et le registre : sans drapeau, le résultat est
         * [DEFAULT] lui-même, et la version publiée n'a ni menu, ni annonce, ni origine du pont d'une enseigne éteinte.
         *
         * Un identifiant qui n'est pas celui d'une enseigne éteinte (une faute de frappe, une enseigne déjà servie) est refusé : on ne sert jamais en silence
         * autre chose que ce que le drapeau dit.
         */
        fun serving(flag: String?): RetailerSites {
            val ids = (flag ?: "").split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct()
            if (ids.isEmpty()) return DEFAULT
            val unknown = ids.filter { id -> SWITCHED_OFF.none { it.id == id } }
            require(unknown.isEmpty()) { "Enseigne à allumer inconnue ou déjà servie : ${unknown.joinToString()}" }
            return RetailerSites(DEFAULT.all + ids.map { id -> SWITCHED_OFF.first { it.id == id } }, legacy = DEFAULT.legacy)
        }
    }
}

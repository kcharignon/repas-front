package eu.kantin.repas.drive

/**
 * La migration UNIQUE du passage d'une enseigne à sa version mobile (DRV-757). Recette réelle du 2026-11-01 : tant que les cookies et le stockage du site n'avaient pas
 * été effacés, la WebView recevait encore l'ANCIEN site ordinateur après « Commencer mes courses » (l'enseigne se souvient du choix « site ordinateur » posé quand l'application
 * forçait ce mode, versions 1.4.x) ; après l'effacement, la même suite d'écrans arrivait sur le site mobile. Une personne qui met l'application à jour resterait donc sur
 * l'ancien site sans le savoir.
 *
 * Au premier lancement du drive de l'enseigne d'avant ([RetailerSites.legacy], la seule qui ait connu le mode ordinateur) après ce passage, ses données de site sont effacées
 * comme par « Se déconnecter » (la personne se reconnecte, une fois) ; un drapeau gardé dans le stockage de l'application dit que c'est fait, et la migration ne se rejoue jamais.
 * Une autre enseigne ne change jamais, ni la session de Repas : [clear] n'efface que les données de l'enseigne donnée, dans son profil de WebView. Kotlin pur : l'effacement
 * lui-même est fait par l'application.
 */
class SiteModeMigration(
    private val sites: RetailerSites,
    private val store: KeyValueStore,
    /** Efface les données de l'enseigne donnée (cookies, stockage du site, mémoires). `false` : c'est impossible sans toucher aux autres données (WebView sans profils), rien n'est noté. */
    private val clear: (RetailerSite) -> Boolean,
) {
    /** Faut-il encore effacer les données de [site] ? Seulement l'enseigne d'avant, passée à sa version mobile, tant que le drapeau manque. */
    fun due(site: RetailerSite): Boolean =
        site === sites.legacy && site.siteMode == SiteMode.MOBILE && store.load(flag(site)) == null

    /** Efface une seule fois les données de [site] si c'est dû ; vrai quand elles viennent d'être effacées (la personne doit se reconnecter). */
    fun runFor(site: RetailerSite): Boolean {
        if (!due(site) || !clear(site)) return false
        store.save(flag(site), DONE)
        return true
    }

    private fun flag(site: RetailerSite): String = "$KEY.${site.id}"

    companion object {
        const val KEY = "migration.mobile-site"
        private const val DONE = "1"
    }
}

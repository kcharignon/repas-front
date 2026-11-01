package eu.kantin.repas.drive

/**
 * Ce que la migration sait faire des données d'une enseigne ; l'application le fait avec la WebView (cœur sans Android).
 */
interface SiteDataEraser {
    /** Y a-t-il quelque chose à effacer pour [site] : un cookie, un souvenir de chemin de magasin ? */
    fun hasData(site: RetailerSite): Boolean

    /**
     * Efface les données de [site] (cookies, stockage du site, mémoires) et rappelle [done] quand c'est RÉELLEMENT fini (l'effacement des cookies de la WebView est asynchrone).
     * Rend `false` quand c'est impossible sans toucher aux autres données (WebView sans profils) : rien n'est fait et [done] n'est jamais appelé.
     */
    fun erase(site: RetailerSite, done: () -> Unit): Boolean
}

/**
 * La migration UNIQUE du passage d'une enseigne à sa version mobile (DRV-757). Recette réelle du 2026-11-01 : tant que les cookies et le stockage du site n'avaient pas
 * été effacés, la WebView recevait encore l'ANCIEN site ordinateur après « Commencer mes courses » (l'enseigne se souvient du choix « site ordinateur » posé quand l'application
 * forçait ce mode, versions 1.4.x) ; après l'effacement, la même suite d'écrans arrivait sur le site mobile. Une personne qui met l'application à jour resterait donc sur
 * l'ancien site sans le savoir.
 *
 * Au premier lancement du drive de l'enseigne d'avant ([RetailerSites.legacy], la seule qui ait connu le mode ordinateur) après ce passage, ses données de site sont effacées
 * comme par « Se déconnecter » ; le drapeau gardé dans le stockage de l'application dit que c'est fait et n'est posé qu'APRÈS la fin réelle de l'effacement : la migration ne
 * se rejoue jamais, et un effacement interrompu se refait. Elle dit à la personne qu'elle a été déconnectée seulement s'il y avait quelque chose à effacer (une installation neuve, ou un effacement déjà
 * fait à la main, ne reçoit aucun message). Une autre enseigne ne change jamais, ni la session de Repas : l'effacement ne touche que l'enseigne donnée. Kotlin pur.
 */
class SiteModeMigration(
    private val sites: RetailerSites,
    private val store: KeyValueStore,
    private val eraser: SiteDataEraser,
) {
    private val running = mutableSetOf<String>()

    /** Faut-il encore effacer les données de [site] ? Seulement l'enseigne d'avant, passée à sa version mobile, tant que le drapeau manque. */
    fun due(site: RetailerSite): Boolean =
        site === sites.legacy && site.siteMode == SiteMode.MOBILE && store.load(flag(site)) == null

    /**
     * Lance l'effacement des données de [site] si c'est dû. [onFinished] est appelé une fois l'effacement fini et le drapeau posé, avec `true` quand il y avait quelque chose à
     * effacer (la personne a été déconnectée). Rend `true` quand l'effacement est lancé : l'appelant attend [onFinished] avant de charger la page ; `false` : rien à faire
     * (ou impossible), la page se charge tout de suite.
     */
    fun runFor(site: RetailerSite, onFinished: (hadData: Boolean) -> Unit): Boolean {
        if (!due(site) || !running.add(site.id)) return false
        val hadData = eraser.hasData(site)
        val started = eraser.erase(site) {
            store.save(flag(site), DONE)
            running.remove(site.id)
            onFinished(hadData)
        }
        if (!started) running.remove(site.id)
        return started
    }

    private fun flag(site: RetailerSite): String = "$KEY.${site.id}"

    companion object {
        const val KEY = "migration.mobile-site"
        private const val DONE = "1"
    }
}

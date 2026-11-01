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

/** Un délai : rappelle [action] après [millis] ms ; la fonction rendue l'annule. L'application le fait avec le fil principal, les tests avec une horloge à la main. */
fun interface Delay {
    fun after(millis: Long, action: () -> Unit): () -> Unit
}

/** Comment une migration s'est terminée : effacée (la personne a été déconnectée), rien à effacer, ou abandonnée faute de réponse de la WebView. */
enum class MigrationOutcome { ERASED, NOTHING_TO_ERASE, GAVE_UP }

/**
 * La migration UNIQUE du passage d'une enseigne à sa version mobile (DRV-757). Recette réelle du 2026-11-01 : tant que les cookies et le stockage du site n'avaient pas
 * été effacés, la WebView recevait encore l'ANCIEN site ordinateur après « Commencer mes courses » (l'enseigne se souvient du choix « site ordinateur » posé quand l'application
 * forçait ce mode, versions 1.4.x) ; après l'effacement, la même suite d'écrans arrivait sur le site mobile. Une personne qui met l'application à jour resterait donc sur
 * l'ancien site sans le savoir.
 *
 * Au premier lancement du drive de l'enseigne d'avant ([RetailerSites.legacy], la seule qui ait connu le mode ordinateur) après ce passage, ses données de site sont effacées
 * comme par « Se déconnecter » ; le drapeau gardé dans le stockage de l'application dit que c'est fait et n'est posé qu'APRÈS la fin réelle de l'effacement : la migration ne
 * se rejoue jamais, et un effacement interrompu se refait. Si la WebView ne répond pas dans [GIVE_UP_MS] (3 s), la migration est ABANDONNÉE : la page se charge quand même,
 * le drapeau n'est pas posé (elle sera retentée au lancement suivant) et aucun message n'est dit. Elle dit à la personne qu'elle a été déconnectée seulement s'il y avait quelque chose à
 * effacer. Une autre enseigne ne change jamais, ni la session de Repas. Kotlin pur.
 */
class SiteModeMigration(
    private val sites: RetailerSites,
    private val store: KeyValueStore,
    private val eraser: SiteDataEraser,
    private val delay: Delay,
) {
    private val running = mutableSetOf<String>()

    /** Faut-il encore effacer les données de [site] ? Seulement l'enseigne d'avant, passée à sa version mobile, tant que le drapeau manque. */
    fun due(site: RetailerSite): Boolean =
        site === sites.legacy && site.siteMode == SiteMode.MOBILE && store.load(flag(site)) == null

    /**
     * Lance l'effacement des données de [site] si c'est dû. [onFinished] est appelé UNE fois : à la fin réelle de l'effacement (drapeau posé, [MigrationOutcome.ERASED] s'il y avait
     * quelque chose à effacer, [MigrationOutcome.NOTHING_TO_ERASE] sinon) ou à l'abandon ([MigrationOutcome.GAVE_UP], drapeau NON posé, un rappel tardif de la WebView est ignoré). Rend
     * `true` quand l'effacement est lancé : l'appelant attend [onFinished] avant de charger la page ; `false` : rien à faire (ou impossible), la page se charge tout de suite.
     */
    fun runFor(site: RetailerSite, onFinished: (MigrationOutcome) -> Unit): Boolean {
        if (!due(site) || !running.add(site.id)) return false
        val hadData = eraser.hasData(site)
        var settled = false
        var cancel: () -> Unit = {}
        val started = eraser.erase(site) {
            if (settled) return@erase
            settled = true
            cancel()
            store.save(flag(site), DONE)
            running.remove(site.id)
            onFinished(if (hadData) MigrationOutcome.ERASED else MigrationOutcome.NOTHING_TO_ERASE)
        }
        if (!started) {
            running.remove(site.id)
            return false
        }
        if (!settled) {
            cancel = delay.after(GIVE_UP_MS) {
                if (settled) return@after
                settled = true
                running.remove(site.id)
                onFinished(MigrationOutcome.GAVE_UP)
            }
        }
        return true
    }

    private fun flag(site: RetailerSite): String = "$KEY.${site.id}"

    companion object {
        const val KEY = "migration.mobile-site"
        /** Le temps laissé à la WebView pour finir d'effacer avant de charger la page quand même. */
        const val GIVE_UP_MS = 3_000L
        private const val DONE = "1"
    }
}

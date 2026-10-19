package eu.kantin.repas.drive

/** Ce qui cloche avec la page où l'envoi attend la page du magasin ([OpeningWatch]). Par ordre de gravité : le premier qui s'applique est dit. */
enum class PageTrouble {
    /** Rien à reprocher à la page (ou elle charge encore). */
    NONE,

    /**
     * Le site a répondu 403 ou 429 : c'est le plus souvent le défi de l'anti-robot de Leclerc, qui doit rester visible pour que l'utilisateur
     * le passe. La page n'est pas « fausse » : on le dit autrement et on ne l'écarte pas.
     */
    VERIFICATION,

    /** Le site a répondu une autre erreur HTTP (4xx, 5xx) à la page principale : une page d'erreur, jamais celle du magasin. */
    HTTP_ERROR,

    /** La page n'a pas fini de charger dans le délai ([OpeningWatch.LOAD_TIMEOUT_MS]). */
    SLOW,

    /** La page d'un magasin a chargé sans erreur, mais son agent ne s'est pas annoncé dans le délai ([OpeningWatch.AGENT_TIMEOUT_MS]). */
    NO_AGENT,
}

/**
 * La surveillance de la page où un envoi (ou la lecture du magasin) attend la page du magasin (ticket E de l'audit du 2026-10-18).
 *
 * Un plan s'ouvre sur l'accueil de l'enseigne ([DrivePlan.startUrl]), qui affiche l'accueil du magasin : ce n'est pas une page de magasin
 * pour l'agent, l'utilisateur doit toucher « Commencer mes courses » (l'attendre est normal, ce n'est pas un problème, [StoreBanner.OPEN]). Le
 * site peut aussi refuser la page (page d'erreur, statut 4xx ou 5xx, dont les 404 de la racine de l'hôte du magasin et de `/magasin-<id>-<id>/`,
 * défi anti-robot), la servir trop lentement, ou servir une page de magasin sans que l'agent s'y annonce. Dans ces cas l'utilisateur ne doit
 * pas rester devant un écran qui n'a rien de Repas : [trouble] dit ce qui cloche, et [StoreBanner] en fait un message avec une issue.
 *
 * Kotlin pur : l'activité lui rapporte les événements de la WebView (début et fin de page, statut HTTP de la page principale, délais écoulés,
 * plan parti vers l'agent) et le consulte. Les délais eux-mêmes sont armés par l'activité (`Handler`), qui appelle [loadTimedOut] et
 * [agentTimedOut] à leur échéance. Aucune adresse n'est gardée : l'adresse courante est donnée à chaque question.
 */
class OpeningWatch {
    /** Une page principale est en cours de chargement : elle a commencé (par son début ou par son erreur) et n'a pas fini. */
    private var open = false
    private var status = 0
    private var failed = false
    private var finished = false
    private var slow = false
    private var agentMissing = false
    private var planSent = false

    /**
     * Une nouvelle page principale commence à charger : tout ce qu'on savait de la précédente est oublié, **sauf** ce que la même page vient
     * déjà de dire. L'ordre des événements d'une page n'est pas garanti : la WebView annonce l'erreur HTTP ou l'échec d'une page avant son
     * début (`onPageStarted` a lieu à la validation de la navigation, après la réponse), et ce début ne doit pas l'effacer.
     */
    fun pageStarted() {
        if (!open) restart()
    }

    /** Une page est (ré)ouverte par l'application elle-même : ce qu'on savait de la précédente, même inachevée, est oublié. */
    fun restart() {
        open = true
        status = 0
        failed = false
        finished = false
        slow = false
        agentMissing = false
        planSent = false
    }

    /** Le site a répondu [status] (400 ou plus) à la page principale. */
    fun httpError(status: Int) {
        pageStarted()
        this.status = status
    }

    /** La WebView n'a pas pu charger la page (pas de réseau, certificat refusé…) : le panneau d'incident l'explique, rien à ajouter. */
    fun loadFailed() {
        pageStarted()
        failed = true
    }

    /** La page principale a fini de charger. */
    fun pageFinished() {
        open = false
        finished = true
        slow = false
    }

    /** Le délai de chargement est écoulé : la page est trop lente, si elle n'a pas fini. */
    fun loadTimedOut() {
        if (!finished) slow = true
    }

    /** Le message du passage est parti vers l'agent de cette page : l'agent est bien là. */
    fun planSent() {
        planSent = true
        agentMissing = false
    }

    /** Le message du passage est parti vers l'agent de la page courante : l'agent y travaille, le retour du téléphone ne doit pas la quitter sans demander. */
    fun hasDeliveredPlan(): Boolean = planSent

    /** Le délai de l'agent est écoulé : la page a fini de charger et son agent n'a pas reçu le message. */
    fun agentTimedOut() {
        if (finished && !planSent) agentMissing = true
    }

    /** Ce qui cloche avec la page d'adresse [url], ou [PageTrouble.NONE]. */
    fun trouble(url: String?): PageTrouble = when {
        failed -> PageTrouble.NONE
        status == 403 || status == 429 -> PageTrouble.VERIFICATION
        status >= HTTP_ERROR_FROM -> PageTrouble.HTTP_ERROR
        slow -> PageTrouble.SLOW
        agentMissing && (NavigationPolicy.isStorePage(url) || NavigationPolicy.isHomePage(url)) -> PageTrouble.NO_AGENT
        else -> PageTrouble.NONE
    }

    /**
     * Le message du passage peut-il partir vers l'agent de la page d'adresse [url] ? Seulement sur une page de magasin que le site n'a pas
     * refusée : sur une page d'erreur, l'agent n'aurait rien à faire (et son message d'erreur ne dirait pas pourquoi). Un plan part aussi de
     * l'accueil de l'enseigne ([entersStore], DRV-625) : l'agent y suit lui-même « Commencer mes courses » ; la lecture du magasin, elle, attend
     * toujours une page de magasin (l'utilisateur choisit son magasin).
     */
    fun canDeliver(url: String?, entersStore: Boolean = false): Boolean =
        !failed && status < HTTP_ERROR_FROM && (NavigationPolicy.isStorePage(url) || (entersStore && NavigationPolicy.isHomePage(url)))

    companion object {
        /** À partir de ce code HTTP, une réponse de la page principale est une erreur. */
        private const val HTTP_ERROR_FROM = 400

        /**
         * Au-delà, une page qui n'a pas fini de charger est trop lente. Assez long pour une grosse page de Leclerc (plusieurs centaines de
         * kilo-octets) sur un réseau mobile médiocre, assez court pour que l'utilisateur ne reste pas devant un écran qui n'avance pas.
         */
        const val LOAD_TIMEOUT_MS = 25_000L

        /** Après la fin du chargement d'une page de magasin, le temps laissé à l'agent pour s'annoncer et recevoir son message. */
        const val AGENT_TIMEOUT_MS = 10_000L
    }
}

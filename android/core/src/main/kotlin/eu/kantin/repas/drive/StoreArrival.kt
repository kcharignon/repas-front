package eu.kantin.repas.drive

/**
 * La page d'arrivée d'un magasin ouvert directement (DRV-759 : un plan dont le magasin vient d'être ouvert, DRV-631 : « Finaliser »). Le site peut la refuser (4xx : repli sur l'accueil, voir
 * [DriveEntry.fallsBack]) ou la servir « introuvable » avec un statut 200 : seul son TITRE est lu ([DriveEntry.isNotFoundTitle], jamais le contenu). Cette surveillance ne vaut que pour CETTE
 * page, pendant son chargement et [TITLE_GRACE_MS] ensuite ; une autre page qui commence l'arrête. Kotlin pur, pour se tester sans téléphone.
 */
class StoreArrival(private val clock: () -> Long = System::currentTimeMillis) {
    private var armedUrl: String? = null
    private var watchTitle = false
    private var finishedAt: Long? = null

    /** L'adresse d'arrivée attendue, tant que sa page n'a pas fini de charger ; `null` ensuite. */
    var homeTarget: String? = null
        private set

    fun arm(url: String, watchTitle: Boolean) {
        armedUrl = url
        homeTarget = url
        this.watchTitle = watchTitle
        finishedAt = null
    }

    /** Une page principale commence : si ce n'est pas la page d'arrivée, on ne surveille plus rien. */
    fun pageStarted(url: String?) {
        if (url != null && same(url, armedUrl)) return
        if (url != null) disarm()
    }

    /** La page a fini de charger : sans refus du site, ce n'est plus « l'adresse d'arrivée à vérifier » ; le titre n'est plus lu que quelques secondes. */
    fun pageFinished(url: String?) {
        // Quelle que soit l'adresse finale (une redirection, un `/` de plus ou de moins) : le chargement armé est fini
        if (armedUrl == null) return
        homeTarget = null
        if (finishedAt == null) finishedAt = clock()
    }

    /** Le titre de cette page dit-il « introuvable » (la page d'arrivée seulement, pendant son chargement et le court délai qui suit) ? */
    fun titleSaysMissing(url: String?, title: String?, site: RetailerSite): Boolean {
        if (!watchTitle) return false
        val done = finishedAt
        if (done != null && clock() - done > TITLE_GRACE_MS) {
            watchTitle = false
            return false
        }
        return DriveEntry.isStoreHome(url, site) && DriveEntry.isNotFoundTitle(title)
    }

    private fun same(url: String, other: String?): Boolean = other != null && url.trimEnd('/') == other.trimEnd('/')

    fun disarm() {
        armedUrl = null
        homeTarget = null
        watchTitle = false
        finishedAt = null
    }

    companion object {
        /** Un titre peut arriver peu après la fin du chargement : on le lit encore ce temps-là. */
        const val TITLE_GRACE_MS = 3_000L
    }
}

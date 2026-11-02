package eu.kantin.repas.drive

/**
 * Le repli quand l'agent est là mais ne montre rien (DRV-760) : l'agent dit à l'application (message `log`, `card`) si un de ses écrans est à l'écran. Le plan est parti et rien n'apparaît
 * après [GRACE_MS] : un bandeau natif dit de continuer dans la page ([StoreBanner.NO_CARD]), jusqu'à ce qu'un écran apparaisse. Kotlin pur, pour se tester sans téléphone.
 */
class CardWatch(private val clock: () -> Long = System::currentTimeMillis) {
    private var armedAt: Long? = null
    private var visible = false

    /** Le plan est parti vers l'agent de cette page. */
    fun planSent() {
        armedAt = clock()
        visible = false
    }

    /** Une page commence : l'agent de l'ancienne n'existe plus, rien n'est attendu de la nouvelle avant son plan. */
    fun pageStarted() {
        armedAt = null
        visible = false
    }

    /** L'agent dit qu'un de ses écrans est à l'écran (vrai) ou plus (faux). */
    fun onAgent(shown: Boolean) {
        visible = shown
    }

    /** Le plan est parti depuis plus de [GRACE_MS] et aucun écran de l'agent n'est à l'écran. */
    fun missing(): Boolean {
        val since = armedAt ?: return false
        return !visible && clock() - since >= GRACE_MS
    }

    companion object {
        /** Le temps laissé à l'agent pour montrer sa carte après l'envoi du plan. */
        const val GRACE_MS = 6_000L
    }
}

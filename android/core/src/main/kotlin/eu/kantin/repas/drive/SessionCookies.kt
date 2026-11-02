package eu.kantin.repas.drive

/** Écrit sur le disque les cookies que le navigateur de la coquille a en mémoire ; l'application le fait avec la WebView, les tests avec un compteur. */
fun interface CookieFlusher {
    /** Rend la main quand l'écriture est finie. */
    fun flush()
}

/**
 * Le moment où les cookies de Repas sont écrits sur le disque (DRV-765). La session de Repas tient dans un cookie de rafraîchissement **à rotation** : chaque usage en invalide
 * l'ancien et en pose un nouveau, que le navigateur ne garde d'abord qu'en mémoire. Si le processus s'arrête avant l'écriture (l'installation d'une mise à jour, lancée depuis l'application,
 * l'arrête), le lancement suivant relit l'ANCIEN cookie, que le serveur refuse : la personne doit retaper son mot de passe.
 *
 * Le piège mesuré : une page cachée (l'écran est en pause, par exemple derrière l'installateur d'Android) continue d'exécuter ses minuteries et ses requêtes, donc de faire tourner le
 * cookie APRÈS la dernière écriture. D'où l'écriture **répétée tant que l'écran est en pause** ([paused]) : le processus vit jusqu'à son arrêt, un cookie tourné pendant la pause est
 * donc écrit au plus une période plus tard. Les autres moments (tous sur le fil principal) :
 * - [flushNow] : tout de suite ;
 * - [flushSoon] : une fois la page posée ([SETTLE_MS]), pour couvrir la rotation que le site fait en démarrant ; un seul rappel attend à la fois, chaque appel le réarme ;
 * - [beforeInstaller] : l'écriture est faite avant d'ouvrir l'installateur (l'intention ; la pause qui suit la répète).
 *
 * Limite connue : le processus arrêté entre deux écritures perd la rotation survenue depuis la dernière, au plus [PAUSE_PERIOD_MS] (puis [PAUSE_SLOW_MS] quand la pause dure plus de
 * [PAUSE_FAST_MS]). Kotlin pur ; ne garde jamais l'écran ni la WebView.
 */
class SessionCookies(
    private val flusher: CookieFlusher,
    private val delay: Delay,
) {
    private var cancelSoon: (() -> Unit)? = null
    private var cancelLoop: (() -> Unit)? = null
    private var loopTicks = 0

    /** Écrit les cookies maintenant. Une écriture retardée en attente reste armée : une rotation tardive aurait encore besoin d'elle. */
    fun flushNow() {
        flusher.flush()
    }

    /** Écrit les cookies dans [SETTLE_MS] ; une écriture déjà en attente est remplacée (jamais deux rappels à la fois). */
    fun flushSoon() {
        cancelSoon?.invoke()
        cancelSoon = delay.after(SETTLE_MS) {
            cancelSoon = null
            flusher.flush()
        }
    }

    /** Écrit les cookies, PUIS exécute [open] (l'ouverture de l'installateur) et rend son résultat. */
    fun <T> beforeInstaller(open: () -> T): T {
        flushNow()
        return open()
    }

    /**
     * L'écran passe en pause : écrit tout de suite, puis toutes les [PAUSE_PERIOD_MS] ms (toutes les [PAUSE_SLOW_MS] ms quand la pause dure plus de [PAUSE_FAST_MS]), jusqu'à [resumed]
     * ou [close]. Un seul rappel en attente : une seconde pause repart de zéro.
     */
    fun paused() {
        stopLoop()
        flushNow()
        armLoop()
    }

    /** L'écran revient au premier plan : la répétition s'arrête ([flushSoon] couvre la rotation du retour). */
    fun resumed() {
        stopLoop()
    }

    /** L'écran est détruit : plus aucune écriture ne doit partir. */
    fun close() {
        cancelSoon?.invoke()
        cancelSoon = null
        stopLoop()
    }

    private fun armLoop() {
        val period = if (loopTicks < FAST_TICKS) PAUSE_PERIOD_MS else PAUSE_SLOW_MS
        cancelLoop = delay.after(period) {
            cancelLoop = null
            loopTicks++
            flusher.flush()
            armLoop()
        }
    }

    private fun stopLoop() {
        cancelLoop?.invoke()
        cancelLoop = null
        loopTicks = 0
    }

    companion object {
        /** Le temps laissé à une page de Repas pour faire sa rotation de cookie après la fin de son chargement. */
        const val SETTLE_MS = 2_000L

        /** La période de l'écriture répétée pendant la pause : une écriture sans changement est quasi gratuite, et 500 ms laisse peu à perdre sans réveiller le téléphone sans cesse (jamais sous 250 ms). */
        const val PAUSE_PERIOD_MS = 500L

        /** Les premières [PAUSE_FAST_MS] ms de pause (le temps d'un écran d'installation) au rythme de [PAUSE_PERIOD_MS] ; ensuite toutes les [PAUSE_SLOW_MS] ms. */
        const val PAUSE_FAST_MS = 120_000L
        const val PAUSE_SLOW_MS = 5_000L
        private const val FAST_TICKS = (PAUSE_FAST_MS / PAUSE_PERIOD_MS).toInt()
    }
}

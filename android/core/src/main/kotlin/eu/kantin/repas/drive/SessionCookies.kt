package eu.kantin.repas.drive

/** Écrit sur le disque les cookies que le navigateur de la coquille a en mémoire ; l'application le fait avec la WebView, les tests avec un compteur. */
fun interface CookieFlusher {
    /** Rend la main quand l'écriture est finie. */
    fun flush()
}

/**
 * Le moment où les cookies de Repas sont écrits sur le disque (DRV-765). La session de Repas tient dans un cookie de rafraîchissement **à rotation** : chaque usage en invalide
 * l'ancien et en pose un nouveau, que le navigateur ne garde d'abord qu'en mémoire. Si le processus s'arrête avant l'écriture (l'installation d'une mise à jour, lancée depuis l'application,
 * l'arrête quelques secondes après la dernière rotation), le lancement suivant relit l'ANCIEN cookie, que le serveur refuse : la personne doit retaper son mot de passe.
 *
 * Trois façons d'écrire, toutes sur le fil principal :
 * - [flushNow] : tout de suite (l'écran passe en arrière-plan) ;
 * - [flushSoon] : une fois la page posée ([SETTLE_MS]), pour couvrir la rotation que le site fait en démarrant ; un seul rappel attend à la fois, chaque appel le réarme ;
 * - [beforeInstaller] : l'écriture est faite AVANT d'ouvrir l'installateur, jamais après.
 *
 * Limite connue : une rotation qui survient pendant que l'installateur est affiché ne peut plus être sauvée. Kotlin pur.
 */
class SessionCookies(
    private val flusher: CookieFlusher,
    private val delay: Delay,
) {
    private var cancelPending: (() -> Unit)? = null

    /** Écrit les cookies maintenant. Une écriture retardée en attente reste armée : une rotation tardive aurait encore besoin d'elle. */
    fun flushNow() {
        flusher.flush()
    }

    /** Écrit les cookies dans [SETTLE_MS] ; une écriture déjà en attente est remplacée (jamais deux rappels à la fois). */
    fun flushSoon() {
        cancelPending?.invoke()
        cancelPending = delay.after(SETTLE_MS) {
            cancelPending = null
            flusher.flush()
        }
    }

    /** Écrit les cookies, PUIS exécute [open] (l'ouverture de l'installateur) et rend son résultat. */
    fun <T> beforeInstaller(open: () -> T): T {
        flushNow()
        return open()
    }

    /** L'écran est détruit : plus aucune écriture ne doit partir. */
    fun close() {
        cancelPending?.invoke()
        cancelPending = null
    }

    companion object {
        /** Le temps laissé à une page de Repas pour faire sa rotation de cookie après la fin de son chargement. */
        const val SETTLE_MS = 2_000L
    }
}

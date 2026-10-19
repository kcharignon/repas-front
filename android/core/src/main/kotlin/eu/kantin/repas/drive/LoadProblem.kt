package eu.kantin.repas.drive

/** Pourquoi une page du drive ne s'affiche pas, en quatre cas que l'utilisateur comprend. */
enum class LoadProblem {
    /** Pas de réseau, ou le site est introuvable depuis ce réseau. */
    OFFLINE,

    /** Le site ne répond pas (délai dépassé, erreur du serveur). */
    UNAVAILABLE,

    /** La connexion n'est pas sûre : certificat refusé. */
    CERTIFICATE,

    /** Tout autre incident. */
    OTHER,
}

/**
 * Le classement des incidents de la WebView. Écrit en Kotlin pur pour se tester sans téléphone ; les numéros sont ceux de
 * `WebViewClient.ERROR_*`. Une erreur HTTP autre que 5xx n'est pas un incident : la page de Leclerc (y compris celle de son anti-robot)
 * reste visible.
 */
object LoadProblems {
    private const val HOST_LOOKUP = -2
    private const val CONNECT = -6
    private const val IO = -7
    private const val TIMEOUT = -8
    private const val SSL_HANDSHAKE = -11

    fun fromWebViewError(errorCode: Int): LoadProblem = when (errorCode) {
        HOST_LOOKUP, CONNECT, IO -> LoadProblem.OFFLINE
        TIMEOUT -> LoadProblem.UNAVAILABLE
        SSL_HANDSHAKE -> LoadProblem.CERTIFICATE
        else -> LoadProblem.OTHER
    }

    fun fromHttpStatus(status: Int): LoadProblem? = if (status in 500..599) LoadProblem.UNAVAILABLE else null
}

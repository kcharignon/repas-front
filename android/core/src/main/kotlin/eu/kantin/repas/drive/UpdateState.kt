package eu.kantin.repas.drive

import org.json.JSONObject

/**
 * Pourquoi une mise à jour de l'application s'arrête (DRV-639). Le [code] part à la page de Repas (`update.state`, état `erreur`) : un mot
 * en majuscules, jamais un texte ni une adresse. C'est la page qui choisit la phrase à montrer.
 */
enum class UpdateError(val code: String) {
    /** Pas de connexion : Internet ou GitHub injoignable. */
    OFFLINE("OFFLINE"),

    /** `version.json` introuvable, mal formé ou incohérent. */
    CHECK_FAILED("CHECK_FAILED"),

    /** Le téléchargement s'est arrêté ou GitHub a répondu autre chose que le fichier. */
    DOWNLOAD_FAILED("DOWNLOAD_FAILED"),

    /** Le fichier dépasse la taille permise ([UpdateSource.MAX_APK_BYTES]). */
    TOO_LARGE("TOO_LARGE"),

    /** L'empreinte SHA-256 du fichier n'est pas celle de `version.json` : rien n'est installé. */
    DIGEST_MISMATCH("DIGEST_MISMATCH"),

    /** Le fichier n'est pas une version plus récente de cette application. */
    INVALID_PACKAGE("INVALID_PACKAGE"),

    /** Une redirection menait hors des hôtes permis ([UpdateSource.isTrustedRedirect]). */
    UNTRUSTED_ADDRESS("UNTRUSTED_ADDRESS"),

    /** L'utilisateur n'a pas autorisé Repas à installer des applications (réglage d'Android). */
    PERMISSION_DENIED("PERMISSION_DENIED"),

    /** Android n'a pas d'écran pour installer le fichier. */
    INSTALLER_UNAVAILABLE("INSTALLER_UNAVAILABLE"),

    /** Interne : l'utilisateur a annulé. Ce n'est pas une erreur, l'état revient à « mise à jour disponible ». */
    CANCELLED("CANCELLED"),
}

/** Une panne de la mise à jour, avec sa raison. */
class UpdateFailure(val error: UpdateError, cause: Throwable? = null) : Exception(error.code, cause)

/**
 * L'état de la mise à jour de l'application, tel que la page de Repas le voit (`update.state`, DRV-639). Les mots de [wire] sont ceux du
 * protocole : `inconnu`, `verification`, `aJour`, `miseAJourDisponible`, `telechargement`, `pretAInstaller`, `erreur`.
 *
 * Machine à états (les seules transitions que [UpdateFlow] fait) :
 *
 * ```
 * Unknown ──check──► Checking ──► UpToDate
 *                        │
 *                        ├──────► Available ──start──► Downloading ──► Ready ──installateur fermé──► Available
 *                        │                                  │                 (rien d'installé : fichier effacé)
 *                        └──────► Failed ◄──────────────────┘
 * ```
 */
sealed interface UpdateState {
    /** Le mot du protocole. */
    val wire: String

    /** Pas encore vérifié depuis le démarrage de l'application. */
    data object Unknown : UpdateState {
        override val wire = "inconnu"
    }

    /** La recherche d'une version plus récente est en cours. */
    data object Checking : UpdateState {
        override val wire = "verification"
    }

    /** L'application est à la dernière version publiée. */
    data object UpToDate : UpdateState {
        override val wire = "aJour"
    }

    /** Une version plus récente est publiée ([version] : `X.Y.Z`). */
    data class Available(val version: String) : UpdateState {
        override val wire = "miseAJourDisponible"
    }

    /** Le téléchargement avance ([percent] : 0 à 100). */
    data class Downloading(val version: String, val percent: Int) : UpdateState {
        override val wire = "telechargement"
    }

    /** Le fichier est téléchargé et vérifié : l'installateur d'Android peut s'ouvrir. */
    data class Ready(val version: String) : UpdateState {
        override val wire = "pretAInstaller"
    }

    /** La mise à jour s'est arrêtée ([version] : celle qui était proposée, si l'on la connaît). */
    data class Failed(val error: UpdateError, val version: String?) : UpdateState {
        override val wire = "erreur"
    }

    /** Le message `update.state` envoyé à la page : l'état, la version, la progression ou le code d'erreur, rien d'autre. */
    fun toMessage(): String {
        val json = JSONObject().put("v", 1).put("type", UPDATE_STATE_TYPE).put("state", wire)
        when (this) {
            is Available -> json.put("version", version)
            is Downloading -> json.put("version", version).put("progress", percent.coerceIn(0, 100))
            is Ready -> json.put("version", version)
            is Failed -> {
                json.put("code", error.code)
                if (version != null) json.put("version", version)
            }
            Unknown, Checking, UpToDate -> Unit
        }
        return json.toString()
    }

    companion object {
        const val UPDATE_STATE_TYPE = "update.state"
    }
}

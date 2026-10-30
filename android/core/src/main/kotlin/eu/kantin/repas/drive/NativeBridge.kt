package eu.kantin.repas.drive

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Ce que l'application retient d'un message reçu de la page de Repas (`window.repasNative`). */
sealed interface NativeRequest {
    /** `app.info` : la version de l'application. */
    data object AppInfo : NativeRequest

    /** `app.menu` : ouvrir le menu de l'application (version, mode d'emploi, déconnexion du drive). */
    data object AppMenu : NativeRequest

    /** `update.status` : dire où en est la mise à jour de l'application (DRV-639). Sans effet de bord : la réponse est `update.state`. */
    data object UpdateStatus : NativeRequest

    /** `update.check` : chercher une version plus récente (DRV-639). L'état revient par `update.state`. */
    data object UpdateCheck : NativeRequest

    /** `update.start` : télécharger, vérifier puis ouvrir l'installateur d'Android (DRV-639). L'état revient par `update.state`. */
    data object UpdateStart : NativeRequest

    /** `update.cancel` : arrêter le téléchargement en cours et effacer le fichier (DRV-639). */
    data object UpdateCancel : NativeRequest

    /** `drive.start` : lancer le passage de ce plan (DRV-314). Le plan est valide dans sa forme et son hôte. */
    class DriveStart(val plan: DrivePlan) : NativeRequest

    /** `drive.setup` : lire le magasin choisi sur le drive (DRV-320). Le `runId` est un UUID ; l'enseigne est celle du message (`retailer`, facultatif), à défaut celle d'avant le multi-enseignes. */
    class DriveSetup(val setup: SetupRequest) : NativeRequest

    /** `drive.cancel` : abandonner le passage en cours ; [runId], s'il est donné, doit être celui du passage. */
    class DriveCancel(val runId: String?) : NativeRequest

    /** Un message de la bonne origine mais mal formé : [reply] est la réponse à renvoyer à la page, [reason] ce qu'on note au journal. */
    class Refused(val reply: String, val reason: Rejection) : NativeRequest

    /** Un message d'une autre origine ou d'un cadre secondaire : aucune réponse, rien d'autre que la raison au journal. */
    class Ignored(val reason: Rejection) : NativeRequest
}

/**
 * Le pont natif entre le front Repas et l'application (DRV-317) : `window.repasNative`, un canal `addWebMessageListener` réservé à l'origine
 * de Repas (`BuildConfig.REPAS_ORIGIN`) ; aucun `addJavascriptInterface`. Les règles sont ici, en Kotlin pur, pour se tester sans téléphone.
 *
 * Les messages sont du JSON en texte (UTF-8, 64 Ko au plus pour ceux de la page) avec `v: 1` et un `type`. L'application répond sur le même
 * canal. Le contrat complet, côté page, est dans `android/README.md`.
 */
object NativeBridge {
    /** Le nom de l'objet vu par la page : `window.repasNative`. */
    const val OBJECT_NAME = "repasNative"

    /** Les codes d'erreur de `error` et de `drive.error`. */
    const val INVALID_MESSAGE = "INVALID_MESSAGE"
    const val UNKNOWN_TYPE = "UNKNOWN_TYPE"

    /**
     * Les codes de `drive.error` : plan invalide, `drive.setup` invalide, un autre passage est en cours (avec son `runId`), drive inutilisable,
     * rien à annuler.
     */
    const val INVALID_PLAN = "INVALID_PLAN"
    const val INVALID_SETUP = "INVALID_SETUP"
    const val BUSY = "BUSY"
    const val UNAVAILABLE = "UNAVAILABLE"
    const val NO_PASS = "NO_PASS"

    private const val PROTOCOL_VERSION = 1

    /** Contrôle un message reçu de la page : origine, cadre principal, texte, borne, JSON de version 1, type connu. */
    fun screen(data: String?, origin: String?, isMainFrame: Boolean, repasOrigin: String, sites: RetailerSites = RetailerSites.DEFAULT): NativeRequest {
        if (!RepasOrigin.matches(origin, repasOrigin)) return NativeRequest.Ignored(Rejection.ORIGIN)
        if (!isMainFrame) return NativeRequest.Ignored(Rejection.NOT_MAIN_FRAME)
        if (data == null) return refused(error(INVALID_MESSAGE), Rejection.NOT_TEXT)
        if (!BridgeMessages.fitsBound(data)) return refused(error(INVALID_MESSAGE), Rejection.TOO_LARGE)
        val json = try {
            JSONObject(data)
        } catch (_: JSONException) {
            return refused(error(INVALID_MESSAGE), Rejection.NOT_JSON)
        }
        if (json.optInt("v", -1) != PROTOCOL_VERSION) return refused(error(INVALID_MESSAGE), Rejection.NOT_PROTOCOL)
        return when (val type = json.optString("type")) {
            "app.info" -> NativeRequest.AppInfo
            "app.menu" -> NativeRequest.AppMenu
            "update.status" -> NativeRequest.UpdateStatus
            "update.check" -> NativeRequest.UpdateCheck
            "update.start" -> NativeRequest.UpdateStart
            "update.cancel" -> NativeRequest.UpdateCancel
            "drive.start" -> DrivePlan.parse(json.optJSONObject("plan"), sites)?.let { NativeRequest.DriveStart(it) }
                ?: refused(driveError(INVALID_PLAN), Rejection.NOT_PROTOCOL)
            "drive.setup" -> SetupRequest.parse(json, sites)?.let { NativeRequest.DriveSetup(it) }
                ?: refused(driveError(INVALID_SETUP), Rejection.NOT_PROTOCOL)
            "drive.cancel" -> {
                val runId = json.opt("runId")
                when {
                    !json.has("runId") || json.isNull("runId") -> NativeRequest.DriveCancel(null)
                    runId is String && DrivePlan.isRunId(runId) -> NativeRequest.DriveCancel(runId)
                    else -> refused(error(INVALID_MESSAGE), Rejection.NOT_PROTOCOL)
                }
            }
            else -> refused(error(UNKNOWN_TYPE), Rejection.NOT_PROTOCOL)
        }
    }

    private fun refused(reply: String, reason: Rejection): NativeRequest = NativeRequest.Refused(reply, reason)

    // ---------------------------------------------------------------------------------------------------------------
    // Les réponses de l'application à la page

    /**
     * Réponse à `app.info`. `drive` : le drive est utilisable (agent intact, WebView assez récente). `selfUpdate` : l'application sait se mettre
     * à jour elle-même (DRV-639, variante hors Google Play seulement) ; la clé n'est écrite que si c'est vrai, pour qu'une application sans cette
     * fonction réponde exactement comme avant. `retailers` (DRV-707) : les enseignes que l'application sait servir (leurs identifiants, dans l'ordre de
     * [RetailerSites.announcedRetailers]) : une CAPACITÉ, jamais un numéro de version. Facultatif pour le lecteur : une page qui ne connaît pas la clé
     * la lit comme la liste de la seule enseigne d'avant ([RetailerSites.legacy]). La clé n'est écrite que si l'appelant la donne.
     */
    fun appInfo(version: String, versionCode: Long, drive: Boolean, selfUpdate: Boolean = false, retailers: List<String>? = null): String = message("app.info") {
        put("version", version)
        put("versionCode", versionCode)
        put("drive", drive)
        if (selfUpdate) put("selfUpdate", true)
        if (retailers != null) put("retailers", JSONArray(retailers))
    }

    /**
     * Le résultat d'un passage (celui de l'agent, ou un résultat `aborted`), à livrer à Repas : `{v, type: "drive.result", result}`. Il peut
     * dépasser 64 Ko de l'enveloppe : la borne ne vaut que pour la page vers l'application.
     */
    fun driveResult(result: JSONObject): String = message("drive.result") { put("result", result) }

    /** Un message mal formé ou inconnu. */
    fun error(code: String): String = message("error") { put("code", code) }

    /** Un refus d'un message `drive.*`, avec au besoin le `runId` du passage concerné. */
    fun driveError(code: String, runId: String? = null): String = message("drive.error") {
        put("code", code)
        if (runId != null) put("runId", runId)
    }

    private fun message(type: String, fill: JSONObject.() -> Unit): String =
        JSONObject().put("v", PROTOCOL_VERSION).put("type", type).apply(fill).toString()
}

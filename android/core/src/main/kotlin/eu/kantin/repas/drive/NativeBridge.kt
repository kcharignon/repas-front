package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/** Ce que l'application retient d'un message reçu de la page de Repas (`window.repasNative`). */
sealed interface NativeRequest {
    /** `app.info` : la version de l'application. */
    data object AppInfo : NativeRequest

    /** `app.menu` : ouvrir le menu de l'application (version, mode d'emploi, déconnexion du drive). */
    data object AppMenu : NativeRequest

    /** `drive.start` : lancer le passage de ce plan (DRV-314). Le plan est valide dans sa forme et son hôte. */
    class DriveStart(val plan: DrivePlan) : NativeRequest

    /** `drive.setup` : lire le magasin choisi sur le drive (DRV-320). Le `runId` est un UUID. */
    class DriveSetup(val setup: SetupRequest) : NativeRequest

    /** `drive.cancel` : abandonner le passage en cours ; [runId], s'il est donné, doit être celui du passage. */
    class DriveCancel(val runId: String?) : NativeRequest

    /**
     * `google.signIn` : obtenir un jeton d'identité Google par la feuille de choix du compte de la plateforme (AUTH-011), jamais par une page de
     * Google dans une WebView. [clientId] (l'ID client Web, l'audience du jeton) et [nonce] (donné par le serveur) ont la forme exigée
     * ([NativeBridge.isGoogleClientId], [NativeBridge.isNonce]) ; ils viennent de la page, qui les tient du back. Ni l'un ni l'autre ne s'écrit au
     * journal : [toString] ne les montre pas.
     */
    class GoogleSignIn(val clientId: String, val nonce: String) : NativeRequest {
        override fun toString(): String = "GoogleSignIn(…)"
    }

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

    /**
     * Les codes de `google.error` propres au pont (AUTH-011) : la demande n'a pas la forme exigée (aucun appel à la plateforme), ou une autre
     * demande est en cours ([BUSY]). Les autres codes sont ceux d'[IdentityError] (`CANCELLED`, `NO_ACCOUNT`, `UNAVAILABLE`, `FAILED`).
     */
    const val INVALID_REQUEST = "INVALID_REQUEST"

    /** La longueur maximale d'un jeton d'identité rendu à la page (celle que la page accepte) ; un jeton vide ou plus long est un échec. */
    const val MAX_ID_TOKEN_CHARS = 4096

    private const val PROTOCOL_VERSION = 1

    /** L'ID client Web d'un projet Google : `<chiffres>-<minuscules et chiffres>.apps.googleusercontent.com`, rien d'autre. */
    private val GOOGLE_CLIENT_ID = Regex("[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com")

    /** Le nonce du serveur : de 16 à 128 caractères `A-Z`, `a-z`, `0-9`, `_` ou `-`. */
    private val NONCE = Regex("[A-Za-z0-9_-]{16,128}")

    /** Vrai si [value] est un texte de la forme d'un ID client Web Google (la valeur n'est jamais écrite dans le dépôt : elle vient du back). */
    fun isGoogleClientId(value: Any?): Boolean = value is String && GOOGLE_CLIENT_ID.matches(value)

    /** Vrai si [value] est un texte de la forme du nonce du serveur. */
    fun isNonce(value: Any?): Boolean = value is String && NONCE.matches(value)

    /** Contrôle un message reçu de la page : origine, cadre principal, texte, borne, JSON de version 1, type connu. */
    fun screen(data: String?, origin: String?, isMainFrame: Boolean, repasOrigin: String): NativeRequest {
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
            "drive.start" -> DrivePlan.parse(json.optJSONObject("plan"))?.let { NativeRequest.DriveStart(it) }
                ?: refused(driveError(INVALID_PLAN), Rejection.NOT_PROTOCOL)
            "drive.setup" -> SetupRequest.of(json.opt("runId"))?.let { NativeRequest.DriveSetup(it) }
                ?: refused(driveError(INVALID_SETUP), Rejection.NOT_PROTOCOL)
            "drive.cancel" -> {
                val runId = json.opt("runId")
                when {
                    !json.has("runId") || json.isNull("runId") -> NativeRequest.DriveCancel(null)
                    runId is String && DrivePlan.isRunId(runId) -> NativeRequest.DriveCancel(runId)
                    else -> refused(error(INVALID_MESSAGE), Rejection.NOT_PROTOCOL)
                }
            }
            // Seuls `clientId` et `nonce` sont lus ; un champ de plus est ignoré.
            "google.signIn" -> {
                val clientId = json.opt("clientId")
                val nonce = json.opt("nonce")
                if (isGoogleClientId(clientId) && isNonce(nonce)) {
                    NativeRequest.GoogleSignIn(clientId as String, nonce as String)
                } else {
                    refused(googleError(INVALID_REQUEST), Rejection.NOT_PROTOCOL)
                }
            }
            else -> refused(error(UNKNOWN_TYPE), Rejection.NOT_PROTOCOL)
        }
    }

    private fun refused(reply: String, reason: Rejection): NativeRequest = NativeRequest.Refused(reply, reason)

    // ---------------------------------------------------------------------------------------------------------------
    // Les réponses de l'application à la page

    /**
     * Réponse à `app.info`. `drive` : le drive est utilisable (agent intact, WebView assez récente). `google` : l'application connaît
     * `google.signIn` (AUTH-011) ; c'est un drapeau de capacité, pas une promesse : sans services Google sur le téléphone, la demande répond
     * `UNAVAILABLE`. Un front plus ancien ignore ce champ ; un front récent devant une application plus ancienne ne le voit pas et ne propose pas
     * la connexion avec Google.
     */
    fun appInfo(version: String, versionCode: Long, drive: Boolean, google: Boolean): String = message("app.info") {
        put("version", version)
        put("versionCode", versionCode)
        put("drive", drive)
        put("google", google)
    }

    /** Le jeton d'identité remis à la page qui l'a demandé (`google.result`). Il n'est ni gardé ni écrit au journal. */
    fun googleResult(idToken: String): String = message("google.result") { put("idToken", idToken) }

    /** Pas de jeton (`google.error`) : un code d'[IdentityError], [BUSY] ou [INVALID_REQUEST], jamais le texte d'une erreur de la plateforme. */
    fun googleError(code: String): String = message("google.error") { put("code", code) }

    /** La réponse de la plateforme, en message pour la page : le jeton (1 à [MAX_ID_TOKEN_CHARS] caractères), sinon le code de l'échec. */
    fun googleAnswer(result: IdentityResult): String = when (result) {
        is IdentityResult.Token ->
            if (result.idToken.isBlank() || result.idToken.length > MAX_ID_TOKEN_CHARS) {
                googleError(IdentityError.FAILED.name)
            } else {
                googleResult(result.idToken)
            }
        is IdentityResult.Failure -> googleError(result.error.name)
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

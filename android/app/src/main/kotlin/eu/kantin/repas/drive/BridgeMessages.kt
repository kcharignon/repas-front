package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/** Pourquoi un message du canal a été ignoré. Jamais le contenu du message : seulement la raison. */
enum class Rejection { ORIGIN, NOT_MAIN_FRAME, NOT_TEXT, TOO_LARGE, NOT_JSON, NOT_PROTOCOL }

/** Ce que l'application retient d'un message reçu d'une page. */
sealed interface Inbound {
    /** L'annonce de la page (envoyée par le petit script d'injection, pas par l'agent) : elle donne le canal de réponse. */
    data object Hello : Inbound

    /** Un message de l'agent, JSON du protocole v1 : l'application n'en interprète que le type (et `result` pour la suite). */
    class FromAgent(val type: String, val text: String) : Inbound

    class Rejected(val reason: Rejection) : Inbound
}

/**
 * Le canal de messages entre l'application et l'agent (DRV-313) : les règles, en Kotlin pur pour se tester sans téléphone.
 *
 * Un seul canal natif, `addWebMessageListener` : aucun objet natif n'est exposé aux pages (pas de `addJavascriptInterface`). Il n'est
 * ouvert qu'aux pages https de `*.leclercdrive.fr`, et l'application revérifie l'origine de chaque message reçu. Les messages sont du JSON
 * en texte, de 64 Ko au plus (la borne du protocole), dans les deux sens. L'application ne les interprète pas (sauf `result`, pour
 * DRV-314) : elle vérifie leur forme, les transmet, et n'écrit jamais leur contenu au journal.
 */
object BridgeMessages {
    /** Le nom de l'objet vu par la page : `window.repasHost`. */
    const val OBJECT_NAME = "repasHost"

    /** Les seules origines où l'objet existe et où l'agent est injecté. Jamais `*`. */
    val ORIGIN_RULES: Set<String> = setOf("https://*.leclercdrive.fr")

    /** La taille maximale d'un message en octets (`LIMITS.messageBytes` du protocole). */
    const val MAX_BYTES = 64 * 1024

    /** La commande qui ouvre le diagnostic de l'agent (protocole v1, `command.schema.json`). */
    const val COMMAND_DIAGNOSTIC = """{"v":1,"type":"command","command":"diagnostic"}"""

    private const val DOMAIN_SUFFIX = ".leclercdrive.fr"
    private const val PROTOCOL_VERSION = 1
    private val FROM_AGENT_TYPES = setOf("result", "setup-result", "progress", "log")

    /** Une origine de la forme `https://<sous-domaine>.leclercdrive.fr` (port 443 permis), comme `ORIGIN_RULES`. */
    fun isAllowedOrigin(origin: String?): Boolean {
        val host = NavigationPolicy.httpsHostOf(origin) ?: return false
        if (!host.endsWith(DOMAIN_SUFFIX)) return false
        return origin!!.lowercase().removeSuffix(":443") == "https://$host"
    }

    /** Le texte tient dans la borne du protocole (en octets UTF-8, pas en caractères). */
    fun fitsBound(text: String): Boolean = text.length <= MAX_BYTES && text.toByteArray(Charsets.UTF_8).size <= MAX_BYTES

    /** Contrôle un message reçu d'une page : origine, cadre principal, texte, borne, JSON du protocole v1, type connu. */
    fun screen(data: String?, origin: String?, isMainFrame: Boolean): Inbound {
        if (!isAllowedOrigin(origin)) return Inbound.Rejected(Rejection.ORIGIN)
        if (!isMainFrame) return Inbound.Rejected(Rejection.NOT_MAIN_FRAME)
        if (data == null) return Inbound.Rejected(Rejection.NOT_TEXT)
        if (!fitsBound(data)) return Inbound.Rejected(Rejection.TOO_LARGE)
        val json = try {
            JSONObject(data)
        } catch (_: JSONException) {
            return Inbound.Rejected(Rejection.NOT_JSON)
        }
        if (json.optInt("v", -1) != PROTOCOL_VERSION) return Inbound.Rejected(Rejection.NOT_PROTOCOL)
        val type = json.optString("type")
        return when {
            type == "hello" -> Inbound.Hello
            type in FROM_AGENT_TYPES -> Inbound.FromAgent(type, data)
            else -> Inbound.Rejected(Rejection.NOT_PROTOCOL)
        }
    }
}

package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/** Pourquoi un message du canal a été ignoré. Jamais le contenu du message : seulement la raison. */
enum class Rejection { ORIGIN, NOT_MAIN_FRAME, NOT_TEXT, TOO_LARGE, NOT_JSON, NOT_PROTOCOL }

/** Ce que l'application retient d'un message reçu d'une page. */
sealed interface Inbound {
    /**
     * L'annonce de la page (envoyée par le petit script d'injection, pas par l'agent) : elle donne le canal de réponse. `debug` : le script
     * d'injection de la variante de débogage a annoncé `debug: true` (DRV-318) ; c'est le seul cas où l'agent honore la commande `selftest`.
     */
    data class Hello(val debug: Boolean) : Inbound

    /** Un message de l'agent, JSON du protocole v1 : l'application n'en interprète que le type (et `result` pour la suite). */
    class FromAgent(val type: String, val text: String) : Inbound

    class Rejected(val reason: Rejection) : Inbound
}

/**
 * Le canal de messages entre l'application et l'agent (DRV-313) : les règles, en Kotlin pur pour se tester sans téléphone.
 *
 * Un seul canal natif, `addWebMessageListener` : aucun objet natif n'est exposé aux pages (pas de `addJavascriptInterface`). Il n'est
 * ouvert qu'aux origines `https` **où le pont existe** ([RetailerSite.bridgeOrigins]), et l'application revérifie l'origine de chaque message reçu. Les messages
 * sont du JSON en texte, de 64 Ko au plus (la borne du protocole), dans les deux sens. L'application ne les interprète pas (sauf `result`, pour
 * DRV-314) : elle vérifie leur forme, les transmet, et n'écrit jamais leur contenu au journal.
 *
 * Les origines sont celles **d'une enseigne** : une origine d'une enseigne ne reçoit jamais le message d'une autre, et une page où l'on navigue sans
 * pont (la page de connexion d'une enseigne qui a son mot de passe sur un autre hôte) n'a ni l'objet ni l'agent. Les fonctions qui ne reçoivent pas
 * d'enseigne sont celles de l'enseigne d'avant le multi-enseignes ([RetailerSites.legacy]).
 */
object BridgeMessages {
    /** Le nom de l'objet vu par la page : `window.repasHost`. */
    const val OBJECT_NAME = "repasHost"

    /**
     * Les seules origines où l'objet existe et où l'agent est injecté, pour toutes les enseignes que cette version de l'application sert
     * ([RetailerSites.DEFAULT]). Jamais `*`. Un écran qui n'ouvre qu'une enseigne donne celles de **cette** enseigne seulement ([originRules]).
     */
    val ORIGIN_RULES: Set<String> = originRules(RetailerSites.DEFAULT.all)

    /** La taille maximale d'un message en octets (`LIMITS.messageBytes` du protocole). */
    const val MAX_BYTES = 64 * 1024

    /** La commande qui ouvre le diagnostic de l'agent (protocole v1, `command.schema.json`). */
    const val COMMAND_DIAGNOSTIC = """{"v":1,"type":"command","command":"diagnostic"}"""

    /** La commande qui lance le test automatique de la variante de débogage (DRV-318) ; l'agent la refuse hors du mode débogage. */
    const val COMMAND_SELFTEST = """{"v":1,"type":"command","command":"selftest"}"""

    private const val PROTOCOL_VERSION = 1
    private val FROM_AGENT_TYPES = setOf("result", "setup-result", "selftest-result", "progress", "log")

    /**
     * Les règles d'origine à donner à la WebView pour ces enseignes : la réunion de celles de chaque enseigne, **celles des hôtes qui portent le pont
     * seulement**. Jamais `*`, jamais `http`.
     */
    fun originRules(sites: Collection<RetailerSite>): Set<String> {
        val rules = sites.flatMapTo(LinkedHashSet()) { it.bridgeOrigins }
        check(rules.none { it == "*" || !it.startsWith("https://") }) { "Règle d'origine trop large." }
        return rules
    }

    /** Une origine du pont de l'enseigne d'avant le multi-enseignes (port 443 permis), comme `ORIGIN_RULES`. */
    fun isAllowedOrigin(origin: String?): Boolean = isAllowedOrigin(RetailerSites.DEFAULT.legacy, origin)

    /** Une origine `https://<nom>` (port 443 permis) où le pont de **cette** enseigne existe : l'origine entière est comparée, rien de plus lâche. */
    fun isAllowedOrigin(site: RetailerSite, origin: String?): Boolean = site.isBridgeOrigin(origin)

    /** Le texte tient dans la borne du protocole (en octets UTF-8, pas en caractères). */
    fun fitsBound(text: String): Boolean = text.length <= MAX_BYTES && text.toByteArray(Charsets.UTF_8).size <= MAX_BYTES

    /** Contrôle un message reçu d'une page de l'enseigne d'avant le multi-enseignes : origine, cadre principal, texte, borne, JSON du protocole v1, type connu. */
    fun screen(data: String?, origin: String?, isMainFrame: Boolean): Inbound = screen(RetailerSites.DEFAULT.legacy, data, origin, isMainFrame)

    /** Contrôle un message reçu d'une page de [site] : origine du pont de **cette** enseigne, cadre principal, texte, borne, JSON du protocole v1, type connu. */
    fun screen(site: RetailerSite, data: String?, origin: String?, isMainFrame: Boolean): Inbound {
        if (!isAllowedOrigin(site, origin)) return Inbound.Rejected(Rejection.ORIGIN)
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
            type == "hello" -> Inbound.Hello(debug = json.opt("debug") == true)
            type in FROM_AGENT_TYPES -> Inbound.FromAgent(type, data)
            else -> Inbound.Rejected(Rejection.NOT_PROTOCOL)
        }
    }
}

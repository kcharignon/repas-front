package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/**
 * Le rapport du test automatique (variante de débogage, DRV-318) : le message `selftest-result` de l'agent mis en texte à copier. L'agent a
 * déjà construit un texte sans donnée personnelle ; l'application le revérifie et masque tout de même ce qui ressemble à une adresse web, à
 * une adresse e-mail ou à un numéro de six chiffres ou plus (un numéro de magasin ne se montre que par ses trois derniers chiffres).
 */
object SelftestReport {
    /** Le rapport tient en 20 000 caractères au plus (`LIMITS.selftestReport` du protocole). */
    const val MAX_CHARS = 20_000

    const val UNREADABLE = "Rapport illisible : l'agent a répondu autrement qu'attendu."

    private val ADDRESS = Regex("(?i)(https?://|www\\.)\\S+")
    private val EMAIL = Regex("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+")
    private val LONG_NUMBER = Regex("\\d{6,}")

    /** Le texte du rapport, ou `null` si le message n'a pas la forme du protocole (`v`, `type`, `ok`, `agentVersion`, `report`). */
    fun render(json: String): String? = try {
        val message = JSONObject(json)
        val report = message.opt("report")
        val valid = message.optInt("v", -1) == 1 &&
            message.optString("type") == "selftest-result" &&
            message.opt("ok") is Boolean &&
            message.optString("agentVersion").matches(Regex("\\d+\\.\\d+\\.\\d+")) &&
            report is String && report.isNotBlank() && report.length <= MAX_CHARS
        if (valid) mask(report as String) else null
    } catch (_: JSONException) {
        null
    }

    /** Masque les adresses, les e-mails et les longs numéros (gardés par leurs trois derniers chiffres, comme le numéro de magasin). */
    fun mask(text: String): String = text
        .replace(ADDRESS, "[adresse masquée]")
        .replace(EMAIL, "[adresse masquée]")
        .replace(LONG_NUMBER) { "…" + it.value.takeLast(3) }
}

/**
 * Le test automatique vu de l'application : une commande envoyée à l'agent, puis son rapport montré à l'utilisateur. Un `selftest-result`
 * n'est accepté que si l'application vient de le demander (une page ne peut pas faire apparaître, ni copier dans le presse-papiers, un
 * rapport qu'on n'a pas demandé). Ne dépend d'aucune classe Android.
 */
class SelftestRun(
    private val send: () -> Boolean,
    private val show: (String) -> Unit,
) {
    private var waiting = false

    /** Demande le test. `false` si la commande n'a pas pu partir vers l'agent. */
    fun start(): Boolean {
        if (!send()) return false
        waiting = true
        return true
    }

    /** Un message de l'agent (`type` et JSON déjà contrôlés par [BridgeMessages.screen]) ; rend vrai s'il a été pris pour le rapport attendu. */
    fun onAgentMessage(type: String, text: String): Boolean {
        if (type != "selftest-result" || !waiting) return false
        waiting = false
        show(SelftestReport.render(text) ?: SelftestReport.UNREADABLE)
        return true
    }
}

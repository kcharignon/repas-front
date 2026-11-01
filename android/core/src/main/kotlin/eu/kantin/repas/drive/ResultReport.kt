package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/**
 * Le résultat de l'agent mis en texte à copier (essai de débogage, DRV-313). Jamais de cookie ni d'adresse, et le numéro de magasin
 * n'est montré que par ses trois derniers chiffres ; le libellé du magasin n'est pas recopié. Le JSON brut n'est jamais affiché.
 */
object ResultReport {
    fun render(json: String): String = try {
        val message = JSONObject(json)
        when (message.optString("type")) {
            "result" -> result(message)
            "setup-result" -> setupResult(message)
            else -> UNREADABLE
        }
    } catch (_: JSONException) {
        UNREADABLE
    }

    private const val UNREADABLE = "Résultat illisible : l'agent a répondu autrement qu'attendu."

    /** Les trois derniers chiffres au plus, précédés de « … ». */
    fun storeTail(id: String): String = if (id.length > 3) "…" + id.takeLast(3) else "…"

    private fun result(message: JSONObject): String = buildString {
        appendLine("Résultat de l'agent")
        appendLine("Issue : " + message.optString("outcome", "?"))
        appendLine("Version de l'agent : " + message.optString("agentVersion", "?"))
        appendLine("Magasin : " + storeTail(message.optJSONObject("store")?.optString("id").orEmpty()))
        // Le magasin que la personne a choisi à la place de celui du plan (DRV-755) : ses trois derniers chiffres, comme le magasin du plan
        message.optJSONObject("chosenStore")?.let { appendLine("Magasin choisi : " + storeTail(it.optString("id"))) }
        message.optJSONObject("error")?.let { appendLine("Erreur : " + it.optString("code", "?") + " (" + it.optString("message") + ")") }
        // Les compteurs du passage (ticket L) : des nombres seulement, quand l'agent en donne.
        message.optJSONObject("stats")?.let {
            appendLine("Requêtes : " + it.optInt("requests") + " (erreurs " + it.optInt("errors") + ", blocages " + it.optInt("blocks") + ")")
        }
        val lines = message.optJSONArray("lines")
        appendLine("Lignes : " + (lines?.length() ?: 0))
        for (index in 0 until (lines?.length() ?: 0)) {
            lines?.optJSONObject(index)?.let { appendLine("- " + line(it)) }
        }
    }.trimEnd()

    private fun line(line: JSONObject): String {
        val parts = mutableListOf(line.optString("outcome", "?"))
        val product = line.optJSONObject("product")
        val productId = product?.optString("id") ?: line.optString("productId")
        if (productId.isNotEmpty()) {
            val label = product?.optString("label").orEmpty()
            parts += "produit $productId" + if (label.isNotEmpty()) " « $label »" else ""
        }
        if (line.has("quantity")) parts += "quantité " + line.optInt("quantity")
        if (line.has("usedRank")) parts += "rang " + line.optInt("usedRank")
        if (line.has("placement")) parts += "placement " + line.optString("placement")
        (product?.optJSONObject("price") ?: line.optJSONObject("price"))?.let { parts += "prix " + euros(it.optLong("cents")) }
        if (line.has("error")) parts += "erreur " + line.optString("error")
        return line.optString("ingredientSlug", "?") + " : " + parts.joinToString(", ")
    }

    private fun euros(cents: Long): String = "%d,%02d €".format(cents / 100, cents % 100)

    private fun setupResult(message: JSONObject): String {
        val store = message.optJSONObject("store")
        return listOf(
            "Magasin lu par l'agent",
            "Version de l'agent : " + message.optString("agentVersion", "?"),
            "Magasin : " + storeTail(store?.optString("id").orEmpty()),
            "Hôte : " + store?.optString("host").orEmpty(),
            "Libellé : " + if (store?.isNull("label") == false) "présent" else "absent",
        ).joinToString("\n")
    }
}

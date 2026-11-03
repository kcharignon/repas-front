package eu.kantin.repas.drive

import org.json.JSONArray
import org.json.JSONObject

/**
 * Les lignes d'un message `progress` de l'agent (DRV-769), jugées avec la MÊME rigueur que le validateur de résultat de Repas (`validateResult`, `drive-agent/protocol/result.ts`) :
 * mêmes clés par issue, mêmes types, mêmes bornes. Une page de l'enseigne partage le monde JavaScript de l'agent : elle peut poster un faux `progress`. Un abandon met ces lignes dans le
 * résultat `aborted` que Repas valide en entier ; une seule ligne de forme douteuse ferait rejeter TOUT le résultat (un abandon illisible). Ici une copie qui n'a pas exactement la forme du
 * protocole est donc refusée en bloc ([parse] rend `null`), jamais réparée ni recoupée ligne à ligne. Kotlin pur.
 */
object ProgressLines {
    /** Lignes d'un plan ou d'un résultat (`LIMITS.lines`). */
    const val MAX_LINES = 100

    private const val MAX_LABEL = 255
    private const val MAX_PRODUCTS = 5
    private const val MAX_UNAVAILABLE_ADDED = 4
    private const val MAX_REJECTED = 20
    private const val MAX_PACKS = 99
    private const val MAX_CENTS = 100_000_000L
    private const val MAX_CATALOG_ID = 2_147_483_647L
    private const val MAX_OFFER_ID = 40
    private const val MIN_QUERY = 2
    private const val MAX_QUERY = 80
    private const val MAX_UNIT_SLUG = 32

    private val SLUG = Regex("^[a-z0-9-]{1,100}$")
    private val PRODUCT_ID = Regex("^(?:[0-9]{1,12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")
    private val OFFER_ID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    private val EAN = Regex("^[0-9]{8,14}$")
    private val UNIT_SLUG = Regex("^[a-z0-9-]{1,255}$")

    private val OUTCOMES = setOf("ADDED", "CHOSEN", "UNAVAILABLE", "HAVE_AT_HOME", "SKIPPED", "FAILED")
    private val PLACEMENTS = setOf("PRIMARY", "FALLBACK", "ONCE")
    private val ERROR_CODES = setOf("NOT_LOGGED_IN", "STORE_MISMATCH", "BLOCKED", "CONTRACT_CHANGED", "NETWORK", "CANCELLED", "INVALID_MESSAGE", "UNSUPPORTED_PAGE")
    private val CONTENT_UNITS = setOf("g", "kg", "ml", "cl", "l", "piece")
    private val MEASURE_UNITS = setOf("kg", "l", "piece")

    /** Les lignes telles quelles si chacune a exactement la forme d'une `ResultLine` du protocole (100 au plus), sinon `null`. */
    fun parse(lines: JSONArray?): JSONArray? {
        if (lines == null || lines.length() > MAX_LINES) return null
        for (index in 0 until lines.length()) {
            val line = lines.optJSONObject(index) ?: return null
            if (!validLine(line)) return null
        }
        return lines
    }

    private fun validLine(line: JSONObject): Boolean {
        val outcome = line.opt("outcome") as? String ?: return false
        if (outcome !in OUTCOMES) return false
        val keys = mutableSetOf("ingredientSlug", "outcome", "rejected")
        when (outcome) {
            "ADDED" -> keys += setOf("productId", "quantity", "usedRank", "unavailableIds", "price", "packSize")
            "CHOSEN" -> keys += setOf("product", "quantity", "placement", "unavailableIds", "searchQuery", "notInCart", "packSize")
            "UNAVAILABLE" -> keys += "unavailableIds"
            "FAILED" -> keys += "error"
        }
        if (!onlyKeys(line, keys) || !text(line, "ingredientSlug", SLUG)) return false
        when (outcome) {
            "ADDED" -> if (!(text(line, "productId", PRODUCT_ID) && int(line, "quantity", 1, MAX_PACKS.toLong()) && int(line, "usedRank", 1, MAX_PRODUCTS.toLong()))) return false
            "CHOSEN" -> if (!(product(line.opt("product"), withPrice = true) && int(line, "quantity", 1, MAX_PACKS.toLong()) && enumOf(line, "placement", PLACEMENTS))) return false
            "FAILED" -> if (!enumOf(line, "error", ERROR_CODES)) return false
        }
        if (line.has("price") && !price(line.opt("price"))) return false
        if (line.has("packSize") && !packSize(line.opt("packSize"))) return false
        if (line.has("searchQuery") && !searchQuery(line.opt("searchQuery"))) return false
        // La clé n'a qu'une valeur, `true` (absente = au panier)
        if (line.has("notInCart") && line.opt("notInCart") != true) return false
        if (line.has("unavailableIds") && !idList(line.opt("unavailableIds"), if (outcome == "ADDED") MAX_UNAVAILABLE_ADDED else MAX_PRODUCTS)) return false
        if (line.has("rejected")) {
            val rejected = line.opt("rejected") as? JSONArray ?: return false
            if (rejected.length() > MAX_REJECTED) return false
            val seen = mutableSetOf<String>()
            for (rank in 0 until rejected.length()) {
                val one = rejected.opt(rank)
                if (!product(one, withPrice = false) || !seen.add((one as JSONObject).getString("id"))) return false
            }
        }
        return true
    }

    private fun product(value: Any?, withPrice: Boolean): Boolean {
        val own = value as? JSONObject ?: return false
        val keys = mutableSetOf("id", "label", "ean", "content")
        if (withPrice) keys += setOf("price", "rayonId", "familyId", "offerId")
        if (!onlyKeys(own, keys) || !text(own, "id", PRODUCT_ID) || !text(own, "label", null)) return false
        if (own.has("ean") && own.opt("ean") != JSONObject.NULL && !text(own, "ean", EAN)) return false
        if (own.has("content") && !content(own.opt("content"))) return false
        if (own.has("price") && !price(own.opt("price"))) return false
        if (own.has("rayonId") && !int(own, "rayonId", 1, MAX_CATALOG_ID)) return false
        if (own.has("familyId") && !int(own, "familyId", 1, MAX_CATALOG_ID)) return false
        if (own.has("offerId") && !text(own, "offerId", OFFER_ID, MAX_OFFER_ID)) return false
        return true
    }

    private fun content(value: Any?): Boolean {
        val own = value as? JSONObject ?: return false
        val amount = own.opt("value") as? Number ?: return false
        val number = amount.toDouble()
        return onlyKeys(own, setOf("value", "unit")) && number > 0 && number.isFinite() && enumOf(own, "unit", CONTENT_UNITS)
    }

    private fun price(value: Any?): Boolean {
        val own = value as? JSONObject ?: return false
        if (!onlyKeys(own, setOf("cents", "perMeasure")) || !int(own, "cents", 0, MAX_CENTS)) return false
        if (own.has("perMeasure")) {
            val measure = own.opt("perMeasure") as? JSONObject ?: return false
            if (!onlyKeys(measure, setOf("cents", "unit")) || !int(measure, "cents", 0, MAX_CENTS) || !enumOf(measure, "unit", MEASURE_UNITS)) return false
        }
        return true
    }

    private fun packSize(value: Any?): Boolean {
        val own = value as? JSONObject ?: return false
        if (!onlyKeys(own, setOf("value", "unitSlug")) || !text(own, "unitSlug", UNIT_SLUG, MAX_UNIT_SLUG)) return false
        val amount = (own.opt("value") as? Number)?.toDouble() ?: return false
        // De 0,001 à 9 999, trois décimales au plus
        if (!amount.isFinite() || amount < 0.001 || amount > 9999.0) return false
        val scaled = amount * 1000
        return Math.abs(scaled - Math.round(scaled)) < 1e-6
    }

    private fun searchQuery(value: Any?): Boolean {
        val query = value as? String ?: return false
        val length = query.codePointCount(0, query.length)
        return length in MIN_QUERY..MAX_QUERY
    }

    private fun idList(value: Any?, max: Int): Boolean {
        val ids = value as? JSONArray ?: return false
        if (ids.length() > max) return false
        val seen = mutableSetOf<String>()
        for (rank in 0 until ids.length()) {
            val id = ids.opt(rank) as? String ?: return false
            if (!PRODUCT_ID.matches(id) || !seen.add(id)) return false
        }
        return true
    }

    private fun onlyKeys(own: JSONObject, allowed: Set<String>): Boolean = own.keys().asSequence().all { it in allowed }

    /** Une chaîne de 1 à [max] points de code qui suit [pattern] s'il y en a un. */
    private fun text(own: JSONObject, key: String, pattern: Regex?, max: Int = MAX_LABEL): Boolean {
        val value = own.opt(key) as? String ?: return false
        val length = value.codePointCount(0, value.length)
        return length in 1..max && (pattern == null || pattern.matches(value))
    }

    private fun int(own: JSONObject, key: String, min: Long, max: Long): Boolean {
        val value = own.opt(key) as? Number ?: return false
        val number = value.toDouble()
        return number == Math.floor(number) && number in min.toDouble()..max.toDouble()
    }

    private fun enumOf(own: JSONObject, key: String, allowed: Set<String>): Boolean = (own.opt(key) as? String)?.let { it in allowed } == true
}

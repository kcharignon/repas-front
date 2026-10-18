package eu.kantin.repas.drive

import java.util.TreeMap
import org.json.JSONArray
import org.json.JSONObject

/** Une valeur JSON en structures de Kotlin (objets triés par clé) : deux JSON de même contenu sont égaux, quel que soit l'ordre de leurs clés. */
internal fun canonical(value: Any?): Any? = when (value) {
    is JSONObject -> TreeMap<String, Any?>().also { map -> value.keys().forEach { map[it] = canonical(value.get(it)) } }
    is JSONArray -> (0 until value.length()).map { canonical(value.get(it)) }
    JSONObject.NULL -> null
    else -> value
}

internal fun sameJson(expected: JSONObject, actual: JSONObject): Boolean = canonical(expected) == canonical(actual)

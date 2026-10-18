package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/**
 * Le plan d'essai de la variante de débogage (DRV-313) : un plan synthétique du protocole v1 pour essayer, sur un téléphone et sans
 * Repas, la recherche, le choix guidé (phase B) et l'ajout au panier de l'agent.
 *
 * Le plan est le fichier `debug-plan.json` (présent seulement dans l'APK de débogage), que `drive-agent` valide avec les mêmes règles que
 * l'agent ; l'application n'y remplace que l'identifiant du passage et le magasin lu par l'agent dans la page. Quatre ingrédients
 * courants, sans produit mémorisé : l'agent cherche et laisse choisir, chaque ajout se fait avec la confirmation de l'utilisateur.
 */
object DebugPlan {
    const val TEMPLATE_FILE = "debug-plan.json"

    private const val MAX_LINES = 100
    private const val FALLBACK_HOST = "www.leclercdrive.fr"
    private val RUN_ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
    private val STORE_ID = Regex("[0-9]{1,12}")
    private val STORE_HOST = Regex("[a-z0-9-]+\\.leclercdrive\\.fr")

    /**
     * Le message `setup` qui demande à l'agent de lire le magasin de la page. Son champ `store` est obligatoire mais l'agent ne s'en sert
     * pas : il lit celui de la page. `pageHost` est l'hôte de la page courante, ou l'accueil du drive à défaut.
     */
    fun setupMessage(runId: String, pageHost: String?): String {
        val host = pageHost?.takeIf { STORE_HOST.matches(it) } ?: FALLBACK_HOST
        return JSONObject()
            .put("v", 1)
            .put("type", "setup")
            .put("runId", runId)
            .put("retailer", "leclerc")
            .put("store", JSONObject().put("id", "0").put("host", host))
            .put("returnPath", "/drive/retour")
            .toString()
    }

    /**
     * Le plan d'essai pour ce magasin, ou `null` si une valeur n'est pas de la forme du protocole (identifiant, hôte, passage), si le
     * modèle est illisible, ou si le résultat dépasse les bornes du protocole (64 Ko, 100 lignes).
     */
    fun plan(template: String, runId: String, storeId: String, storeHost: String): String? {
        if (!RUN_ID.matches(runId) || !STORE_ID.matches(storeId) || !STORE_HOST.matches(storeHost)) return null
        val text = template
            .replace("__RUN_ID__", runId)
            .replace("__STORE_ID__", storeId)
            .replace("__STORE_HOST__", storeHost)
        return try {
            val json = JSONObject(text)
            if (json.getJSONArray("lines").length() > MAX_LINES) return null
            json.toString().takeIf { BridgeMessages.fitsBound(it) }
        } catch (_: JSONException) {
            null
        }
    }
}

/**
 * L'essai de bout en bout, en deux messages : `setup` (l'agent lit le magasin de la page et demande à l'utilisateur de le confirmer),
 * puis `plan` avec ce magasin. Le résultat final de l'agent est montré dans un écran de texte. Ne dépend d'aucune classe Android :
 * l'envoi, l'affichage, le modèle et l'identifiant viennent de l'extérieur.
 */
class DebugRun(
    private val template: () -> String?,
    private val send: (String) -> Boolean,
    /** Enregistre le plan comme passage en cours (un seul à la fois, écran allumé) et l'envoie à l'agent : le chemin d'un plan de Repas (DRV-314). */
    private val startPass: (String) -> Boolean,
    private val show: (String) -> Unit,
    private val newRunId: () -> String,
) {
    private enum class Step { IDLE, WAITING_STORE, WAITING_RESULT }

    private var step = Step.IDLE

    /** Lance l'essai sur la page courante (`pageHost` : son hôte). `false` si le message n'a pas pu partir vers l'agent. */
    fun start(pageHost: String?): Boolean {
        if (!send(DebugPlan.setupMessage(newRunId(), pageHost))) return false
        step = Step.WAITING_STORE
        return true
    }

    /** Un message de l'agent (`type` et JSON déjà contrôlés par [BridgeMessages.screen]). */
    fun onAgentMessage(type: String, text: String) {
        when {
            type == "setup-result" && step == Step.WAITING_STORE -> sendPlan(text)
            type == "result" || type == "setup-result" -> {
                step = Step.IDLE
                show(ResultReport.render(text))
            }
        }
    }

    private fun sendPlan(setupResult: String) {
        val store = try {
            JSONObject(setupResult).getJSONObject("store")
        } catch (_: JSONException) {
            return finish("Magasin illisible : la réponse de l'agent n'a pas la forme attendue.")
        }
        val plan = template()?.let { DebugPlan.plan(it, newRunId(), store.optString("id"), store.optString("host")) }
            ?: return finish("Plan d'essai impossible : le magasin lu par l'agent n'a pas la forme attendue.")
        if (!startPass(plan)) return finish("L'agent ne répond plus ou un autre envoi est en cours : rouvre une page du drive et recommence.")
        step = Step.WAITING_RESULT
    }

    private fun finish(message: String) {
        step = Step.IDLE
        show(message)
    }
}

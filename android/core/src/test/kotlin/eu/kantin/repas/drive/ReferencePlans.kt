package eu.kantin.repas.drive

import java.io.File
import org.json.JSONObject

/**
 * Les plans de référence du protocole (`plan-complet.json`, `plan-100-lignes.json` : copies exactes des exemples de l'agent, que `native-contract.spec.ts` garde
 * identiques) avec un magasin **de la forme de l'enseigne d'aujourd'hui** : depuis DRV-754 l'hôte d'un plan de Leclerc est un hôte du serveur `fd<N>-courses`, alors
 * que l'exemple du protocole garde un nom de magasin quelconque (`courses-test`, le contrat du back accepte `[a-z0-9-]+`). Le fichier n'est jamais réécrit : seul le
 * nom du magasin l'est, ici.
 */
internal object ReferencePlans {
    /** L'hôte de magasin que les tests de Leclerc donnent à un plan. */
    const val STORE_HOST = "fd9-courses.leclercdrive.fr"

    fun json(name: String = "plan-complet.json"): JSONObject =
        JSONObject(File("src/test/resources/$name").readText()).also { it.getJSONObject("store").put("host", STORE_HOST) }

    fun text(name: String = "plan-complet.json"): String = json(name).toString()
}

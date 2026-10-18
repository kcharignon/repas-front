package eu.kantin.repas.drive

import android.app.Application
import android.content.Context

/**
 * L'application : ce que la coquille Repas ([MainActivity]) et l'écran du drive ([DriveActivity]) partagent pendant que le processus vit.
 */
class RepasApp : Application() {
    /** L'agent embarqué, lu et vérifié une seule fois (empreinte, WebView assez récente). */
    internal val agentLoad: AgentLoad by lazy { AgentHost.load(this, BuildConfig.DEBUG) }

    /**
     * Le passage du plan et les résultats à livrer (DRV-314) : relus au démarrage du processus s'ils ont moins de 24 h. Les deux écrans y
     * lisent et y écrivent ; seule la coquille parle à la page de Repas.
     */
    internal val pass: DrivePass by lazy {
        DrivePass(
            store = PrefsPassStore(this),
            clock = System::currentTimeMillis,
            agentVersion = { agentLoad.script?.version ?: "0.0.0" },
        )
    }
}

/**
 * Le [PassStore] du téléphone : une préférence privée de l'application. Elle ne contient que l'identifiant et le plan du passage non terminé
 * et les résultats pas encore livrés (jamais un cookie ni un identifiant d'enseigne) ; elle est exclue des sauvegardes (`data_extraction_rules.xml`).
 */
internal class PrefsPassStore(context: Context) : PassStore {
    private val prefs = context.getSharedPreferences("drive-pass", Context.MODE_PRIVATE)

    override fun load(): String? = prefs.getString(KEY, null)

    override fun save(value: String?) {
        prefs.edit().apply { if (value == null) remove(KEY) else putString(KEY, value) }.apply()
    }

    private companion object {
        const val KEY = "state"
    }
}

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
     * Les enseignes que cette construction SERT (DRV-707) : celles du registre de la version, et, dans la seule variante de débogage, une enseigne
     * fictive pour les essais de l'émulateur ([TestRetailers]). L'enseigne d'avant reste la même. Le menu et `app.info` ne parlent que de
     * [RetailerSites.DEFAULT], jamais d'une enseigne d'essai.
     */
    internal val sites: RetailerSites by lazy {
        if (TestRetailers.extra.isEmpty()) RetailerSites.DEFAULT else RetailerSites(RetailerSites.DEFAULT.all + TestRetailers.extra, legacy = RetailerSites.DEFAULT.legacy)
    }

    /** Le stockage clé-valeur des mémoires du drive (préférence `drive-store`, exclue des sauvegardes) : les clés sont choisies par le cœur, par enseigne. */
    private val driveStore: KeyValueStore by lazy { PrefsKeyValueStore(this) }

    /**
     * Le passage du plan et les résultats à livrer (DRV-314) : relus au démarrage du processus s'ils ont moins de 24 h. Les deux écrans y
     * lisent et y écrivent ; seule la coquille parle à la page de Repas.
     */
    internal val storePaths: StorePathMemories by lazy { StorePathMemories(sites, driveStore) }

    /** La forme du dernier « Finaliser » de chaque enseigne (DRV-631), montrée dans « Version et mode d'emploi ». */
    internal val finalizeOutcomes: FinalizeOutcomeMemories by lazy { FinalizeOutcomeMemories(sites, driveStore) }

    internal val pass: DrivePass by lazy {
        DrivePass(
            store = PrefsPassStore(this),
            clock = System::currentTimeMillis,
            agentVersion = { agentLoad.script?.version ?: "0.0.0" },
            sites = sites,
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

/**
 * Le [KeyValueStore] du téléphone (DRV-629, DRV-631, DRV-707) : la préférence privée `drive-store` de l'application, exclue des sauvegardes
 * (`data_extraction_rules.xml`). Elle ne contient que, par enseigne, le chemin du magasin avec sa ville (`path.<enseigne>`) et un mot, la forme du
 * dernier « Finaliser » (`finalize.<enseigne>`) : jamais un cookie, un identifiant de compte, une adresse complète ni un numéro de magasin seul. Les
 * clés d'avant le multi-enseignes (`path`, `finalize`) sont relues par le cœur comme celles de l'enseigne d'avant, puis déplacées à la première
 * écriture ([RetailerValue]). Effacée avec les données du drive de l'enseigne.
 */
internal class PrefsKeyValueStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("drive-store", Context.MODE_PRIVATE)

    override fun load(key: String): String? = prefs.getString(key, null)

    override fun save(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

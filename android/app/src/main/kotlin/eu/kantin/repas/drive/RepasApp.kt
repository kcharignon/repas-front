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
     * Les enseignes que cette construction ANNONCE à Repas (`app.info`) et PROPOSE dans son menu (DRV-707, DRV-728) : celles de la version publiée
     * ([RetailerSites.DEFAULT] : Leclerc et Auchan), plus celles que son drapeau de construction allume (`BuildConfig.EXTRA_RETAILERS`, [RetailerSites.serving]).
     * La construction de publication a toujours un drapeau vide : sans menu ni annonce d'une enseigne éteinte. Annoncer une enseigne ne la fait pas proposer à
     * l'utilisateur : Repas ne la propose que si le back l'allume (`DRIVE_RETAILERS`). Jamais une enseigne d'essai.
     */
    internal val announced: RetailerSites by lazy { RetailerSites.serving(BuildConfig.EXTRA_RETAILERS) }

    /**
     * Les enseignes que cette construction SERT (DRV-707) : les enseignes annoncées ([announced]) et, dans la seule variante de débogage, une enseigne
     * fictive pour les essais de l'émulateur ([TestRetailers]). L'enseigne d'avant reste la même. Les règles d'origine du pont, les écrans et les
     * mémoires ne connaissent que ces enseignes.
     */
    internal val sites: RetailerSites by lazy {
        if (TestRetailers.extra.isEmpty()) announced else RetailerSites(announced.all + TestRetailers.extra, legacy = announced.legacy)
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

    /**
     * La migration unique vers la version mobile de l'enseigne d'avant (DRV-757) : ses cookies et son stockage de site sont effacés une fois, dans SON profil de WebView
     * seulement (ni Repas, ni une autre enseigne). Sans profils de WebView l'effacement toucherait Repas : rien n'est fait, elle sera retentée.
     */
    internal val siteModeMigration: SiteModeMigration by lazy {
        SiteModeMigration(sites, driveStore) { site ->
            if (!DriveProfile.isolated) return@SiteModeMigration false
            DriveProfile.clear(null, site, sites)
            storePaths.forget(site)
            finalizeOutcomes.forget(site)
            true
        }
    }

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

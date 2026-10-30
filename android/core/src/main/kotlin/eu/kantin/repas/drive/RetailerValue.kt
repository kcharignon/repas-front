package eu.kantin.repas.drive

/**
 * Le stockage clé-valeur privé du téléphone (une préférence de l'application, exclue des sauvegardes) : le cœur choisit les clés, l'application les range.
 * Une valeur absente se lit `null` ; écrire `null` efface la clé.
 */
interface KeyValueStore {
    fun load(key: String): String?
    fun save(key: String, value: String?)
}

/**
 * Une valeur texte d'**une enseigne** sur un [KeyValueStore] : la clé est `<nom>.<identifiant de l'enseigne>`, de sorte qu'une enseigne ne lit ni
 * n'écrit jamais celle d'une autre.
 *
 * **Migration sans perte.** Avant le multi-enseignes, la valeur était gardée sous la seule clé `<nom>` (le chemin du magasin `path`, la forme du dernier
 * « Finaliser » `finalize`) : c'est celle de l'enseigne d'avant ([RetailerSites.legacy]). Cette enseigne la relit tant que sa propre clé est vide,
 * puis la déplace sous sa clé à la première écriture (la clé d'avant est effacée en même temps, pour qu'un oubli ne la fasse pas renaître). Les autres
 * enseignes ne lisent jamais la clé d'avant.
 */
class RetailerValue private constructor(
    private val keyValues: KeyValueStore,
    private val key: String,
    private val oldKey: String?,
) : StorePathStore, FinalizeOutcomeStore {
    override fun load(): String? = keyValues.load(key) ?: oldKey?.let { keyValues.load(it) }

    override fun save(value: String?) {
        keyValues.save(key, value)
        if (oldKey != null) keyValues.save(oldKey, null)
    }

    companion object {
        /** La valeur de [site] sous le nom [name] ; la clé d'avant le multi-enseignes n'est relue que par l'enseigne d'avant de [sites]. */
        fun of(keyValues: KeyValueStore, name: String, site: RetailerSite, sites: RetailerSites): RetailerValue =
            RetailerValue(keyValues, "$name.${site.id}", if (site === sites.legacy) name else null)
    }
}

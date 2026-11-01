package eu.kantin.repas.drive

/** Où va le chemin du magasin retenu d'UNE enseigne : une seule valeur texte, gardée par le téléphone. */
interface StorePathStore {
    fun load(): String?
    fun save(value: String?)
}

/**
 * Le chemin d'un magasin AVEC sa ville, tel que la dernière page de magasin vue dans le drive l'a donné (DRV-629) : `https://<hôte>/magasin-N-N-Ville`
 * (pour Leclerc, la page de la version mobile `m-courses`, DRV-754).
 *
 * Pourquoi : l'accueil du magasin qui charge toujours est `<chemin du magasin avec la ville>` (constat du 2026-10-19), et la ville ne se lit que dans une
 * page du magasin. Le front ne connaît le magasin que par ses numéros (`/magasin-N-N`) ; « Finaliser » est donc un lien
 * `https://<hôte>/magasin-N-N` que la coquille complète ici ([DriveEntry.resolve]) avec la ville retenue, SI elle est du même hôte (ou d'un autre hôte de
 * l'enseigne quand elle le dit, [StorePages.sameStoreOnAnyHost]) et des mêmes numéros (DRV-631 : l'accueil du magasin, jamais la page du panier). Jamais une adresse tirée du message du plan ni d'un texte de page : seule une
 * adresse que la WebView a vraiment chargée, de forme vérifiée, est retenue.
 *
 * Elle est celle d'**une enseigne** ([site]) : elle ne retient que les pages de magasin de cette enseigne. [StorePathMemories] en tient une par enseigne.
 * Gardée dans une préférence privée de l'application (exclue des sauvegardes), jamais journalisée, effacée avec les données du drive.
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
class StorePathMemory(private val store: StorePathStore, val site: RetailerSite = RetailerSites.DEFAULT.legacy) {
    /** Un chemin de magasin avec sa ville : l'hôte, les deux numéros et le segment `/magasin-N-N-Ville`. */
    data class Entry(val host: String, val first: String, val second: String, val segment: String) {
        val value: String get() = "https://$host$segment"
    }

    /** Retient le chemin de magasin de cette page, si c'est une page de magasin de l'enseigne avec la ville ; sinon ne change rien. */
    fun remember(url: String?) {
        val entry = parse(url, site) ?: return
        if (entry.value != store.load()) store.save(entry.value)
    }

    /**
     * L'accueil du magasin [first]-[second] de l'hôte [host] (avec la ville), si le chemin retenu est celui de ce magasin ; sinon `null`.
     *
     * Même hôte exigé, sauf pour une enseigne dont deux hôtes servent le même magasin ([StorePages.sameStoreOnAnyHost], Leclerc depuis DRV-754) : le lien
     * du front porte l'hôte du serveur du plan (`fd<N>-courses`), la page retenue est celle où l'on navigue (`m-courses`). Alors seuls les NUMÉROS comptent,
     * et [host] doit avoir la forme d'un hôte de magasin de l'enseigne ([RetailerSite.isStoreHost] : minuscules, pont présent) ; ce qui s'ouvre reste la page retenue (vue dans la WebView, de forme vérifiée), jamais
     * une adresse construite avec [host].
     */
    fun storeHomeUrl(host: String, first: String, second: String): String? {
        val entry = parse(store.load(), site) ?: return null
        if (entry.first != first || entry.second != second) return null
        if (entry.host != host && !(site.storePages?.sameStoreOnAnyHost == true && site.isStoreHost(host))) return null
        return entry.value
    }

    /** Un chemin de magasin est-il retenu (de n'importe quel magasin de l'enseigne) ? */
    fun hasPath(): Boolean = parse(store.load(), site) != null

    /** Oublie le chemin (déconnexion du drive). */
    fun forget() = store.save(null)

    companion object {
        /** Le chemin de magasin avec ville d'une page de [site] (`https`, hôte de l'enseigne hors site mobile), ou `null`. */
        fun parse(url: String?, site: RetailerSite = RetailerSites.DEFAULT.legacy): Entry? {
            val pages = site.storePages ?: return null
            if (!site.isStorePage(url)) return null
            val host = NavigationPolicy.httpsHostOf(url) ?: return null
            val afterScheme = url!!.substring("https://".length)
            val path = afterScheme.substring(afterScheme.indexOf('/')).substringBefore('?').substringBefore('#')
            val segment = "/" + path.removePrefix("/").substringBefore('/')
            val match = pages.homeSegment.matchEntire(segment) ?: return null
            return Entry(host, match.groupValues[1], match.groupValues[2], segment)
        }
    }
}

/**
 * Les mémoires du chemin du magasin de toutes les enseignes d'un registre : **une par enseigne**, chacune sous sa clé (`path.<identifiant>`, voir
 * [RetailerValue]). Ce que l'une retient, une autre ne le lit jamais. [forget] les efface toutes.
 */
class StorePathMemories(val sites: RetailerSites, keyValues: KeyValueStore) {
    private val byId: Map<String, StorePathMemory> =
        sites.all.associate { it.id to StorePathMemory(RetailerValue.of(keyValues, KEY, it, sites), it) }

    /** La mémoire de [site], qui doit être au registre. */
    fun of(site: RetailerSite): StorePathMemory = byId[site.id] ?: throw IllegalArgumentException("Enseigne inconnue : ${site.id}")

    /** Retient le chemin de magasin de cette page dans la mémoire de **son** enseigne ; une page d'aucune enseigne ne change rien. */
    fun remember(url: String?) {
        val site = sites.forNavigation(url) ?: return
        of(site).remember(url)
    }

    /** Oublie le chemin d'une enseigne (déconnexion de son drive). */
    fun forget(site: RetailerSite) = of(site).forget()

    /** Oublie le chemin de toutes les enseignes. */
    fun forget() = byId.values.forEach { it.forget() }

    companion object {
        /** Le nom de la clé : `path` avant le multi-enseignes (la valeur d'alors est celle de [RetailerSites.legacy]), `path.<identifiant>` ensuite. */
        const val KEY = "path"
    }
}

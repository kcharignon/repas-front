package eu.kantin.repas.drive

/** Où va le chemin du magasin retenu : une seule valeur texte, gardée par le téléphone. */
interface StorePathStore {
    fun load(): String?
    fun save(value: String?)
}

/**
 * Le chemin d'un magasin AVEC sa ville, tel que la dernière page de magasin vue dans le drive l'a donné (DRV-629) : `https://<hôte>/magasin-N-N-Ville`.
 *
 * Pourquoi : l'accueil du magasin qui charge toujours est `<chemin du magasin avec la ville>` (constat du 2026-10-19), et la ville ne se lit que dans une
 * page du magasin. Le front ne connaît le magasin que par ses numéros (`/magasin-N-N`) ; « Finaliser sur Leclerc » est donc un lien
 * `https://<hôte>/magasin-N-N` que la coquille complète ici ([DriveEntry.resolve]) avec la ville retenue, SI elle est du même hôte et des mêmes
 * numéros (DRV-631 : l'accueil du magasin, jamais la page du panier). Jamais une adresse tirée du message du plan ni d'un texte de page : seule une
 * adresse que la WebView a vraiment chargée, de forme vérifiée, est retenue.
 *
 * Gardée dans une préférence privée de l'application (exclue des sauvegardes), jamais journalisée, effacée avec les données du drive.
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
class StorePathMemory(private val store: StorePathStore) {
    /** Un chemin de magasin avec sa ville : l'hôte, les deux numéros et le segment `/magasin-N-N-Ville`. */
    data class Entry(val host: String, val first: String, val second: String, val segment: String) {
        val value: String get() = "https://$host$segment"
    }

    /** Retient le chemin de magasin de cette page, si c'est une page de magasin avec la ville ; sinon ne change rien. */
    fun remember(url: String?) {
        val entry = parse(url) ?: return
        if (entry.value != store.load()) store.save(entry.value)
    }

    /** L'accueil du magasin [first]-[second] de l'hôte [host] (avec la ville), si le chemin retenu est celui de ce magasin ; sinon `null`. */
    fun storeHomeUrl(host: String, first: String, second: String): String? {
        val entry = parse(store.load()) ?: return null
        if (entry.host != host || entry.first != first || entry.second != second) return null
        return entry.value
    }

    /** Un chemin de magasin est-il retenu (de n'importe quel magasin) ? */
    fun hasPath(): Boolean = parse(store.load()) != null

    /** Oublie le chemin (déconnexion du drive). */
    fun forget() = store.save(null)

    companion object {
        /** `/magasin-N-N-Ville` : la ville est un segment non vide, sans caractère de contrôle, espace, barre oblique inverse ni guillemet. */
        private val SEGMENT = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})-[^/?#\\s\\\\<>\"'\\u0000-\\u001f]+$")

        /** Le chemin de magasin avec ville d'une page du drive (`https`, hôte `*.leclercdrive.fr` hors site mobile), ou `null`. */
        fun parse(url: String?): Entry? {
            if (!NavigationPolicy.isStorePage(url)) return null
            val host = NavigationPolicy.httpsHostOf(url) ?: return null
            val afterScheme = url!!.substring("https://".length)
            val path = afterScheme.substring(afterScheme.indexOf('/')).substringBefore('?').substringBefore('#')
            val segment = "/" + path.removePrefix("/").substringBefore('/')
            val match = SEGMENT.matchEntire(segment) ?: return null
            return Entry(host, match.groupValues[1], match.groupValues[2], segment)
        }
    }
}

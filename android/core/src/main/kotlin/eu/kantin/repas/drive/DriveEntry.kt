package eu.kantin.repas.drive

import java.text.Normalizer
import java.util.Locale

/**
 * Ouvrir le drive DANS l'application, sans plan (DRV-625, DRV-629, DRV-631) : « Finaliser » du récapitulatif de Repas est un lien vers le drive de
 * l'enseigne. Il ne s'ouvre pas dans le navigateur du téléphone, où l'utilisateur n'est pas connecté à l'enseigne (sa connexion est dans le profil
 * « drive » de l'application) : la coquille le confie à [DriveActivity].
 *
 * **L'enseigne est celle de l'hôte du lien** ([RetailerSites.forNavigation]) : le chemin retenu qui complète un lien est celui de cette enseigne
 * (jamais celui d'une autre), et le repli est l'accueil de cette enseigne.
 *
 * Où il s'ouvre :
 * - le lien du front est `https://<hôte>/magasin-N-N` (le magasin enregistré dans Repas, sans ville, [StorePages.frontLink]) : il ne dit que QUEL magasin. La
 *   page qui s'ouvre est l'accueil du magasin AVEC la ville (`/magasin-N-N-Ville`), que la dernière page de magasin vue dans le drive a donnée
 *   ([StorePathMemory]) : elle charge toujours. Le panier est dans l'icône en haut à droite de cette page (bandeau court de l'écran du drive).
 *   Si ce chemin est inconnu, d'un autre hôte ou d'autres numéros : l'accueil de l'enseigne. Jamais une adresse tirée du plan ni d'une page ;
 * - l'application ne navigue **jamais** vers la page du panier du site : ouverte sans passer par le site, elle la répond « introuvable » (constat
 *   du 2026-10-19 sur un téléphone, application 0.1.8) ;
 * - toute autre page du drive (accueil, page de magasin, site mobile, forme douteuse) est remplacée par l'accueil de l'enseigne. Une adresse qui n'est
 *   d'aucune enseigne n'est pas concernée (la coquille la confie au navigateur, comme avant).
 *
 * Si le site refuse l'accueil du magasin (4xx, 5xx) ou le sert avec un titre « introuvable », l'écran du drive se replie sur l'accueil du drive
 * ([fallsBack], [isNotFoundTitle]).
 *
 * Les fonctions sans enseigne ([resolve] avec une seule mémoire, [startPage], [isStoreHome]…) sont celles de l'enseigne d'avant le multi-enseignes
 * ([RetailerSites.legacy]). Kotlin pur, pour se tester sans téléphone.
 */
object DriveEntry {
    /**
     * Où ouvrir le drive ([page]) et comment s'en souvenir : [outcome] est la forme de ce « Finaliser » ([FinalizeOutcome]), `null` si le lien est
     * l'accueil du drive lui-même (une entrée du drive qui n'est pas « Finaliser » : pas de bandeau, rien à retenir).
     */
    data class Entry(val page: String, val outcome: FinalizeOutcome?)

    /**
     * L'entrée pour ce lien de la page de Repas, ou `null` si ce n'est pas un lien du drive. L'accueil du magasin avec la ville retenue par
     * [memory] pour le lien du magasin du front, sinon l'accueil du drive. [memory] est celle d'UNE enseigne ([StorePathMemory.site]) : un lien d'une
     * autre enseigne n'en profite pas.
     */
    fun resolve(url: String?, memory: StorePathMemory? = null): Entry? =
        resolveIn(RetailerSites.DEFAULT, url) { site -> memory?.takeIf { it.site === site } }

    /** L'entrée pour ce lien, avec la mémoire de l'enseigne de son hôte ([StorePathMemories.of]). */
    fun resolve(url: String?, memories: StorePathMemories): Entry? = resolveIn(memories.sites, url) { memories.of(it) }

    private fun resolveIn(sites: RetailerSites, url: String?, memoryOf: (RetailerSite) -> StorePathMemory?): Entry? {
        val site = sites.forNavigation(url) ?: return null
        if (url == site.startUrl) return Entry(site.startUrl, null)
        val link = parseLink(site, url!!) ?: return Entry(site.startUrl, FinalizeOutcome.ADRESSE_REFUSEE)
        val memory = memoryOf(site)
        val home = memory?.storeHomeUrl(link.host, link.first, link.second)
            ?: return Entry(site.startUrl, if (memory?.hasPath() == true) FinalizeOutcome.ADRESSE_REFUSEE else FinalizeOutcome.CHEMIN_INCONNU)
        return Entry(home, FinalizeOutcome.OUVERTE)
    }

    /** La page où ouvrir le drive pour ce lien, ou `null` si ce n'est pas un lien du drive. */
    fun target(url: String?, memory: StorePathMemory? = null): String? = resolve(url, memory)?.page

    /**
     * La page d'ouverture demandée à l'écran du drive de [site], revérifiée : l'accueil, ou l'accueil d'un magasin de cette enseigne (avec la ville) ;
     * sinon l'accueil de l'enseigne.
     */
    fun startPage(url: String?, site: RetailerSite = RetailerSites.DEFAULT.legacy): String =
        if (isStoreHome(url, site)) url!! else site.startUrl

    /** Vrai pour l'accueil d'un magasin de [site], avec la ville dans le chemin : `https://<hôte>/magasin-N-N-Ville` (une barre finale, une requête ou un fragment passent). */
    fun isStoreHome(url: String?, site: RetailerSite = RetailerSites.DEFAULT.legacy): Boolean {
        val entry = StorePathMemory.parse(url, site) ?: return false
        val rest = url!!.substring(entry.value.length)
        return rest.isEmpty() || rest == "/" || rest[0] == '?' || rest[0] == '#' || rest.startsWith("/?") || rest.startsWith("/#")
    }

    /**
     * La page où se trouve l'utilisateur est-elle encore celle de l'arrivée de « Finaliser » : l'accueil de [site] ou l'accueil d'un de ses magasins ?
     * Quand elle ne l'est plus, il a navigué : le bandeau disparaît.
     */
    fun isArrivalPage(url: String?, site: RetailerSite = RetailerSites.DEFAULT.legacy): Boolean = isStoreHome(url, site) || site.isHomePage(url)

    /**
     * Faut-il se replier sur l'accueil du drive ? Vrai quand l'accueil du magasin demandé ([armed]) est refusé par le site : même adresse, code 4xx
     * ou 5xx. Sauf 403 et 429 : c'est le plus souvent le défi de l'anti-robot, que l'utilisateur doit pouvoir passer (le même défi attendrait sur l'accueil).
     */
    fun fallsBack(armed: String?, requested: String?, status: Int): Boolean =
        armed != null && requested == armed && status >= 400 && status != 403 && status != 429

    /**
     * Le titre de la page est-il celui d'une page « introuvable » du site ? Il la sert parfois avec un statut 200 : le code HTTP ne
     * la trahit pas. Seul le TITRE est lu (jamais le contenu de la page), sans accent ni majuscule.
     */
    fun isNotFoundTitle(title: String?): Boolean {
        if (title.isNullOrBlank()) return false
        val plain = Normalizer.normalize(title, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase(Locale.ROOT)
        return NOT_FOUND_WORDS.any { plain.contains(it) } || Regex("(^|\\D)404(\\D|$)").containsMatchIn(plain)
    }

    private val NOT_FOUND_WORDS = listOf("introuvable", "pas pu etre trouvee", "non trouvee", "not found")

    private class Link(val host: String, val first: String, val second: String)

    private fun parseLink(site: RetailerSite, url: String): Link? {
        val pages = site.storePages ?: return null
        if (site.isMobileSite(url)) return null
        val host = NavigationPolicy.httpsHostOf(url) ?: return null
        val afterScheme = url.substring("https://".length)
        val slash = afterScheme.indexOf('/')
        if (slash < 0) return null
        val found = pages.frontLink.matchEntire(afterScheme.substring(slash)) ?: return null
        return Link(host, found.groupValues[1], found.groupValues[2])
    }
}

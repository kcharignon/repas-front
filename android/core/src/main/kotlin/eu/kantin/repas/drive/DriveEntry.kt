package eu.kantin.repas.drive

import java.text.Normalizer
import java.util.Locale

/**
 * Ouvrir le drive DANS l'application, sans plan (DRV-625, DRV-629, DRV-631) : « Finaliser sur Leclerc » du récapitulatif de Repas est un lien vers
 * le drive. Il ne s'ouvre pas dans le navigateur du téléphone, où l'utilisateur n'est pas connecté à Leclerc (sa connexion est dans le profil
 * « drive » de l'application) : la coquille le confie à [DriveActivity].
 *
 * Où il s'ouvre :
 * - le lien du front est `https://<hôte>/magasin-N-N` (le magasin enregistré dans Repas, sans ville) : il ne dit que QUEL magasin. La page qui
 *   s'ouvre est l'accueil du magasin AVEC la ville (`/magasin-N-N-Ville`), que la dernière page de magasin vue dans le drive a donnée
 *   ([StorePathMemory]) : elle charge toujours. Le panier est dans l'icône en haut à droite de cette page (bandeau court de l'écran du drive).
 *   Si ce chemin est inconnu, d'un autre hôte ou d'autres numéros : l'accueil du drive ([NavigationPolicy.START_URL]). Jamais une adresse tirée du
 *   plan ni d'une page ;
 * - l'application ne navigue **jamais** vers la page du panier de Leclerc : ouverte sans passer par le site, il la répond « introuvable » (constat
 *   du 2026-10-19 sur un téléphone, application 0.1.8) ;
 * - toute autre page du drive (accueil, page de magasin, site mobile, forme douteuse) est remplacée par l'accueil du drive. Une adresse qui n'est
 *   pas du drive n'est pas concernée (la coquille la confie au navigateur, comme avant).
 *
 * Si le site refuse l'accueil du magasin (4xx, 5xx) ou le sert avec un titre « introuvable », l'écran du drive se replie sur l'accueil du drive
 * ([fallsBack], [isNotFoundTitle]).
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
object DriveEntry {
    /** Le lien du front : `/magasin-N-N`, sans ville, sans paramètre ni fragment. */
    private val STORE_LINK = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})$")

    /**
     * Où ouvrir le drive ([page]) et comment s'en souvenir : [outcome] est la forme de ce « Finaliser » ([FinalizeOutcome]), `null` si le lien est
     * l'accueil du drive lui-même (une entrée du drive qui n'est pas « Finaliser » : pas de bandeau, rien à retenir).
     */
    data class Entry(val page: String, val outcome: FinalizeOutcome?)

    /**
     * L'entrée pour ce lien de la page de Repas, ou `null` si ce n'est pas un lien du drive. L'accueil du magasin avec la ville retenue par
     * [memory] pour le lien du magasin du front, sinon l'accueil du drive.
     */
    fun resolve(url: String?, memory: StorePathMemory? = null): Entry? {
        if (!NavigationPolicy.isAllowed(url)) return null
        if (url == NavigationPolicy.START_URL) return Entry(url, null)
        val link = parseLink(url!!) ?: return Entry(NavigationPolicy.START_URL, FinalizeOutcome.ADRESSE_REFUSEE)
        val home = memory?.storeHomeUrl(link.host, link.first, link.second)
            ?: return Entry(NavigationPolicy.START_URL, if (memory?.hasPath() == true) FinalizeOutcome.ADRESSE_REFUSEE else FinalizeOutcome.CHEMIN_INCONNU)
        return Entry(home, FinalizeOutcome.OUVERTE)
    }

    /** La page où ouvrir le drive pour ce lien, ou `null` si ce n'est pas un lien du drive. */
    fun target(url: String?, memory: StorePathMemory? = null): String? = resolve(url, memory)?.page

    /** La page d'ouverture demandée à l'écran du drive, revérifiée : l'accueil, ou l'accueil d'un magasin (avec la ville) ; sinon l'accueil. */
    fun startPage(url: String?): String =
        if (isStoreHome(url)) url!! else NavigationPolicy.START_URL

    /** Vrai pour l'accueil d'un magasin, avec la ville dans le chemin : `https://<hôte>/magasin-N-N-Ville` (une barre finale, une requête ou un fragment passent). */
    fun isStoreHome(url: String?): Boolean {
        val entry = StorePathMemory.parse(url) ?: return false
        val rest = url!!.substring(entry.value.length)
        return rest.isEmpty() || rest == "/" || rest[0] == '?' || rest[0] == '#' || rest.startsWith("/?") || rest.startsWith("/#")
    }

    /**
     * La page où se trouve l'utilisateur est-elle encore celle de l'arrivée de « Finaliser » : l'accueil du drive ou l'accueil d'un magasin ? Quand
     * elle ne l'est plus, il a navigué : le bandeau disparaît.
     */
    fun isArrivalPage(url: String?): Boolean = isStoreHome(url) || NavigationPolicy.isHomePage(url)

    /**
     * Faut-il se replier sur l'accueil du drive ? Vrai quand l'accueil du magasin demandé ([armed]) est refusé par le site : même adresse, code 4xx
     * ou 5xx. Sauf 403 et 429 : c'est le plus souvent le défi de l'anti-robot, que l'utilisateur doit pouvoir passer (le même défi attendrait sur l'accueil).
     */
    fun fallsBack(armed: String?, requested: String?, status: Int): Boolean =
        armed != null && requested == armed && status >= 400 && status != 403 && status != 429

    /**
     * Le titre de la page est-il celui d'une page « introuvable » de Leclerc ? Leclerc sert parfois cette page avec un statut 200 : le code HTTP ne
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

    private fun parseLink(url: String): Link? {
        if (NavigationPolicy.isMobileSite(url)) return null
        val host = NavigationPolicy.httpsHostOf(url) ?: return null
        val afterScheme = url.substring("https://".length)
        val slash = afterScheme.indexOf('/')
        if (slash < 0) return null
        val found = STORE_LINK.matchEntire(afterScheme.substring(slash)) ?: return null
        return Link(host, found.groupValues[1], found.groupValues[2])
    }
}

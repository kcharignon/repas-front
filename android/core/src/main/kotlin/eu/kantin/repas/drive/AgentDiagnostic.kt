package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/**
 * La boîte de diagnostic de l'écran du drive (DRV-759). Le diagnostic de l'agent vit dans la page, qu'une WebView ne laisse pas lire (ni `uiautomator`, ni le support) : une boîte
 * NATIVE dit ce que l'application sait et ce que l'agent lui rapporte. Rien d'identifiant : la CATÉGORIE de la page (le genre d'hôte et de chemin, jamais l'adresse entière, un
 * numéro de magasin, une ville, une requête), le nombre d'annonces de l'agent, le genre de passage, le bandeau, et les deux lignes que l'agent envoie (« Session », « Fenêtre au
 * premier plan » : des formes, jamais une valeur de champ). Kotlin pur, pour se tester sans téléphone.
 */
object AgentDiagnostic {
    /** Au plus ce nombre de lignes de l'agent, de cette longueur : un message de page est une entrée non fiable (la page partage le monde JavaScript de l'agent). */
    const val MAX_LINES = 4
    const val MAX_LINE = 400

    private val NUMBERS = Regex("[0-9]+")
    private val STORE_SEGMENT = Regex("^magasin-[0-9]+-[0-9]+(-[^/]*)?$", RegexOption.IGNORE_CASE)
    private val PAGE_SEGMENT = Regex("^[a-z]+(-[a-z]+)*\\.aspx$", RegexOption.IGNORE_CASE)

    /**
     * Le genre de la page : l'hôte (son premier nom, numéros masqués : `fd<N>-espace-client`) avec ou sans agent, et le chemin réduit à des formes : un segment de magasin
     * devient `magasin-<N>-<N>[-<ville>]`, un nom de page de l'enseigne (`authentification.aspx`) reste, tout autre segment est `<x>`. Une page hors du drive n'est pas décrite.
     */
    fun pageCategory(site: RetailerSite, url: String?): String {
        if (url == null) return "aucune page"
        val host = NavigationPolicy.httpsHostOf(url)
        if (host == null || !site.isNavigable(url)) return "page hors du drive"
        val agent = if (site.isBridgePage(url)) "avec agent" else "sans agent"
        val rest = url.substring("https://".length).let { it.substring(it.indexOf('/').takeIf { at -> at >= 0 } ?: it.length) }
        val path = rest.substringBefore('?').substringBefore('#')
        val query = if ('?' in rest.substringBefore('#')) "avec requête" else "sans requête"
        val shape = path.split('/').filter { it.isNotEmpty() }.joinToString("/", prefix = "/") { segment ->
            when {
                STORE_SEGMENT.matches(segment) -> "magasin-<N>-<N>" + if (segment.count { it == '-' } > 2) "-<ville>" else ""
                PAGE_SEGMENT.matches(segment) -> segment.lowercase()
                segment == "drive" -> segment
                else -> "<x>"
            }
        }
        return "hôte ${host.substringBefore('.').replace(NUMBERS, "<N>")} $agent ; chemin $shape, $query"
    }

    /** Les lignes de l'agent d'un message `log` : du texte seul, nettoyé (caractères de contrôle en espaces), borné ; illisible ou d'une autre forme : rien. */
    fun agentLines(text: String): List<String> {
        val json = try {
            JSONObject(text)
        } catch (_: JSONException) {
            return emptyList()
        }
        val array = json.optJSONArray("lines") ?: return emptyList()
        val lines = ArrayList<String>()
        for (index in 0 until minOf(array.length(), MAX_LINES)) {
            val line = array.opt(index) as? String ?: return emptyList()
            lines += line.replace(Regex("[\\p{Cntrl}\\p{Cf}]+"), " ").trim().take(MAX_LINE)
        }
        return lines
    }

    /** Les lignes de la boîte : ce que l'application sait, puis ce que l'agent a dit (ou la phrase qui dit qu'il n'a rien dit). */
    fun report(page: String, agentHellos: Int, pagesStarted: Int, pass: String, banner: String, agentLines: List<String>): List<String> =
        listOf(
            "Page : $page",
            "Agent annoncé : $agentHellos fois, pages chargées : $pagesStarted",
            "Passage : $pass",
            "Bandeau : $banner",
        ) + agentLines.ifEmpty { listOf("Agent : aucune ligne reçue (absent de cette page, ou trop ancien)") }
}

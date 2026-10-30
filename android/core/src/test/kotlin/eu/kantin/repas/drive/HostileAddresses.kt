package eu.kantin.repas.drive

/**
 * Les familles d'adresses hostiles que la navigation et le pont refusent (celles de `NavigationPolicyTest`), écrites pour un nom de site donné. Une seule
 * table pour toutes les enseignes : fictives ([RetailerIsolationTest]) comme réelles ([AuchanSiteTest]). Aucune de ces adresses n'est ouverte.
 */
internal object HostileAddresses {
    /** Les lettres latines qui ont un double cyrillique (invisible à l'œil). */
    private val HOMOGLYPHS = mapOf('a' to 'а', 'c' to 'с', 'e' to 'е', 'o' to 'о', 'p' to 'р', 'x' to 'х', 'y' to 'у', 'i' to 'і')

    /** [domain] dont la première lettre qui a un double cyrillique est remplacée par lui ; toujours différent de [domain] (un nom sans une telle lettre n'est pas passé ici). */
    private fun withHomoglyph(domain: String): String {
        val index = domain.indexOfFirst { it in HOMOGLYPHS }
        require(index >= 0) { "Aucune lettre à remplacer dans $domain" }
        return domain.replaceRange(index, index + 1, HOMOGLYPHS.getValue(domain[index]).toString())
    }

    /** Des adresses qui ressemblent à [domain] (un nom de site ou un domaine) sans être une page de ce site. */
    fun of(domain: String): List<String> {
        val prefix = domain.substringBefore('.')
        val suffix = domain.substringAfter('.')
        return listOf(
            // un autre domaine qui contient le nôtre
            "https://$domain.evil.test/",
            "https://www.$domain.evil.test/",
            "https://evil$domain/",
            "https://www.$domain-evil.test/",
            "https://$prefix$suffix/",
            "https://${prefix}X$suffix/",
            "https://www.${prefix}X$suffix/",
            "https://evil.test/$domain",
            "https://evil.test/?u=https://www.$domain/",
            "https://evil.test#.$domain",
            "https://evil.test?.$domain",
            // les astuces d'écriture
            "https://www.$domain@evil.test/",
            "https://user:pass@www.$domain/",
            "https://evil.test\\@www.$domain/",
            "https://evil.test\\.$domain/",
            "https://www.$domain\\.evil.test/",
            "https://www.$domain./",
            "https://.$domain/",
            "https://..$domain/",
            "https://-.$domain/",
            "https://a-.$domain/",
            "https://www.$domain:8443/",
            "https://www.$domain:/",
            "https://www.$domain:443x/",
            "https://[::1]/",
            "https://www.$domain /",
            "https://www.$domain\n.evil.test/",
            "https://www.$domain\t/",
            "https://www.${withHomoglyph(domain)}/",
            "https://www.$domain%2f@evil.test/",
            "https://www.$domain‮/",
            "https:///www.$domain/",
            "https://",
            "https:/www.$domain/",
            // un autre schéma
            "http://www.$domain/",
            "ftp://www.$domain/",
            "file:///www.$domain/",
            "javascript:alert('www.$domain')",
            "data:text/html,https://www.$domain/",
            "intent://www.$domain/#Intent;scheme=https;end",
            "about:blank",
            "//www.$domain/",
            "www.$domain",
            "",
        )
    }
}

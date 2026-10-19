package eu.kantin.repas.drive

/**
 * Le service de plateforme « ouvrir une page web hors de l'application », dans le navigateur du système (AUTH-015, décision D5 de l'ADR 0024).
 * Les règles qui décident **quelle** adresse sort de l'application sont dans le cœur ([NavigationPolicy], [ShellNavigation] :
 * [Decision.OPEN_EXTERNALLY]) ; ouvrir le navigateur est ce que chaque plateforme fait à sa manière.
 */
interface LinkOpener {
    /**
     * Ouvre [url] (une adresse `http` ou `https` que la règle de navigation a déjà jugée) dans le navigateur du système. Rend `false` si rien
     * ne peut l'ouvrir ; la plateforme l'a alors dit à l'utilisateur, l'appelant n'a rien à ajouter.
     */
    fun open(url: String): Boolean
}

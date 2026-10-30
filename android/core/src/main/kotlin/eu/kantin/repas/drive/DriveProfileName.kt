package eu.kantin.repas.drive

/**
 * Le nom du profil de WebView d'une enseigne (DRV-707, décision D-M6 de l'ADR 0027 du back) : **un profil par enseigne**, pour que se déconnecter d'une
 * enseigne n'efface ni les cookies ni le stockage d'une autre.
 *
 * L'enseigne d'avant le multi-enseignes ([RetailerSites.legacy]) garde le nom `drive`, celui que les installations existantes ont déjà : le renommer
 * déconnecterait tout le monde. Les autres enseignes ont `drive-<identifiant>` (minuscules et chiffres : un nom valide pour la WebView). Les noms sont
 * distincts d'une enseigne à l'autre tant que les identifiants le sont, et aucun n'est le profil par défaut, celui de Repas.
 *
 * Kotlin pur, pour se tester sans téléphone ; [DriveProfile] (l'application) n'en fait que l'application à la WebView.
 */
object DriveProfileName {
    /** Le nom du profil de l'enseigne d'avant le multi-enseignes. */
    const val LEGACY = "drive"

    /** Le début du nom des autres enseignes. */
    const val PREFIX = "drive-"

    /** Le nom du profil de [site] dans le registre [sites]. */
    fun of(site: RetailerSite, sites: RetailerSites = RetailerSites.DEFAULT): String = if (site === sites.legacy) LEGACY else PREFIX + site.id
}

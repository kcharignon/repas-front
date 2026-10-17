package eu.kantin.repas.drive

/**
 * La ligne de version que l'application montre à l'utilisateur (et qu'il peut citer pour un signalement).
 *
 * Le nom et le numéro viennent de l'étiquette Git et du compteur de la construction (`AppVersion` dans `buildSrc`). Ni adresse, ni
 * identifiant, ni donnée de compte. Écrit en Kotlin pur pour se tester sans téléphone.
 */
object VersionLabel {
    fun render(versionName: String, versionCode: Long, buildCommit: String, debuggable: Boolean): String = buildString {
        append("Version ").append(versionName).append(" (numéro ").append(versionCode).append("), construction ").append(buildCommit)
        if (debuggable) append(", débogage")
    }
}

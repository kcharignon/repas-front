package eu.kantin.repas.drive

import org.json.JSONException
import org.json.JSONObject

/**
 * Ce que dit `version.json`, le fichier publié avec chaque version de l'application (DRV-315) : le nom et le code de la version, l'empreinte
 * SHA-256 de l'APK et la version d'Android minimale. Il est lu avec méfiance : une forme inattendue le fait refuser en entier
 * ([parse] rend `null`), et seuls ces quatre champs sont lus. En particulier `apkUrl` est IGNORÉ : l'adresse de l'APK est calculée
 * par [UpdateSource.apkUrl] à partir du nom de version validé, jamais copiée d'un fichier venu du réseau.
 *
 * Le code de version est celui que la construction tire du nom (`X * 1 000 000 + Y * 1 000 + Z`, `AppVersion` de `buildSrc`) : un fichier
 * dont le code ne correspond pas à son nom est incohérent, donc refusé.
 */
class ReleaseInfo(
    /** `X.Y.Z`. */
    val versionName: String,
    /** Le code de version que le système compare : strictement croissant d'une version à l'autre. */
    val versionCode: Long,
    /** L'empreinte SHA-256 de l'APK, 64 caractères hexadécimaux minuscules. */
    val sha256: String,
    /** La plus ancienne version d'Android (niveau d'API) qui peut installer cette version. */
    val minAndroid: Int,
) {
    /** Cette version est strictement plus récente que celle qui est installée (un code égal ou plus bas n'est jamais proposé). */
    fun isNewerThan(installedCode: Long): Boolean = versionCode > installedCode

    /** Le téléphone a une version d'Android assez récente pour l'installer. */
    fun canInstallOn(sdkInt: Int): Boolean = sdkInt >= minAndroid

    companion object {
        private val VERSION_NAME = Regex("""^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$""")
        private val SHA256 = Regex("""^[0-9a-f]{64}$""")

        /** Le niveau d'API le plus bas que l'application accepte (`minSdk` de l'application). */
        private const val MIN_ANDROID_FLOOR = 26
        private const val MAX_ANDROID = 99

        /** Un nom de version `X.Y.Z` accepté par la construction (sans zéro en tête, majeur jusqu'à 2099). */
        fun isVersionName(value: String): Boolean = codeOf(value) != null

        /** Le code de version d'un nom `X.Y.Z` (le même calcul que la construction), ou `null` si ce n'est pas une version valide. */
        fun codeOf(name: String): Long? {
            val match = VERSION_NAME.matchEntire(name) ?: return null
            val (major, minor, patch) = match.destructured
            if (major.toInt() > 2099) return null
            val code = major.toLong() * 1_000_000 + minor.toLong() * 1_000 + patch.toLong()
            return code.takeIf { it >= 1 }
        }

        /** Lit `version.json` ; `null` si le texte n'est pas du JSON objet, si un des quatre champs manque ou est mal formé, ou si le code contredit le nom. */
        fun parse(text: String?): ReleaseInfo? {
            if (text == null) return null
            val json = try {
                JSONObject(text)
            } catch (_: JSONException) {
                return null
            }
            val name = json.opt("versionName") as? String ?: return null
            val expectedCode = codeOf(name) ?: return null
            val code = when (val raw = json.opt("versionCode")) {
                is Int -> raw.toLong()
                is Long -> raw
                else -> return null
            }
            if (code != expectedCode) return null
            val sha256 = json.opt("sha256") as? String ?: return null
            if (!SHA256.matches(sha256)) return null
            val minAndroid = when (val raw = json.opt("minAndroid")) {
                null -> MIN_ANDROID_FLOOR
                is Int -> raw
                else -> return null
            }
            if (minAndroid < MIN_ANDROID_FLOOR || minAndroid > MAX_ANDROID) return null
            return ReleaseInfo(name, code, sha256, minAndroid)
        }
    }
}

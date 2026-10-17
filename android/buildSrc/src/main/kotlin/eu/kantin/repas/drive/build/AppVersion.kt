package eu.kantin.repas.drive.build

/**
 * La version de l'application, dérivée de deux entrées de la construction :
 *
 * - le NOM (`1.2.3`, celui que l'utilisateur voit) vient de l'étiquette Git `android-v1.2.3` ;
 * - le CODE (l'entier que le système compare pour accepter une mise à jour : il ne doit jamais baisser) vient d'un compteur,
 *   le numéro d'exécution de la CI.
 *
 * Sans étiquette ni compteur (construction locale), la version est celle de développement. Une publication, elle, exige les deux :
 * un APK signé nommé « 0.0.0-dev » ou numéroté 1 empêcherait toute mise à jour par-dessus.
 *
 * Écrit en Kotlin pur (sans l'API de Gradle) pour se tester sans lancer de construction.
 */
data class AppVersion(val name: String, val code: Int) {
    companion object {
        const val TAG_PREFIX = "android-v"
        const val DEV_NAME = "0.0.0-dev"
        const val DEV_CODE = 1

        /** Le plus grand code de version accepté par Android est 2 100 000 000. */
        const val MAX_CODE = 2_100_000_000

        private val SEMVER = Regex("""(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})""")
        private val COUNTER = Regex("""[1-9]\d{0,9}""")
        private val COMMIT = Regex("""[0-9a-f]{7,40}""")

        /**
         * La version d'une construction. Une valeur vide ou faite d'espaces compte comme absente. Une valeur présente mais invalide
         * est toujours refusée, même hors publication : une faute de frappe ne doit pas passer en silence.
         *
         * @param forRelease exige l'étiquette ET le compteur.
         * @throws IllegalArgumentException avec un message en français qui dit quoi corriger.
         */
        fun derive(tag: String?, counter: String?, forRelease: Boolean = false): AppVersion {
            val cleanTag = tag?.trim()?.takeIf { it.isNotEmpty() }
            val cleanCounter = counter?.trim()?.takeIf { it.isNotEmpty() }
            if (forRelease) {
                requireNotNull(cleanTag) {
                    "Une publication demande l'étiquette de version : ANDROID_VERSION_TAG=${TAG_PREFIX}X.Y.Z (par exemple ${TAG_PREFIX}0.1.0)."
                }
                requireNotNull(cleanCounter) {
                    "Une publication demande le compteur de version : ANDROID_VERSION_CODE=<entier qui monte à chaque construction>."
                }
            }
            return AppVersion(
                name = cleanTag?.let(::nameFromTag) ?: DEV_NAME,
                code = cleanCounter?.let(::codeFromCounter) ?: DEV_CODE,
            )
        }

        /** `android-v1.2.3` donne `1.2.3`. Rien d'autre n'est accepté (ni préfixe de référence Git, ni suffixe, ni zéro en tête). */
        fun nameFromTag(tag: String): String {
            val version = tag.removePrefix(TAG_PREFIX)
            require(tag.startsWith(TAG_PREFIX) && SEMVER.matches(version)) {
                "Étiquette de version invalide : « $tag ». Format attendu : ${TAG_PREFIX}X.Y.Z (X, Y et Z entiers sans zéro en tête), par exemple ${TAG_PREFIX}0.1.0."
            }
            return version
        }

        /** Un entier strictement positif, sans zéro en tête, d'au plus [MAX_CODE]. */
        fun codeFromCounter(counter: String): Int {
            val value = if (COUNTER.matches(counter)) counter.toLong() else 0L
            require(value in 1..MAX_CODE) {
                "Compteur de version invalide : « $counter ». Attendu : un entier de 1 à $MAX_CODE, sans zéro en tête."
            }
            return value.toInt()
        }

        /**
         * Le début de l'empreinte du commit d'une construction (7 caractères), ou `local` hors CI. Une valeur qui n'est pas une
         * empreinte Git est refusée : elle finit dans une ressource de l'application.
         */
        fun shortCommit(raw: String?): String {
            val clean = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return "local"
            if (clean == "local") return clean
            require(COMMIT.matches(clean)) { "Empreinte de commit invalide : « $clean ». Attendu : 7 à 40 caractères hexadécimaux en minuscules." }
            return clean.take(7)
        }
    }
}

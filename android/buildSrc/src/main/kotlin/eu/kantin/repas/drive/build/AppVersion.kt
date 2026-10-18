package eu.kantin.repas.drive.build

/**
 * La version de l'application, dérivée de deux entrées de la construction :
 *
 * - le NOM (`1.2.3`, celui que l'utilisateur voit) vient de l'étiquette Git `android-v1.2.3` ;
 * - le CODE (l'entier que le système compare pour accepter une mise à jour : il ne doit jamais baisser) vient, pour une publication, de
 *   l'étiquette aussi : `X * 1 000 000 + Y * 1 000 + Z`. `android-v1.2.3` donne donc 1 002 003, et le code monte avec le numéro de
 *   version (1.10.0 est au-dessus de 1.9.0), sur n'importe quel ordinateur et quel que soit le nombre d'essais. Les constructions de
 *   débogage de la CI, elles, le tirent d'un compteur (le numéro d'exécution) : leur clé n'est pas celle de la publication, les deux
 *   familles ne se mettent jamais à jour l'une l'autre.
 *
 * Sans étiquette ni compteur (construction locale), la version est celle de développement. Une publication, elle, exige l'étiquette :
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

        /** Le plus grand numéro majeur dont le code reste sous [MAX_CODE] (2099 * 1 000 000 + 999 * 1 000 + 999 = 2 099 999 999). */
        const val MAX_MAJOR = 2099

        private val SEMVER = Regex("""(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})""")
        private val COUNTER = Regex("""[1-9]\d{0,9}""")
        private val COMMIT = Regex("""[0-9a-f]{7,40}""")

        /**
         * La version d'une construction. Une valeur vide ou faite d'espaces compte comme absente. Une valeur présente mais invalide
         * est toujours refusée, même hors publication : une faute de frappe ne doit pas passer en silence.
         *
         * Le code : le compteur s'il est donné (constructions de débogage), sinon celui que donne l'étiquette, sinon celui de
         * développement. Pour une publication il vient toujours de l'étiquette : un compteur donné en plus doit lui être égal, il ne
         * peut pas le contredire.
         *
         * @param forRelease exige l'étiquette et en tire le code.
         * @throws IllegalArgumentException avec un message en français qui dit quoi corriger.
         */
        fun derive(tag: String?, counter: String?, forRelease: Boolean = false): AppVersion {
            val cleanTag = tag?.trim()?.takeIf { it.isNotEmpty() }
            val cleanCounter = counter?.trim()?.takeIf { it.isNotEmpty() }
            if (forRelease) {
                requireNotNull(cleanTag) {
                    "Une publication demande l'étiquette de version : ANDROID_VERSION_TAG=${TAG_PREFIX}X.Y.Z (par exemple ${TAG_PREFIX}0.1.0)."
                }
            }
            val name = cleanTag?.let(::nameFromTag)
            val counterCode = cleanCounter?.let(::codeFromCounter)
            val code = when {
                counterCode != null && !forRelease -> counterCode
                name != null -> codeFromName(name, cleanTag).also { tagCode ->
                    require(counterCode == null || counterCode == tagCode) {
                        "Le compteur ANDROID_VERSION_CODE=$cleanCounter contredit l'étiquette « $cleanTag » : le code d'une publication " +
                            "vient de l'étiquette ($tagCode). Retirer ANDROID_VERSION_CODE."
                    }
                }
                else -> DEV_CODE
            }
            return AppVersion(name = name ?: DEV_NAME, code = code)
        }

        /** `android-v1.2.3` donne `1.2.3`. Rien d'autre n'est accepté (ni préfixe de référence Git, ni suffixe, ni zéro en tête). */
        fun nameFromTag(tag: String): String {
            val version = tag.removePrefix(TAG_PREFIX)
            require(tag.startsWith(TAG_PREFIX) && SEMVER.matches(version)) {
                "Étiquette de version invalide : « $tag ». Format attendu : ${TAG_PREFIX}X.Y.Z (X, Y et Z entiers sans zéro en tête), par exemple ${TAG_PREFIX}0.1.0."
            }
            return version
        }

        /**
         * Le code de version d'un nom `X.Y.Z` : `X * 1 000 000 + Y * 1 000 + Z`. Il monte avec le numéro de version. `0.0.0` (code 0) et un
         * majeur au-dessus de [MAX_MAJOR] sont refusés. [tag] ne sert qu'à nommer l'étiquette dans le message d'erreur.
         */
        fun codeFromName(name: String, tag: String? = null): Int {
            val numbers = SEMVER.matchEntire(name)?.groupValues?.drop(1)?.map { it.toInt() }
            require(numbers != null) { "Nom de version invalide : « $name »." }
            val (major, minor, patch) = numbers
            val shown = tag ?: "$TAG_PREFIX$name"
            require(major <= MAX_MAJOR) { "Étiquette de version trop grande : « $shown ». Le numéro majeur va de 0 à $MAX_MAJOR." }
            val code = major * 1_000_000 + minor * 1_000 + patch
            require(code >= 1) { "Étiquette de version sans numéro : « $shown » donnerait le code 0. Commencer à ${TAG_PREFIX}0.0.1." }
            return code
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

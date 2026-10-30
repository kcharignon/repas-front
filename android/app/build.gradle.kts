import eu.kantin.repas.drive.build.AppVersion
import java.security.MessageDigest
import java.util.Base64
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Les entrées de la construction viennent toutes de variables d'environnement (voir android/README.md) : rien de secret n'est écrit
// dans le dépôt. Ni les mots de passe ni la clé de publication ne sont jamais lus ailleurs que dans ces variables.
fun env(name: String): String? = providers.environmentVariable(name).orNull?.trim()?.takeIf { it.isNotEmpty() }

val versionTag = env("ANDROID_VERSION_TAG")
val versionCounter = env("ANDROID_VERSION_CODE")
val appVersion = try {
    AppVersion.derive(versionTag, versionCounter)
} catch (e: IllegalArgumentException) {
    throw GradleException(e.message, e)
}
// L'origine du front Repas que la coquille charge (DRV-317). L'APK de publication a toujours celle de la production ; l'APK de débogage peut
// en viser une autre (`ANDROID_REPAS_ORIGIN=https://hote.exemple/`, https seulement), par exemple le faux Repas de l'émulateur.
val productionOrigin = "https://kantin.eu/"
fun originHost(origin: String): String {
    val match = Regex("^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)/$").find(origin)
        ?: throw GradleException("ANDROID_REPAS_ORIGIN doit être de la forme https://hote/ (https, sans port ni chemin) : « $origin ».")
    return match.groupValues[1]
}
val debugOrigin = env("ANDROID_REPAS_ORIGIN") ?: productionOrigin
// Les enseignes ÉTEINTES qu'une construction de DÉBOGAGE allume (DRV-728) : `ANDROID_EXTRA_RETAILERS=<id>`, des identifiants séparés par des virgules (vide par
// défaut : aucune). C'est le drapeau de construction qui fait entrer une enseigne inscrite dans le registre que l'application sert, annonce à Repas
// (`app.info`) et propose dans son menu (`RetailerSites.serving`). La construction de PUBLICATION a toujours un drapeau vide, quoi que dise
// l'environnement : `verifyReleaseInputs` refuse la variable, et `build.sh` vérifie le drapeau dans `BuildConfig`. Aucune enseigne n'est nommée ici. Depuis DRV-738
// Auchan n'est plus éteinte (elle est dans `RetailerSites.DEFAULT`, donc servie et annoncée par toute construction) : la liste des enseignes éteintes est vide,
// le mécanisme attend la prochaine enseigne.
val extraRetailers = env("ANDROID_EXTRA_RETAILERS") ?: ""
if (!Regex("^([a-z][a-z0-9]{0,19}(,[a-z][a-z0-9]{0,19})*)?$").matches(extraRetailers)) {
    throw GradleException("ANDROID_EXTRA_RETAILERS doit être une liste d'identifiants d'enseigne (minuscules et chiffres) séparés par des virgules : « $extraRetailers ».")
}
val buildCommit = try {
    AppVersion.shortCommit(env("ANDROID_COMMIT"))
} catch (e: IllegalArgumentException) {
    throw GradleException(e.message, e)
}

// La clé de publication : un fichier déposé hors du dépôt (`build.sh release` le décode dans un dossier temporaire) et trois valeurs.
val releaseKeystorePath = env("ANDROID_KEYSTORE_FILE")
val releaseStorePassword = env("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = env("ANDROID_KEY_ALIAS")
val releaseKeyPassword = env("ANDROID_KEY_PASSWORD")

/**
 * Copie l'agent du drive (`drive-agent/dist/agent.js`, construit par `make agent-build`) dans les actifs de l'application, avec
 * l'empreinte attendue, et refuse de construire si son empreinte SHA-384 n'est pas celle de `agent.js.sha384` (DRV-313).
 * L'application revérifie la même empreinte au démarrage avant d'injecter quoi que ce soit.
 */
abstract class PrepareAgentAsset : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val agentFile: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val expectedDigestFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun prepare() {
        val bytes = agentFile.get().asFile.readBytes()
        val actual = "sha384-" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-384").digest(bytes))
        val expected = expectedDigestFile.get().asFile.readText().trim()
        if (actual != expected) {
            throw GradleException(
                "L'agent drive-agent/dist/agent.js n'est plus celui attendu.\n" +
                    "  empreinte attendue (android/agent.js.sha384) : $expected\n" +
                    "  empreinte du fichier                         : $actual\n" +
                    "Si l'agent a changé exprès : make android-agent-hash, relire, puis commiter agent.js.sha384 et le dire dans la PR."
            )
        }
        val target = outputDir.get().asFile
        target.deleteRecursively()
        target.mkdirs()
        target.resolve("agent.js").writeBytes(bytes)
        target.resolve("agent.js.sha384").writeText("$expected\n")
    }
}

android {
    namespace = "eu.kantin.repas.drive"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "eu.kantin.repas.drive"
        minSdk = 26
        // À partir de 35, Android dessine sous les barres du système (affichage bord à bord obligatoire) : chaque écran gère les marges.
        targetSdk = 36
        versionCode = appVersion.code
        versionName = appVersion.name
        resValue("string", "build_commit", buildCommit)
    }

    // Deux façons de distribuer la même application (DRV-639, ADR 0025 du back) :
    //  - `direct` : l'APK de la release GitHub, installé à la main. Seul à savoir se mettre à jour lui-même : il déclare la permission
    //    « installer des applications » (REQUEST_INSTALL_PACKAGES), le fournisseur de fichiers et le code qui télécharge, vérifie et ouvre
    //    l'installateur d'Android (`app/src/direct`) ;
    //  - `play` : la version de Google Play (à venir, tickets STORE) : Google interdit à une application distribuée par Play de s'installer ailleurs.
    //    Elle ne contient NI la permission NI ce code (`app/src/play` n'a qu'un remplaçant qui répond « non » à tout). `build.sh test`
    //    construit les deux et échoue si la variante `play` porte l'un ou l'autre.
    flavorDimensions += "distribution"
    productFlavors {
        create("direct") { dimension = "distribution" }
        create("play") { dimension = "distribution" }
    }

    buildFeatures {
        resValues = true
        // BuildConfig.DEBUG : le menu « Plan d'essai (débogage) » n'existe que dans l'APK de débogage.
        buildConfig = true
    }

    signingConfigs {
        // Clé de débogage publique (mot de passe « android »), commitée pour que chaque APK de débogage s'installe par-dessus le
        // précédent. Elle ne protège rien et ne signe jamais une publication.
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // Sans les quatre variables, cette configuration reste vide et `verifyReleaseInputs` refuse la construction avant tout.
        create("release") {
            if (releaseKeystorePath != null && releaseStorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null) {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("String", "REPAS_ORIGIN", "\"$debugOrigin\"")
            buildConfigField("String", "EXTRA_RETAILERS", "\"$extraRetailers\"")
            manifestPlaceholders["repasHost"] = originHost(debugOrigin)
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            buildConfigField("String", "REPAS_ORIGIN", "\"$productionOrigin\"")
            // Aucune enseigne éteinte dans la publication : jamais lu de l'environnement. Les enseignes servies par la publication sont celles de `RetailerSites.DEFAULT` (DRV-738).
            buildConfigField("String", "EXTRA_RETAILERS", "\"\"")
            manifestPlaceholders["repasHost"] = originHost(productionOrigin)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

androidComponents {
    onVariants { variant ->
        val prepare = tasks.register<PrepareAgentAsset>("prepareAgentAsset${variant.name.replaceFirstChar { it.titlecase() }}") {
            agentFile.set(rootProject.layout.projectDirectory.file("../drive-agent/dist/agent.js"))
            expectedDigestFile.set(rootProject.layout.projectDirectory.file("agent.js.sha384"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(prepare, PrepareAgentAsset::outputDir)
    }
}

// Une publication refuse de se construire sans clé, sans étiquette ou sans compteur. Rien de ce qui est vérifié ici n'est affiché.
val verifyReleaseInputs by tasks.registering {
    group = "verification"
    description = "Refuse de construire une publication sans clé de signature, étiquette de version ou compteur."
    doLast {
        if (extraRetailers.isNotEmpty()) {
            throw GradleException(
                "Une publication n'embarque aucune enseigne éteinte : ANDROID_EXTRA_RETAILERS ne sert qu'aux constructions de débogage. Retire la variable de l'environnement.",
            )
        }
        val missing = listOfNotNull(
            "ANDROID_KEYSTORE_FILE".takeIf { releaseKeystorePath == null },
            "ANDROID_KEYSTORE_PASSWORD".takeIf { releaseStorePassword == null },
            "ANDROID_KEY_ALIAS".takeIf { releaseKeyAlias == null },
            "ANDROID_KEY_PASSWORD".takeIf { releaseKeyPassword == null },
        )
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Pas de clé de signature : ${missing.joinToString(", ")} manque. Une publication se signe avec une clé fournie par variables " +
                    "d'environnement (voir android/README.md) ; jamais de clé dans le dépôt.",
            )
        }
        if (!file(releaseKeystorePath!!).isFile) {
            throw GradleException("Le fichier de clé de signature est introuvable (ANDROID_KEYSTORE_FILE).")
        }
        try {
            AppVersion.derive(versionTag, versionCounter, forRelease = true)
        } catch (e: IllegalArgumentException) {
            throw GradleException(e.message, e)
        }
    }
}

// Une tâche de publication (de n'importe quelle variante : `direct`, `play`) demande les entrées d'abord.
tasks.configureEach {
    if (Regex("""^pre\w*ReleaseBuild$""").matches(name) || Regex("""^validateSigning\w*Release$""").matches(name)) {
        dependsOn(verifyReleaseInputs)
    }
}

dependencies {
    // Seule bibliothèque à l'exécution : les indications client (client hints) de la WebView, pour le mode ordinateur.
    implementation("androidx.webkit:webkit:1.18.0")
    // Le cœur : les règles en Kotlin pur (`android/core`, AUTH-015). Il ne dépend jamais de l'application.
    implementation(project(":core"))
    testImplementation("junit:junit:4.13.2")
    // Les tests jouent sur la JVM, où `org.json` d'Android n'est qu'une coquille vide : la vraie bibliothèque la remplace.
    testImplementation("org.json:json:20250517")
}

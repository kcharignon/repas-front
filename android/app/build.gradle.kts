import eu.kantin.repas.drive.build.AppVersion
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

    buildFeatures {
        resValues = true
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
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
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

// Une publication refuse de se construire sans clé, sans étiquette ou sans compteur. Rien de ce qui est vérifié ici n'est affiché.
val verifyReleaseInputs by tasks.registering {
    group = "verification"
    description = "Refuse de construire une publication sans clé de signature, étiquette de version ou compteur."
    doLast {
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

tasks.configureEach {
    if (name == "preReleaseBuild" || name == "validateSigningRelease") {
        dependsOn(verifyReleaseInputs)
    }
}

dependencies {
    // Aucune bibliothèque à l'exécution pour l'instant (l'hôte WebView ajoutera `androidx.webkit`, DRV-312).
    testImplementation("junit:junit:4.13.2")
}

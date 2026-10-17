// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
import java.security.MessageDigest
import java.util.Base64
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Copie le banc d'essai du favori (`drive-agent/lab/published/lab.js`) dans les actifs de l'application, à la construction,
 * et refuse de construire si son empreinte SHA-384 n'est pas celle notée dans `lab.js.sha384`.
 */
abstract class PrepareLabAsset : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val labFile: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val expectedDigestFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun prepare() {
        val bytes = labFile.get().asFile.readBytes()
        val actual = "sha384-" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-384").digest(bytes))
        val expected = expectedDigestFile.get().asFile.readText().trim()
        if (actual != expected) {
            throw GradleException(
                "Le banc d'essai drive-agent/lab/published/lab.js n'est plus celui attendu.\n" +
                    "  empreinte attendue (lab.js.sha384) : $expected\n" +
                    "  empreinte du fichier              : $actual\n" +
                    "Si le banc a changé exprès : make android-lab-hash, relire, puis commiter lab.js.sha384 et le dire dans la PR."
            )
        }
        val target = outputDir.get().asFile
        target.deleteRecursively()
        target.mkdirs()
        target.resolve("lab.js").writeBytes(bytes)
    }
}

// Le numéro de version monte à chaque construction de la CI (numéro d'exécution) : un APK plus récent s'installe par-dessus.
val labVersionCode = providers.environmentVariable("ANDROID_LAB_VERSION_CODE").orElse("1").get().toInt()
val labCommit = providers.environmentVariable("ANDROID_LAB_COMMIT").orElse("local").get().take(7)

android {
    namespace = "eu.kantin.repas.lab"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "eu.kantin.repas.lab"
        minSdk = 26
        // 34 et non 35 ou plus : à partir de 35, Android dessine sous les barres du système et impose de gérer les marges.
        targetSdk = 34
        versionCode = labVersionCode
        versionName = "0.1.0"
        resValue("string", "build_commit", labCommit)
    }

    // Clé de débogage jetable, publique (mot de passe « android »), commitée pour que chaque APK s'installe par-dessus le précédent.
    // Elle ne protège rien : désinstaller l'application à la fin du test.
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
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
    // Seule la version de débogage existe dans ce spike.
    beforeVariants { variantBuilder ->
        if (variantBuilder.buildType == "release") {
            variantBuilder.enable = false
        }
    }
    onVariants { variant ->
        val prepare = tasks.register<PrepareLabAsset>("prepareLabAsset${variant.name.replaceFirstChar { it.titlecase() }}") {
            labFile.set(rootProject.layout.projectDirectory.file("../lab/published/lab.js"))
            expectedDigestFile.set(rootProject.layout.projectDirectory.file("lab.js.sha384"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(prepare, PrepareLabAsset::outputDir)
    }
}

dependencies {
    // Seule bibliothèque ajoutée : les indications client (client hints) de la WebView, pour le mode ordinateur.
    implementation("androidx.webkit:webkit:1.17.1")
    testImplementation("junit:junit:4.13.2")
}

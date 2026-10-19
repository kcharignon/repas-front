import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Le cœur de l'application (AUTH-015) : du Kotlin sans aucune classe Android. Ce module n'applique pas le plugin Android et ne dépend d'aucune
// bibliothèque Android ou AndroidX : un `import android.…` ou `import androidx.…` ne compile donc pas ici (« Unresolved reference »), et
// `CoreArchitectureTest` le dit en clair. L'application (`:app`) dépend du cœur, jamais l'inverse. Voir android/ARCHITECTURE.md.
plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // `org.json` : Android l'apporte (rien n'est embarqué dans l'APK), la JVM des tests non. Seul emprunt à la JVM avec `MessageDigest` et
    // `Base64` d'`AgentAsset` : la liste fermée de `CoreArchitectureTest`, et ce qu'il faudra remplacer pour Kotlin Multiplatform (ARCHITECTURE.md).
    compileOnly("org.json:json:20250517")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
}

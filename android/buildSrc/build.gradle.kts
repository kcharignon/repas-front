// Le code de construction qui se teste seul : la dérivation de la version (AppVersion). `./build.sh test` joue ses tests.
plugins {
    `kotlin-dsl`
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

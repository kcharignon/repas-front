plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.2.21" apply false
    // Le cœur de l'application (core/, AUTH-015) est un module Kotlin sans Android : il n'a pas le plugin Android, donc pas le SDK Android.
    id("org.jetbrains.kotlin.jvm") version "2.2.21" apply false
}

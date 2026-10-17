# Repas Drive : l'application Android

L'application Android du chantier « envoyer la liste de courses au drive Leclerc » (tickets `DRV-311` à `DRV-316`, dépôt back `docs/drive/`). Elle affichera le drive Leclerc dans une WebView en mode ordinateur, y injectera l'agent de `drive-agent/` et rendra le résultat à Repas. **Écrite en Kotlin, une seule activité, AndroidX réduit au strict nécessaire.**

État : **squelette** (DRV-311). Un écran nomme l'application et montre sa version. L'hôte WebView (DRV-312), l'agent embarqué (DRV-313), le passage du plan (DRV-314) et la publication signée (DRV-315) viennent ensuite.

> `drive-agent/android-lab/` est l'application de test jetable du spike (DRV-011). Elle reste en place, avec le banc d'essai `drive-agent/lab/`, jusqu'à la fin du jalon M3b ; ce dossier-ci la prolonge sans la modifier.

## Commandes

Tout se lance dans Docker (image : JDK 17, Gradle, SDK Android ; rien à installer sur la machine). La première construction télécharge les outils, les suivantes réutilisent le cache.

| Commande | Rôle |
|---|---|
| `make android` | construit l'APK de débogage : `android/dist/repas-drive-debug.apk`, avec sa taille et son empreinte SHA-256 |
| `make android-test` | joue les tests Kotlin : ceux de l'application et ceux de la dérivation de la version (`buildSrc`) |
| `make android-release` | construit l'APK signé `android/dist/repas-drive.apk` ; **refuse sans clé de signature**, sans étiquette ou sans compteur de version |
| `make android-release-selftest` | prouve le refus sans clé et la réussite avec une clé jetable créée à l'instant (rien n'est conservé) |

La CI (`.github/workflows/android.yml`, séparée de `make check`) joue `make android-test`, `make android` et `make android-release-selftest` ; l'APK de débogage est déposé en artefact du run. Elle ne tourne que si `android/`, son workflow, `compose.yaml` ou le `Makefile` changent. L'image de construction est mise en cache par GitHub Actions.

## Structure

```
android/
  Dockerfile, build.sh      image de construction et script lancé dedans (test, apk, release, release-selftest)
  settings.gradle.kts, build.gradle.kts, gradle.properties
  buildSrc/                 la dérivation de la version (AppVersion), en Kotlin pur, avec ses tests
  app/
    build.gradle.kts        applicationId eu.kantin.repas.drive, minSdk 26, targetSdk 36, signatures, version
    src/main/kotlin/eu/kantin/repas/drive/
      MainActivity.kt       le squelette : nom de l'application et version
      NavigationPolicy.kt   la règle de navigation (seules les pages https de leclercdrive.fr restent dans l'application)
      UserAgent.kt          l'identité « ordinateur » de la WebView (agent utilisateur et indications client)
      VersionLabel.kt       la ligne de version montrée à l'utilisateur
    src/test/kotlin/...     tests JUnit (Kotlin pur, sans téléphone)
  __tests__/hygiene.spec.ts un test Vitest : aucune clé ni mot de passe dans le dépôt
  debug.keystore            clé de débogage PUBLIQUE (mot de passe « android »), la seule clé suivie par Git
```

`NavigationPolicy` et `UserAgent` viennent du spike et sont prêts pour l'hôte WebView (DRV-312) ; l'écran du squelette ne s'en sert pas encore. Elles sont écrites sans classe Android pour se tester sans téléphone.

## Version

- Le **nom** (`1.2.3`) vient de l'étiquette Git `android-v1.2.3` : variable `ANDROID_VERSION_TAG` (format strict `android-vX.Y.Z`).
- Le **code** (l'entier que le système compare pour accepter une mise à jour, qui ne doit jamais baisser) vient d'un compteur : variable `ANDROID_VERSION_CODE` (le numéro d'exécution de la CI).
- `ANDROID_COMMIT` (l'empreinte du commit, 7 caractères gardés) s'ajoute à la ligne de version ; `local` hors CI.
- Sans étiquette ni compteur (construction locale), la version est `0.0.0-dev` (code 1). Une valeur **présente mais invalide** est toujours refusée. Une **publication** (`make android-release`) exige l'étiquette et le compteur : un APK signé numéroté 1 empêcherait toute mise à jour par-dessus.
- La version est visible dans l'application, sur son écran : `Version 1.2.3 (numéro 42), construction 0123abc` (`, débogage` pour l'APK de débogage).

Exemple : `ANDROID_VERSION_TAG=android-v0.1.0 ANDROID_VERSION_CODE=7 make android`.

## Signature

- **APK de débogage** : signé avec `debug.keystore`, une clé jetable et publique reprise du spike. Elle ne protège rien et ne signe jamais une publication. Chaque APK de débogage s'installe par-dessus le précédent.
- **APK de publication** : signé avec une clé **fournie par variables d'environnement**, qui ne touche jamais le dépôt : `ANDROID_KEYSTORE_BASE64` (le fichier de clé encodé en base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Le script décode la clé dans un fichier temporaire du conteneur, effacé en sortie ; aucune valeur n'est affichée. La création de cette clé, sa sauvegarde et son dépôt dans les secrets de GitHub sont une étape humaine (DRV-315).
- Un APK de débogage et un APK de publication n'ont pas la même clé : Android refuse de l'un à l'autre. Désinstaller l'application avant de passer de l'un à l'autre.
- Jamais de clé, de mot de passe ni de secret dans le dépôt (public) : `.gitignore` ignore les fichiers de clé et `__tests__/hygiene.spec.ts` (joué par `make check`) le vérifie.

## Règles

- **Rien d'une enseigne n'est lu ni conservé** : aucun identifiant, cookie, jeton ni contenu de page dans les journaux ou le dépôt. L'utilisateur se connecte lui-même dans la WebView. Les cookies restent sur le téléphone (ni sauvegarde dans le nuage, ni transfert d'appareil : `data_extraction_rules.xml`).
- **Aucun objet natif exposé aux pages** (pas de `addJavascriptInterface`) : seul un canal de messages restreint à `*.leclercdrive.fr` (DRV-313).
- **Aucune permission** pour l'instant ; l'accès à Internet arrive avec l'hôte WebView (DRV-312), jamais d'autre permission.
- **Données synthétiques** dans les tests : aucun vrai numéro de magasin, nom de ville, cookie ou HTML d'enseigne (dépôt public). Aucun essai ne contacte `leclercdrive.fr` depuis la CI : le site se visite seulement sur le téléphone de l'utilisateur (recette, DRV-505).
- `targetSdk` 36 : depuis Android 15 l'écran passe sous les barres du système (bord à bord). Chaque écran gère ses marges (`fitsSystemWindows` pour le squelette) ; l'hôte WebView (DRV-312) devra le faire aussi, le spike restait en 34 pour l'éviter.
- Gradle est lancé sans démon, plugins et dépendances épinglés (`build.gradle.kts`, `app/build.gradle.kts`), image de construction épinglée par empreinte (`Dockerfile`). Une mise à jour d'outil se fait à la main, une PR par chantier.

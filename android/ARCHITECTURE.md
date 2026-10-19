# Architecture de l'application Android

L'application est faite de deux morceaux, pour qu'un iPhone puisse un jour réutiliser le premier sans réécriture (AUTH-015, décision D5 de l'[ADR 0024](https://github.com/kcharignon/repas/blob/main/docs/adr/0024-connexion-avec-google.md) du dépôt back : « fais juste en sorte que l'appli puisse avoir un tronc commun Kotlin le jour où j'ai besoin de sortir sur iPhone »). Aucun code iOS n'existe et Kotlin Multiplatform n'est pas là : on a seulement rangé le terrain.

```
        android/app  (Android)                              android/core  (Kotlin sans Android)
 ┌───────────────────────────────────────┐            ┌────────────────────────────────────────────────┐
 │ écrans : MainActivity, DriveActivity   │            │ les règles : adresses permises, messages du     │
 │ la WebView : AgentHost, DesktopMode,   │  appelle   │ pont, plan, passage, empreinte de l'agent,      │
 │   DriveProfile                         ├──────────► │ version, bandeaux, surveillance de la page       │
 │ les services d'Android :               │            │                                                │
 │   AndroidLinkOpener, Prefs…Store,      │ implémente │ les services de plateforme (interfaces) :       │
 │   (AUTH-011) Credential Manager        │◄───────────┤   IdentityProvider, LinkOpener,                 │
 └───────────────────────────────────────┘            │   PassStore, StorePathStore                     │
                                                       └────────────────────────────────────────────────┘
          dépend du cœur  ─────────────────────►  le cœur ne dépend de rien d'Android
```

## La règle d'or

> **Le cœur n'importe rien d'Android.** Ni `android.*`, ni `androidx.*`, ni `BuildConfig`, ni `R`, ni une classe d'une activité.

Elle est tenue par trois choses, qui échouent chacune d'un mot clair :

- **la construction** : `core/` n'applique pas le plugin Android et n'a pas le SDK ; un `import android.…` donne « Unresolved reference » à `make android-test` ;
- **`CoreArchitectureTest`** (`core/src/test/kotlin`, rejoué par `make android-test`) : aucun fichier du cœur ni de ses tests ne nomme Android ou AndroidX, et ce que le cœur emprunte à la JVM tient dans une liste fermée (voir plus bas) ;
- **`android/__tests__/core.spec.ts`** (rejoué par `make check`, sans Docker de construction) : la même règle, la tuyauterie Gradle, et que ce fichier nomme chaque fichier Kotlin.

Le sens des dépendances ne se renverse pas : `app` dépend de `core` (`implementation(project(":core"))`), jamais l'inverse.

## Où est quoi

Le cœur : `android/core/src/main/kotlin/eu/kantin/repas/drive/` (le paquet n'a pas changé, il n'y a donc eu aucun import à réécrire).

| Fichier | Ce qu'il porte |
|---|---|
| `NavigationPolicy.kt` | la règle de navigation du drive (seules les pages `https` de `leclercdrive.fr` restent dans l'application), les formes d'adresses, le site mobile, l'accueil |
| `ShellNavigation.kt` | l'origine de Repas (`RepasOrigin`) et la règle de navigation de la coquille |
| `DriveEntry.kt` | où ouvrir le drive depuis « Finaliser sur Leclerc » (l'accueil du magasin, ou l'accueil du drive) |
| `FinalizeOutcome.kt` | la forme du dernier « Finaliser » (un mot, jamais une adresse) et son port de stockage (`FinalizeOutcomeStore`) |
| `StorePathMemory.kt` | le chemin du magasin avec sa ville, et son port de stockage (`StorePathStore`) |
| `OpeningWatch.kt` | la surveillance de la page où l'envoi attend la page du magasin (`PageTrouble`) |
| `NativeBridge.kt` | les règles du pont `repasNative` : origine, 64 Ko, forme du JSON, réponses |
| `BridgeMessages.kt` | les règles du canal `repasHost` entre l'application et l'agent |
| `DrivePlan.kt` | le plan reçu de Repas (forme, hôte, bornes), la lecture du magasin et le résultat `aborted` |
| `DrivePass.kt` | le passage (un seul à la fois, reprise sous 24 h, résultats à livrer, son port `PassStore`), le bandeau (`StoreBanner`), l'envoi du plan (`PlanDelivery`) |
| `AgentAsset.kt` | l'agent embarqué : empreinte SHA-384, version, script injecté, états |
| `UserAgent.kt` | l'identité « ordinateur » : agent utilisateur et indications client |
| `LoadProblem.kt` | le classement des incidents de chargement |
| `VersionLabel.kt` | la ligne de version montrée à l'utilisateur |
| `DebugPlan.kt`, `ResultReport.kt`, `SelftestReport.kt` | (débogage) le plan d'essai, le rapport du résultat, le rapport du test automatique |
| `IdentityProvider.kt` | le service de plateforme « obtenir un jeton d'identité » (AUTH-011) : `IdentityProvider`, `IdentityResult`, `IdentityError`, `Cancellation` |
| `LinkOpener.kt` | le service de plateforme « ouvrir une page web dans le navigateur du système » |

L'application : `android/app/src/main/kotlin/eu/kantin/repas/drive/`, tout ce qui touche à Android.

| Fichier | Ce qu'il porte |
|---|---|
| `MainActivity.kt` | la coquille Repas : WebView, pont `repasNative`, liens entrants, menu |
| `DriveActivity.kt` | le drive, second écran : WebView en mode ordinateur, agent injecté |
| `AgentHost.kt` | la colle `androidx.webkit` : injection de l'agent, canal `repasHost` |
| `DesktopMode.kt` | le mode ordinateur appliqué à la WebView |
| `DriveProfile.kt` | le profil « drive » de la WebView (cookies et stockage séparés de Repas) |
| `RepasApp.kt` | l'application ; les stockages Android (`PrefsPassStore`, `PrefsStorePathStore`, `PrefsFinalizeOutcomeStore`) |
| `AndroidServices.kt` | les services de plateforme d'Android derrière les interfaces du cœur (`AndroidLinkOpener`) |
| `InstalledVersion.kt` | la version installée, lue dans le gestionnaire de paquets |
| `Dialogs.kt`, `Views.kt`, `TextPanel.kt` | fenêtres, vues, écran de texte |

Les tests suivent : `core/src/test` pour tout ce qui se joue sur la JVM seule ; `app/src/test` pour ce qui touche à Android ou à un actif de l'application (`LoadProblemTest` rapproche le classement des constantes de la WebView, `BuildOriginTest` lit `BuildConfig`, `InjectionAssetTest` lit `injection.js`, `DebugRunTest` joue le vrai `debug-plan.json`).

## Les services de plateforme

Quand le cœur a besoin de quelque chose que seule la plateforme sait faire, il le demande par une **interface du cœur** ; l'application l'implémente.

| Interface (cœur) | Ce qu'elle demande | Android | iPhone |
|---|---|---|---|
| `IdentityProvider` | un jeton d'identité, par la feuille de choix du compte de la plateforme (`signIn(clientId, nonce, callback)`) | Credential Manager (AUTH-011, à écrire) | hors portée |
| `LinkOpener` | ouvrir une page web dans le navigateur du système | `AndroidLinkOpener` (`AndroidServices.kt`) | hors portée |
| `PassStore` | garder une valeur texte : le passage non terminé et les résultats à livrer | `PrefsPassStore` (préférence privée, hors sauvegarde) | hors portée |
| `StorePathStore` | garder le chemin du magasin | `PrefsStorePathStore` | hors portée |
| `FinalizeOutcomeStore` | garder la forme du dernier « Finaliser » | `PrefsFinalizeOutcomeStore` | hors portée |

- **Pas de `SecureStore`** : rien ne garde de secret aujourd'hui (la connexion Google ne garde pas le jeton). Le jour où quelque chose en aura besoin, on l'ajoute au cœur avec son implémentation.
- **Pas encore d'interface** pour l'écran allumé (`FLAG_KEEP_SCREEN_ON`), la WebView elle-même (injection, pont, profil, mode ordinateur) ni les fenêtres : il n'y a qu'une plateforme, on n'invente pas l'interface avant le second besoin. Les *règles* de ces morceaux sont déjà dans le cœur, c'est ce qui compte.

## Où mettre un nouveau code

1. Il se joue sans téléphone, sans WebView, sans `Context` ? **Dans le cœur**, avec ses tests JUnit.
2. Il a besoin de la plateforme ? Le **cœur** écrit l'interface (en Kotlin, sans type Android dans ses signatures), **l'application** l'implémente dans `AndroidServices.kt` (ou un fichier voisin) et la branche dans `RepasApp` ou l'activité.
3. Il est de la colle d'Android (WebView, vue, activité, manifeste) ? **Dans l'application**, aussi mince que possible : la décision va au cœur, l'application l'exécute.

## Ce que Kotlin Multiplatform demandera

Le jour où l'iPhone devient un besoin, ce ne sera pas une réécriture :

1. déplacer `core/` en un module `shared` (plugin `org.jetbrains.kotlin.multiplatform`, sources en `commonMain`/`commonTest`), brancher l'application dessus (`implementation(project(":shared"))`) ;
2. remplacer ce que le cœur emprunte à la JVM, la liste fermée de `CoreArchitectureTest` (`CoreRules.BORROWED_FROM_THE_JVM`) :
   - `org.json` (tout le JSON du pont, du plan et des rapports) : une bibliothèque JSON multiplateforme, ou une petite façade ;
   - `java.security.MessageDigest` et `java.util.Base64` (`AgentAsset`, l'empreinte SHA-384) : `expect`/`actual`, ou la `Base64` de la bibliothèque standard de Kotlin ;
   - `java.text.Normalizer` et `java.util.Locale` (`DriveEntry`, le titre « introuvable » sans accents ni majuscules) : `expect`/`actual` (sur iPhone, la décomposition d'Apple) ;
   - `String.format` (`ResultReport`) et les conversions d'octets (`Charsets`) : leurs équivalents multiplateformes ;
   - JUnit : `kotlin.test` ;
3. revérifier les expressions régulières du cœur sur Kotlin/Native (les formes d'adresses en dépendent) : les tests les couvrent déjà ;
4. écrire côté iPhone les implémentations des interfaces de plateforme (`IdentityProvider`, `LinkOpener`, les trois stockages) et la colle du `WKWebView` (injection du script, canal de messages, profil) ; `injection.js` est propre à Android, l'iPhone aura le sien.

Rien de cela n'est fait ni préparé de façon cachée : le cœur compile et se teste aujourd'hui sans Android, c'est tout ce que ce découpage promet.

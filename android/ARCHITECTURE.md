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
| `RetailerSite.kt` | **une enseigne de drive vue par l'application** (DRV-706) : `RetailerSite` (identifiant, noms, accueil, mode du site, hôtes où l'on navigue et hôtes où le pont `repasHost` et l'agent existent, formes des pages de magasin, de connexion et du site mobile, règle de livraison d'un plan), `HostPattern` (un nom exact ou tous les sous-domaines d'un domaine, jamais un joker plus large), `SiteHost`, `StorePages`, `SiteMode` |
| `RetailerSites.kt` | **le registre des enseignes** : la seule liste (deux enseignes inscrites, dont une éteinte : Auchan, DRV-728), injectable dans les tests ; **le seul fichier du cœur qui nomme une enseigne** ; refuse deux enseignes qui se partagent un nom de site ; `announcedRetailers()` pour `app.info` |
| `DriveProfileName.kt` | le nom du profil de WebView de chaque enseigne (DRV-707) : `drive` pour l'enseigne d'avant (les installations existantes restent connectées), `drive-<identifiant>` pour les autres |
| `RetailerValue.kt` | une valeur texte **par enseigne** sur le stockage clé-valeur du téléphone (`KeyValueStore`) : clé `<nom>.<identifiant>`, ancienne clé unique relue comme celle de l'enseigne d'avant |
| `NavigationPolicy.kt` | la règle de navigation du drive (seules les pages `https` de l'enseigne de l'écran restent dans l'application : `decide(site, url)`), la lecture des adresses ; les formes sans enseigne sont celles de l'enseigne d'avant |
| `ShellNavigation.kt` | l'origine de Repas (`RepasOrigin`) et la règle de navigation de la coquille |
| `DriveEntry.kt` | où ouvrir le drive depuis « Finaliser » (l'accueil du magasin, ou l'accueil du drive de l'enseigne du lien) |
| `FinalizeOutcome.kt` | la forme du dernier « Finaliser » (un mot, jamais une adresse), son port de stockage (`FinalizeOutcomeStore`) et sa mémoire par enseigne (`FinalizeOutcomeMemories`) |
| `StorePathMemory.kt` | le chemin du magasin avec sa ville, son port de stockage (`StorePathStore`) et sa mémoire par enseigne (`StorePathMemories`) |
| `OpeningWatch.kt` | la surveillance de la page où l'envoi attend la page du magasin (`PageTrouble`) |
| `NativeBridge.kt` | les règles du pont `repasNative` : origine, 64 Ko, forme du JSON, réponses |
| `BridgeMessages.kt` | les règles du canal `repasHost` entre l'application et l'agent : origines du pont d'une enseigne, règles d'origine de la WebView (`originRules`) |
| `DrivePlan.kt` | le plan reçu de Repas (forme, enseigne du registre, hôte de cette enseigne, bornes), la lecture du magasin et le résultat `aborted` |
| `DrivePass.kt` | le passage (un seul à la fois, reprise sous 24 h, résultats à livrer, son port `PassStore`), le bandeau (`StoreBanner`), l'envoi du plan (`PlanDelivery`) |
| `AgentAsset.kt` | l'agent embarqué : empreinte SHA-384, version, script injecté, états |
| `UserAgent.kt` | l'identité « ordinateur » : agent utilisateur et indications client |
| `LoadProblem.kt` | le classement des incidents de chargement |
| `VersionLabel.kt` | la ligne de version montrée à l'utilisateur |
| `DebugPlan.kt`, `ResultReport.kt`, `SelftestReport.kt` | (débogage) le plan d'essai, le rapport du résultat, le rapport du test automatique |
| `IdentityProvider.kt` | le service de plateforme « obtenir un jeton d'identité » (AUTH-011) : `IdentityProvider`, `IdentityResult`, `IdentityError`, `Cancellation` |
| `LinkOpener.kt` | le service de plateforme « ouvrir une page web dans le navigateur du système » |
| `UpdateSource.kt` | la mise à jour de l'application (DRV-639) : les SEULES adresses qu'elle contacte (écrites en dur), les hôtes de redirection permis, les bornes de taille |
| `ReleaseInfo.kt` | `version.json` lu avec méfiance (quatre champs, code cohérent avec le nom) et la règle « strictement plus récent » |
| `UpdateState.kt` | l'état de la mise à jour (`inconnu`, `aJour`, `miseAJourDisponible`, `telechargement`, `pretAInstaller`, `erreur`), ses codes d'erreur et le message `update.state` |
| `UpdateTransfer.kt` | le téléchargement à travers les règles d'adresses (`SafeFetcher` : redirections jugées une à une, taille bornée, annulation) et le port HTTP `HttpHop` |
| `UpdateFlow.kt` | la mise à jour pas à pas (chercher, télécharger, vérifier l'empreinte SHA-256, effacer dans tous les cas) et les ports `UpdateStorage`, `UpdatePlatform` |

L'application : `android/app/src/main/kotlin/eu/kantin/repas/drive/` (commun aux variantes) et, pour la mise à jour dans l'application, `android/app/src/direct/kotlin/…` et `android/app/src/play/kotlin/…` (une par variante de distribution), tout ce qui touche à Android.

| Fichier | Ce qu'il porte |
|---|---|
| `MainActivity.kt` | la coquille Repas : WebView, pont `repasNative`, liens entrants, menu |
| `DriveActivity.kt` | le drive d'UNE enseigne, second écran (DRV-707) : WebView (en mode ordinateur si le site de l'enseigne le demande), agent injecté, profil, mémoires et textes de cette enseigne |
| `AgentHost.kt` | la colle `androidx.webkit` : injection de l'agent, canal `repasHost`, avec les origines de l'enseigne de l'écran seulement |
| `DesktopMode.kt` | le mode ordinateur appliqué à la WebView d'une enseigne dont le site le demande (`SiteMode.DESKTOP`) |
| `DriveProfile.kt` | le profil de WebView de chaque enseigne (cookies et stockage séparés de Repas et des autres enseignes) |
| `RepasApp.kt` | l'application, son registre des enseignes servies (`sites`) ; les stockages Android (`PrefsPassStore`, `PrefsKeyValueStore`) |
| `AndroidServices.kt` | les services de plateforme d'Android derrière les interfaces du cœur (`AndroidLinkOpener`) |
| `InstalledVersion.kt` | la version installée, lue dans le gestionnaire de paquets |
| `Dialogs.kt`, `Views.kt`, `TextPanel.kt` | fenêtres, vues, écran de texte |
| `SelfUpdate.kt` | ce que la coquille attend de la mise à jour dans l'application : une interface, réalisée par chaque variante de distribution (voir plus bas) |
| `SelfUpdateDirect.kt` | (variante `direct`) la mise à jour : fil de travail, fenêtre d'autorisation, intention d'installation, effacement du fichier |
| `UpdateServices.kt` | (variante `direct`) les services d'Android derrière les ports de la mise à jour : `HttpsHop`, `PrivateUpdateStorage`, `AndroidUpdatePlatform` |
| `SelfUpdatePlay.kt` | (variante `play`) le remplaçant qui répond « non » à tout : `NoSelfUpdate` |

Les tests suivent : `core/src/test` pour tout ce qui se joue sur la JVM seule ; `app/src/test` pour ce qui touche à Android ou à un actif de l'application (`LoadProblemTest` rapproche le classement des constantes de la WebView, `BuildOriginTest` lit `BuildConfig`, `InjectionAssetTest` lit `injection.js`, `DebugRunTest` joue le vrai `debug-plan.json`).

## Les services de plateforme

Quand le cœur a besoin de quelque chose que seule la plateforme sait faire, il le demande par une **interface du cœur** ; l'application l'implémente.

| Interface (cœur) | Ce qu'elle demande | Android | iPhone |
|---|---|---|---|
| `IdentityProvider` | un jeton d'identité, par la feuille de choix du compte de la plateforme (`signIn(clientId, nonce, callback)`) | Credential Manager (AUTH-011, à écrire) | hors portée |
| `LinkOpener` | ouvrir une page web dans le navigateur du système | `AndroidLinkOpener` (`AndroidServices.kt`) | hors portée |
| `PassStore` | garder une valeur texte : le passage non terminé et les résultats à livrer | `PrefsPassStore` (préférence privée, hors sauvegarde) | hors portée |
| `StorePathStore` | garder le chemin du magasin d'UNE enseigne | `RetailerValue` sur `PrefsKeyValueStore` | hors portée |
| `FinalizeOutcomeStore` | garder la forme du dernier « Finaliser » d'UNE enseigne | `RetailerValue` sur `PrefsKeyValueStore` | hors portée |
| `KeyValueStore` | garder des valeurs texte par clé (DRV-706) : le cœur choisit les clés `path.<enseigne>`, `finalize.<enseigne>`, l'application les range | `PrefsKeyValueStore` (préférence privée `drive-store`, DRV-707) | hors portée |
| `HttpHop` | UNE demande `GET` en `https`, sans suivre de redirection (DRV-639) | `HttpsHop` (`HttpsURLConnection`) | hors portée |
| `UpdateStorage` | le dossier privé où l'APK téléchargé attend, seul (DRV-639) | `PrivateUpdateStorage` (`files/update/`) | hors portée |
| `UpdatePlatform` | l'autorisation d'installer et le contrôle du fichier posé (paquet, code, certificat) | `AndroidUpdatePlatform` | hors portée |

- **Pas de `SecureStore`** : rien ne garde de secret aujourd'hui (la connexion Google ne garde pas le jeton). Le jour où quelque chose en aura besoin, on l'ajoute au cœur avec son implémentation.
- **Pas encore d'interface** pour l'écran allumé (`FLAG_KEEP_SCREEN_ON`), la WebView elle-même (injection, pont, profil, mode ordinateur) ni les fenêtres : il n'y a qu'une plateforme, on n'invente pas l'interface avant le second besoin. Les *règles* de ces morceaux sont déjà dans le cœur, c'est ce qui compte.

## Plusieurs enseignes (DRV-706)

Une enseigne est **une donnée, pas une branche de code** : `RetailerSite` (`RetailerSite.kt`) et sa seule liste `RetailerSites` (`RetailerSites.kt` : Leclerc, servie, et Auchan, inscrite et éteinte, DRV-728). Ajouter une enseigne, c'est ajouter une entrée ; `RetailerSitesArchitectureTest` (et `retailer-sites.spec.ts`) échouent si une enseigne est nommée dans le code d'un autre fichier du cœur.

- **Navigation et pont ne sont pas la même liste.** Chaque `SiteHost` dit si le pont `repasHost` et l'agent y existent (`bridge`). Une enseigne peut naviguer sur plusieurs hôtes (la page de connexion, à part) sans que le pont existe sur la page du mot de passe. Les règles d'origine de la WebView (`BridgeMessages.originRules`) se déduisent des seuls hôtes qui portent le pont, de l'ensemble des enseignes **que l'écran ouvre** ; jamais `*`, jamais un joker plus large qu'un nom exact ou `*.domaine`.
- **Une adresse n'est celle que d'une seule enseigne.** `RetailerSites` refuse deux enseignes qui se partagent un nom de site. `NavigationPolicy.decide(site, url)` ne garde dans la WebView que les pages de **l'enseigne de l'écran** ; une page d'une autre enseigne part au navigateur du téléphone.
- **Un plan n'est livré qu'à une page de son enseigne** (`RetailerSite.acceptsPlanOn`, `OpeningWatch.canDeliver(request, url)`) : où le pont existe, et une page de magasin (ou l'accueil pour un plan) quand l'enseigne a des pages de magasin. Un plan est refusé (`INVALID_PLAN`) si son enseigne n'est pas au registre ou si l'hôte de son magasin n'est pas un hôte de **cette** enseigne.
- **Les formes sans enseigne** (`NavigationPolicy.decide(url)`, `START_URL`, `BridgeMessages.isAllowedOrigin(origin)`, `DrivePlan.parse(plan)`…) sont celles de l'enseigne d'avant le multi-enseignes (`RetailerSites.legacy`) : un écran qui n'a pas choisi d'enseigne ne navigue que chez elle. L'écran du drive passe son enseigne partout (DRV-707, voir plus bas).
- **Mémoires par enseigne** : `StorePathMemories` et `FinalizeOutcomeMemories` rangent une valeur par enseigne (`path.<identifiant>`, `finalize.<identifiant>`) sur un `KeyValueStore` ; la valeur unique de l'ancienne version (`path`, `finalize`) est relue comme celle de l'enseigne d'avant, puis déplacée sous sa clé à la première écriture.
- **Annonce** : `RetailerSites.announcedRetailers()` (liste d'identifiants) est ce que `app.info` annonce (champ facultatif `retailers`, DRV-707) : une capacité de l'application, jamais un numéro de version.

### L'écran du drive d'une enseigne (DRV-707)

- **Il s'ouvre sur une enseigne** : l'enseigne du passage en cours, sinon l'extra d'intention `retailer` (`RetailerSites.forScreen` : absent ou inconnu = l'enseigne d'avant). La coquille le donne à chaque ouverture (`drive.start`, `drive.setup`, reprise d'un passage, « Finaliser », menu) ; `drive.setup` porte un `retailer` facultatif, absent = l'enseigne d'avant.
- **Tout est de l'enseigne de l'écran** : navigation (`NavigationPolicy.decide(site, url)` : une adresse d'une autre enseigne part au navigateur du téléphone), accueil, mode du site (`SiteMode` : le mode ordinateur n'est imposé qu'à `DESKTOP`), origines du pont et injection de l'agent (`AgentHost`, avec `BridgeMessages.originRules(listOf(site))`, posées avant le premier chargement), repli d'injection (`site.isBridgePage`), livraison du plan (jamais à l'agent d'un écran d'une autre enseigne), mémoires (`storePaths`, `finalizeOutcomes`), textes.
- **Un profil de WebView par enseigne** (`DriveProfileName`) : `drive` reste celui de l'enseigne d'avant (personne n'est déconnecté par la mise à jour), `drive-<identifiant>` pour les autres. « Se déconnecter {nom} » n'efface que le profil et les mémoires de cette enseigne.
- **Textes** : `strings.xml` ne nomme aucune enseigne ; `%1$s` est le nom, `%2$s` la forme avec « de » (`getString(id, site.name, site.nameDe)`). Le menu de la coquille offre « Ouvrir le drive {nom} » et « Se déconnecter {nom} » pour chaque enseigne que la construction annonce (`RepasApp.announced`, DRV-728 : celles de `RetailerSites.DEFAULT`, plus celles que le drapeau de construction allume ; Leclerc seule dans la version publiée, le menu est celui d'avant).
- **Enseigne d'essai (variante de débogage seulement)** : `app/src/debug/…/TestRetailers.kt` ajoute une enseigne FICTIVE (`*.exemple-b.test`) au registre de `RepasApp.sites` pour que `make android-e2e` prouve l'isolement ; `app/src/release/…/TestRetailers.kt` est vide. Elle n'est jamais annoncée (`app.info`) ni proposée dans un menu.

### Auchan, inscrite et éteinte (DRV-728)

Auchan est une entrée de la table (`RetailerSites.kt`, `SWITCHED_OFF`) **sans être dans le registre de la version publiée** (`DEFAULT`, Leclerc seul). La règle de sécurité (la décision DRV-715, « xhigh ») :

- **Navigation** : `https://www.auchan.fr` et `https://compte.auchan.fr` (la connexion, Keycloak), noms **exacts**, rien d'autre, pas même un autre nom de `auchan.fr`. Les sous-ressources de la page (`api.auchan.fr`, `cdn.auchan.fr`, `dd.ecom.auchan.fr`, `google.com/recaptcha`) ne sont pas des navigations : elles n'y sont pas.
- **Pont et agent** : **uniquement** `https://www.auchan.fr` (`SiteHost.bridge`). Jamais sur `compte.auchan.fr`, la page du mot de passe : aucune règle d'origine ne la nomme, aucun `*.auchan.fr` n'existe. Un plan d'Auchan n'est donc livré qu'à une page de `www.auchan.fr` (`acceptsPlanOn`), et le plan d'une autre enseigne n'y est jamais livré.
- Accueil `https://www.auchan.fr/courses`, mode `AS_IS` (pas de mode ordinateur), **pas de page de magasin** (l'agent lit le magasin), pas de forme de connexion à reconnaître (`loginPath` vide : « choisis d'abord ton magasin » est une règle de Leclerc), identifiant de magasin = un UUID, `store.host` = `www.auchan.fr`.

**Le drapeau de construction qui l'allume** (ou non) : `ANDROID_EXTRA_RETAILERS=auchan` (identifiants séparés par des virgules, **débogage seulement**) → `BuildConfig.EXTRA_RETAILERS` → `RetailerSites.serving(flag)` → `RepasApp.announced` (ce que `app.info` annonce et ce que le menu propose) → `RepasApp.sites` (ce que sert l'application : règles d'origine du pont, écrans, mémoires). Sans drapeau, `serving` rend `DEFAULT` lui-même : la version publiée n'a ni menu d'Auchan, ni annonce, ni origine du pont d'Auchan, et une adresse ou un plan d'Auchan est traité comme celui de n'importe quel autre site (adresse confiée au navigateur, `INVALID_PLAN`). Un identifiant inconnu est refusé, jamais ignoré. **La publication a toujours un drapeau vide** : écrit en dur dans `app/build.gradle.kts`, la variable est **refusée** par une construction de publication (`verifyReleaseInputs`), et `build.sh` le vérifie (`check_distributions` : drapeau vide dans `direct` et `play` + refus de la variable ; `verify-release` : `BuildConfig` de l'APK contrôlé). L'entrée d'Auchan reste, inerte, dans les classes du cœur de **tout** APK (le cœur est commun) : ce qui fait qu'une enseigne est servie est le registre de l'application, pas la présence de son entrée. L'application ne nomme aucune enseigne (`retailer-flag.spec.ts`). Allumer Auchan pour tous, un jour (recette DRV-726), c'est changer cette ligne de `build.gradle.kts`, relue.

Tests : `AuchanSiteTest` (adresses hostiles de Leclerc appliquées à Auchan, `compte.auchan.fr` en navigation sans pont ni agent, isolement entre les deux enseignes réelles, plans, mémoires, profil), `RetailerSitesTest` (`serving`, concordance avec le contrat), `RetailerSitesArchitectureTest` (chaque enseigne n'est nommée que dans `RetailerSites.kt`), `retailer-flag.spec.ts` (le chemin du drapeau jusqu'à la publication).

## Deux variantes de distribution (DRV-639)

Le module `app` a deux **variantes de distribution** (`flavorDimensions` : `distribution`), qui partagent tout le code de `src/main` :

| Variante | Pour qui | Mise à jour dans l'application | Permission `REQUEST_INSTALL_PACKAGES` |
|---|---|---|---|
| `direct` | l'APK de la release GitHub, installé à la main (aujourd'hui, et jusqu'en 2027 au moins) | **oui** : `src/direct` (manifeste, fournisseur de fichiers, `SelfUpdateDirect.kt`, `UpdateServices.kt`) | **oui**, déclarée dans `src/direct/AndroidManifest.xml` seulement |
| `play` | la version de Google Play (à venir, tickets STORE-xxx) : Google interdit à une application distribuée par Play de s'installer ailleurs | **non** : `src/play` n'a que `NoSelfUpdate`, qui répond « non » | **non** |

- Le code commun ne connaît que l'interface `SelfUpdate` et la fonction `createSelfUpdate` que chaque variante définit. `MainActivity` lui passe les messages `update.*` du pont et lit `supported` pour `app.info` (clé `selfUpdate`).
- `./build.sh test` (donc `make android-test`, la CI) construit les deux variantes et **échoue** si la variante `play` porte la permission, le fournisseur de fichiers ou une classe de mise à jour, ou si la permission est dans le manifeste commun (`check_distributions`) ; `android/__tests__/shell.spec.ts` le dit aussi dans `make check`. `make android-release-verify` exige, sur l'APK publié, exactement Internet et `REQUEST_INSTALL_PACKAGES`.
- La logique pure de la mise à jour (adresses permises, version, empreinte, états, effacement) est dans le **cœur**, commune aux deux builds mais inerte : sans permission ni écran d'installation elle ne peut rien installer, et la variante `play` n'a aucun port de plateforme branché dessus. Ce qui télécharge, écrit un fichier et ouvre l'installateur est dans `src/direct`, nulle part ailleurs.
- Un APK de débogage (`src/directDebug/AndroidManifest.xml`) retire la permission et le fournisseur de fichiers : il ne se met jamais à jour lui-même (sa clé de signature est publique, `SelfUpdate.supported` est faux sous `BuildConfig.DEBUG`) et n'a que la permission Internet.
- Le jour où le build Play existe : `bundlePlayRelease` (tâche de la variante `play`) ; rien d'autre à retirer.

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

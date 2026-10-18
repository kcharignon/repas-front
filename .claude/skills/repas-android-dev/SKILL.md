---
name: repas-android-dev
description: Développer l'application Android « Repas Drive » (`android/` du dépôt `kcharignon/repas-front`, Kotlin) du chantier « envoyer la liste au drive Leclerc » : hôte WebView sécurisé en mode ordinateur, injection de l'agent et pont de messages, variante de débogage, signature, émulateur Docker permanent et test de fumée. À utiliser pour tout ticket DRV-311 à DRV-319, tout changement de `android/`, du script `injection.js`, de la signature ou de l'émulateur, et pour les étapes humaines (clé de signature, `assetlinks.json`, KVM).
---

# repas-android-dev — l'application Android

L'application affiche le drive Leclerc dans une **WebView en mode ordinateur**, y injecte l'agent (`drive-agent/dist/agent.js`) et lui parle par un canal restreint. Kotlin, une activité (`MainActivity`), AndroidX réduit au strict nécessaire, `applicationId` `eu.kantin.repas.drive`, `minSdk` 26, `targetSdk` 36. Tout se construit dans Docker (JDK, Gradle, SDK) : rien à installer sur la machine.

## 0. Avant toute chose

1. Lire `android/README.md` (commandes, structure, version, signature, émulateur), `android/PROCEDURE.md`, `CLAUDE.md` du front, puis dans le dépôt back `kcharignon/repas` : `docs/drive/pivot-application-android.md`, `docs/drive/spikes/DRV-011-rapport.md` et `DRV-005-decision-g1.md`, `docs/drive/consignes-agents.md` et le ticket `docs/drive/tickets/DRV-31x-*.md` (sections « Réalisation », « Points laissés », « RÉVISION » : contrats pour la suite).
2. Règles transverses (détail : `consignes-agents.md` du back) : **aucun contact avec Leclerc** (aucun test, aucune émulation ouverte sur le vrai site : le vrai site se visite seulement sur le téléphone de l'utilisateur, recette DRV-505) ; aucune donnée réelle (valeurs factices `123456`, `Ville-Test`) ; jamais de déploiement, de release de production ni de secret ; une PR n'est fusionnée que si **tous** les contrôles de la CI sont verts ; commits courts en français **sans `Co-Authored-By`** ; worktree dédié quand d'autres agents travaillent.
3. État du code (à vérifier avant d'écrire) : en place = hôte WebView (DRV-312), agent embarqué et pont (DRV-313), test automatique de débogage (DRV-318), émulateur et test de fumée (DRV-319, livraison 1). **Pas encore dans le code Android** : la coquille Repas (WebView sur le front Repas), `DriveActivity`, le pont natif `repasNative` et ses messages `drive.*` (DRV-317 et DRV-314, décision D28 ; le côté front existe déjà, voir § 3b), la publication signée par étiquette et la vérification de mise à jour (DRV-315), l'aide d'installation (DRV-316), `make android-e2e` (DRV-319 livraison 2).

## 1. Carte du code (chemins vérifiés)

| Sujet | Où |
|---|---|
| Activité et WebView | `android/app/src/main/kotlin/eu/kantin/repas/drive/MainActivity.kt` (hôte, retour, marges, panneau d'erreur, menu), `DesktopMode.kt`, `Views.kt` |
| Règles en Kotlin pur (testées sans téléphone) | `NavigationPolicy.kt`, `UserAgent.kt`, `LoadProblem.kt`, `AgentAsset.kt`, `BridgeMessages.kt`, `DebugPlan.kt`, `ResultReport.kt`, `SelftestReport.kt`, `VersionLabel.kt` |
| Colle `androidx.webkit` | `AgentHost.kt` (injection, canal `repasHost`, envoi vers l'agent) |
| Script injecté | `android/app/src/main/assets/injection.js` (pont gelé, file de messages, `hello`, marqueur `/*__DEBUG__*/false`) |
| Débogage seulement | `android/app/src/debug/assets/debug-plan.json`, `TextPanel.kt` (copier/partager) |
| Version et signature | `android/app/build.gradle.kts`, `android/buildSrc/` (`AppVersion`), `android/build.sh`, `android/debug.keystore` (clé de débogage **publique**) |
| Empreinte de l'agent | `android/agent.js.sha384`, `android/agent-digest.ts` (`make android-agent-hash`) |
| Tests | `android/app/src/test/kotlin/` (JUnit), `android/__tests__/` (Vitest : `hygiene`, `agent-asset`, `debug-plan`, `injection`) |
| Émulateur | `android/emulator/` (`Dockerfile`, `entrypoint.sh`, `ctl.sh`, `smoke.sh`, `testsite.py`, `testpage.html`), service `android-emulator` de `compose.yaml` |
| CI | `.github/workflows/android.yml` (séparé de `make check`) |

## 2. Commandes

| Commande | Rôle |
|---|---|
| `make android-test` | tests Kotlin (application + dérivation de la version) |
| `make android` | APK de débogage `android/dist/repas-drive-debug.apk` (taille, SHA-256) |
| `make android-release` | APK signé `android/dist/repas-drive.apk` : **refuse sans clé**, sans `ANDROID_VERSION_TAG` (`android-vX.Y.Z`) ni `ANDROID_VERSION_CODE` |
| `make android-release-selftest` | prouve le refus sans clé et la réussite avec une clé jetable créée à l'instant |
| `make android-agent-hash` | note l'empreinte SHA-384 du nouvel agent dans `android/agent.js.sha384` |
| `make android-emulator-up\|down\|status` | émulateur Docker permanent (KVM requis) ; `status` rend 0 seulement s'il a démarré |
| `make android-smoke` | test de fumée sur une page **locale** ; rapport et captures dans `android/dist/smoke/` |

Chaque commande reconstruit d'abord l'agent (`make agent-build`) ; la construction **échoue** si son empreinte n'est pas celle de `agent.js.sha384`. `make check` ne construit pas l'application, mais joue `android/__tests__/` ; jouer aussi `make android-test` dès que `android/` change.

## 3. Règles du domaine : WebView et pont sécurisés

- **Origines** : navigation, injection et canal limités à `https://*.leclercdrive.fr` (`NavigationPolicy` refuse tout ce qui est ambigu : `@`, barre oblique inverse, port, point final, non-ASCII ; un autre site `http(s)` part dans le navigateur du téléphone, tout autre schéma est bloqué). Jamais `*`.
- **Pas de `addJavascriptInterface`.** Un seul canal : `WebViewCompat.addWebMessageListener` (nom `repasHost`, mêmes origines), messages **texte JSON de 64 Ko au plus** dans les deux sens, forme vérifiée par `BridgeMessages` qui ignore (en ne journalisant que la **raison**, jamais le contenu) toute origine, cadre secondaire, non-texte, taille, JSON ou type hors protocole. Même règle pour le futur `repasNative` : **une seule origine** autorisée (celle du front Repas, constante de construction), bornes 64 Ko, refus de toute autre forme.
- **Injection** : `addDocumentStartJavaScript` (repli `evaluateJavascript` après `onPageFinished`, mêmes pages), page principale seulement (le défi anti-robot est un cadre d'un autre site : pas d'agent), une fois. L'agent est un **actif de l'APK** vérifié à la construction et **revérifié au démarrage** (`AgentAsset`) ; altéré ou absent, il n'est jamais injecté. Jamais de code reçu d'un site.
- **Mode ordinateur permanent** (`UserAgent.kt`, `DesktopMode.kt`) : agent utilisateur Linux de bureau sans `wv`, sans `Mobile`, sans `Android` (`Chrome/<majeur>.0.0.0`), indications client cohérentes (plateforme Linux, mobile faux, « Android WebView » renommé « Google Chrome », facteur de forme bureau), fenêtre large et zoom au pincement. Sans cela Leclerc sert son site mobile (`m-courses`) dont les routes sont inconnues. Chaque faiblesse est notée au journal (sans adresse ni contenu) et l'application continue ; sans version de Chrome lisible, l'identité de la WebView reste en place.
- **Réglages** : JavaScript et stockage du DOM actifs, `allowFileAccess`/`allowContentAccess` faux, contenu mixte refusé, `safeBrowsingEnabled`, `usesCleartextTraffic` faux, `allowBackup` faux. Les cookies tiers sont acceptés pour la WebView (anti-robot) : ne rien changer aux cookies sans essai sur téléphone.
- **Cookies et session** : l'utilisateur se connecte **lui-même** ; cookies conservés entre deux ouvertures, jamais lus ni journalisés, exclus de toute sauvegarde ou transfert (`res/xml/data_extraction_rules.xml`) ; « Se déconnecter et effacer les données » (`clearBrowserData`) efface cookies, stockage du site, cache et historique.
- **Une seule permission : Internet** (pas même `ACCESS_NETWORK_STATE`). Toute autre permission est refusée.
- **Écran allumé** : `FLAG_KEEP_SCREEN_ON` au premier plan aujourd'hui ; DRV-314 le restreindra à la durée d'un passage.
- **`targetSdk` 36** : affichage bord à bord obligatoire, marges sous les barres, l'encoche et le clavier par `setOnApplyWindowInsetsListener`; geste « retour » par `OnBackInvokedCallback` (`android:enableOnBackInvokedCallback="true"`), jamais `onBackPressed`. `configChanges` évite que la rotation recharge la page.
- **Variante de débogage ≠ production** : les menus « Test automatique (débogage) » et « Plan d'essai (débogage) » n'existent que sous `BuildConfig.DEBUG` ; `AgentAsset.assemble` remplace le marqueur `/*__DEBUG__*/false` par `true` **seulement** en débogage (l'agent n'honore `selftest` que si la page a annoncé `debug: true`) ; `debug-plan.json` n'est que dans l'APK de débogage. Ne jamais livrer un APK de production avec l'un d'eux.
- **Signature** : aucune clé, mot de passe ni secret dans le dépôt (public ; `hygiene.spec.ts` le vérifie, seule `android/debug.keystore` est suivie). La clé de publication arrive par **quatre variables d'environnement** : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (décodée dans un fichier temporaire du conteneur, effacé en sortie, jamais affichée), plus `ANDROID_VERSION_TAG` et `ANDROID_VERSION_CODE` (compteur qui ne baisse jamais, sinon plus de mise à jour par-dessus). Une valeur de version présente mais invalide est refusée. Débogage et publication n'ont pas la même clé : désinstaller avant de passer de l'un à l'autre.

## 3b. Contrat du pont natif `repasNative` (côté front fait, côté Android à écrire)

Lire `src/features/drive/bridge/native.ts` et `driveBridge.ts` du front : l'application doit s'y conformer, pas l'inverse. Un objet `repasNative` (`addWebMessageListener`, **origine du front Repas seulement**, constante de construction `REPAS_ORIGIN`, jamais `*`) avec `postMessage(texte)` et des événements `message` dont `data` est du **texte JSON `{"v":1,…}` de 64 Ko au plus** (octets UTF-8). Page vers application : `app.info`, `drive.start` (`plan` = message `plan` du protocole v1), `drive.cancel`. Application vers page : `app.info` (`version`, `versionCode` entier, `drive` booléen : agent intact et WebView assez récente), `drive.result` (`result` = message `result` ou `setup-result` valide), `drive.error` (`code` en majuscules `^[A-Z][A-Z0-9_]{0,63}$`, `runId` uuid ou nul), `error` (`code`, pour un message refusé : par exemple `UNKNOWN_TYPE`). Règles à tenir côté Kotlin : un seul passage à la fois ; le résultat est mis en file si la page s'est rechargée ; la WebView du front ne reçoit **jamais** l'agent ni les cookies de Leclerc (deux WebView séparées, `DriveActivity` pour le drive) ; hôtes du drive autorisés écrits en dur (un plan d’un autre hôte, ou de plus de 64 Ko, est refusé) ; reprise 24 h après interruption (identifiant d'exécution et plan, aucun cookie).

## 4. Émulateur Docker permanent et test de fumée

- **Jamais Leclerc** : le DNS de l'émulateur (`dnsmasq`) envoie `*.leclercdrive.fr` vers un faux site HTTPS local (`10.0.2.2`, `testsite.py`) et ne résout **rien d'autre** ; `make android-smoke` s'arrête avant d'ouvrir quoi que ce soit si ce nom ne pointe pas vers `10.0.2.2`, et le journal du DNS prouve qu'aucune demande n'est partie. Seul le premier lancement va sur Internet (SDK chez Google). Certificat jetable dans le volume, accepté par la WebView par `--ignore-certificate-errors-spki-list` écrit dans l'émulateur seulement (image Google APIs « userdebug », pas Play Store) : l'application n'est pas modifiée.
- **KVM** (`/dev/kvm`) : sans lui l'émulateur est inutilisable et les commandes refusent de démarrer (code 3). Sous WSL2, **étape humaine** : `sudo modprobe kvm_intel && sudo chmod 666 /dev/kvm` (`kvm_amd` sur AMD), à refaire à chaque redémarrage de WSL, ou une fois pour toutes dans `/etc/wsl.conf` (`[boot]` → `command = modprobe kvm_intel && chmod 666 /dev/kvm`, sans écraser un `[boot]` existant) puis `wsl --shutdown` côté Windows. C’est une étape humaine (système de l’utilisateur, droits `sudo`) : l’agent la demande en une étape à la fois, au lieu de la faire.
- **Permanent** : SDK, image système (Android 14 Google APIs x86_64) et AVD `repas` dans le volume Docker `repas-front_android-emulator-sdk` (≈ 2 Go téléchargés, 6 Go sur disque, 2 min 45 la première fois, ≈ 30 s ensuite). Profil Compose à part (`make stop` ne l'arrête pas). Réglages : `EMULATOR_MEMORY` (3072 Mo), `EMULATOR_CORES` (4). Pour repartir de zéro : `make android-emulator-down` puis `docker volume rm repas-front_android-emulator-sdk`.
- **Le verdict attendu du test de fumée est « KO avec `Arrêt : UNSUPPORTED_PAGE` »** pour le test automatique : la page locale n'est pas une page de magasin ; ce qui compte est que le rapport arrive (26 contrôles OK). Exit 0 = tout passe, 1 = échec (voir `rapport.txt` et `journal-android.txt`), 3 = KVM manque.
- **Lire les captures avant de conclure** : `android/dist/smoke/01-page-locale.png`, `02-menu.png`, `03-diagnostic-agent.png`, `04-rapport-selftest.png` et `rapport.txt` ; un « OK » sans avoir regardé les images ne prouve rien.
- La CI n'a pas KVM : l'émulateur est une cible **manuelle**, `make check` n'y touche pas. Les scénarios complets (coquille Repas, faux site Leclerc de DRV-309 : `drive-agent/fake-leclerc/`, déjà fait côté agent, servi en HTTP sur la boucle locale ; il reste à y ajouter HTTPS avec l'autorité de test et à l'atteindre depuis l'émulateur) sont la livraison 2 de DRV-319.

## 5. Recettes

### 5.1 Modifier l'application (Kotlin)
Mettre la règle dans une classe **Kotlin pur** (sans classe Android) avec ses tests JUnit, la coller ensuite dans `MainActivity`/`AgentHost` → `make android-test` → `make android` → `make android-smoke` si le pont, l'injection ou le menu changent → lire les captures. Tout ce qui touche `DesktopMode`/`MainActivity` ne se prouve que sur téléphone : le dire dans « À relire » (recette de l'utilisateur).

### 5.2 Le pont ou `injection.js` change
Garder la forme attendue par `drive-agent/src/transport/bridge.ts` (`postMessage(texte)` et `addEventListener('message', …)`), tester dans `android/__tests__/injection.spec.ts` (jsdom, agent réel, faux site), borner (64 Ko) et valider côté Kotlin **et** côté agent. Le message `hello` n'est pas du protocole.

### 5.3 L'agent a changé
`make agent-build` puis `make android-agent-hash`, commiter `android/agent.js.sha384`, le dire dans la PR (voir `repas-agent-dev`).

### 5.4 Publier (étapes humaines : l'assistant ne voit jamais les secrets)
Clé de signature créée (`keytool`, dans Docker) et sauvegardée par l'utilisateur, hors du dépôt (la perdre empêche toute mise à jour par-dessus), puis déposée en secrets GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) ; `/.well-known/assetlinks.json` (empreinte du certificat) publié par le front pour les liens `https://kantin.eu/…` (DRV-317) ; installation à la main hors Google Play (la vérification d'identité des développeurs d'Android est à surveiller). La pré-version `android-dev-<date>` (workflow lancé à la main, APK de débogage) n'est **jamais** une release de production ; les étiquettes `vX.Y.Z` sont réservées à `release.yml`.

## 6. Definition of Done

- [ ] `make android-test` et `make android` verts ; `make check` vert (dont `hygiene` et `agent-asset`) ; `make android-release-selftest` si `build.sh` ou la signature changent
- [ ] `make android-smoke` joué et ses captures **lues** si le pont, l'injection, le menu ou la WebView changent (sinon dire pourquoi non)
- [ ] Aucune permission ajoutée, aucun objet natif exposé, aucune clé ni donnée réelle ; menus de débogage sous `BuildConfig.DEBUG`
- [ ] README `android/` à jour (en français, pas à pas pour les étapes humaines) ; PR (Quoi / Vérifié / À relire) ; `gh pr checks` tout vert, puis `gh pr merge --squash --delete-branch`, `gh issue close <n>`

## 7. Erreurs fréquentes

- Oublier `make android-agent-hash` (la construction échoue) ou `ANDROID_VERSION_CODE` en publication.
- Ajouter `addJavascriptInterface` « pour aller plus vite », ou un `*` dans les origines.
- Passer par `onBackPressed` (jamais appelé en `targetSdk` 36) ou oublier les marges (contenu sous les barres).
- Laisser une fonction de débogage hors `BuildConfig.DEBUG` ; mélanger APK de débogage et de publication sur le téléphone.
- Ouvrir le vrai Leclerc dans l'émulateur, ou conclure d'un test de fumée sans regarder les captures.
- Écrire dans le journal Android une adresse, un cookie ou le contenu d'un message.

## 8. Interdits

Contacter Leclerc ; exposer un objet natif aux pages ; demander une permission autre qu'Internet ; mettre une clé, un mot de passe ou un secret dans le dépôt, une PR ou le chat ; créer une release de production (`vX.Y.Z`, ou `android-vX.Y.Z` sans que l'utilisateur l'ait demandé) ; modifier les secrets GitHub ; `--no-verify`, force-push, push sur `main` ; fusionner une PR dont un contrôle n'est pas vert.

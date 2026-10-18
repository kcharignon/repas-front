# Repas Drive : l'application Android

L'application Android du chantier « envoyer la liste de courses au drive Leclerc » (tickets `DRV-311` à `DRV-316`, dépôt back `docs/drive/`). Elle affiche le drive Leclerc dans une WebView en mode ordinateur, y injectera l'agent de `drive-agent/` et rendra le résultat à Repas. **Écrite en Kotlin, une seule activité, AndroidX réduit au strict nécessaire.**

État : **hôte WebView** (DRV-312) et **agent embarqué** (DRV-313). L'application ouvre le drive en plein écran, en mode ordinateur, et l'utilisateur s'y connecte lui-même ; l'agent de `drive-agent/` est injecté dans ses pages, avec un canal de messages réservé à `*.leclercdrive.fr`. Le passage du plan reçu de Repas (DRV-314) et la publication signée (DRV-315) viennent ensuite.

> `drive-agent/android-lab/` est l'application de test jetable du spike (DRV-011). Elle reste en place, avec le banc d'essai `drive-agent/lab/`, jusqu'à la fin du jalon M3b ; ce dossier-ci la prolonge sans la modifier.

## Commandes

Tout se lance dans Docker (image : JDK 17, Gradle, SDK Android ; rien à installer sur la machine). La première construction télécharge les outils, les suivantes réutilisent le cache.

| Commande | Rôle |
|---|---|
| `make android-agent-hash` | note l'empreinte SHA-384 de l'agent construit dans `android/agent.js.sha384` (après un changement voulu de l'agent) |
| `make android` | construit l'APK de débogage : `android/dist/repas-drive-debug.apk`, avec sa taille et son empreinte SHA-256 |
| `make android-test` | joue les tests Kotlin : ceux de l'application et ceux de la dérivation de la version (`buildSrc`) |
| `make android-release` | construit l'APK signé `android/dist/repas-drive.apk` ; **refuse sans clé de signature**, sans étiquette ou sans compteur de version |
| `make android-release-selftest` | prouve le refus sans clé et la réussite avec une clé jetable créée à l'instant (rien n'est conservé) |

Chaque commande Android reconstruit d'abord l'agent (`make agent-build`, Node dans Docker) : `agent.js` est un actif de l'APK (voir plus bas). La CI le construit avec `setup-node` puis passe `ANDROID_AGENT=` aux commandes `make` pour ne pas relancer Node dans Docker. La CI (`.github/workflows/android.yml`, séparée de `make check`) joue `make android-test`, `make android` et `make android-release-selftest` ; l'APK de débogage est déposé en artefact du run. Elle ne tourne que si `android/`, l'agent (`drive-agent/src`, `protocol`, `scripts`, `package*.json`), son workflow, `compose.yaml` ou le `Makefile` changent. Lancé à la main sur `main` (`gh workflow run android.yml --ref main`, avec au besoin `-f tag=android-dev-2026-10-18b` pour choisir l'étiquette), il publie aussi l'APK de débogage en **pré-version GitHub** `android-dev-<date>` (jamais une release de production ; mode d'emploi : `PROCEDURE.md`). L'image de construction est mise en cache par GitHub Actions.

## Structure

```
android/
  Dockerfile, build.sh      image de construction et script lancé dedans (test, apk, release, release-selftest)
  settings.gradle.kts, build.gradle.kts, gradle.properties
  buildSrc/                 la dérivation de la version (AppVersion), en Kotlin pur, avec ses tests
  app/
    build.gradle.kts        applicationId eu.kantin.repas.drive, minSdk 26, targetSdk 36, signatures, version
    src/main/kotlin/eu/kantin/repas/drive/
      MainActivity.kt       l'hôte : WebView plein écran, retour arrière, marges, panneau d'erreur, menu
      DesktopMode.kt        le mode ordinateur appliqué à la WebView (agent utilisateur, indications client, fenêtre large, zoom)
      NavigationPolicy.kt   la règle de navigation (seules les pages https de leclercdrive.fr restent dans l'application)
      UserAgent.kt          l'identité « ordinateur » : agent utilisateur, indications client, repli si elles manquent (Kotlin pur)
      LoadProblem.kt        le classement des incidents de chargement, affichés en français avec « Réessayer » (Kotlin pur)
      Views.kt              les petits outils de vue (boutons, étiquettes, dp)
      AgentHost.kt          la colle androidx.webkit : injection de l'agent, canal repasHost, envoi vers l'agent
      AgentAsset.kt         l'agent embarqué : empreinte, version, script injecté, états (Kotlin pur)
      BridgeMessages.kt     les règles du canal : origines, 64 Ko, forme du JSON, commande de diagnostic (Kotlin pur)
      DebugPlan.kt          (débogage) le plan d'essai et son déroulement en deux messages (Kotlin pur)
      ResultReport.kt       (débogage) le résultat de l'agent en texte à copier, sans numéro de magasin entier (Kotlin pur)
      SelftestReport.kt     (débogage) le rapport du test automatique : sa forme, le masquage, et `SelftestRun` (n'accepte que le rapport demandé) (Kotlin pur)
      TextPanel.kt          (débogage) l'écran de texte : « Copier », « Partager » (feuille de partage), « Fermer », copie automatique du rapport
      VersionLabel.kt       la ligne de version montrée à l'utilisateur
    src/main/assets/injection.js   ce que l'application évalue dans chaque page du drive : met en place le pont, puis lance l'agent
    src/debug/assets/debug-plan.json  le plan d'essai (dans l'APK de débogage seulement)
    src/test/kotlin/...     tests JUnit (Kotlin pur, sans téléphone)
  agent.js.sha384           l'empreinte attendue de l'agent embarqué (la construction échoue sinon)
  agent-digest.ts           la vérifier ou la noter (`make android-agent-hash`)
  __tests__/               tests Vitest : pas de clé dans le dépôt (hygiene), empreinte de l'agent (agent-asset), plan d'essai (debug-plan), pont, mode débogage et agent réel dans jsdom, dont le test automatique de bout en bout avec un faux site (injection)
  debug.keystore            clé de débogage PUBLIQUE (mot de passe « android »), la seule clé suivie par Git
```

`NavigationPolicy`, `UserAgent` et `LoadProblem` sont écrites sans classe Android pour se tester sans téléphone ; `DesktopMode` et `MainActivity` n'en sont que la colle, à essayer sur un téléphone (recette de l'utilisateur).

## L'agent embarqué (DRV-313)

- **Un actif de l'APK.** `drive-agent/dist/agent.js` (construit par `make agent-build`) est copié dans l'application à la construction (tâche Gradle `prepareAgentAsset`), qui **échoue** si son empreinte SHA-384 n'est pas celle de `agent.js.sha384`. Une modification de l'agent (ou de sa chaîne de construction) change l'empreinte : `make android-agent-hash`, relire, commiter le fichier et le dire dans la PR. `make check` le détecte aussi (`__tests__/agent-asset.spec.ts` compare le fichier, une construction fraîche et `manifest.json`). À l'exécution l'application revérifie l'empreinte avant d'injecter quoi que ce soit (`AgentAsset`) ; un agent absent ou altéré n'est jamais injecté et la fenêtre « Version » le dit.
- **Injection.** `WebViewCompat.addDocumentStartJavaScript` évalue `injection.js` (le pont, puis l'agent) avant tout script des pages `https://*.leclercdrive.fr`, jamais `*` ; si la WebView ne l'offre pas, repli par `evaluateJavascript` après `onPageFinished`, pour les mêmes pages. L'agent ne démarre que dans la page principale (un cadre, comme le défi anti-robot, n'en reçoit pas), une seule fois, et reste silencieux tant qu'aucun message n'arrive.
- **Canal.** `WebViewCompat.addWebMessageListener`, nom `repasHost`, mêmes origines. **Pas de `addJavascriptInterface`.** `injection.js` remplace l'objet natif par un objet gelé à la forme exacte qu'attend l'agent (`postMessage(texte)` et `addEventListener('message', …)`, voir `bridgeTransport`), garde en file les messages arrivés avant l'agent, et annonce la page par un premier message `{"v":1,"type":"hello"}` : c'est lui qui donne à l'application le canal de réponse vers cette page, par lequel partent tous ses messages (le canal natif n'en a pas d'autre).
- **Messages.** JSON du protocole v1, en texte, 64 Ko au plus dans les deux sens. Application vers agent : `plan`, `setup`, `command` (`diagnostic`, et `selftest` en débogage). Agent vers application : `result`, `setup-result`, `selftest-result` (`progress` et `log` sont acceptés mais l'agent n'en envoie pas encore). `BridgeMessages` ignore, en n'écrivant au journal que la raison, tout message d'une origine autre que `https://<sous-domaine>.leclercdrive.fr`, d'un cadre secondaire, qui n'est pas du texte, trop gros, qui n'est pas du JSON objet de version 1 ou de type inconnu. L'application ne les interprète pas, sauf `result` (suite : DRV-314).
- **Mode débogage.** `injection.js` porte un marqueur `/*__DEBUG__*/false` que `AgentAsset.assemble` remplace par `true` dans la variante de débogage (`BuildConfig.DEBUG`) et par `false` partout ailleurs. À `true`, le pont de la page porte `isDebug` (gelé) et le message d'accueil devient `{"v":1,"type":"hello","debug":true}` : seul cas où l'agent honore la commande `selftest`. `AgentHost.openSelftest()` n'envoie la commande que si l'application est la variante de débogage et si la page a annoncé `debug: true`.
- **Diagnostic de l'agent.** L'entrée du menu envoie `{"v":1,"type":"command","command":"diagnostic"}` ; l'agent ouvre son écran de diagnostic dans la page. Jamais de fragment d'adresse sur les pages du drive.
- **Plan d'essai (variante de débogage seulement).** `BuildConfig.DEBUG` ajoute au menu « Plan d'essai (débogage) » : l'application envoie `setup` (l'agent lit le magasin de la page et demande de le confirmer), puis un plan synthétique de quatre ingrédients (`src/debug/assets/debug-plan.json`, validé par `validatePlan` dans `__tests__/debug-plan.spec.ts`, sans produit mémorisé, avec `needed`), puis montre le résultat de l'agent dans un écran de texte copiable (numéro de magasin réduit à ses trois derniers chiffres, ni libellé, ni adresse, ni cookie). L'APK de publication n'a ni ce menu ni ce fichier.
- **Test automatique (variante de débogage seulement, DRV-318).** « Test automatique (débogage) » remplace la procédure manuelle d'une trentaine d'essais : un seul geste, un seul rapport. L'application vérifie qu'une page du drive est ouverte, envoie la commande `selftest` ; l'agent enchaîne sans autre action le diagnostic (huit contrôles), la lecture du magasin, un lot de 12 recherches en série, puis un essai de 3 produits (premier candidat en stock pour trois exemplaires, hors panier ; quantité 1, puis 3 puis 2 sur le premier, puis retrait de tout et comparaison du panier avant et après), à la cadence normale (800 ms + gigue). Garde-fous : 3 produits au plus, quantité 3 au plus, arrêt immédiat sur blocage, nettoyage toujours tenté. L'agent rend un message `selftest-result` (le rapport en texte) ; `SelftestRun` ne l'accepte que si l'application vient de le demander ; `SelftestReport` le revérifie et masque tout de même adresses, e-mails et numéros de six chiffres ou plus ; `TextPanel` le copie dans le presse-papiers à l'ouverture, avec « Copier » et « Partager ». Mode d'emploi pour l'utilisateur : `PROCEDURE.md`.

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
- **Aucun objet natif exposé aux pages** (pas de `addJavascriptInterface`) : seul un canal de messages restreint à `*.leclercdrive.fr` (DRV-313). Le code qui tourne dans les pages est `injection.js` et `agent.js`, tous deux dans l'APK et vérifiés : jamais de code reçu d'un site.
- **Une seule permission : Internet**. Jamais d'autre (pas de position, de fichiers ni de contacts). `ACCESS_NETWORK_STATE` n'est pas demandée non plus : « hors connexion » se déduit de l'erreur de la WebView.
- **Données synthétiques** dans les tests : aucun vrai numéro de magasin, nom de ville, cookie ou HTML d'enseigne (dépôt public). Aucun essai ne contacte `leclercdrive.fr` depuis la CI : le site se visite seulement sur le téléphone de l'utilisateur (recette, DRV-505).
- `targetSdk` 36 : depuis Android 15 l'écran passe sous les barres du système (bord à bord). La racine de l'écran garde ses marges sous les barres du système, les encoches et le clavier (`setOnApplyWindowInsetsListener`) ; le spike restait en 34 pour éviter ce travail. Le geste « retour » passe par `OnBackInvokedCallback` (Android 13 et plus) : la méthode `onBackPressed` n'y est plus appelée.
- Gradle est lancé sans démon, plugins et dépendances épinglés (`build.gradle.kts`, `app/build.gradle.kts`), image de construction épinglée par empreinte (`Dockerfile`). Une mise à jour d'outil se fait à la main, une PR par chantier.

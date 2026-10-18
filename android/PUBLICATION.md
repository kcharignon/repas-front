# Publier l'application Repas (version signée) et l'installer sur le téléphone des courses

Procédure **pour l'utilisateur**, une étape à la fois (l'assistant te guide et vérifie après chaque étape). Elle sert **une fois** (clé, secrets, `assetlinks.json`), puis à chaque nouvelle version (étapes 5 à 8). Ticket DRV-315, workflow [`android-release.yml`](../.github/workflows/android-release.yml).

## Ce qu'il faut savoir avant de commencer

- La version « de production » de l'application est un **fichier `.apk` signé avec ta clé**, publié dans une *release* GitHub. Elle est installée à la main, sans Google Play. Les mises à jour se font en installant le nouveau fichier **par-dessus**.
- **Ta clé de signature est la chose la plus importante** : si tu la perds, plus aucune version ne peut s'installer par-dessus l'ancienne (il faudrait désinstaller puis réinstaller, et refaire la connexion à Leclerc). Fais **deux copies** (étape 1).
- **Jamais de clé, de mot de passe ni de secret dans le chat avec l'assistant, dans un commit ou dans une PR** (le dépôt est public). L'assistant ne les voit jamais : tu les tapes toi-même dans ton terminal.
- **Les pré-versions `android-dev-…` (essais de débogage) et `android-lab-…` (banc d'essai) ne s'installent jamais sur le téléphone des courses.** Elles sont signées d'une **clé de débogage publique** (n'importe qui peut fabriquer un fichier qui s'installe par-dessus), l'application est débogable et porte des menus d'essai. Seule une release dont le nom commence par `android-v` **sans** la mention « Pre-release » est la bonne.
- Seul **toi** pousses l'étiquette `android-vX.Y.Z` qui déclenche la publication. Le workflow ne se déclenche ni sur une PR, ni sur `main`, ni à la main, et refuse de publier sans clé.

## Vue d'ensemble

| Étape | Qui | Quoi | Quand |
|---|---|---|---|
| 1 | toi | créer la clé de signature et la sauvegarder | une fois |
| 2 | toi | noter l'empreinte (publique) du certificat et la donner à l'assistant | une fois |
| 3 | toi | poser les 4 secrets GitHub | une fois |
| 4 | l'assistant (PR) puis toi (release du site) | publier `assetlinks.json` sur `kantin.eu` | une fois, **avant** la première version |
| 5 | toi | pousser l'étiquette `android-vX.Y.Z` | à chaque version |
| 6 | toi | vérifier la release | à chaque version |
| 7 | toi | installer sur le téléphone | la première fois |
| 8 | toi | mettre à jour par-dessus | à chaque version suivante |

## Étape 1. Créer la clé de signature (une fois)

**But** : fabriquer le fichier qui prouve que les versions viennent de toi. Aucun JDK à installer : on utilise celui de Docker.

1. Dans un terminal, crée un dossier **hors du dépôt** (jamais dans `repas-front`) :

   ```bash
   mkdir -p ~/repas-cle && chmod 700 ~/repas-cle
   ```

2. Crée la clé (Docker doit tourner) :

   ```bash
   docker run --rm -it --user "$(id -u):$(id -g)" -v "$HOME/repas-cle:/cle" eclipse-temurin:17.0.20_8-jdk-jammy \
     keytool -genkeypair -keystore /cle/repas-publication.p12 -storetype PKCS12 \
     -alias repas -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Repas"
   ```

   - Il te demande un **mot de passe** (deux fois). Choisis-en un long (ton gestionnaire de mots de passe peut le générer) et **enregistre-le dans le gestionnaire tout de suite** : sans lui, le fichier est inutilisable. Pour ce type de fichier, le mot de passe de la clé est le même que celui du fichier : il n'y en a qu'un.
   - Ne mets **ni ton nom ni ton e-mail** dans `-dname` : ce texte est public (il est dans l'application).
   - `-validity 10000` : la clé vaut environ 27 ans.

3. Vérifie que le fichier existe : `ls -l ~/repas-cle/repas-publication.p12` puis `chmod 600 ~/repas-cle/repas-publication.p12`.

4. **Sauvegarde** (obligatoire) : copie `repas-publication.p12` à **deux endroits qui ne sont pas ce PC** (par exemple une clé USB rangée à la maison et un espace de stockage chiffré), et garde le mot de passe dans ton gestionnaire de mots de passe. Teste une copie : la commande de l'étape 2 doit marcher avec elle.

**Résultat attendu** : un fichier `~/repas-cle/repas-publication.p12`, deux copies, un mot de passe dans ton gestionnaire. **Dis « fait » à l'assistant** (sans rien copier du fichier ni du mot de passe).

## Étape 2. Noter l'empreinte du certificat (une fois)

**But** : l'empreinte est une signature **publique** de ta clé. Elle sert à deux choses : le site `kantin.eu` la déclare pour que les liens s'ouvrent dans l'application (étape 4), et le workflow **refuse de publier** si le fichier n'est pas signé par cette clé.

```bash
docker run --rm -it -v "$HOME/repas-cle:/cle:ro" eclipse-temurin:17.0.20_8-jdk-jammy \
  keytool -list -v -keystore /cle/repas-publication.p12 -alias repas
```

Tape le mot de passe quand il le demande. Cherche la ligne qui commence par **`SHA256:`**, par exemple `SHA256: AA:BB:CC:...` (32 groupes de deux caractères séparés par `:`). **Copie cette ligne dans le chat, à l'assistant** : elle n'a rien de secret. Il ouvre alors la PR de l'étape 4.

## Étape 3. Poser les quatre secrets dans GitHub (une fois)

**But** : donner la clé au workflow, et à lui seul. GitHub chiffre les secrets : une fois posés, personne ne peut les relire (même pas toi), seul le workflow les utilise.

**Les quatre noms, à l'identique :**

| Nom du secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | le fichier `repas-publication.p12` encodé en base64 (une seule ligne) |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe de l'étape 1 |
| `ANDROID_KEY_ALIAS` | `repas` |
| `ANDROID_KEY_PASSWORD` | **le même** mot de passe que `ANDROID_KEYSTORE_PASSWORD` |

**Avec le terminal** (`gh` doit être connecté : `gh auth status`) :

```bash
base64 -w0 ~/repas-cle/repas-publication.p12 | gh secret set ANDROID_KEYSTORE_BASE64 -R kcharignon/repas-front
gh secret set ANDROID_KEYSTORE_PASSWORD -R kcharignon/repas-front
gh secret set ANDROID_KEY_ALIAS -R kcharignon/repas-front --body repas
gh secret set ANDROID_KEY_PASSWORD -R kcharignon/repas-front
```

Pour les deux mots de passe, `gh` te demande la valeur (elle ne s'affiche pas quand tu la tapes ; elle n'entre pas dans l'historique du terminal). Colle le même mot de passe deux fois.

**Sans le terminal** : sur `https://github.com/kcharignon/repas-front/settings/secrets/actions`, bouton « New repository secret », un secret à la fois. Pour le premier, ouvre le fichier encodé : `base64 -w0 ~/repas-cle/repas-publication.p12 > /tmp/cle.b64`, colle son contenu, puis **supprime** `/tmp/cle.b64` (`rm /tmp/cle.b64`).

**Vérifier** : `gh secret list -R kcharignon/repas-front` doit lister les quatre noms (jamais les valeurs). **Dis « fait » à l'assistant.**

## Étape 4. Publier `assetlinks.json` sur kantin.eu (une fois, avant la première version)

**But** : sans ce fichier, un lien `https://kantin.eu/…` reçu par e-mail (confirmation d'adresse) s'ouvre dans le navigateur au lieu de l'application. Et le workflow s'en sert pour savoir **quelle empreinte** il doit trouver sur l'APK : sans lui, il refuse de publier (l'ordre compte).

**Le fichier exact** : `public/.well-known/assetlinks.json` dans le dépôt `repas-front`, servi sur `https://kantin.eu/.well-known/assetlinks.json` :

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "eu.kantin.repas.drive",
      "sha256_cert_fingerprints": ["<L'EMPREINTE SHA256 DE L'ÉTAPE 2, AVEC LES « : »>"]
    }
  }
]
```

**Ce que fait l'assistant** (toi, tu n'as rien à écrire) :

1. Il crée le fichier avec **ton** empreinte, dans une PR du dépôt front (un test vérifie la forme du fichier, qu'il ne déclare que `eu.kantin.repas.drive` et **jamais** l'empreinte de la clé de débogage), puis il la fusionne.
2. **Toi** : tu publies une version du site, comme d'habitude (`gh release create vX.Y.Z --target main --generate-notes`, puis « Approve and deploy » sur la page du run, l'assistant te guide).

**Comment c'est servi** (rien à changer ailleurs) : Vite recopie `public/` tel quel dans l'image du site ; le Caddy du front (`docker/Caddyfile`) sert d'abord le fichier s'il existe (`try_files {path} /index.html`), avec le type `application/json` ; la bordure Caddy du back (`deploy/Caddyfile`) envoie tout ce qui n'est ni `/api` ni `/images` vers le front, **sans redirection**. Aucun changement n'est nécessaire dans `deploy/` du back.

**Vérifier** (avec `curl`, pas avec le navigateur : l'application web installable peut y répondre par la page d'accueil) :

```bash
curl -sSI https://kantin.eu/.well-known/assetlinks.json   # attendu : 200, content-type: application/json, pas de ligne « location: »
                                                           # (si le fichier manque, le site répond aussi 200, mais « text/html » : regarde le type)
curl -sS  https://kantin.eu/.well-known/assetlinks.json   # ton empreinte, et rien d'autre
curl -sS "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://kantin.eu&relation=delegate_permission/common.handle_all_urls"
```

La troisième commande demande à Google de lire le fichier comme le fera Android : elle doit renvoyer ton application et ton empreinte. **Dis « fait » à l'assistant.**

## Étape 5. Pousser l'étiquette (à chaque version)

**But** : c'est ce geste, et lui seul, qui lance la publication. L'étiquette doit être de la forme `android-vX.Y.Z` (X, Y, Z : des nombres) et le numéro **ne doit jamais baisser** : le code de version de l'application en est tiré (`android-v1.2.3` donne 1 002 003), et Android refuse une version plus basse que celle installée. Le workflow refuse une étiquette plus ancienne que la dernière publiée.

- Première version : `android-v0.1.0`. Ensuite : `android-v0.1.1` (petit correctif), `android-v0.2.0` (nouveauté ou changement de l'agent), `android-v1.0.0` quand la version est jugée stable.
- **Ne réutilise jamais un numéro déjà publié.**

```bash
cd ~/Projet/repas-front        # ton dépôt local
git switch main && git pull --ff-only
git tag --list 'android-v*' | sort -V      # les versions déjà publiées
git tag android-v0.1.0                     # le nouveau numéro, plus grand que tous les autres
git push origin android-v0.1.0
```

(le commit doit être dans `main`, déjà relu et fusionné : c'est vérifié.) Suivre la publication (environ 15 minutes, l'image de construction est lourde) :

```bash
gh run list --workflow "Android release" -R kcharignon/repas-front --limit 3
gh run watch <numéro du run> -R kcharignon/repas-front
```

Si le run échoue, il dit pourquoi et **rien n'a été publié** :

| Message | Cause | Que faire |
|---|---|---|
| « Pas de clé de signature » | un des quatre secrets manque | étape 3, puis `gh run rerun <numéro> -R kcharignon/repas-front` |
| « assetlinks.json manque » ou « vide » | étape 4 non faite | l'étape 4, puis `gh run rerun` |
| « le certificat de signature … n'est pas l'un de ceux attendus » | mauvaise clé dans les secrets, ou empreinte du fichier fausse | vérifier l'empreinte de l'étape 2 et les secrets ; demander à l'assistant |
| « une étiquette plus récente existe déjà » | numéro trop bas | une étiquette plus grande |
| « le commit … n'est pas dans main » | tu as étiqueté une branche non fusionnée | étiqueter un commit de `main` |
| « Agent altéré » | l'agent embarqué n'a pas l'empreinte notée dans `android/agent.js.sha384` | le dire à l'assistant (ne pas publier) |

Pour recommencer après un correctif dans le code, prends un **nouveau numéro** (`android-v0.1.1`). Si une étiquette a été poussée par erreur et qu'aucune release n'existe : `git push --delete origin android-v0.1.0 && git tag -d android-v0.1.0`.

## Étape 6. Vérifier la release (à chaque version)

1. Sur `https://github.com/kcharignon/repas-front/releases` : la release « Repas Android 0.1.0 » est là, **sans** la mention « Pre-release », avec trois fichiers : `repas-drive.apk`, `repas-drive.apk.sha256` et `version.json`. Ses notes donnent l'empreinte SHA-256 de l'APK, la version de l'agent embarqué et l'empreinte du certificat (la même que dans `assetlinks.json`).
2. Sur ton PC, vérifie que le fichier téléchargé est intact :

   ```bash
   mkdir -p ~/telechargements-repas && cd ~/telechargements-repas
   gh release download android-v0.1.0 -R kcharignon/repas-front
   sha256sum -c repas-drive.apk.sha256        # attendu : repas-drive.apk: OK
   ```

3. (Facultatif) le certificat, après avoir construit l'image une fois avec `make android-test` :

   ```bash
   docker run --rm -v "$HOME/telechargements-repas:/d:ro" --entrypoint bash repas-front-android:latest \
     -c '$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs /d/repas-drive.apk | grep SHA-256'
   ```

   L'empreinte affichée (sans les `:`, en minuscules) doit être celle de l'étape 2.

Ce que le workflow a déjà contrôlé avant de publier : agent embarqué = `android/agent.js.sha384`, tests Kotlin verts, signature valide avec le certificat attendu (et jamais la clé de débogage), version et code conformes à l'étiquette, **une seule permission (Internet)**, application **non débogable**, aucun plan d'essai ni menu de débogage (`BuildConfig.DEBUG` faux), origine `https://kantin.eu/`.

## Étape 7. Installer sur le téléphone (la première fois)

**À savoir d'abord** : si une **pré-version** `android-dev-…` ou l'ancienne « Repas Drive » est installée, **désinstalle-la d'abord** (appui long sur l'icône, « Infos sur l'appli », « Désinstaller ») : elle est signée d'une autre clé, Android refuse de mettre la nouvelle par-dessus. Cela efface la connexion à Leclerc dans l'application : tu la referas. Tes recettes et tes listes sont sur ton compte Repas, elles ne bougent pas.

1. Sur le téléphone, dans **Chrome**, va sur `https://github.com/kcharignon/repas-front/releases` (tape l'adresse toi-même), ouvre la version la plus récente dont le nom commence par **`android-v`** et **sans** « Pre-release », puis touche **`repas-drive.apk`** dans « Assets ». (L'aide de Repas, « Mon compte » puis « Installer l'application Android », explique la même chose.)
2. Quand le téléchargement est fini, touche « Ouvrir ». Si Android dit qu'il ne peut pas installer d'applications inconnues depuis Chrome, touche « Paramètres », active « Autoriser depuis cette source », reviens en arrière, puis « Installer ».
3. Si **Play Protect** avertit que l'application ne vient pas de Google Play : « Plus de détails » puis « Installer quand même » (seulement si tu as pris le fichier sur la page GitHub ci-dessus).
4. Touche « Ouvrir », connecte-toi à Repas.
5. **Vérifie la version** : « Mon compte », « Drive », « Menu de l'application », « Version et mode d'emploi » : la ligne doit être du genre `Version 0.1.0 (numéro 1000), construction abc1234`, **sans** « , débogage ». Il n'y a pas de petit bouton rond **⋮** sur le bord droit de l'écran (il n'existe que dans la version de débogage).
6. **Vérifie le lien vérifié** (une fois `assetlinks.json` publié) : envoie-toi un e-mail avec un lien `https://kantin.eu/…` et ouvre-le : il doit s'ouvrir **dans l'application**, sans demander de choisir. Si ce n'est pas le cas : contrôle l'étape 4 ; sur Android 12 et plus, « Paramètres », « Applications », « Repas », « Ouvrir par défaut » permet d'ajouter `kantin.eu` à la main ; avec le téléphone branché et l'assistant : `adb shell pm get-app-links eu.kantin.repas.drive` doit dire `kantin.eu: verified` (`adb shell pm verify-app-links --re-verify eu.kantin.repas.drive` relance la vérification).

## Étape 8. Mettre à jour par-dessus (à chaque version suivante)

1. L'assistant et toi : nouvelle étiquette plus grande (étape 5), release vérifiée (étape 6).
2. Sur le téléphone : télécharge le nouveau `repas-drive.apk` comme à l'étape 7 et installe-le **sans désinstaller** : Android propose « Mettre à jour » et **garde tout** (connexion à Repas, connexion à Leclerc).
3. Vérifie le numéro de version (étape 7, point 5).
4. « Application non installée » ou conflit : la version installée n'est pas signée de ta clé (une pré-version de débogage). Désinstalle-la, puis installe la nouvelle. Si c'est bien la tienne, vérifie que le numéro de la nouvelle version est **plus grand** que celui installé.

*(La vérification automatique « Une nouvelle version est disponible » dans l'application n'existe pas encore : `version.json`, publié avec chaque release, est fait pour elle. En attendant, la mise à jour se fait à la main, comme ci-dessus.)*

## Si la clé est perdue, volée ou à changer

- **Perdue** (plus de fichier, plus de copie, ou mot de passe oublié) : aucune version ne pourra plus s'installer par-dessus l'ancienne. Il faut créer une nouvelle clé (étape 1), **ajouter** sa nouvelle empreinte dans `assetlinks.json` (à côté de l'ancienne pendant la transition), remplacer les quatre secrets, publier une version, et chaque téléphone doit **désinstaller puis réinstaller** (connexion à Leclerc à refaire). Pour que ce soit rare : les deux copies de l'étape 1, testées une fois par an.
- **Volée ou divulguée** : dans GitHub, supprime tout de suite les quatre secrets (`gh secret delete ANDROID_KEYSTORE_BASE64 -R kcharignon/repas-front`, etc.), puis même démarche que ci-dessus avec une nouvelle clé, et retire l'ancienne empreinte de `assetlinks.json`.

## À surveiller : l'identité des développeurs Android

Google annonce une vérification d'identité des développeurs d'applications, **même hors Google Play**, par étapes à partir de fin 2026 (avec un compte gratuit pour un usage limité à quelques appareils). Avant la première publication, l'assistant vérifie ce qu'il en est pour la France et te dit si une inscription est nécessaire (`docs/drive/pivot-application-android.md` du dépôt back, « inconnue 6 »).

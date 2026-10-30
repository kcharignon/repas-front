# Publier l'application Repas (version signée) et l'installer sur le téléphone des courses

Procédure **pour l'utilisateur**, une étape à la fois (l'assistant te guide et vérifie après chaque étape). Elle sert **une fois** (clé, secrets, `assetlinks.json`), puis à chaque nouvelle version (étapes 5 à 8). Ticket DRV-315, workflow [`android-release.yml`](../.github/workflows/android-release.yml).

> **Mise à jour du 2026-10-20 (phase bêta, jusqu'à la 1.0.0).** Le déploiement du site n'a plus d'approbation manuelle (plus de « Approve and deploy ») et l'assistant principal crée lui-même les releases du site et pousse l'étiquette `android-vX.Y.Z`, une fois le back et le site déployés quand le protocole change. Les passages où c'est « toi » qui publies, pousses ou approuves sont corrigés ; s'il en reste un, il décrit l'ancien régime. La dernière version est toujours à des adresses fixes, celles de la release roulante `android-latest` (`releases/download/android-latest/{version.json,repas-drive.apk}`, voir plus bas). Inchangé : la clé de signature et les secrets restent à toi, jamais dans le chat ; les sous-agents ne publient rien ; le passage à la 1.0.0 remettra une approbation. Détail : `CLAUDE.md`, « Livrer en production ».

## Ce qu'il faut savoir avant de commencer

- **Plusieurs enseignes (DRV-711).** Une seule application sert toutes les enseignes : publier une version ne change pas celles qui sont allumées (c'est `DRIVE_RETAILERS` côté back, acte de l'humain). Une version qui ajoute une enseigne se publie **éteinte côté back** (l'application l'annonce, DRV-738 pour Auchan ; Repas ne la propose pas tant que `DRIVE_RETAILERS` ne l'allume pas), après le site (règle « le site avant l'application ») ; `build.sh` vérifie que la publication annonce Auchan. « Se déconnecter de {enseigne} » n'efface que le profil de CETTE enseigne ; le mot « Leclerc » de cette procédure est l'exemple de la première.

- La version « de production » de l'application est un **fichier `.apk` signé avec ta clé**, publié dans une *release* GitHub. Elle est installée à la main, sans Google Play. Les mises à jour se font en installant le nouveau fichier **par-dessus**.
- **Ta clé de signature est la chose la plus importante** : si tu la perds, plus aucune version ne peut s'installer par-dessus l'ancienne (il faudrait désinstaller puis réinstaller, et refaire la connexion à Leclerc). Fais **deux copies** (étape 1).
- **Jamais de clé, de mot de passe ni de secret dans le chat avec l'assistant, dans un commit ou dans une PR** (le dépôt est public). L'assistant ne les voit jamais : tu les tapes toi-même dans ton terminal.
- **Les pré-versions `android-dev-…` (essais de débogage) et les anciennes `android-lab-…` (banc d'essai, retiré) s'il en reste ne s'installent jamais sur le téléphone des courses.** Elles sont signées d'une **clé de débogage publique** (n'importe qui peut fabriquer un fichier qui s'installe par-dessus), l'application est débogable et porte des menus d'essai. Seule une release dont le nom commence par `android-v` **sans** la mention « Pre-release » est la bonne.
- Seule l'étiquette `android-vX.Y.Z` déclenche la publication ; depuis le 2026-10-20 (phase bêta), c'est l'assistant principal qui la pousse (jamais un sous-agent, qui s'arrête à la PR verte). Le workflow ne se déclenche ni sur une PR, ni sur `main`, ni à la main, et refuse de publier sans clé.

## Vue d'ensemble

| Étape | Qui | Quoi | Quand |
|---|---|---|---|
| 1 | toi | créer la clé de signature et la sauvegarder | une fois |
| 2 | toi | noter l'empreinte (publique) du certificat et la donner à l'assistant | une fois |
| 3 | toi | poser les 4 secrets GitHub | une fois |
| 4 | l'assistant (PR, puis release du site) | publier `assetlinks.json` sur `kantin.eu` | une fois, **avant** la première version |
| 5 | l'assistant (phase bêta) | pousser l'étiquette `android-vX.Y.Z` | à chaque version |
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
2. **L'assistant** publie une version du site (`gh release create vX.Y.Z --target main --generate-notes`) ; depuis le 2026-10-20 (phase bêta), le déploiement part seul quand la CI est verte, sans « Approve and deploy ».

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

**But** : c'est ce geste, et lui seul, qui lance la publication. Depuis le 2026-10-20 (phase bêta), l'assistant principal le fait ; un sous-agent ne le fait jamais. L'étiquette doit être de la forme `android-vX.Y.Z` (X, Y, Z : des nombres) et le numéro **ne doit jamais baisser** : le code de version de l'application en est tiré (`android-v1.2.3` donne 1 002 003), et Android refuse une version plus basse que celle installée. Le workflow refuse une étiquette plus ancienne que la dernière publiée.

- Première version : `android-v0.1.0`. Ensuite : `android-v0.1.1` (petit correctif), `android-v0.2.0` (nouveauté ou changement de l'agent), `android-v1.0.0` quand la version est jugée stable.
- **Ne réutilise jamais un numéro déjà publié.**
- **Ordre quand le protocole change : le site d'abord, l'application ensuite.** Quand un message entre l'application et Repas gagne un champ (par exemple le champ `stats` du résultat, ajouté avec l'agent 0.15.0), un récepteur qui ne connaît pas ce champ **rejette tout le message**. L'application qui embarque le nouvel agent enverrait alors un résultat que l'ancien site refuse. Donc : **déploie d'abord le site** (release `vX.Y.Z` du front, approbation du déploiement, `https://kantin.eu/` qui répond), **puis seulement** pousse l'étiquette `android-vX.Y.Z` de l'application qui embarque cet agent. L'ordre inverse est sans danger : un site plus récent lit les messages d'une application plus ancienne, puisqu'un champ ajouté est facultatif. En cas de doute (l'agent a-t-il changé dans cette version ?), demande à l'assistant : la version de l'agent est dans les notes de la release et dans `drive-agent/src/version.ts`.

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

1. Sur `https://github.com/kcharignon/repas-front/releases` : la release « Repas Android 0.1.0 » est là, **sans** la mention « Pre-release », avec cinq fichiers : **`repas-drive-X.Y.Z.apk`** (le numéro de version est dans le nom : c'est le fichier à donner aux proches) et son `.sha256`, `repas-drive.apk` et son `.sha256` (le **même** fichier, octet pour octet, sous un nom qui ne change jamais : pour les liens et la documentation), et `version.json`. Ses notes donnent l'empreinte SHA-256 de l'APK, la version de l'agent embarqué et l'empreinte du certificat (la même que dans `assetlinks.json`).
2. Sur ton PC, vérifie que le fichier téléchargé est intact :

   ```bash
   mkdir -p ~/telechargements-repas && cd ~/telechargements-repas
   gh release download android-v0.1.0 -R kcharignon/repas-front
   sha256sum -c repas-drive-0.1.0.apk.sha256  # attendu : repas-drive-0.1.0.apk: OK
   sha256sum -c repas-drive.apk.sha256        # attendu : repas-drive.apk: OK (le même fichier)
   cmp repas-drive-0.1.0.apk repas-drive.apk  # attendu : aucune sortie (identiques)
   ```

3. (Facultatif) le certificat, après avoir construit l'image une fois avec `make android-test` :

   ```bash
   docker run --rm -v "$HOME/telechargements-repas:/d:ro" --entrypoint bash repas-front-android:latest \
     -c '$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs /d/repas-drive-0.1.0.apk | grep SHA-256'
   ```

   L'empreinte affichée (sans les `:`, en minuscules) doit être celle de l'étape 2.

Ce que le workflow a déjà contrôlé avant de publier : agent embarqué = `android/agent.js.sha384`, tests Kotlin verts, signature valide avec le certificat attendu (et jamais la clé de débogage), version et code conformes à l'étiquette, **deux permissions seulement** (Internet, et `REQUEST_INSTALL_PACKAGES` pour la mise à jour dans l'application, voir plus bas), application **non débogable**, aucun plan d'essai ni menu de débogage (`BuildConfig.DEBUG` faux), origine `https://kantin.eu/`.

> **Deux noms pour le même fichier.** Chaque release joint l'APK signé sous **deux noms** : `repas-drive-X.Y.Z.apk` (le nom dit la version ; **c'est celui qu'on donne aux proches** et celui que la page d'aide de Repas désigne) et `repas-drive.apk` (nom **stable**, jamais renommé : il reste pour les liens existants, la documentation et le futur outil de mise à jour, et `version.json` y pointe). C'est une copie octet pour octet faite par le workflow **après** la signature et le contrôle, jamais une seconde construction : les deux ont la même empreinte SHA-256. Les releases antérieures n'ont que `repas-drive.apk`. Attention : `releases/latest/download/…` ne mène pas à l'application, car « Latest » est réservé aux releases du site (`--latest=false`).

## Adresses fixes vers la dernière version : la release « android-latest »

Les numéros changent à chaque version ; l'application (mise à jour) et le site (page d'installation) ont besoin d'une adresse qui ne change pas. À chaque publication, après la release de la version, le workflow met à jour une seconde release, d'étiquette **`android-latest`** (titre « Repas Android, dernière version (adresses fixes) »). Elle contient **toujours et seulement** les cinq fichiers de la dernière version, les mêmes octets que la release `android-vX.Y.Z` :

```text
https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk
https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk.sha256
https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive-X.Y.Z.apk      (X.Y.Z : la dernière version)
https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive-X.Y.Z.apk.sha256
https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json
```

L'adresse **sans numéro** à retenir : `…/releases/download/android-latest/repas-drive.apk` (et `version.json` pour connaître la version). `releases/latest/download/…` ne sert à rien ici : « Latest » reste aux releases du site.

- **Elle ne lance rien** : l'étiquette `android-latest` ne ressemble pas à `android-vX.Y.Z` (le seul déclencheur), `release.yml` (le site) ignore toute étiquette `android-`, et elle n'est jamais « Latest » (`--latest=false`, vérifié). Le travail n'a besoin d'aucun droit de plus que celui d'écrire des releases, qu'il avait déjà, et d'aucun secret.
- **Ordre de la mise à jour** (GitHub ne remplace pas plusieurs fichiers d'un coup) : 1. `repas-drive-X.Y.Z.apk` puis son `.sha256` (noms nouveaux, personne ne les attend encore) ; 2. `repas-drive.apk` puis `repas-drive.apk.sha256` ; 3. `version.json`, **en dernier** (c'est lui qui annonce la version : il ne change que quand tout le reste est en place) ; 4. retrait des fichiers versionnés des versions précédentes ; 5. titre et notes. Remplacer un fichier le supprime puis le renvoie : pendant quelques secondes, un téléchargeur peut voir un fichier absent (404) ou une empreinte qui ne correspond pas encore à l'APK ; il n'a qu'à recommencer, et un outil qui compare l'APK à l'empreinte de `version.json` refuse un fichier incohérent au lieu de l'installer. La première fois, la release est créée avec les cinq fichiers d'un coup.
- **Contrôle fait par le workflow** : exactement les cinq fichiers, `sha256sum -c` des deux empreintes, `cmp` de chaque fichier avec celui de la release de la version, et les adresses fixes de `repas-drive.apk` et de `version.json` téléchargées avec les mêmes octets.
- **Si la publication échoue à moitié** (la release `android-vX.Y.Z` est bonne mais le dernier pas est rouge, ou la release roulante est incomplète) : relancer le run (`gh run rerun <numéro> -R kcharignon/repas-front --failed`) ou, à la main, le bloc ci-dessous, qui sert aussi à **amorcer** la release roulante à partir d'une version déjà publiée. Il part de la release `android-vX.Y.Z` (déjà signée, jamais reconstruite), recrée les fichiers au nom versionné par copie, vérifie, puis remplace dans le même ordre que le workflow :

```bash
VERSION=0.1.26                      # la dernière version publiée (sans « android-v »)
R=kcharignon/repas-front
cd "$(mktemp -d)"
gh release download "android-v$VERSION" -R "$R" --pattern repas-drive.apk --pattern repas-drive.apk.sha256 --pattern version.json
sha256sum -c repas-drive.apk.sha256
cp repas-drive.apk "repas-drive-$VERSION.apk" && sha256sum "repas-drive-$VERSION.apk" > "repas-drive-$VERSION.apk.sha256"
if gh release view android-latest -R "$R" > /dev/null 2>&1; then
  for f in "repas-drive-$VERSION.apk" "repas-drive-$VERSION.apk.sha256" repas-drive.apk repas-drive.apk.sha256 version.json; do
    gh release upload android-latest "$f" -R "$R" --clobber
  done
  gh release view android-latest -R "$R" --json assets --jq '.assets[].name' | grep -vF -e "repas-drive-$VERSION.apk" -e repas-drive.apk -e version.json \
    | while read -r old; do gh release delete-asset android-latest "$old" -R "$R" --yes; done
else
  gh release create android-latest repas-drive.apk repas-drive.apk.sha256 "repas-drive-$VERSION.apk" "repas-drive-$VERSION.apk.sha256" version.json -R "$R" \
    --target "$(gh api "repos/$R/commits/android-v$VERSION" --jq .sha)" --latest=false \
    --title "Repas Android, dernière version (adresses fixes)" \
    --notes "Cette release contient toujours les fichiers de la dernière version de l'application Android (actuellement $VERSION), à des adresses qui ne changent pas. Release de la version : https://github.com/$R/releases/tag/android-v$VERSION"
fi
gh release view android-latest -R "$R" --json assets,isDraft --jq '.isDraft, (.assets[].name)'   # attendu : false, puis les cinq noms
curl -fsSL https://github.com/$R/releases/download/android-latest/version.json                 # attendu : la version $VERSION
curl -fsSL https://github.com/$R/releases/download/android-latest/repas-drive.apk | sha256sum   # attendu : l'empreinte de repas-drive.apk.sha256
```

## Étape 7. Installer sur le téléphone (la première fois)

**À savoir d'abord** : si une **pré-version** `android-dev-…` ou l'ancienne « Repas Drive » est installée, **désinstalle-la d'abord** (appui long sur l'icône, « Infos sur l'appli », « Désinstaller ») : elle est signée d'une autre clé, Android refuse de mettre la nouvelle par-dessus. Cela efface la connexion à Leclerc dans l'application : tu la referas. Tes recettes et tes listes sont sur ton compte Repas, elles ne bougent pas.

1. Sur le téléphone, dans **Chrome**, va sur `https://github.com/kcharignon/repas-front/releases` (tape l'adresse toi-même), ouvre la version la plus récente dont le nom commence par **`android-v`** et **sans** « Pre-release », puis touche **`repas-drive-X.Y.Z.apk`** dans « Assets » (le fichier dont le nom se termine par le numéro de version : Chrome ne le confond plus avec un téléchargement précédent, et le plus grand numéro est le plus récent). (L'aide de Repas, « Moi » puis « Installer l'application Android », explique la même chose.)
2. Quand le téléchargement est fini, touche « Ouvrir ». Si Android dit qu'il ne peut pas installer d'applications inconnues depuis Chrome, touche « Paramètres », active « Autoriser depuis cette source », reviens en arrière, puis « Installer ».
3. Si **Play Protect** avertit que l'application ne vient pas de Google Play : « Plus de détails » puis « Installer quand même » (seulement si tu as pris le fichier sur la page GitHub ci-dessus).
4. Touche « Ouvrir », connecte-toi à Repas.
5. **Vérifie la version** : « Moi », « Drive », « Menu de l'application », « Version et mode d'emploi » : la ligne doit être du genre `Version 0.1.0 (numéro 1000), construction abc1234`, **sans** « , débogage ». Il n'y a pas de petit bouton rond **⋮** sur le bord droit de l'écran (il n'existe que dans la version de débogage).
6. **Vérifie le lien vérifié** (une fois `assetlinks.json` publié) : envoie-toi un e-mail avec un lien `https://kantin.eu/…` et ouvre-le : il doit s'ouvrir **dans l'application**, sans demander de choisir. Si ce n'est pas le cas : contrôle l'étape 4 ; sur Android 12 et plus, « Paramètres », « Applications », « Repas », « Ouvrir par défaut » permet d'ajouter `kantin.eu` à la main ; avec le téléphone branché et l'assistant : `adb shell pm get-app-links eu.kantin.repas.drive` doit dire `kantin.eu: verified` (`adb shell pm verify-app-links --re-verify eu.kantin.repas.drive` relance la vérification).

## Étape 8. Mettre à jour par-dessus (à chaque version suivante)

1. L'assistant et toi : si le protocole a changé, le site est déjà déployé (étape 5, « Ordre quand le protocole change ») ; nouvelle étiquette plus grande (étape 5), release vérifiée (étape 6).
2. Sur le téléphone : télécharge le nouveau `repas-drive-X.Y.Z.apk` (le plus grand numéro) comme à l'étape 7 et installe-le **sans désinstaller** : Android propose « Mettre à jour » et **garde tout** (connexion à Repas, connexion à Leclerc).
3. Vérifie le numéro de version (étape 7, point 5).
4. « Application non installée » ou conflit : la version installée n'est pas signée de ta clé (une pré-version de débogage). Désinstalle-la, puis installe la nouvelle. Si c'est bien la tienne, vérifie que le numéro de la nouvelle version est **plus grand** que celui installé.
5. **Une fois la release publiée** (pas avant : sinon les téléphones seraient invités à une version qui n'existe pas encore), l'assistant dit au serveur quelle est la dernière version : `APP_LATEST_VERSION`, écrit par le script `ecrire-app-version.sh` du skill `repas-ops` (dépôt back), comme `DRIVE_ENABLED`. Les personnes dont l'application est plus ancienne voient alors, en haut de « Moi », « Une nouvelle version de l'application est prête. » et un bouton « Mettre à jour » vers le mode d'emploi (DRV-637) ; l'administrateur les voit « À mettre à jour » dans la liste des comptes. Rien n'est bloqué.

*(L'application envoie sa version au serveur une fois par connexion, au démarrage : c'est ce qui permet le bandeau et la colonne de l'administration. Depuis la version qui embarque la mise à jour dans l'application (DRV-639), elle cherche aussi elle-même une version plus récente et se met à jour d'un seul geste : voir « La mise à jour dans l'application » plus bas. Cette étape 8, à la main, ne sert plus qu'à la **première** installation de cette version, et aux téléphones dont l'application est plus ancienne.)*

## La mise à jour dans l'application (DRV-639)

**Ce que voit l'utilisateur.** Dans « Moi », le bandeau « Une nouvelle version de l'application est prête. » (ou la page d'aide) porte un bouton **« Mettre à jour »**. Il fait tout : l'application télécharge la nouvelle version dans son espace privé (une barre avance), vérifie son empreinte, puis ouvre l'écran d'installation d'Android : il ne reste qu'à toucher « Installer ». La toute première fois, Android demande une autorisation (« Installer des applications inconnues », une phrase d'explication avant, une seule fois). Ni GitHub, ni Chrome, ni le dossier « Téléchargements » : aucun fichier « repas-drive (1).apk » ne s'accumule, le fichier téléchargé est effacé après l'installation (ou, si l'installation est annulée, à l'écran d'installation fermé et au démarrage suivant).

**D'où vient la version.** L'application lit `version.json` **à une seule adresse, écrite en dur** dans `UpdateSource.kt` : `https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json`, le fichier de la release « roulante » `android-latest` (voir « Adresses fixes vers la dernière version » plus haut ; `releases/latest/download/…` ne mène pas à l'application). Elle ne propose « Mettre à jour » que si le `versionCode` du fichier est **strictement plus grand** que le sien. L'adresse de l'APK n'est **pas** lue dans le fichier (`apkUrl` est ignoré) : elle est calculée du nom de version (`…/releases/download/android-v<X.Y.Z>/repas-drive.apk`), donc une release qui ne change plus. GitHub redirige le téléchargement vers un hôte de pièces jointes : seuls `release-assets.githubusercontent.com`, `objects.githubusercontent.com` et `github-releases.githubusercontent.com` sont suivis, en `https`, un à un ; tout autre hôte arrête la mise à jour (aucune installation). Si GitHub change ce nom un jour, la mise à jour affichera « La mise à jour n'a pas pu se faire » : il faut alors l'ajouter à `UpdateSource.DOWNLOAD_HOSTS` (une PR relue).

**Ce qui est vérifié avant d'ouvrir l'installateur** : taille au plus 25 Mo (l'APK en fait environ 1,2) ; empreinte SHA-256 de `version.json` (calculée à la réception puis **relue sur le disque** juste avant l'installateur) ; le fichier est bien **cette** application (même nom de paquet), de code de version **annoncé** et **strictement plus grand** que l'installé, non débogable, et du même certificat quand Android le dit. Tout écart : rien n'est installé, le fichier est effacé, une phrase s'affiche. **La vérification de signature d'Android n'est jamais contournée** : l'écran d'installation du système compare le certificat à celui de l'application installée (même clé de publication) et refuse un autre, ou un code plus bas. L'empreinte de `version.json` ne protège pas d'un dépôt compromis (le fichier et l'APK viennent du même dépôt) : seule la clé de signature le fait.

**Deux variantes de distribution.** `android/app` a deux variantes : **`direct`** (l'APK de la release GitHub, installé à la main : c'est celle-ci qui est publiée, `make android-release` construit `assembleDirectRelease`) et **`play`** (la version de Google Play, à venir, tickets STORE : Google interdit à une application distribuée par Play de s'installer ailleurs). La permission `REQUEST_INSTALL_PACKAGES`, le fournisseur de fichiers privé et tout le code de mise à jour sont **dans `direct` seulement** (`app/src/direct`) ; la variante `play` n'en contient **ni la permission ni ce code** (`app/src/play` n'a qu'un remplaçant qui répond « non »), et `build.sh test` (la CI) échoue si c'est faux. Le build Play, le jour venu, se construit par `bundlePlayRelease` : rien à retirer. Les APK de débogage (`android-dev-…`) ne se mettent jamais à jour eux-mêmes (clé publique) et n'ont que la permission Internet.

**Ordre de publication.** Le site (page `/installer`, bouton) et l'application sont indépendants : le site s'adapte (une application qui ne dit pas `selfUpdate` garde l'ancien lien vers l'aide). La mise à jour dans l'application n'existe que dans les versions **publiées après** ce changement : **une dernière installation à la main** de cette première version, puis les suivantes se mettent à jour toutes seules. La release roulante `android-latest` doit exister (le workflow la tient à jour depuis la PR #190 ; sinon l'amorcer avec le bloc de la section plus haut).

### Essai de la mise à jour sur le téléphone (à faire une fois par l'utilisateur)

À jouer avec deux versions **publiées** (signées de la clé de publication ; un APK de débogage ne convient pas) : N (installée à la main) puis N+1.

1. Installe N à la main (page `/installer` du site, ou étape 7). Ouvre l'application et connecte-toi.
2. Publie N+1 (étape 5, une étiquette plus grande ; le workflow met à jour `android-latest`). Vérifie : `curl -fsSL https://github.com/kcharignon/repas-front/releases/download/android-latest/version.json` dit N+1.
3. Dans l'application : « Moi ». Le bandeau « Une nouvelle version de l'application est prête. » apparaît (même sans que le serveur connaisse `APP_LATEST_VERSION`, l'application cherche elle-même). Touche **« Mettre à jour »**.
4. Android demande « Autoriser » une seule fois : une phrase de Repas, puis les réglages d'Android (« Autoriser depuis cette source »), reviens : le téléchargement démarre tout seul.
5. La barre avance, puis « Touche « Installer » dans l'écran d'Android. » et l'écran d'installation d'Android s'ouvre : touche « Installer », puis « Ouvrir ».
6. Vérifie : « Moi » → « Menu de l'application » → « Version et mode d'emploi » dit N+1 ; le bandeau a disparu.
7. **Le fichier est effacé** : avec le téléphone branché, `adb shell run-as eu.kantin.repas.drive ls files/update` doit dire « No such file or directory » (ou un dossier vide) ; sinon, ouvre l'application une fois de plus (le démarrage efface). Et `adb shell ls /sdcard/Download | grep repas` ne doit rien montrer (rien n'est jamais écrit dans « Téléchargements »).
8. Annulation : rejoue 3 à 5 en touchant « Annuler » (ou « retour ») sur l'écran d'installation : le bandeau revient avec « Mettre à jour », et `files/update` est vide.
9. Hors connexion (mode avion) : « Mettre à jour » donne une phrase (« Pas de connexion pour le moment. ») et « Réessayer », rien d'autre.

## Le site s'adapte à l'application (principe)

Le site et l'application se publient séparément, et une personne peut garder une ancienne application longtemps sans le savoir. Le site, lui, est toujours à jour : il est chargé en direct dans l'application. **C'est donc le site qui s'adapte à l'application, jamais l'inverse.**

- Une fonction du site qui a besoin d'une application récente (un message nouveau du pont, un champ que l'agent embarqué doit connaître, une ouverture de Leclerc que l'ancienne application ne sait pas suivre) **demande d'abord sa version à l'application** (`driveBridge.info()`), la compare **nombre par nombre** (`compareVersions` de `src/features/drive/appVersion.ts` : `0.1.10` est au-dessus de `0.1.9`) et, pour une application plus ancienne ou qui ne dit pas sa version, **retombe sur un comportement sûr** : ce qui marchait avant, ou une invitation à mettre à jour, jamais une erreur muette.
- Les seuils sont écrits **à un seul endroit**, `src/features/drive/appVersion.ts` :
  - `MIN_DRIVE_APP_VERSION` : en dessous, l'envoi au drive n'est pas proposé (une phrase « Mets à jour l'application… », un bouton vers le mode d'emploi, les recherches à la main), et la liste n'est jamais verrouillée ;
  - `RAYON_HINTS_APP_VERSION` : en dessous, le site n'envoie pas les rayons conseillés (un agent plus ancien refuserait tout le plan) et la liste garde l'ordre du site.
  Une nouvelle exigence ajoute sa constante à côté, avec sa raison et la première version publiée qui la remplit ; on ne relève un seuil que pour un changement de l'application, jamais pour un changement du seul site.
- La version donnée par l'application n'accorde aucun droit : elle ne sert qu'à choisir le bon comportement et à informer (bandeau de « Moi », administration).
- Avec ce principe, l'ordre de publication ne casse rien pour l'utilisateur : un site récent sait parler à une ancienne application. La seule exception reste l'étape 5 (« Ordre quand le protocole change ») : un champ nouveau envoyé par l'application à un site qui ne le connaît pas encore.

## Si la clé est perdue, volée ou à changer

- **Perdue** (plus de fichier, plus de copie, ou mot de passe oublié) : aucune version ne pourra plus s'installer par-dessus l'ancienne. Il faut créer une nouvelle clé (étape 1), **ajouter** sa nouvelle empreinte dans `assetlinks.json` (à côté de l'ancienne pendant la transition), remplacer les quatre secrets, publier une version, et chaque téléphone doit **désinstaller puis réinstaller** (connexion à Leclerc à refaire). Pour que ce soit rare : les deux copies de l'étape 1, testées une fois par an.
- **Volée ou divulguée** : dans GitHub, supprime tout de suite les quatre secrets (`gh secret delete ANDROID_KEYSTORE_BASE64 -R kcharignon/repas-front`, etc.), puis même démarche que ci-dessus avec une nouvelle clé, et retire l'ancienne empreinte de `assetlinks.json`.

## À surveiller : l'identité des développeurs Android

Google annonce une vérification d'identité des développeurs d'applications, **même hors Google Play**, par étapes à partir de fin 2026 (avec un compte gratuit pour un usage limité à quelques appareils). Avant la première publication, l'assistant vérifie ce qu'il en est pour la France et te dit si une inscription est nécessaire (`docs/drive/pivot-application-android.md` du dépôt back, « inconnue 6 »).

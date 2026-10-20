# 0009 — L'application Android se met à jour elle-même (variante hors Google Play)

- **Statut** : Accepted
- **Date** : 2026-10-20
- **Liens** : [0008](0008-envoi-de-la-liste-au-drive.md), `android/ARCHITECTURE.md`, `android/PUBLICATION.md`, ticket DRV-639 et [ADR 0025](https://github.com/kcharignon/repas/blob/main/docs/adr/0025-publication-sur-google-play.md) du dépôt back (la variante Google Play n'aura **pas** cette fonction)

## Contexte

L'application Android est distribuée hors Google Play, par un APK d'une release GitHub, jusqu'en 2027 au moins. Pour la mettre à jour, un proche devait ouvrir GitHub, trouver la bonne étiquette, télécharger le fichier (Chrome ajoute « (1) », « (2) »…), le retrouver dans ses fichiers et l'ouvrir. Demande de l'utilisateur (2026-10-20) : « simplifier ça, pour mes proches néophytes ».

## Décision

1. **Un seul bouton, « Mettre à jour », fait tout** (bandeau de « Moi » et page d'aide) : l'application cherche une version plus récente, télécharge l'APK dans son espace privé, vérifie son empreinte SHA-256, ouvre l'installateur d'Android (fournisseur de fichiers privé, intention d'installation) et efface le fichier après coup. L'utilisateur touche « Installer ». La permission « Installer des applications inconnues » est demandée une seule fois, avec une phrase.
2. **Le pont natif gagne des messages facultatifs** (protocole v1 inchangé pour qui ne les connaît pas) : `update.status|check|start|cancel` et la réponse `update.state` (`inconnu`, `verification`, `aJour`, `miseAJourDisponible`, `telechargement` + `progress`, `pretAInstaller`, `erreur` + `code`), et la clé `selfUpdate` de `app.info`. La page ne donne **ni adresse, ni version, ni empreinte**. Une application qui ne dit pas `selfUpdate` (ancienne, débogage, Google Play) garde l'ancien comportement : le bandeau renvoie vers l'aide, qui propose le téléchargement à la main.
3. **Adresses fixes, écrites en dur à un seul endroit** (`UpdateSource.kt`) : le `version.json` de la release « roulante » d'étiquette `android-latest` (le workflow la remplace à chaque version ; `releases/latest/download/` ne mène pas à l'application, « Latest » étant aux releases du site, `--latest=false`) ; l'APK est demandé à l'adresse de **sa** release (`android-vX.Y.Z`), **calculée** du nom de version validé : `apkUrl` de `version.json` est ignoré. Les redirections de GitHub vers ses hôtes de pièces jointes sont suivies une à une, en `https`, vers une liste fermée de trois noms ; tout autre hôte arrête la mise à jour.
4. **Vérifications avant l'installateur** : taille bornée (25 Mo), empreinte de `version.json` (flux reçu, fichier relu, puis une troisième fois juste avant l'installateur), paquet = cette application avec le code annoncé, strictement plus grand que l'installé, non débogable, même certificat quand Android le dit. La signature d'Android n'est jamais contournée ni assouplie (aucune installation silencieuse, aucun `PackageInstaller`). L'empreinte ne protège pas d'un dépôt compromis (même dépôt pour le fichier et l'APK) : seule la clé de signature le fait.
5. **Effacement dans tous les cas** : erreur de réseau, taille, empreinte, paquet refusé, annulation, exception, installateur fermé, et démarrage suivant de la coquille (pas du processus : le fournisseur de fichiers peut le provoquer pendant qu'Android installe).
6. **Deux variantes de distribution** (`flavorDimensions` : `direct`, `play`). La permission `REQUEST_INSTALL_PACKAGES`, le fournisseur de fichiers et le code qui télécharge et installe sont dans `app/src/direct` ; `app/src/play` n'a qu'un remplaçant qui répond « non ». `build.sh test` construit les deux et échoue si `play` contient l'un des trois, ou si la permission est dans le manifeste commun ; `make android-release-verify` exige exactement Internet et `REQUEST_INSTALL_PACKAGES` sur l'APK publié. Un APK de débogage retire la permission et ne se met jamais à jour (clé publique).
7. **La logique pure est dans le cœur Kotlin** (AUTH-015, sans Android) : adresses et redirections, `version.json`, comparaison stricte, empreinte, machine à états, effacement ; elle se joue sur la JVM avec de faux serveurs. `app/src/direct` n'apporte que HTTPS, le dossier privé, le fournisseur de fichiers et l'intention d'installation.
8. **Page publique `/installer`** (sans connexion, pour envoyer son adresse à un proche) : un gros bouton vers `…/releases/download/android-latest/repas-drive.apk` et trois étapes. `/drive/aide` y mène depuis un navigateur ; dans l'application, `/installer` mène à la mise à jour.

## Conséquences

- La toute première version qui embarque la fonction s'installe une dernière fois à la main ; les suivantes se mettent à jour toutes seules.
- Le build Play futur (tickets STORE) se construit par la variante `play` : rien à retirer, ni permission sensible à justifier.
- Un changement de nom d'hôte des pièces jointes de GitHub fait échouer la mise à jour avec une phrase, sans installer quoi que ce soit : on l'ajoute à `UpdateSource.DOWNLOAD_HOSTS`.
- Risque résiduel accepté : un `version.json` rejoué (une ancienne version, encore plus récente que l'installée) ne ferait installer que des versions déjà publiées et signées de la même clé ; Android refuse toute version plus basse.

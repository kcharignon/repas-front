# Essayer l’application Repas (version de débogage) sur ton téléphone

Quelques étapes, dans l’ordre. Durée : environ 10 minutes.

## À quoi ça sert

Un seul geste lance tout le test. L’application cherche 12 produits courants sur le drive Leclerc, met 3 produits d’essai dans ton panier (jusqu’à 3 exemplaires), les retire aussitôt, puis te donne **un seul rapport** à coller à l’assistant. Elle ne valide aucune commande et ne paie rien.

- Elle n’a **qu’une seule permission : Internet**. Elle ne lit jamais ton mot de passe, le code reçu par e-mail ni tes cookies : tu te connectes toi-même, sur la page de Leclerc.
- Elle **n’envoie rien** à Repas ni ailleurs : le rapport reste sur ton téléphone jusqu’à ce que tu le colles toi-même.
- Le rapport ne contient ni cookie, ni adresse, ni nom de ville, ni ton numéro de magasin entier (seulement les trois derniers chiffres).
- Elle est signée avec une **clé de test publique** : désinstalle-la à la fin (étape 8).

## Les étapes

1. **Installer.** Sur ton téléphone, ouvre Chrome et va sur `https://github.com/kcharignon/repas-front/releases` ; ouvre la version la plus récente dont le nom commence par `android-dev-` (étiquette « Pre-release »), puis touche **`repas-drive-debug.apk`** dans **Assets**. Ouvre le fichier téléchargé, autorise l’installation depuis Chrome si Android le demande, touche **Installer** (si Play Protect hésite : **Installer quand même**), puis **Ouvrir**.

2. **Ouvrir le drive et te connecter à Leclerc.** L’application s’ouvre sur Repas (tu peux t’y connecter comme sur le site). Touche le petit bouton rond **⋮** sur le bord droit de l’écran, puis **Ouvrir le drive Leclerc** : le drive s’ouvre sur un second écran. Choisis ton magasin sur le site, puis connecte-toi toi-même (identifiant, mot de passe et, si Leclerc le demande, le code reçu par e-mail). Si un test anti-robot s’affiche, fais-le.

3. **Aller sur une page de ton magasin.** Fais une recherche avec la zone de recherche du site (par exemple **farine**) et attends les résultats. Le test a besoin d’une page de magasin, pas de la page d’accueil.

4. **Toucher « Test automatique ».** Sur l’écran du drive, touche le bouton rond vert **⋮** en bas à droite, puis **Test automatique (débogage)**. Ne touche plus à rien : un écran de l’agent montre l’avancement (environ une minute). Tu peux toucher **Arrêter** : l’agent retire alors ce qu’il a ajouté et te donne quand même un rapport.

5. **Lire le message de fin.** L’écran **« Rapport du test automatique »** s’ouvre, et le rapport est **déjà copié**. Si le début du rapport dit « Verdict : OK », le test est réussi ; sinon il dit quelle étape a échoué.

6. **Coller le rapport à l’assistant.** Dans la conversation, appui long puis **Coller**. Si la copie n’a pas marché, touche **Copier**, ou **Partager** pour l’envoyer par une autre application (messagerie, notes). Relis avant de coller : il ne doit y avoir ni mot de passe, ni code reçu par e-mail, ni adresse e-mail.

7. **Vérifier le panier.** Ouvre ton panier sur le site : il doit être comme avant le test. Si le rapport dit « à retirer à la main », retire les produits qu’il liste. Ne valide aucune commande.

8. **Désinstaller** (appui long sur l’icône **Repas**, **Infos sur l’appli**, **Désinstaller**). Cela efface aussi ta connexion à Leclerc dans l’application.

## Si ça ne marche pas

- **« L’agent n’est pas prêt sur cette page »** : attends la fin du chargement d’une page du drive, puis recommence l’étape 4.
- **Le rapport dit « Arrêt : UNSUPPORTED_PAGE »** : tu n’étais pas sur une page de magasin ; recommence à l’étape 3.
- **Le rapport dit « Arrêt : NOT_LOGGED_IN »** : reconnecte-toi (étape 2), puis recommence.
- **Le rapport dit « Arrêt : BLOCKED »** : Leclerc a ralenti les requêtes. Attends quelques minutes, recharge la page, recommence, et dis-le dans ta réponse.
- **Le site s’affiche en version mobile** (le nom du site commence par `m-`) : touche **⋮**, **Se déconnecter de Leclerc**, puis rouvre le drive.
- **Le menu dit que ta WebView est trop ancienne** : mets à jour « Android System WebView » dans le Play Store.
- **L’installation est refusée** : désinstalle d’abord l’ancienne version de **Repas Drive** (l’ancien nom de l’application), puis recommence.

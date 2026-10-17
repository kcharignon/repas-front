# Essayer Repas Drive (version de débogage) sur ton téléphone

Cette feuille te guide pas à pas. Une étape = un numéro. Fais les étapes dans l’ordre.

## À quoi ça sert

Tu as choisi une **application Android** pour envoyer ta liste de courses au drive Leclerc. Cette version de **débogage** sert à essayer, sur ton téléphone et **sans Repas**, ce que fera l’application :

- afficher le drive Leclerc comme sur un ordinateur, où tu te connectes toi-même ;
- chercher des produits pour une petite liste de test (farine, sucre, sel, huile) ;
- te laisser **choisir** les produits, puis les **mettre dans ton panier** Leclerc ;
- ouvrir le **diagnostic de l’agent** (un auto-test) pour dire ce qui marche ou non.

Elle s’installe **à côté** de l’application de test d’avant (`Banc Repas`) : les deux peuvent rester sur ton téléphone.

Durée : environ 30 minutes.

## Ce que l’application fait, et ne fait pas

- Elle n’a **qu’une seule permission : Internet**. Pas de contacts, pas de fichiers, pas de position.
- Elle **ne lit jamais** ton identifiant, ton mot de passe, le code reçu par e-mail ni tes cookies. Tu tapes tout toi-même, sur la page de Leclerc.
- Elle **n’envoie rien** à Repas ni ailleurs. Elle ne parle qu’au site Leclerc, comme un navigateur.
- Le plan d’essai **ajoute des produits à ton panier Leclerc**, un par un, **après ton choix**. Il ne valide jamais de commande et ne paie rien. Tu retires tes produits de test à l’étape 28.
- L’application est signée avec une **clé de test publique** (tout le monde la connaît). Elle ne protège rien : **désinstalle-la à la fin** (étape 36).

**Règle d’or :** ne colle jamais dans une conversation un mot de passe, un code reçu par e-mail, un cookie, une adresse e-mail ou le numéro de ton magasin. Les écrans de résultat et de diagnostic cachent déjà le numéro du magasin (ils n’en montrent que les trois derniers chiffres), mais relis quand même avant de coller.

## Partie A : installer l’application (sur le téléphone)

Android demande une autorisation parce que l’application ne vient pas du Play Store. C’est normal.

1. Sur ton **téléphone**, ouvre **Chrome** et va sur `https://github.com/kcharignon/repas-front/releases/tag/android-dev-2026-10-18`. (S’il y a une version plus récente, elle s’appelle `android-dev-` suivi d’une date, et porte l’étiquette « Pre-release ».)

2. Descends en bas de la page, dans **Assets** (les fichiers). Touche **`repas-drive-debug.apk`**. Chrome télécharge le fichier. Si Chrome dit « Ce type de fichier peut endommager votre appareil », touche **Télécharger quand même** : c’est normal pour un fichier `.apk`.

   _Facultatif._ La description de la version donne l’**empreinte SHA-256** du fichier (une signature). Tu n’as pas besoin de la vérifier : note-la seulement dans ton rapport.

3. Quand le téléchargement est fini, touche **Ouvrir** dans le message de Chrome. Autre chemin : application **Fichiers**, dossier **Téléchargements**, touche `repas-drive-debug.apk`.

4. Si Android dit que l’installation d’applications inconnues n’est pas autorisée **depuis cette source** (Chrome), touche **Paramètres**, active **Autoriser depuis cette source**, puis reviens en arrière avec la flèche.

5. Touche **Installer**. Si Google Play Protect affiche « Application non reconnue » ou « Analyser l’application », touche **Plus de détails**, puis **Installer quand même** (ou **Installer sans analyser**).

6. Touche **Ouvrir** (ou l’icône **Repas Drive** dans la liste de tes applications).

## Partie B : ouvrir le drive et se connecter

L’application n’a pas de barre d’adresse. Le bouton « retour » du téléphone revient à la page précédente ; sur la première page, il ferme l’application. Un petit bouton rond vert **⋮** en bas à droite ouvre le **menu**.

7. L’application s’ouvre sur le site du drive Leclerc. Attends quelques secondes. Tu dois voir le site **pour ordinateur** (grand, à agrandir en pinçant l’écran avec deux doigts). Note ce que tu vois : la page d’accueil, une page blanche, un message d’erreur, ou un test anti-robot.

8. Si le site te demande de **prouver que tu n’es pas un robot**, fais-le. Note « test anti-robot demandé : oui » (et s’il s’est répété).

9. **Choisis ton magasin**, comme tu le fais d’habitude sur le site.

10. **Connecte-toi toi-même** : touche **Se connecter** (ou l’équivalent) et tape ton identifiant et ton mot de passe sur la page de Leclerc, jamais ailleurs. Si Leclerc t’envoie un **code par e-mail**, ouvre ta messagerie, puis reviens dans **Repas Drive** et tape le code sur la page de Leclerc.

11. Touche le bouton **⋮**, puis **Version et mode d’emploi**. Note la première ligne (la version) et la ligne « Agent : version …, empreinte … ». Touche **Fermer**. Si la ligne dit que ta WebView est trop ancienne, va voir le dépannage (partie I).

12. Ferme l’application complètement (applications récentes, glisse-la), puis rouvre-la. **Es-tu encore connecté ?** Note « session conservée : oui ou non ».

## Partie C : regarder ton panier avant l’essai

13. Sur le site, ouvre ton **panier** et regarde ce qu’il contient. Le mieux est de commencer avec un panier **vide**, sinon note ce qu’il y a déjà : tu ne dois retirer à la fin que les produits de l’essai.

## Partie D : le plan d’essai (la liste de test)

14. Va sur une **page de ton magasin** : fais une recherche avec la zone de recherche du site (par exemple **farine**) et attends les résultats. Le plan d’essai a besoin d’une page de magasin, pas de la page d’accueil du site.

15. Touche **⋮**, puis **Plan d’essai (débogage)**. (Cette entrée n’existe que dans cette version de débogage.)

16. Un écran de l’agent s’ouvre sur la page : **« Enregistrer ce magasin dans Repas ? »**. L’agent vient de lire ton magasin. **Rien n’est enregistré nulle part** (il n’y a pas de Repas ici) : touche **Enregistrer** pour continuer. Si, à la place, tu vois « Page non prise en charge », touche **Fermer** (ou **Retourner dans Repas** : l’application affichera alors l’erreur) et retourne à l’étape 14.

17. Un deuxième écran s’affiche : **« Prêt à remplir ton panier »**. Il annonce **4 nouveaux produits à choisir** (farine, sucre, sel, huile) et rappelle que rien n’est commandé ni payé. Touche **Commencer**.

18. L’écran **« Remplissage du panier »** s’affiche. Les quatre lignes sont « à choisir ensuite » (l’agent n’a pas de produit mémorisé). Attends que l’agent passe au **choix des produits**.

19. Pour **chaque ingrédient**, l’agent affiche une **liste de produits** trouvés sur le site, avec leur prix et leur contenu. Regarde que : les produits ressemblent bien à ce que tu cherchais, les prix sont lisibles, et la phrase « Il te faut : … » (la quantité demandée) est là. Touche **Choisir** sur un produit.

20. L’agent demande ensuite **ce que tu fais de ce produit** (« Mon nouveau produit préféré », « Produit de secours » ou « Seulement cette fois »). Pour l’essai, touche **Seulement cette fois**.

21. L’agent **ajoute le produit à ton panier** (message « Ajout au panier… »). Note si l’ajout réussit, ou si un message d’erreur apparaît (par exemple « Leclerc n’a pas pu mettre ce produit au panier »).

22. Fais les étapes 19 à 21 pour les quatre ingrédients. Tu peux aussi essayer **« Chercher autre chose »**, **« Passer cette fois »** et **« J’en ai toujours »** sur une ligne, pour voir qu’ils marchent.

23. À la fin, l’agent affiche **« Panier rempli »** (ou « en partie ») avec le compte de ce qui a été ajouté. Touche **Retourner dans Repas**.

24. L’application affiche alors un écran **« Résultat de l’essai »** : l’issue, la version de l’agent, le magasin (trois derniers chiffres) et une ligne par ingrédient. **Touche Copier**, puis garde ce texte pour le rapport (partie H). Touche **Fermer**.

## Partie E : vérifier le panier sur le site

25. Ouvre ton **panier** sur le site (dans l’application). Les produits que tu as choisis y sont-ils, **avec les bonnes quantités** ? Note « panier conforme : oui ou non », et ce qui diffère.

26. Regarde aussi **le total** du panier et s’il y a un message d’erreur du site.

## Partie F : retirer les produits de test

27. Reste sur la page du panier.

28. **Retire du panier les produits ajoutés par l’essai** (touche le « − » ou la corbeille du site), pour retrouver le panier de l’étape 13. Ne valide **aucune commande**.

## Partie G : le diagnostic de l’agent

29. Va sur une page de ton magasin (une recherche suffit).

30. Touche **⋮**, puis **Diagnostic de l’agent**.

31. L’écran **« Diagnostic »** s’ouvre sur la page et joue ses contrôles (version de l’agent, page prise en charge, recherche d’un mot courant, contenu net des produits…). **Il n’écrit rien dans ton panier.** Attends qu’il affiche « Contrôles terminés ».

32. Touche **Copier le rapport**. Si la copie échoue, l’écran te le dit : sélectionne alors le texte du rapport et copie-le. Touche **Fermer**.

33. Si le menu répond « L’agent n’est pas prêt sur cette page », attends la fin du chargement de la page et réessaie ; sinon va voir le dépannage.

## Partie H : ce que tu me rapportes

34. Colle dans la conversation, après l’avoir relu :
    - la version de l’application et la ligne de l’agent (étape 11) ;
    - le texte de l’écran « Résultat de l’essai » (étape 24) ;
    - le rapport du diagnostic (étape 32) ;
    - « session conservée » (étape 12) et « panier conforme » (étape 25), avec ce que tu as remarqué (choix des produits clair ou non, lenteurs, messages d’erreur, test anti-robot).

35. **Ne colle jamais** : ton mot de passe, un code reçu par e-mail, un cookie, ton adresse e-mail, le numéro complet de ton magasin ou le nom de ta ville.

## Partie I : à la fin, et dépannage

36. **Désinstalle l’application** : appui long sur l’icône **Repas Drive**, **Infos sur l’appli**, **Désinstaller**. Cela efface aussi ta connexion à Leclerc dans l’application. (Pour seulement te déconnecter : **⋮**, **Se déconnecter et effacer les données**.) Retire ensuite, si tu veux, l’autorisation d’installer des applications inconnues donnée à Chrome (Paramètres, Applications, Chrome, Installer des applis inconnues).

**Dépannage**

- **Le site s’affiche en version mobile** (le nom du site commence par `m-`) : touche **⋮**, **Se déconnecter et effacer les données**, puis rouvre l’application. Si ça continue, note-le dans ton rapport.
- **« Pas de connexion à Internet »** ou **« Le site du drive ne répond pas »** : vérifie le Wi-Fi ou les données mobiles, puis touche **Réessayer**.
- **« Certificat refusé »** : vérifie la date et l’heure du téléphone, évite un Wi-Fi public, puis **Réessayer**.
- **Le menu dit que ta WebView est trop ancienne** : ouvre le Play Store, cherche **Android System WebView**, touche **Mettre à jour**, puis relance l’application.
- **« L’agent n’est pas prêt sur cette page »** : attends la fin du chargement d’une page du drive, puis réessaie. Si ça ne passe pas, ferme et rouvre l’application.
- **L’agent affiche « Ce n’est pas le bon magasin » ou « Page non prise en charge »** : va sur une page de ton magasin (une recherche), puis recommence l’étape 15.
- **« Leclerc a ralenti les requêtes »** : attends quelques minutes, recharge la page, puis recommence. Note-le dans ton rapport.
- **L’application se ferme pendant que tu lis ton e-mail** (peu de mémoire) : rouvre-la et recommence la connexion.
- **L’installation est refusée** (« application non installée ») : désinstalle d’abord l’ancienne version de **Repas Drive** si tu en as une, puis recommence. Les deux applications `Banc Repas` et `Repas Drive` sont différentes et peuvent rester ensemble.

# Essayer le banc d'essai du favori sur ton téléphone (DRV-002)

> Outil de test jetable, à supprimer après la décision G1 (DRV-005).

Cette feuille te guide pas à pas. Une étape = un numéro. Fais les étapes dans l'ordre.

## À quoi ça sert

Avant d'écrire le vrai programme, on veut savoir si un **favori** peut tourner sur le site du drive Leclerc, dans le Chrome de ton téléphone Android.

- Un **favori** est un raccourci enregistré dans Chrome. Celui-ci contient un petit programme (le « banc d'essai »).
- Le banc d'essai propose **12 essais**. Chaque essai donne un résultat écrit, que tu peux copier.
- À la fin, tu remplis le rapport `docs/drive/spikes/DRV-002-rapport.md` (dépôt `repas`, 19 lignes).

Durée : environ une heure, avec ton téléphone et ton ordinateur.

## Ce que le banc fait, et ne fait pas

- Il **ne lit jamais** ton mot de passe, tes cookies ni tes identifiants. Pour le cookie anti-robot `datadome`, il dit seulement « oui » ou « non » (il existe, ou pas).
- Il **n'envoie rien** ailleurs que sur le site Leclerc où tu es. Seule exception : les essais 7 et 8 ouvrent `https://kantin.eu/` quand tu le demandes.
- Il **n'écrit dans ton panier** que dans les essais 3 et 12, **un seul produit à la fois**, après ta confirmation. Il le retire ensuite, si tu confirmes encore.
- Il **ne valide jamais** une commande, ne choisit pas de créneau, ne paie rien.
- Il **s'arrête tout seul** à la première réponse « 403 » ou « 429 » (le site nous demande de ralentir).

**Règle d'or :** ne colle jamais dans une conversation ou dans le rapport un mot de passe, un code reçu par SMS, un cookie, une adresse e-mail ou le numéro de ton magasin. Le bouton « Copier le résultat » masque déjà le numéro du magasin. Relis quand même avant de coller.

## Partie A : préparer le favori (sur ton ordinateur)

1. Ouvre un terminal dans le dossier du front : `cd /home/kantin/Projet/repas-front`.

2. Tape `make lab` puis Entrée. Attends la fin (quelques secondes, Docker doit tourner). Tu dois lire :

   ```text
   Favori du banc d'essai construit : drive-agent/lab/dist/lab-bookmarklet.txt
   Taille de la chaîne : … octets (… Ko), limite 60000 octets (60,0 Ko)
   …
   Fin de la chaîne : …;void 0
   ```

   Si tu lis « Trop gros », arrête-toi et préviens l'agent.

3. La chaîne à utiliser est dans le fichier `drive-agent/lab/dist/lab-bookmarklet.txt`. C'est une seule très longue ligne. Elle commence par `javascript:` et se termine par `;void 0`.

4. Copie cette chaîne dans le presse-papiers de Windows. Dans le même terminal, tape :

   ```text
   clip.exe < drive-agent/lab/dist/lab-bookmarklet.txt
   ```

   Autre façon : tape `explorer.exe drive-agent/lab/dist`, ouvre le fichier avec le Bloc-notes, puis Ctrl+A et Ctrl+C.

5. Envoie cette chaîne à toi-même **par e-mail** : crée un nouveau message pour ta propre adresse, colle (Ctrl+V) dans le texte du message, envoie. Une note (Google Keep) ou un fichier dans ton Drive marchent aussi.

   **N'utilise pas** WhatsApp, Telegram ni Signal : ces applications mettent le texte en forme et peuvent le casser.

   _Autre solution, très fiable : Chrome synchronisé._ Si Chrome est connecté au même compte Google sur ton ordinateur et sur ton téléphone, crée le favori sur l'ordinateur : ouvre le gestionnaire de favoris (Ctrl+Maj+O), menu **⋮** en haut à droite, **Ajouter un nouveau favori**, nom `lab`, URL : colle la chaîne (Ctrl+V). Après quelques instants, le favori apparaît sur le téléphone (Chrome, **Favoris**, **Appareil mobile**). Tu peux alors passer directement à la partie C.

## Partie B : créer le favori sur Chrome Android

6. Sur ton téléphone, ouvre le message reçu. Appuie longuement sur la chaîne, choisis **Tout sélectionner**, puis **Copier**.

7. Ouvre Chrome et va sur n'importe quelle page (par exemple `https://kantin.eu`).

8. Touche le menu **⋮** (trois points), puis l'étoile **☆** (« Ajouter aux favoris »). Un message apparaît en bas : touche **Modifier**.

   Autre chemin : menu **⋮**, **Favoris**, appui long sur le favori que tu viens de créer, **Modifier**.

9. Dans le champ **Nom**, écris `lab` (trois lettres, en minuscules : c'est ce que tu taperas pour le lancer).

10. Dans le champ **URL** (ou « Adresse »), efface tout, puis colle la chaîne (appui long, **Coller**). Vérifie que le début est `javascript:` et que la fin est `;void 0`. Touche **Enregistrer** (la flèche ou la coche en haut).

    **Ne colle pas** la chaîne dans la barre d'adresse : Chrome retire alors le mot `javascript:` et ça ne marche plus.

## Partie C : ouvrir le drive et se connecter

11. Dans **Chrome** (pas dans l'application Leclerc, pas dans un onglet intégré d'une autre application), ouvre le site du drive Leclerc.

12. Choisis ton magasin, puis **connecte-toi toi-même** (tu tapes ton mot de passe sur la page de Leclerc, jamais ailleurs).

13. Va sur la page d'accueil de ton magasin. L'adresse contient `/magasin-` suivi de chiffres. Si ce n'est pas le cas, le banc ne pourra pas travailler.

14. Regarde ton panier Leclerc. Les essais 3 et 12 y touchent un peu. Le mieux est de commencer avec un panier vide, ou de savoir ce qu'il contient. **Le banc refuse de toucher un produit déjà dans ton panier.**

## Partie D : lancer le favori

15. Touche la barre d'adresse de Chrome. Tape `lab` **sans appuyer sur Entrée**. Dans la liste qui apparaît, touche la ligne du favori `lab` (elle montre `javascript:` ou une étoile).

16. Le menu **Banc d'essai** doit s'afficher avec 12 essais. Dans le rapport :
    - ligne 1 (le favori se lance) : oui si une fenêtre s'est ouverte ;
    - ligne 2 (il affiche son menu) : oui si tu vois la liste des 12 essais.

    Si rien ne se passe, note exactement ce que tu vois (rien, une page blanche, un message). C'est déjà un résultat utile. Va voir la partie G.

Pour relancer le banc plus tard, refais l'étape 15. Pour le fermer, touche **Fermer**.

## Partie E : les 12 essais

Pour chaque essai : touche son nom dans le menu, fais ce qui est écrit, puis touche **Copier le résultat**. Colle le texte dans un message à toi-même (étape 5) pour le garder. Touche **← Menu** pour revenir.

**Ordre conseillé :** 1, 2, 10, 3, 12, 5, 6, 9, 4, 11, 7, 8. Les essais 7 et 8 te font quitter la page : fais-les en dernier. Les essais 4 et 11 font beaucoup de recherches : fais-les vers la fin, parce qu'ils peuvent déclencher un blocage.

### Essai 1 : Sonde d'environnement (ligne 3 du rapport)

17. Touche l'essai 1. Le résultat s'affiche tout seul. Vérifie qu'il montre l'hôte (par exemple `fd9-courses.leclercdrive.fr`) et le magasin lu dans l'adresse.

    Pour la **ligne 14** (adresse de la page panier) : ouvre la page du panier sur le site Leclerc (bouton « Panier »), relance le favori, refais l'essai 1 et recopie la ligne « Chemin ». Le numéro du magasin est masqué dans le texte copié.

### Essai 2 : Recherche sur le site (lignes 4, 15 et 16)

18. Touche l'essai 2, laisse « farine » et touche **Chercher**. Note le code (`HTTP 200` attendu) et le nombre de « Produits reconnus ».

    - **Ligne 16 (EAN)** : lis la ligne « EAN dans les données : oui/non ». Ouvre aussi une fiche produit sur le site et regarde si un code-barres ou « EAN » est écrit.
    - **Ligne 15 (même produit dans deux magasins)** : note les identifiants (`id …`) de 5 produits. Change de magasin sur le site, refais l'essai 2 avec le même mot, et compare les identifiants des mêmes produits. Réponds « oui » s'ils sont identiques.

    Si le banc écrit « Produits reconnus : 0 », copie le résultat : il contient un petit extrait de la page qui aidera l'agent à corriger.

### Essai 10 : Contenu net des produits (ligne 17)

19. Après l'essai 2, touche l'essai 10 puis **Comparer**. Note « Au moins une méthode : N » sur le nombre de produits comparés (jusqu'à 30). Pour avoir environ 30 produits, cherche un mot courant à l'essai 2 (« farine », « lait »).

### Essai 3 : Ajouter puis retirer un produit (ligne 5, et ligne 13)

20. Touche l'essai 3. Dans la liste, choisis un produit **peu cher** (vu à l'essai 2) qui n'est pas dans ton panier. Touche **Préparer l'ajout…**.

21. Une boîte rouge te demande de confirmer. **Rien n'est envoyé avant.** Touche **Oui, ajouter 1 au panier**. Note le code HTTP et la ligne « (type 1, panier) » avec le total.

22. **Ligne 13** : ouvre l'application Leclerc Drive (avec le même compte) et regarde si le produit est dans le panier. Reviens ensuite dans Chrome. Si la page s'est rechargée, relance le favori : si le produit est resté dans ton panier, retire-le à la main sur le site.

23. Touche **Retirer ce produit du panier…**, puis **Oui, retirer du panier**. Vérifie sur le site que le panier est revenu comme avant.

### Essai 12 : Disponibilité d'un produit connu (ligne 19)

24. Touche l'essai 12. Choisis un produit vu à l'essai 2, puis **Chercher ce produit**. Note : retrouvé ou non, son rang, son stock.

25. Si tu connais un produit **en rupture** (stock 0) : saisis son identifiant et son libellé, touche **Chercher ce produit**, puis **Essayer d'ajouter ce produit…** et confirme. Note la réponse du panier et la « quantité au panier lue ». Retire ensuite le produit si le bouton est proposé.

### Essai 5 : Cadre natif (ligne 7)

26. Touche l'essai 5, puis **Ouvrir le cadre**. Un « cadre » est une fenêtre dans la fenêtre : la page de recherche Leclerc s'affiche en plein écran sous une barre sombre.

    Note : le cadre s'affiche-t-il ? Le résultat dit s'il est « accessible », « refusé », « vide » ou « redirigé ». **Si la page entière se recharge toute seule**, note-le : Leclerc refuse d'être affiché dans un cadre.

### Essai 6 : Repérer un ajout dans le cadre (ligne 8)

27. Le cadre de l'essai 5 reste ouvert. Dedans, utilise **les boutons de Leclerc** pour ajouter un produit au panier (un seul). La barre sombre en haut affiche le produit repéré.

28. Touche **Retour au banc**, puis l'essai 6. Note le produit repéré et **la méthode** : `XHR`, `fetch` ou `DOM` (c'est celle qui a fonctionné). Si le produit n'est pas repéré, écris « non ».

29. Retire à la main (sur le site) le produit que tu viens d'ajouter. Touche **Fermer le cadre** quand tu as fini.

### Essai 9 : Écran allumé (ligne 12)

30. Dans les réglages du téléphone, mets la veille de l'écran sur 30 secondes. Touche l'essai 9 puis **Garder l'écran allumé 60 s**. Ne touche plus au téléphone pendant une minute. Note : le verrou est-il obtenu ? L'écran est-il resté allumé toute la minute ? Remets ensuite ta veille habituelle.

### Essai 4 : Cadence (ligne 6)

31. Touche l'essai 4 puis **Lancer les 5 recherches**. Note la conclusion : « 5 réponses reçues sur 5 » ou « blocage à la requête N ». Si un blocage apparaît, recharge le site Leclerc dans Chrome, attends dix minutes avant de recommencer.

### Essai 11 : Lot de 30 recherches (ligne 18)

32. Touche l'essai 11. La liste contient déjà 30 ingrédients courants (tu peux la changer, un nom par ligne). Touche **Lancer le lot** (environ 35 secondes).

33. À la fin, touche **Copier le résultat** et garde le texte. Pour chaque ingrédient, regarde si le **bon produit** est parmi les 3 premiers. Compte combien de fois (sur 30) : c'est la **ligne 18**.

### Essai 7 : Fragments d'adresse (lignes 9 et 10)

Le « fragment » est la partie de l'adresse après le signe `#`. On veut savoir s'il survit quand on change de page.

34. **Vers Leclerc (ligne 9)** : touche l'essai 7, puis **6 Ko vers Leclerc** et **Oui, y aller**. Une page de ton magasin s'ouvre. Relance le favori (étape 15) et touche l'essai 7 : il dit « 6144 caractères reçus, contenu intact » ou « tronqué » ou « aucun ». Recommence avec **16 Ko** puis **64 Ko**.

35. **Vers Repas (ligne 10)** : sur une page Leclerc, relance le favori, essai 7, touche **16 Ko vers Repas** puis **Oui, y aller**. Le site Repas s'ouvre. Regarde la barre d'adresse : le `#lab=…` est-il encore là une fois la page chargée ? Relance le favori sur cette page (étape 15), touche l'essai 7 : il dit combien de caractères sont arrivés. Si le favori ne se lance pas sur Repas, note-le. Reviens avec le bouton « retour » du téléphone. Recommence avec **6 Ko** et **64 Ko**.

### Essai 8 : Retour vers Repas (ligne 10)

36. Sur une page Leclerc, relance le favori, touche l'essai 8, puis **Retourner vers Repas…** et **Oui, y aller**. Regarde la barre d'adresse sur la page de Repas : le `#lab=ok` est-il conservé quand l'application s'est affichée ? Relance le favori pour lire ce que l'adresse contient.

### Ligne 11 : lien d'intention depuis l'application installée

37. Cette ligne n'a **pas d'essai** dans le banc : elle demande un lien dans l'application Repas, qui n'existe pas encore. Écris « non testé : hors banc d'essai ».

## Partie F : remplir le rapport

38. Rassemble tous les textes copiés dans un seul message à toi-même ou une seule note.

39. Relis-les. Enlève tout ce qui est personnel : adresse e-mail, nom de ville de ton magasin, numéro de ton magasin (normalement masqué), nom de ton compte.

40. Demande à un agent (Claude Code) de t'aider. Tu peux lui écrire :

    > Voici les résultats du banc d'essai du favori. Remplis `docs/drive/spikes/DRV-002-rapport.md` du dépôt `repas` (19 lignes, « oui », « non » ou « non testé » avec la raison), puis ouvre une PR docs. Ne mets aucun identifiant, cookie, adresse e-mail ni numéro de magasin.

    Colle ensuite les résultats. L'agent te posera ses questions **une étape à la fois**. Il ne te demandera jamais un mot de passe.

41. Dans le rapport, note aussi : le modèle de ton téléphone, la version d'Android, la version de Chrome (Chrome, menu ⋮, **Paramètres**, **À propos de Chrome**), et le magasin sous la forme « magasin A » (jamais l'adresse précise).

## Tableau : essai du banc et ligne du rapport

| Ligne du rapport DRV-002                                 | Où l'obtenir                                           |
| -------------------------------------------------------- | ------------------------------------------------------ |
| 1. Le favori se lance (nom tapé dans la barre d'adresse) | Étape 15                                               |
| 2. Il affiche son menu de test                           | Étape 16                                               |
| 3. La sonde voit le magasin courant et l'hôte            | Essai 1                                                |
| 4. Recherche même origine : 200 et nombre de produits    | Essai 2                                                |
| 5. Ajouter puis retirer un produit, code HTTP            | Essai 3                                                |
| 6. Blocage 403, après combien de requêtes                | Essai 4 (et arrêt automatique des essais 2, 3, 11, 12) |
| 7. Un cadre vers la page de recherche s'affiche          | Essai 5                                                |
| 8. Le produit ajouté dans le cadre est repéré            | Essai 6 (méthode XHR, fetch ou DOM)                    |
| 9. Un fragment de 6, 16, 64 Ko survit vers Leclerc       | Essai 7, boutons « vers Leclerc »                      |
| 10. Le retour vers Repas conserve le fragment            | Essais 7 (« vers Repas ») et 8                         |
| 11. Lien d'intention depuis l'application installée      | Pas d'essai : « non testé »                            |
| 12. Écran allumé pendant une minute                      | Essai 9                                                |
| 13. Le panier apparaît dans l'application Leclerc Drive  | Pendant l'essai 3, étape 22                            |
| 14. Adresse de la page panier                            | Essai 1 lancé sur la page du panier                    |
| 15. Même identifiant de produit dans deux magasins       | Essai 2 dans deux magasins                             |
| 16. EAN visible sur la fiche produit                     | Essai 2 (ligne « EAN ») et fiche produit sur le site   |
| 17. Contenu net déductible, sur 30 résultats             | Essai 10                                               |
| 18. Bon produit parmi les 3 premiers, sur 30 ingrédients | Essai 11 et ton jugement                               |
| 19. Disponibilité d'un produit connu, produit en rupture | Essai 12                                               |

## Partie G : si ça ne marche pas

- **Rien ne se passe quand je touche le favori.** Vérifie que l'URL du favori commence par `javascript:` et finit par `;void 0` (Chrome, **⋮**, **Favoris**, appui long, **Modifier**). Recommence la copie depuis l'e-mail (pas depuis une messagerie). Essaie la solution « Chrome synchronisé » de l'étape 5. Essaie aussi sur ton ordinateur : ouvre une page de ton magasin dans Chrome de bureau, crée le favori de la même façon, tape `lab` dans la barre d'adresse. Dis à l'agent ce qui marche et ce qui ne marche pas.
- **Chrome refuse de coller toute la chaîne, ou la coupe.** Utilise la solution « Chrome synchronisé » (créer le favori sur l'ordinateur). Note-le dans le rapport.
- **Un message « Banc d'essai : lancement impossible (…) » s'affiche.** Recopie le message entre parenthèses dans le rapport.
- **« Blocage probable (403/429) ».** C'est le site qui nous demande de ralentir. Recharge-le dans Chrome, attends dix minutes. Note après combien de requêtes ça s'est produit.
- **Le banc dit « Cette page n'est pas une page de magasin ».** Va sur une page dont l'adresse contient `/magasin-`, puis relance le favori.
- **Je suis perdu.** Touche **Fermer**, recharge la page, relance le favori.

## Après le test

Quand la décision G1 est prise (ticket DRV-005), supprime le favori `lab` de ton téléphone. Le dossier `drive-agent/lab/` pourra être supprimé du dépôt.

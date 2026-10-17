# Essayer l'application Android jetable sur ton téléphone (DRV-011)

> Outil de test jetable, à supprimer après la décision G1 (DRV-005).

Cette feuille te guide pas à pas. Une étape = un numéro. Fais les étapes dans l'ordre.

> **Tu as déjà la première version de l'application, installée et connectée ?** Fais seulement la partie A (étapes 1 à 6 : l'installation se fait par-dessus, sans te déconnecter), puis va directement à la **partie F (mode ordinateur)**. Tu n'as pas à refaire les autres parties.

## À quoi ça sert

Le favori du banc d'essai ne se lance pas dans Chrome sur ton téléphone. Tu as choisi une **application Android**. Avant de construire la vraie, on veut savoir si une petite application de test peut :

- afficher le site du drive Leclerc dans une fenêtre intégrée à l'application (une **WebView** : un navigateur caché dans l'application) ;
- te laisser **te connecter toi-même** ;
- passer l'**anti-robot** du site (il s'appelle DataDome) ;
- lancer le **banc d'essai** et donner les mêmes résultats que sur l'ordinateur ;
- te garder connecté quand tu fermes puis rouvres l'application.

**Ce que le premier essai a appris :** sur un téléphone, Leclerc répond par son **site mobile**, qui n'a pas les mêmes adresses que le site pour ordinateur sur lequel le banc s'appuie. L'application a donc un troisième choix, **« Ordinateur »**, qui reproduit le mode « version pour ordinateur » de Chrome : Leclerc doit alors servir son site pour ordinateur, et le banc doit retrouver ses produits.

L'application s'appelle **Banc Repas**. Elle a trois boutons en bas à droite : **Banc** (vert), **Diagnostic** (blanc) et un bouton qui bascule entre **→ Ordinateur** et **→ Mobile**.

Durée : environ une heure.

## Ce que l'application fait, et ne fait pas

- Elle n'a **qu'une seule permission : Internet**. Pas de contacts, pas de fichiers, pas de position.
- Elle **ne lit jamais** ton identifiant, ton mot de passe, le code reçu par e-mail ni tes cookies. Tu tapes tout toi-même, sur la page de Leclerc. Les cookies restent dans le téléphone (ils ne sont pas sauvegardés dans le nuage).
- Elle **n'envoie rien** à Repas ni ailleurs. Elle ne parle qu'au site Leclerc, comme un navigateur.
- Elle **n'écrit rien** dans le journal du téléphone : ni adresse, ni cookie, ni contenu de page.
- Elle n'ouvre que les pages `https` de `leclercdrive.fr`. Tout autre lien s'ouvre dans le navigateur de ton téléphone.
- Le banc d'essai est le même que sur ordinateur : il **n'écrit dans ton panier** que dans les essais 3 et 3b, un seul produit à la fois, **après ta confirmation avant chaque écriture**. Il ne valide jamais de commande.
- Changer d'agent utilisateur (mobile, ordinateur) **ne touche pas à tes cookies** : tu restes connecté si Leclerc le permet.
- L'application est signée avec une **clé de test publique** (tout le monde la connaît). Elle ne protège rien : **désinstalle l'application à la fin du test** (partie K).

**Règle d'or :** ne colle jamais dans une conversation ou dans le rapport un mot de passe, un code reçu par e-mail, un cookie, une adresse e-mail ou le numéro de ton magasin. Le bouton « Copier le résultat » du banc masque déjà le numéro du magasin, mais relis quand même avant de coller.

## Partie A : installer ou mettre à jour l'application (sur le téléphone)

Android demande une autorisation parce que l'application ne vient pas du Play Store. C'est normal. Cette autorisation se retire à la fin (partie K).

1. Sur ton **téléphone**, ouvre **Chrome** et va sur la page des versions : `https://github.com/kcharignon/repas-front/releases`. Touche la version la plus récente dont le nom commence par **`android-lab-`** (elle porte l'étiquette « Pre-release »).

2. Descends en bas de la page, dans **Assets** (les fichiers). Touche **`repas-android-lab.apk`**. Chrome télécharge le fichier. Si Chrome dit « Ce type de fichier peut endommager votre appareil », touche **Télécharger quand même** : c'est normal pour un fichier `.apk`.

   _Facultatif._ La description de la version donne l'**empreinte SHA-256** du fichier (une signature). Ce n'est pas nécessaire de la vérifier sur le téléphone ; l'agent la note dans le rapport.

3. Quand le téléchargement est fini, touche **Ouvrir** dans le message de Chrome. Autre chemin : application **Fichiers**, dossier **Téléchargements**, touche `repas-android-lab.apk`.

4. Si Android dit que l'installation d'applications inconnues n'est pas autorisée **depuis cette source** (Chrome), touche **Paramètres**, active **Autoriser depuis cette source**, puis reviens en arrière avec la flèche.

5. Touche **Installer** (ou **Mettre à jour** si l'application est déjà là : tu gardes ta connexion et tes réglages, la clé de signature ne change jamais). Si Google Play Protect affiche « Application non reconnue » ou « Analyser l'application », touche **Plus de détails**, puis **Installer quand même** (ou **Installer sans analyser**).

6. Touche **Ouvrir** (ou l'icône **Banc Repas** dans la liste de tes applications). Pour vérifier que c'est la nouvelle version : touche **Diagnostic** ; la ligne « Application » donne un numéro plus grand qu'avant, et un troisième choix **Ordinateur** existe dans « Agent utilisateur ». Touche **Fermer**.

## Partie B : ouvrir le drive et se connecter

L'application n'a pas de barre d'adresse. Le bouton « retour » du téléphone revient à la page précédente ; sur la première page, il ferme l'application.

7. L'application s'ouvre sur le site du drive Leclerc. Attends quelques secondes. Note ce que tu vois : la page d'accueil du site, une page blanche, un message d'erreur, ou un test anti-robot. Sur un téléphone, Leclerc affiche sa **version mobile** (le nom du site commence par `m-`) : c'est normal à ce stade. Si tu vois autre chose que la page d'accueil, va voir la partie J.

8. Si le site te demande de **prouver que tu n'es pas un robot** (un puzzle, des cases à cocher), fais-le. Note « test anti-robot demandé : oui » (et s'il s'est répété plusieurs fois).

9. **Choisis ton magasin**, comme tu le fais d'habitude sur le site.

10. **Connecte-toi toi-même** : touche **Se connecter** (ou l'équivalent) et tape ton identifiant et ton mot de passe sur la page de Leclerc, jamais ailleurs. Si Leclerc t'envoie un **code par e-mail**, ouvre ta messagerie (change d'application, puis reviens dans **Banc Repas**), et tape le code sur la page de Leclerc.

    Note : « connexion réussie : oui ou non », et à quelle étape ça bloque s'il y a un blocage. Si la page de connexion s'ouvre **dans Chrome** au lieu de l'application, note-le et va voir la partie J.

    Si Android ferme l'application pendant que tu lis ton e-mail (cela arrive avec peu de mémoire), rouvre-la et recommence la connexion.

11. Va sur la **page d'accueil de ton magasin**. Le banc te dira lui-même si la page n'est pas une page de magasin.

12. Regarde ton panier Leclerc. Les essais 3 et 3b y touchent un peu. Le mieux est de commencer avec un panier vide, ou de savoir ce qu'il contient. **Le banc refuse de toucher un produit déjà dans ton panier.**

13. Utilise la **zone de recherche du site** : tape **farine** et valide. La page des résultats s'affiche.

## Partie C : lancer le banc

14. Touche le bouton vert **Banc**. Le menu **Banc d'essai** s'affiche par-dessus la page, avec **13 lignes** : les 12 essais et le 3b (juste après le 3). Note « le banc se lance et affiche son menu : oui ou non ».

    - Si un petit message dit « Ouvre d'abord une page du site Leclerc Drive », la page affichée n'est pas une page Leclerc : reviens à l'accueil du site (bouton **Diagnostic**, puis **Revenir à l'accueil du site**).
    - Si rien ne se passe, va voir la partie J.

Pour fermer le banc, touche **Fermer**. Pour le rouvrir, touche **Banc** de nouveau.

## Partie D : les essais 1, 2, 3 et 3b

Ces essais servent deux fois : une fois avec le site mobile (agent par défaut), puis surtout en **mode ordinateur** (partie F). Pour chaque essai : touche son nom dans le menu, fais ce qui est écrit, puis touche **Copier le résultat**. Colle le texte dans un message à toi-même (un e-mail) pour le garder. Touche **← Menu** pour revenir. Tu n'as pas besoin des autres essais pour ce test.

**Avec le site mobile (agent par défaut), fais seulement les étapes 15 et 16.** Le banc est écrit pour le site pour ordinateur : sur le site mobile, l'essai 2 répond « HTTP 200 » mais « Produits reconnus : 0 ». C'est un résultat attendu, note-le. Les étapes 17 à 23 se font en mode ordinateur (partie F).

15. **Essai 1 (sonde).** Touche l'essai 1. Le résultat s'affiche tout seul. Note le **nom du site** (`m-courses…` pour le site mobile, `fd…-courses…` pour le site pour ordinateur) et le magasin lu dans l'adresse. Copie le résultat.

16. **Essai 2 (recherche).** Touche l'essai 2, laisse « farine » et touche **Chercher**. Note le code (`HTTP 200` attendu) et le nombre de « Produits reconnus ». Copie le résultat.

17. **Essai 3 (ajouter puis retirer un produit).** Fais l'essai 2 juste avant. Touche l'essai 3, choisis un produit **peu cher** qui n'est pas dans ton panier, puis **Préparer l'ajout…**. Laisse la case « Diagnostic : sans l'objet de contexte » **décochée**.

18. Une boîte rouge te demande de confirmer. **Rien n'est envoyé avant.** Touche **Oui, ajouter 1 au panier**. Note le code HTTP et la ligne « Quantité obtenue du produit… » (elle doit dire 1). Copie le résultat.

    - Si tu lis « La requête n'a pas été comprise par Leclerc (HTTP 404) » : copie le résultat, puis recommence les étapes 17 et 18 en **cochant** la case « Diagnostic : sans l'objet de contexte » avant de confirmer. Copie ce second résultat aussi.
    - Si tu lis « Blocage probable (403/429) » : le banc s'est arrêté. Va voir la partie J.

19. Touche **Fermer** pour fermer le banc, ouvre le **panier** du site et regarde si le produit y est. Touche **Banc** de nouveau (si la page s'est rechargée, le banc repart de zéro : refais alors l'essai 2). Touche l'essai 3, puis **Retirer ce produit du panier…** et **Oui, retirer du panier**. Vérifie sur le site que le panier est revenu comme avant. Si le produit est resté, retire-le à la main sur le site.

20. **Essai 3b (quantités).** Touche **← Menu**, puis l'essai **3b**. Le produit de l'essai 3 est déjà rempli. Sinon, choisis un produit **peu cher** qui n'est pas dans ton panier. Touche **Préparer l'étape 1…**, puis **Oui, fixer à 3 (action 1)**.

21. Touche **Étape 2 : fixer à 2 (action 1)…**, puis **Oui, fixer à 2 (action 1)**. Lis la ligne 2 : si la quantité obtenue est **2**, le nombre envoyé est bien la quantité voulue.

22. **Seulement si le banc propose** « Essayer l'action 2, quantité 2… » : touche-le, puis **Oui, essayer l'action 2, quantité 2**.

23. Touche **Retirer le produit…**, puis **Oui, retirer du panier**. Vérifie sur le site que le panier est revenu comme avant. Touche **Copier le résultat** et colle-le dans ton message.

## Partie E : essai de session (reste-t-on connecté ?)

24. **Ferme complètement** l'application : touche le bouton des applications récentes de ton téléphone, puis balaie **Banc Repas** vers le haut (ou sur le côté) pour la fermer.

25. **Rouvre** Banc Repas. Note : le site te montre-t-il encore **connecté** (ton compte, ton magasin), ou te demande-t-il de te reconnecter ? Si tu dois te reconnecter, note-le : c'est un résultat.

26. Si tu es resté connecté : refais la recherche « farine » (étape 13), touche **Banc** et refais l'**essai 2**. Note le code (`HTTP 200` attendu) : le banc marche-t-il toujours après la réouverture ?

27. _Facultatif, le lendemain._ Rouvre l'application sans rien faire d'autre. Note si tu es encore connecté.

## Partie F : le mode ordinateur (le plus important)

Le mode **Ordinateur** change la « carte d'identité » (l'**agent utilisateur**) que l'application montre au site : Linux, sans la mention `wv` (WebView), sans `Mobile`, sans `Android`, comme le fait Chrome quand tu coches « Version pour ordinateur ». Il envoie aussi les mêmes « indications client » (plateforme Linux, pas mobile) et affiche la page en grand format, comme un ordinateur. **Il ne touche pas à tes cookies.**

Fais cette partie une fois **connecté** (partie B).

28. Touche le bouton **→ Ordinateur** (en bas à droite, sous Diagnostic). La page se recharge. Autre chemin : **Diagnostic**, puis dans « Agent utilisateur » le choix **Ordinateur**. Le bouton affiche maintenant **→ Mobile** : touche-le pour revenir à la version mobile.

29. La page est maintenant large et petite, comme sur un ordinateur : **écarte deux doigts** pour agrandir, glisse pour te déplacer. Ce n'est pas un défaut.

30. Note : **la connexion faite en mode mobile reste-t-elle valable en mode ordinateur ?** Le site te montre-t-il encore connecté, ou te demande-t-il de te reconnecter ? Si Leclerc te demande de te reconnecter, fais-le toi-même (avec le code reçu par e-mail si besoin) et note que c'était nécessaire. Si un test anti-robot apparaît, fais-le et note-le.

31. Vérifie que Leclerc sert bien le **site pour ordinateur** : touche **Diagnostic** et lis ces lignes :
    - « Site affiché (nom seulement) » : un nom qui commence par `fd` et un chiffre (par exemple `fd…-courses.leclercdrive.fr`) est le site pour ordinateur ; un nom qui commence par `m-` est le site mobile ;
    - « Agent utilisateur utilisé » : il ne doit contenir ni `wv`, ni `Mobile`, ni `Android` ;
    - « Indications client (client hints) » : `oui`, ou `non disponible` si ta WebView est trop ancienne (dans ce cas seule la chaîne est appliquée : note-le).

    Touche **Copier le diagnostic** et colle-le dans ton message. Si le site est encore le site mobile, touche **Revenir à l'accueil du site**, attends, puis regarde de nouveau « Site affiché » dans le diagnostic.

32. Choisis ton magasin si le site te le demande, va sur la page d'accueil du magasin, puis fais la recherche **farine** avec la zone de recherche du site (comme à l'étape 13).

33. Touche le bouton vert **Banc**. Le menu peut paraître petit : écarte deux doigts pour l'agrandir. Note « le banc se lance en mode ordinateur : oui ou non ».

34. Refais les **essais 1, 2, 3 et 3b** exactement comme aux **étapes 15 à 23**. Cette fois :
    - l'essai 1 doit montrer un nom de site qui commence par `fd` ;
    - l'essai 2 doit reconnaître des produits (« Produits reconnus » plus grand que 0) ;
    - note le code HTTP de l'ajout au panier (essai 3) et le sens de la quantité (essai 3b).

35. **Session en mode ordinateur.** Ferme complètement l'application (étape 24) et rouvre-la. Note : le choix **Ordinateur** est-il encore actif (**Diagnostic**, ligne « Agent utilisateur choisi ») ? Es-tu encore connecté ? Le banc marche-t-il toujours (essai 2) ?

36. Pour revenir à la version mobile, touche **→ Mobile**.

## Partie G : l'agent « sans wv » (facultatif)

Cette passe sert seulement si l'anti-robot bloque avec l'agent par défaut **et** avec le mode ordinateur. Le choix **Le même, sans le marqueur « wv »** retire la mention `wv` de l'agent par défaut, mais reste un agent de téléphone : Leclerc répond alors par son site mobile, et les essais 3 et 3b n'ont pas de sens.

37. Touche **Diagnostic**, puis **Effacer cookies et stockage…**, puis **Effacer**. Cela te **déconnecte** de Leclerc et repart de zéro : sans cela, les cookies anti-robot des passes précédentes pourraient fausser celle-ci.

38. Touche **Diagnostic**. Dans « Agent utilisateur », choisis **Le même, sans le marqueur « wv »**. Vérifie que la ligne « Agent utilisateur utilisé » ne contient plus `; wv`. Touche **Copier le diagnostic** et colle-le dans ton message. Touche **Fermer**.

39. Refais les parties **B** (accueil, magasin, **connexion**), **C**, puis les étapes 15 et 16. Note si l'anti-robot et la connexion se passent mieux ou moins bien qu'avec l'agent par défaut.

## Partie H : copier les résultats

40. Rassemble tous les textes copiés (essais, diagnostics de chaque passe) dans un seul message à toi-même ou une seule note, en gardant bien l'ordre : agent par défaut (mobile), puis mode ordinateur, puis, si tu l'as fait, « sans wv ».

41. Relis-les. Enlève tout ce qui est personnel : adresse e-mail, nom de ville de ton magasin, numéro de ton magasin (normalement masqué), nom de ton compte.

42. Note aussi le **modèle de ton téléphone** et la **version d'Android** (Paramètres, À propos du téléphone). La version d'Android et celle de la WebView sont déjà dans le diagnostic.

43. Demande à un agent (Claude Code) de t'aider. Tu peux lui écrire :

    > Voici les résultats de l'application Android de test (DRV-011). Remplis le rapport `docs/drive/spikes/DRV-011-rapport.md` du dépôt `repas`, puis ouvre une PR docs. Ne mets aucun identifiant, cookie, adresse e-mail ni numéro de magasin.

    Colle ensuite les résultats. L'agent te posera ses questions **une étape à la fois**. Il ne te demandera jamais un mot de passe.

## Partie I : quoi noter pour le rapport

| Question du spike                                                            | Où l'obtenir                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. L'anti-robot accepte-t-il la WebView (agent par défaut) ?                 | Étapes 7 et 8                                                 |
| 1bis. Et en mode ordinateur ?                                                | Étapes 28 à 34                                                |
| 1ter. Et « sans wv » (facultatif) ?                                          | Étapes 37 à 39                                                |
| 2. La connexion (mot de passe, code par e-mail) marche-t-elle ?              | Étape 10                                                      |
| 2bis. La connexion faite en mode mobile reste-t-elle valable en ordinateur ? | Étape 30                                                      |
| 3. Quel site Leclerc sert-il (mobile ou ordinateur) dans chaque mode ?       | Étape 15 (essai 1) et étape 31 (Diagnostic, « Site affiché ») |
| 4. Le banc donne-t-il les mêmes résultats que Chrome de bureau ?             | Étapes 33 et 34 : essais 1, 2, 3 et 3b en mode ordinateur     |
| 5. La session reste-t-elle ouverte entre deux lancements ?                   | Étapes 25 à 27, et étape 35 en mode ordinateur                |

Les questions 5 (passage du plan depuis Repas) et 6 (distribution) du document de pivot ne sont **pas** testées par ce spike.

## Partie J : si ça ne marche pas

- **Android refuse d'installer, ou « Installation bloquée ».** Refais l'étape 4 : l'autorisation « depuis cette source » doit être activée pour l'application avec laquelle tu as téléchargé le fichier (Chrome, ou Fichiers). Si Play Protect bloque, touche **Plus de détails**, puis **Installer quand même**.
- **« Application non installée » ou « conflit avec un autre paquet ».** Une autre version signée autrement est déjà là. Désinstalle **Banc Repas** (Paramètres, Applications), puis refais les étapes 3 à 6. Tu devras te reconnecter à Leclerc.
- **« Application non compatible ».** Ton Android est trop ancien (il faut Android 8 ou plus). Note la version d'Android dans le rapport.
- **Écran blanc.** Attends dix secondes. Puis touche **Diagnostic**, **Recharger la page**. Vérifie ta connexion (Wi-Fi ou données mobiles). Si l'écran reste blanc, touche **Diagnostic**, **Copier le diagnostic**, et note la version de la WebView : une WebView trop ancienne peut en être la cause (mets à jour « Android System WebView » dans le Play Store).
- **Page d'erreur de Leclerc** (« Accès refusé », « 403 », « Vous semblez être un robot »). Note le texte exact (sans donnée personnelle). Ne recharge pas la page vingt fois : attends dix minutes. Essaie un autre agent utilisateur (partie F, ou partie G) : c'est justement ce que le test mesure.
- **Une demande de test anti-robot (captcha) qui revient en boucle.** Résous-le une fois ou deux. Si ça boucle, note-le (c'est un résultat) et essaie un autre agent utilisateur.
- **Le site reste en version mobile en mode ordinateur** (le « Site affiché » du diagnostic commence encore par `m-`). Dans **Diagnostic**, touche **Revenir à l'accueil du site** et regarde de nouveau. Si c'est toujours le site mobile, cherche en bas de la page d'accueil de Leclerc un lien du genre « Version ordinateur » et touche-le. En dernier recours : **Diagnostic**, **Effacer cookies et stockage…**, puis reconnecte-toi en mode ordinateur. Note ce qui a fait changer le site.
- **Le menu du banc est minuscule en mode ordinateur.** Écarte deux doigts pour agrandir la page, ou touche **→ Mobile** pour les essais qui ne demandent que le menu.
- **Le diagnostic dit « Indications client : non disponible ».** Ta WebView est trop ancienne pour changer les indications client (il faut la version 126 ou plus). La chaîne d'agent utilisateur est appliquée quand même. Note-le, et mets à jour « Android System WebView » dans le Play Store si tu veux refaire l'essai.
- **La page de connexion s'ouvre dans Chrome au lieu de l'application.** L'application n'ouvre que `leclercdrive.fr`. Touche **Diagnostic** : la dernière ligne liste les **noms de sites** envoyés au navigateur du téléphone (jamais l'adresse complète). Copie le diagnostic et donne-le à l'agent : il saura quel site autoriser.
- **Rien ne se passe quand je touche Banc.** Touche **Diagnostic** : la ligne « Banc embarqué » doit montrer une empreinte `sha384-…`. Si elle dit « introuvable », note-le. Si un petit message dit « Ouvre d'abord une page du site Leclerc Drive », reviens à l'accueil du site.
- **Le banc dit « Cette page n'est pas une page de magasin ».** Choisis un magasin sur le site (étape 9), puis touche **Banc** de nouveau.
- **« Blocage probable (403/429) ».** C'est le site qui nous demande de ralentir. Attends dix minutes. Note après combien de requêtes ça s'est produit.
- **« Copier le résultat » ne copie rien.** Note-le (c'est un résultat). Essaie d'appuyer longuement sur le texte du résultat pour le sélectionner et le copier à la main.
- **L'écran ne s'éteint plus.** C'est voulu : l'application garde l'écran allumé tant qu'elle est ouverte au premier plan. Ferme-la quand tu as fini.
- **Je suis perdu.** Touche **Fermer** (banc ou diagnostic). Sinon, ferme complètement l'application (étape 24) et rouvre-la. Pour repartir de zéro : **Diagnostic**, **Effacer cookies et stockage…**.

## Partie K : après le test

44. Désinstalle l'application : Paramètres, Applications, **Banc Repas**, **Désinstaller**. Sa clé de signature est publique : on ne la garde pas.

45. Retire l'autorisation d'installer des applications inconnues : Paramètres, Applications, **Chrome** (ou Fichiers), **Installer des applications inconnues**, **Non autorisé**.

46. Quand la décision G1 est prise (ticket DRV-005), le dossier `drive-agent/android-lab/` pourra être supprimé du dépôt.

---

## Pour l'agent (construction et publication)

- **Construire** : `make android-lab` (dans Docker : JDK 17, Gradle, SDK Android ; le premier lancement prend quelques minutes). Il lance d'abord les tests Kotlin, puis écrit `drive-agent/android-lab/dist/repas-android-lab.apk` et affiche sa taille et son empreinte SHA-256.
- **Tests Kotlin seuls** : `make android-lab-test` (règle de navigation, choix de l'agent utilisateur et chaîne du mode ordinateur, texte du diagnostic).
- **Le banc embarqué** est `drive-agent/lab/published/lab.js`, copié dans l'application à la construction. La construction échoue si son empreinte SHA-384 n'est pas celle de `lab.js.sha384` (et `make check` aussi). Si le banc change exprès : `make lab-publish`, `make android-lab-hash`, relire, commiter `lab.js.sha384`, **le dire dans la PR**.
- **Mode ordinateur** : agent utilisateur `Mozilla/5.0 (X11; Linux x86_64) … Chrome/<majeure>.0.0.0 Safari/537.36` (version majeure lue dans l'agent de la WebView), indications client par `androidx.webkit` (`WebSettingsCompat.setUserAgentMetadata`, WebView 126 ou plus : plateforme Linux, mobile faux, modèle vide, marques de la WebView avec « Android WebView » renommé « Google Chrome »), fenêtre large (`useWideViewPort`). Les autres choix remettent les réglages d'origine. Le changement recharge la page sans toucher aux cookies.
- **Publication** : workflow GitHub « Android lab » (`.github/workflows/android-lab.yml`). Sur une PR, il construit l'APK et le dépose en artefact. Sur `main` (ou à la main, `workflow_dispatch` sur `main`), il crée aussi la pré-version `android-lab-<date>` (suffixe `-2`, `-3`… si elle existe déjà) avec l'APK et son empreinte SHA-256.
- **Signature** : `debug.keystore`, clé de test jetable et publique (mot de passe `android`, alias `androiddebugkey`), commitée pour que chaque APK s'installe par-dessus le précédent. Le numéro de version de l'APK est le numéro d'exécution du workflow.
- **Le code** : une activité (`MainActivity.kt`), la règle de navigation (`NavigationPolicy.kt`), les agents utilisateur (`UserAgent.kt`) et le texte du diagnostic (`DiagnosticReport.kt`), sous `app/src/main/kotlin/eu/kantin/repas/lab/`.

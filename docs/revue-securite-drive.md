# Revue de sécurité et de qualité du front, de l'agent et de l'application Android du drive

Revue indépendante du chantier « envoyer la liste de courses au drive Leclerc » côté **front web, agent embarqué (`drive-agent/`) et application Android (`android/`)**, faite le **2026-10-18** sur `main` au commit `30f6866` (#106), puis sur les corrections de la revue (#107 à #112). Elle cherche de vrais défauts, les prouve par un test qui échoue d'abord, corrige ceux qui sont confirmés et laisse à l'utilisateur les décisions de conception. Aucun contact avec Leclerc, aucune donnée réelle, aucun secret, aucun déploiement, aucune étiquette de version. Le pendant pour le back est `docs/drive/revue-securite-back.md` du dépôt back.

## En deux phrases

La conception tient sur l'essentiel : tout ce qui vient de la page de l'enseigne ou du plan s'affiche par `textContent`, le pont est borné et filtré des deux côtés, l'agent ne sort jamais de l'hôte de la page ni de la cadence, l'application ne demande que la permission Internet, ne se sauvegarde nulle part et sépare les cookies de Leclerc de ceux de Repas. **Cinq défauts de gravité basse ont été corrigés** (#107, #108, #109, #110, #112) ; **un risque de conception est à décider** : l'agent s'exécute dans le même monde JavaScript que la page de l'enseigne, qui peut donc lire le plan et fabriquer un faux résultat que le front enregistre tel quel (voir C1).

## Périmètre relu

- **Agent** : `drive-agent/src` en entier (point d'entrée, transport par pont et par fragment, orchestrateur et phases A et B, adaptateur Leclerc : magasin, recherche, panier, cadence, contenu net, analyse de la page ; interface en Shadow DOM, diagnostic, test automatique) et `drive-agent/protocol` (validateurs écrits à la main, codec, schémas, exemples), `drive-agent/scripts/build.mjs`. Environ 5 500 lignes. Le banc d'essai `lab/` et l'application `android-lab/` (jetables) ont été lus en passant.
- **Application Android** : `AndroidManifest.xml`, `res/xml/data_extraction_rules.xml`, `app/build.gradle.kts`, `build.sh`, les 23 fichiers Kotlin de `app/src/main` (environ 2 400 lignes : `MainActivity`, `DriveActivity`, `NativeBridge`, `BridgeMessages`, `DrivePlan`, `DrivePass`, `AgentHost`, `AgentAsset`, `NavigationPolicy`, `ShellNavigation`, `DriveProfile`, `DesktopMode`, rapports de débogage…), `injection.js`, les workflows `android.yml` et `release.yml`, la documentation `android/README.md`.
- **Front web** : `src/features/drive/` en entier (module `driveBridge`, brouillon, plan, retour, réglages, aide, vie privée, produits, estimation), le routeur, `docker/Caddyfile` (politique de contenu), `vite.config.ts` (PWA, cache hors ligne), les textes du drive de `src/i18n/fr.ts`.
- **Données personnelles** : tout le dépôt front et son historique complet (adresses, numéros de magasin, noms, IP, clés), puis le dépôt back en lecture seule (`git grep`, rien modifié).
- **Hors périmètre** : le back (revue à part), tout ce que fait Leclerc, l'essai sur un vrai téléphone, les versions d'Android antérieures à 14, la charge.

## Méthode

1. Lecture du code contre `consignes-agents.md`, les trois skills du domaine (`repas-front-dev`, `repas-agent-dev`, `repas-android-dev`), `architecture.md` § 8 et le contrat du pont `repasNative`.
2. **Sondes jetables** (tests non conservés) : analyse d'une page de 1 Mo pathologique (neuf formes), valeurs héritées de `Object.prototype` dans chaque table de l'agent, plan reçu par une page hostile après l'injection (jsdom, `injection.js` réel).
3. **Essai différentiel des règles de navigation** : 34 648 adresses piégées (`@`, `\`, port, point final, sous-domaines, `%2f`, tabulations, retours à la ligne, chiffres et lettres Unicode, `\u0000`, schémas voisins…) comparées, pour chacune, à l'analyseur d'adresses du web (WHATWG, celui de Chromium). Les trois règles (`NavigationPolicy`, `ShellNavigation`, `BridgeMessages.isAllowedOrigin`) ne doivent accepter que ce que le web lit comme `leclercdrive.fr` ou l'hôte de Repas en https.
4. **Essai sur Android 14** (émulateur de test, ART réel, processus à part, rien d'installé) : l'analyseur JSON de la plateforme face à 64 Ko de `[` ou de `{"a":` imbriqués.
5. Pour chaque défaut : un test qui échoue d'abord, la correction minimale, `npm run check` (et `agent:verify`, `agent:e2e`, `make android-test`, `android-agent-hash` quand l'agent ou l'application changent), une PR, la CI entièrement verte avant la fusion.
6. Recherche de données personnelles, de clés et de secrets : `git grep` sur l'arbre et sur tout l'historique.

Non fait : essai sur un téléphone réel (étape humaine), Android 8 à 13, charge, ré-essai des écrans dans Chromium (aucun écran n'a changé, seuls des textes).

## Défauts corrigés

| # | Gravité | Défaut | Preuve | Correctif |
|---|---|---|---|---|
| D1 | Basse (voir la note sous le tableau) | L'agent lisait des tables d'objets avec une clé venue de la page ou du plan, sans vérifier que l'objet la porte lui-même. Un nom hérité de `Object.prototype` (`constructor`, `__proto__`) retrouvait alors une fonction ou un objet : (a) une unité structurée `constructor` donnait un contenu net `{ value: NaN, unit: undefined }`, qui masquait le libellé et les prix (la règle « `null` plutôt qu'une valeur fausse » était violée) ; (b) l'entité `&constructor;` d'un libellé s'affichait « function Object() { [native code] } » ; (c) un ingrédient dont l'identifiant est `constructor` (un identifiant valide) était sauté du passage, puis le résultat n'était jamais envoyé (écran « le site ne répond plus comme prévu », produits déjà au panier). | 15 cas dans `drive-agent/test/hostile-keys.spec.ts`, 6 rouges avant, tous verts après. | #107 : `own()` (`drive-agent/src/own.ts`) ne rend une valeur que si l'objet la porte lui-même ; utilisé pour les unités, les entités et l'état du passage. `AGENT_VERSION` 0.6.1. |
| D2 | Basse (moyenne si l'on suit le conseil) | L'aide d'installation disait de prendre « la version la plus récente dont le nom commence par `android-` ». Les pré-versions de débogage (`android-dev-AAAA-MM-JJ`) et les bancs (`android-lab-…`) commencent par ce mot et il n'existe encore aucune `android-v…` : la phrase menait donc forcément à un APK d'essai (à ce jour : 2 pré-versions `android-dev`, 8 `android-lab`, aucune `android-v`). Ces APK sont **débogables** et **signés d'une clé publique** (celle du dépôt) : n'importe qui peut fabriquer un APK de même nom qui s'installe « par-dessus » et reprend les cookies. | `DriveHelpView.spec.ts`, 1 rouge avant. | #108 : l'aide dit `android-v` (par exemple `android-v0.1.0`) et d'ignorer les versions contenant « dev » ou marquées « Pre-release ». |
| D3 | Basse | La note de vie privée complète disait « tout cela se passe entre votre téléphone et Leclerc » et « ne la partage ni avec Repas ni avec personne » ; le mode d'emploi de l'application disait « ne parle qu'à leclercdrive.fr ». Or les pages de Leclerc chargent leurs propres services (anti-robot, mesure) et la WebView du drive accepte leurs cookies (`DriveActivity`, voulu pour le défi anti-robot). | `DriveHelpView.spec.ts` et `android/__tests__/shell.spec.ts`, 2 rouges avant. | #108 : les trois phrases le disent (« comme dans un navigateur, les pages de Leclerc font appel à leurs propres services… »). La note du back (`docs/drive/note-vie-privee.md`) doit recevoir la même phrase (voir C8). |
| D4 | Basse | Un numéro de magasin à six chiffres, donné en exemple de « zéro de tête » dans le banc d'essai, l'agent et leurs tests, venait de la mise au point sur le vrai site : il avait toute l'allure d'un vrai relevé, contre la règle « aucun vrai numéro de magasin ». | `src/__tests__/fictionalData.spec.ts` (nouveau), rouge avant. | #109 : remplacé par une valeur inventée partout ; le test impose que tout numéro de magasin du dépôt soit dans la liste des valeurs factices, et qu'aucune adresse d'un fournisseur de messagerie grand public n'apparaisse (hors deux copies du contrat du back, voir C7). L'historique Git garde l'ancienne valeur (voir « Données personnelles »). |
| D5 | Basse | `startsWith(..., ignoreCase = true)` de Kotlin suit Unicode : `ſ` (s long) devient `S`, donc `httpſ://www.leclercdrive.fr/` passait pour `https://` dans `NavigationPolicy` et `ShellNavigation`. Seule divergence trouvée par l'essai différentiel. Non exploitable aujourd'hui (la WebView ne remet à l'application que des adresses déjà canoniques), mais la règle dit qu'une acceptation à tort n'est jamais sans danger. | `NavigationPolicyTest` et `ShellNavigationTest`, 2 rouges avant (155 tests Kotlin). | #110 : le schéma se compare lettre ASCII par lettre ASCII (`startsWithAscii`). |
| D6 | Basse | `assertSameHost`, seule défense de l'agent contre une requête hors de l'hôte de la page, acceptait tout chemin commençant par une seule barre. Un navigateur lit `\` comme `/` et ignore les tabulations et retours à la ligne : `/\hote/x` et `/<tab>/hote/x` partent vers un autre hôte. Non exploitable aujourd'hui (les chemins sont construits par l'adaptateur sur une adresse déjà normalisée). | 5 cas dans `leclerc-pacer.spec.ts`, rouges avant ; chaque cas prouve par `new URL` qu'il change d'hôte. | #112 : le garde refuse ces chemins avant tout envoi. `AGENT_VERSION` 0.6.2. |

Pourquoi des gravités basses : aucun ingrédient réel ne s'appelle `constructor`, une unité de ce genre ne vient que d'une page de l'enseigne devenue étrange (D1) ; D5 et D6 ne sont atteignables par aucun chemin actuel (défense en profondeur) ; D2, D3 et D4 sont des textes et des données d'exemple. D1 viole pourtant une règle écrite de l'agent (une donnée de la page est non fiable, `null` plutôt qu'une valeur fausse) et D2 est le seul qui expose un utilisateur réel si le texte est suivi.

## Constats non corrigés (décisions pour l'utilisateur)

### C1 — La page de l'enseigne fait partie de la base de confiance de l'agent (moyenne)

L'agent est injecté dans le monde JavaScript de la page de Leclerc (WebView, pas de monde isolé). Tout script qui s'y exécute (Leclerc lui-même, un service tiers de la page comme l'anti-robot ou la mesure d'audience, ou une faille d'injection chez eux) peut donc, **sans rien casser** :

- **lire le plan** (`window.repasHost.addEventListener('message', …)` reçoit les mêmes messages que l'agent : les noms des ingrédients de la liste et l'identifiant du passage) ;
- **fabriquer un faux résultat** (`window.repasHost.postMessage(…)` avec le bon identifiant de passage, lu dans le plan) : l'application l'accepte (elle ne contrôle que le type et l'identifiant), le transmet à Repas, et l'écran du retour **l'enregistre tout de suite**, sans confirmation (`DriveReturnView.vue`, `persist()` au montage) : produits, libellés, contenus et prix mémorisés dans le compte, donc dans les fiches de produits partagées du magasin (le même mécanisme que C1 du back) ;
- remplacer ou supprimer `window.repasHost` (`configurable: true`), sans effet sur l'agent, qui a gardé sa référence.

Preuve (sonde jetable, jsdom, `injection.js` réel) : après l'injection, un script de page reçoit le plan via le pont et poste un `result` valide ; le canal natif simulé reçoit bien le message.

Ce que la page **ne peut pas** faire : atteindre Repas autrement que par ce canal, lire ou écrire les cookies, le jeton ou le stockage de Repas (autre origine, autre profil de WebView), envoyer une commande ou un plan à l'agent (elle n'a aucun moyen d'appeler ses écouteurs), ni déclencher `selftest` hors du mode débogage (voir « Points vérifiés »). Un cadre secondaire n'a ni pont ni agent, et l'application ignore ses messages.

Pourquoi pas corrigé : fermer le pont à la page ne sert à rien tant que la page partage le monde de l'agent (elle peut remplacer `JSON.stringify`, `fetch` ou `attachShadow` avant que l'agent s'en serve, donc lire ou fausser tout ce qu'il fait). Seule une isolation (monde isolé, absent d'Android WebView) règle le fond. C'est la limite connue d'un agent injecté dans une page tierce, et la page est celle de l'enseigne chez qui l'utilisateur a son propre compte.

**Décision (2026-10-18) : option C, sans confirmation supplémentaire, faite par DRV-614.** L'écran du retour ne retient d'un résultat que ce que le plan envoyé explique : une ligne dont l'ingrédient n'est pas dans le plan, un produit ajouté qui n'est pas l'un des siens, un produit choisi pour une ligne qui n'était pas à choisir sont ignorés, jamais enregistrés, comptés dans un message du récapitulatif (« N lignes inattendues ignorées »). Le brouillon de passage garde pour cela les lignes du plan envoyé (slug, statut, identifiants des produits) ; sans elles (brouillon d'une version plus ancienne), le plan est relu du back et, faute de plan, rien n'est enregistré. Le risque résiduel est celui que la revue décrit pour C : le contenu d'une ligne du plan (libellé, prix) reste fabricable ; les fiches de produits partagées sont protégées côté back (DRV-613, premier écrivain gagnant). L'option B (« Enregistrer ces choix ? ») reste possible plus tard.

Options : **A** (retenue par défaut) accepter et le dire dans la note de vie privée et l'ADR (« la page de Leclerc est dans la base de confiance de l'envoi ») ; **B** (petit changement, recommandé avant d'ouvrir à des inconnus) l'écran du retour montre ce qui sera mémorisé et demande « Enregistrer ces choix ? » au lieu de l'enregistrer au montage ; **C** le front ne retient d'un résultat que les lignes dont l'identifiant d'ingrédient figure dans le plan de la liste du brouillon. A et B se combinent ; C ne protège que l'identité des lignes, pas leur contenu. À décider avec C1 du back (fiches partagées).

### C2 — Coût d'analyse d'une page pathologique (basse)

Pas de retour arrière catastrophique : les expressions régulières de `embedded.ts`, `content.ts`, `cart.ts` et `store.ts` ont des alternatives disjointes ou bornées. En revanche, le repérage de l'objet qui entoure chaque identifiant de produit (`enclosingObject`) parcourt jusqu'à 18 000 caractères par identifiant, et les identifiants répétés sont retraités. Mesuré dans jsdom sur 1 Mo : 0,5 s pour 14 000 produits valides, **1,2 à 5,6 s** pour des pages pathologiques (80 000 identifiants sans accolade, accolades jamais refermées). Une vraie page de recherche fait environ un dixième de cette taille et ne répète pas ses identifiants. Non corrigé : la page vient de Leclerc, en TLS ; pas de test fiable sans mesure de temps. Piste : plafonner le nombre d'identifiants traités (par exemple 2 000) et ne pas retraiter un identifiant déjà lu avec son libellé.

### C3 — Limites du Shadow DOM fermé (info)

L'interface de l'agent est dans un Shadow DOM fermé et épinglé en `!important` : une feuille de style de la page ne la cache ni ne la déplace. Ce n'est **pas** une frontière contre un script de la page, qui peut envelopper `attachShadow` avant l'affichage du premier écran pour garder la racine (c'est ce que font les tests de bout en bout). Rien ne protège donc le bouton « Commencer » d'un clic simulé : sans conséquence, l'agent ne fait que ce que le plan demande.

### C4 — Pas de limite de débit sur le canal (info)

Une page hostile peut envoyer en boucle des messages de 64 Ko à l'application ; chacun est analysé sur le fil principal. Conséquence : lenteur de l'application tant que l'écran du drive est ouvert, rien de persistant. Piste : ignorer les messages qui arrivent plus vite que, par exemple, 20 par seconde.

### C5 — L'état de reprise est lisible par la page (info)

L'état d'un passage non terminé est dans le `sessionStorage` de la page de Leclerc (`repas:run:<identifiant>`) : identifiants d'ingrédients, de produits, libellés et prix lus sur le site, rien de personnel, effacé à la fin du passage. Il est relu avec contrôle de forme mais ses lignes ne sont pas revalidées une à une avant d'être renvoyées : une page peut y glisser des lignes, ce que le front refuse de toute façon (`validateResult`) ; même famille que C1.

### C6 — Pré-versions et bancs publics (à décider)

Les pré-versions `android-dev-*` (APK de débogage) et `android-lab-*` (banc d'essai) sont publiques, débogables et signées d'une clé publique du dépôt. D2 en réduit le risque (l'aide ne mène plus qu'à `android-v…`), pas la présence. Recommandation : supprimer les pré-versions anciennes quand l'essai est fini, ne jamais installer une pré-version sur le téléphone qui sert aux courses, et retirer `drive-agent/lab/`, `drive-agent/android-lab/` et leurs workflows à la fin du jalon M3b (le banc tire du code d'un CDN, avec empreinte, pour le favori de bureau : acceptable pour l'essai, pas à garder).

**Suite (2026-10-19)** : `drive-agent/lab/`, `drive-agent/android-lab/`, le workflow `android-lab.yml`, les cibles `make` (`lab*`, `android-lab*`), les scripts npm (`lab:*`), les entrées de configuration et de documentation qui ne servaient qu'à eux sont **retirés** (l'historique Git les garde ; l'agent, son empreinte et ses fixtures sont inchangés). Le workflow `android.yml` et sa pré-version `android-dev-*` **restent** : le runbook du back s'en sert pour le test automatique quand Leclerc change (`android/PROCEDURE.md`), avec leur avertissement. Reste, à la main : supprimer de la page des releases les pré-versions `android-lab-*` déjà publiées et les `android-dev-*` dont on n'a plus besoin.

### C7 — Copies du contrat du back (info)

`api/openapi.json` et `src/api/schema.d.ts` portent l'adresse de messagerie réelle d'un tiers, recopiée des exemples du back. À corriger au back, puis `npm run api:update` (voir « Données personnelles »). Le test de #109 écarte ces deux fichiers en attendant ; retirer cette exception ensuite.

### C8 — À garder identique (info)

La note du front (`drivePrivacy` de `fr.ts`) doit rester identique au fond à `docs/drive/note-vie-privee.md` du back : D3 y ajoute une phrase, à reporter côté back. Autre écart non corrigé, déjà noté par la revue du back (C1) : « Chacun ne retrouve que les produits qu'il a lui-même mémorisés » reste vrai, mais le contenu d'une fiche peut venir d'un autre utilisateur du même magasin (la note du front dit maintenant, comme celle du back, que la première personne qui décrit un produit fixe sa fiche et que les suivantes ne font que la compléter : DRV-613 partie 1). **Suite (DRV-613, partie 2)** : l'agent ne fait plus confiance au contenu mémorisé pour la quantité : en phase A il recalcule le nombre de produits sur le contenu lu en direct (et `needed`), le met au panier s'il diffère de celui du plan et le signale à l'écran de fin (`AGENT_VERSION` 0.8.0).

### C9 — Le CI et les actions GitHub (info)

Les workflows référencent les actions par étiquette (`actions/checkout@v7`, `docker/build-push-action@v7.4.0`…) et non par empreinte de commit. Les jetons sont limités à `contents: read` (sauf la pré-version, lancée à la main sur `main`) et le champ `tag` de `workflow_dispatch` passe par une variable d'environnement avant d'être validé : pas d'injection de commande. Piste : épingler par empreinte (Dependabot sait les mettre à jour).

## Points vérifiés sans défaut

**1. Agent : ce qui vient de la page**
- Tout s'affiche par `createElement` et `textContent` (`ui/dom.ts` ; `h()` refuse les attributs `on*` et `srcdoc`) ; aucun `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `v-html` dans `drive-agent/src` et `src/` (balayage, en plus des règles ESLint et de `rules.spec.ts`). Le sélecteur de produits n'affichait aucune image ; depuis DRV-633 il montre la photo des produits (12 au plus, `loading="lazy"`), construite par `createElement`, avec une adresse **revérifiée deux fois** (`photo-url.ts` : `https`, hôte `leclercdrive.fr` ou sous-domaine, ni identifiant ni port, 2 000 caractères au plus, ASCII imprimable seulement ; `candidate.ts` puis `ui/photo.ts`) ; jamais envoyée à Repas ni gardée.
- Les messages sont validés avant toute action : taille (64 Ko en octets, avant `JSON.parse`), types, bornes (100 lignes, 5 produits, 20 refusés, 1 à 99 produits, libellés de 1 à 255 caractères), clés inconnues refusées (`Object.keys` : un `__proto__` du JSON est une clé comme une autre, donc inconnue), doublons (`Set`), identifiants de produit `^[0-9]{1,12}$`, hôte `^[a-z0-9-]+\.leclercdrive\.fr$`, aucune entrée non validée n'est utilisée.
- Requêtes : un seul `fetch`, chemin relatif (D6 pour le garde), une seule requête à la fois, au moins 800 ms plus une gigue, un 403 ou 429 retenté une fois puis arrêt complet (`BLOCKED`), un 404 n'est pas un blocage, les écritures au panier sont absolues et vérifiées par la réponse. Aucune requête d'API vers Repas. L'agent n'agit qu'après « Commencer », ne valide ni ne paie jamais, ne retire rien du panier en production (le retrait n'existe que dans le test automatique de débogage).
- Pont : lu une fois au démarrage, avant la page ; pas d'agent ni de pont hors de la page principale (`win.top`, et `isMainFrame` côté application) ; l'origine de Repas écrite en dur n'est utilisée que pour le transport par fragment, qui n'existe pas dans l'application (`canReturn` faux sans pont ni origine).
- `command` / `selftest` : le message `command` n'arrive que de l'application. `selftest` n'est honoré que si le pont porte `isDebug`, posé par la variante de débogage du script d'injection ; le pont est gelé et la page n'a aucun moyen d'appeler les écouteurs de l'agent. Hors débogage, la commande est refusée sans rien afficher ni envoyer. Un `hello` mensonger (`debug: true`) n'a d'effet que dans l'APK de débogage.
- Rapports : le diagnostic ne contient que des nombres, des phrases fixes, `fdN` et les trois derniers chiffres du magasin ; le test automatique (débogage) est en plus revérifié et masqué côté application (adresses, e-mails, longs numéros).
- Reprise : `sessionStorage` sous `repas:run:<identifiant>`, un seul passage à la fois, état relu avec contrôle de forme, effacé à la fin (voir C5).

**2. Application Android**
- Manifeste : une seule permission (`INTERNET`) ; `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules` qui excluent racine, fichiers, bases, préférences et stockage externe, pour la sauvegarde et le transfert ; `usesCleartextTraffic="false"` ; un seul composant exporté (`MainActivity`, filtre `https` + hôte de Repas, `autoVerify`) dont le lien entrant est revalidé contre l'hôte ; `DriveActivity` non exportée ; pas de `debuggable`.
- WebView : JavaScript et stockage du site seulement ; `allowFileAccess` et `allowContentAccess` faux ; contenu mixte refusé ; Safe Browsing actif ; géolocalisation coupée ; certificat refusé jamais accepté ; aucune autorisation de caméra, micro ou fichier (non demandées, non implémentées) ; `setWebContentsDebuggingEnabled` seulement si l'application est débogable ; console de la page non journalisée ; cookies tiers refusés pour Repas, acceptés pour le drive (voulu, dit dans la note depuis D3).
- Navigation : l'essai différentiel (34 648 adresses) ne trouve **aucune acceptation à tort** hors D5 (`NavigationPolicy`, `ShellNavigation` et l'origine du canal : 0 hors `httpſ://`) ; 2 785 refus par prudence (adresses que le web lirait comme Leclerc mais que la règle envoie au navigateur du téléphone : sans danger). Schémas `intent:`, `file:`, `javascript:`, `data:`, `tel:` : bloqués ; autre page web : navigateur du téléphone. `window.open` du drive passe par la même règle.
- Canal `repasHost` : un seul objet, aucun `addJavascriptInterface` (testé), origines `https://*.leclercdrive.fr` écrites en dur, page principale seulement, texte seulement, 64 Ko en octets (taille puis octets UTF-8), JSON de version 1 et type connu ; la raison seule est journalisée. Canal `repasNative` : une seule origine (celle de la construction, `https://kantin.eu/` en publication, jamais lue d'un message).
- `drive.start` : plan validé dans sa forme et son hôte (identifiant de passage UUID, magasin de 1 à 12 chiffres, hôte `*.leclercdrive.fr` d'un seul niveau, chemin de retour, 100 lignes, 64 Ko), un seul passage à la fois (`BUSY` avec l'identifiant en cours), reprise 24 h, résultat mis en file puis livré, `NO_PASS` pour une annulation sans passage.
- JSON profond : 65 536 `[` ou 13 107 `{"a":` donnent une `JSONException` sur Android 14 (pas de dépassement de pile) ; un tableau fermé de 32 768 niveaux est analysé. Le risque de plantage par un message de 64 Ko est **réfuté** sur cette version (non essayé sur Android 8 à 13).
- Données gardées : une préférence privée (`drive-pass`) avec l'identifiant et le plan du passage non terminé et les résultats à livrer ; jamais un cookie ; exclue des sauvegardes.
- Journaux : seulement des constantes et la raison d'un refus (`Rejection`) ou une phrase fixe de `DesktopMode` ; jamais une adresse, un cookie ou le contenu d'un message.
- Profil de WebView séparé (`drive`) quand la WebView le permet ; sinon, les données de Repas et du drive sont mêlées dans l'application mais restent séparées par origine, et le menu le dit avant d'effacer.
- Signature : aucune clé dans le dépôt (seule `android/debug.keystore`, clé de débogage publique), quatre variables d'environnement pour la publication, refus sans clé prouvé par `make android-release-selftest`, `.gitignore` et `hygiene.spec.ts` ; aucune clé ni secret dans tout l'historique (balayage des motifs usuels : clés privées, jetons GitHub et AWS, JWT, mots de passe en clair).
- Débogage : menus « Test automatique » et « Plan d'essai », `debug-plan.json` et marqueur `isDebug` seulement dans la variante de débogage (`BuildConfig.DEBUG`, dossier `src/debug`).
- Intégrité de l'agent : empreinte SHA-384 vérifiée à la construction et au démarrage, jamais injecté s'il est altéré ou absent ; la construction est reproductible (deux constructions identiques, et l'empreinte de l'hôte est celle de Docker).

**3. Front web**
- `driveBridge` : message ignoré s'il n'est pas du texte de 64 Ko au plus, du JSON de version 1 et d'un type connu ; chaque message reconnu est validé champ par champ (`validateResult` pour un résultat, motif strict pour les codes et les identifiants) ; un résultat n'est pris que s'il porte l'identifiant du brouillon, puis recoupé avec le plan envoyé (C1, DRV-614) ; le brouillon (`repas.drive.run`) ne contient que l'identifiant du passage, celui de la liste, la date et, pour chaque ligne du plan, le slug de l'ingrédient, son statut et les identifiants de ses produits (clés exactes, 24 h) : ni magasin, ni jeton, ni libellé.
- Rendu : interpolation Vue partout (échappement), aucun `v-html`, aucun libellé du back ou de l'agent en HTML ; liens externes en `target="_blank" rel="noopener noreferrer"` ; aucune image externe ; politique de contenu de production inchangée depuis #26 (`default-src 'self'`, pas de script en ligne, pas d'image hors origine, `frame-ancestors 'none'`).
- Stockage : le jeton d'accès reste en mémoire ; la copie hors ligne ne garde que la liste active, au nom de l'utilisateur, 7 jours ; le plan du drive (qui contient la liste) n'est jamais gardé (`gcTime: 0`).
- Messages d'erreur : codes et chemins de champ seulement, jamais le contenu du message refusé.
- Textes : corrigés en D2 et D3 ; le reste de l'aide et de la note concorde avec le comportement (permission unique, pas de sauvegarde, effacement par le menu, produits et magasin conservés jusqu'à la suppression du compte, aucun cookie lu).

## Risques résiduels

1. **C1** : réduit par DRV-614 (option C : seules les lignes du plan sont retenues) et, côté back, par DRV-613 (premier écrivain gagnant, plafonds). La page de Leclerc peut encore fabriquer le contenu d'une ligne du plan ; l'option B (confirmation) reste à décider avant d'ouvrir à des inconnus.
2. Les pré-versions publiques débogables (C6), tant qu'elles existent.
3. Tout ce qui dépend de Leclerc (anti-robot, changement du site, conditions d'utilisation) est hors de ce périmètre et couvert par `runbook.md` et la note de vie privée.
4. Versions d'Android 8 à 13 et téléphones réels : non essayés (recette).

## Recommandations pour la recette (DRV-505)

- **Installer uniquement une release `android-vX.Y.Z`**, jamais une pré-version ; vérifier l'empreinte SHA-256 affichée par la release. Sur le téléphone : menu, « Version et mode d'emploi » (l'empreinte de l'agent doit commencer comme celle de la release).
- Vérifier que l'application n'est **pas débogable** : `adb shell dumpsys package eu.kantin.repas.drive | grep -i flags` ne doit pas contenir `DEBUGGABLE`, et la WebView ne doit pas apparaître dans `chrome://inspect`.
- Vérifier l'absence de sauvegarde : la même ligne `flags` ne doit pas contenir `ALLOW_BACKUP`.
- Après un envoi : `adb logcat -d | grep RepasDrive` ne doit montrer ni adresse, ni cookie, ni contenu.
- Avec deux comptes du même magasin (valeurs factices) : C1 du back (la fiche d'un produit modifiée par l'autre compte) ; c'est l'essai qui chiffre le risque.
- Sur un téléphone récent et un téléphone ancien : l'écran « Version » dit si le profil séparé est actif ; sans lui, se déconnecter de Leclerc déconnecte aussi de Repas (le message le dit).
- Publier `assetlinks.json` (étape humaine) avant d'envoyer le courriel de confirmation à d'autres personnes, sinon le lien s'ouvre dans le navigateur.

## Données personnelles dans les dépôts publics

**Dépôt front** (arbre et historique complet) :
- Un numéro de magasin à six chiffres, d'allure réelle, utilisé en exemple dans cinq fichiers du banc d'essai et de l'agent : **remplacé** (#109) ; il reste dans l'historique Git. Si c'est bien un vrai numéro, seule une réécriture de l'historique l'effacerait : décision de l'utilisateur.
- Une adresse de messagerie réelle d'un tiers (prénom et nom, fournisseur grand public), dans `api/openapi.json` (2 occurrences) et dans les types générés `src/api/schema.d.ts` : copies du contrat du back, qui la porte dans ses exemples. **Non modifiée ici** (la copie suit le back, `api/contract.json` en fige le commit) ; voir C7.
- `CLAUDE.md` du front donne l'adresse IP du serveur de production, l'utilisateur de déploiement et le nom du fichier de clé SSH (étape de vérification d'une livraison). Pas un secret, mais utile à qui vise le serveur : à remplacer par un renvoi au skill `repas-ops` si l'utilisateur le souhaite.
- Aucune clé privée, jeton, mot de passe ou certificat, dans l'arbre comme dans l'historique ; aucune capture d'écran suivie ; aucun nom de ville réel (seulement `Ville-Test` et dérivés) ; les hôtes `fd0` et `fd9` et le magasin `123456` sont inventés.

**Dépôt back** (lecture seule, **rien modifié**, à traiter par l'assistant) :
- L'adresse de messagerie réelle du tiers ci-dessus, dans `config/packages/nelmio_api_doc.yaml` (exemple OpenAPI, d'où les 2 occurrences de `docs/api/openapi.json`), `src/User/Application/Query/GetCurrentUser/CurrentUserDTO.php`, `src/Repas/Infrastructure/DataFixture/RecipeFixture.php` (73 fois), `ShoppingListFixture.php` (4 fois), `src/User/Infrastructure/DataFixture/UserFixture.php`, et le début de l'adresse (avec les dates et un nom de liste « EVJF … ») dans `phpstan-baseline.neon`.
- Dans `UserFixture.php` : le nom complet du tiers et **des mots de passe en clair** (trois comptes de développement). Si l'un d'eux est utilisé ailleurs, le changer.
- L'adresse de messagerie personnelle du propriétaire dans `src/User/Domain/Model/User.php` (`PROTECTED_EMAIL`), `UserFixture.php`, `ShoppingListFixture.php` et `docs/adr/0021-gestion-des-comptes-par-l-administrateur.md` : choix connu de l'utilisateur, à confirmer.
- L'adresse IP du serveur de production, avec la connexion `root`, dans `docs/production.md`, `docs/drive/runbook.md` et sept fichiers de `.claude/skills/repas-ops/` (déjà signalée par la revue du back).
- Les numéros de magasin du back sont tous inventés (`123456`, `654321`, `000042`, `000001`).

## Hors périmètre, vu en passant

- La branche DRV-320 (lecture du magasin depuis l'application, protocole `setup`) n'est pas relue ici ; elle touche `agent.ts`, le protocole et `android/` : après sa fusion, relire `MainActivity` et `DriveActivity` (nouvelle entrée de menu, `drive.setup`) avec les mêmes règles (une seule origine, un seul passage, rien de personnel dans le résultat de lecture du magasin).
- L'historique de l'agent (`AGENT_VERSION`) est maintenant 0.6.2 ; chaque changement de l'agent change `android/agent.js.sha384`.

## Addendum DRV-706 (2026-10-30) : la liste des origines par enseigne

Les règles de navigation et d'origine du pont ne sont plus écrites pour un seul domaine : `RetailerSite` (le cœur de l'application) les porte pour chaque enseigne, et `RetailerSites` est la seule liste. À relire par la revue :

- **Aucun joker plus large que nécessaire.** Un nom de site est un nom exact (`www.exemple.test`) ou tous les sous-domaines d'un domaine (`*.exemple.test`, jamais le domaine nu, jamais `*.fr`) ; `HostPattern` refuse tout autre forme à la construction. Les règles données à la WebView se déduisent de ces noms (`BridgeMessages.originRules`), seulement pour les hôtes qui portent le pont.
- **Navigation et pont sont deux listes.** Une enseigne peut naviguer sur plusieurs hôtes (page de connexion à part) sans que le pont `repasHost` ni l'agent existent sur la page du mot de passe (test avec une enseigne fictive : `RetailerIsolationTest`).
- **Une origine d'une enseigne ne reçoit jamais le plan d'une autre.** Un plan est refusé si son enseigne n'est pas au registre ou si l'hôte de son magasin n'est pas un hôte de cette enseigne où le pont existe ; il n'est livré qu'à une page de son enseigne (`RetailerSite.acceptsPlanOn`). Une adresse n'est celle que d'une seule enseigne : un registre où deux enseignes se partagent un nom de site est refusé.
- **Tables hostiles** (`@`, barre oblique inverse, port, point final, non-ASCII, domaine qui en contient un autre, schémas voisins) rejouées pour chaque enseigne fictive, en plus de celles de `NavigationPolicyTest` pour l'enseigne d'aujourd'hui, dont les attentes n'ont pas bougé.
- **Légère contrainte de plus pour l'enseigne d'aujourd'hui** : un plan ne part plus vers une page du domaine nu `leclercdrive.fr` (où l'on navigue mais où le pont n'existe pas) ; sans effet visible, le pont n'y existait pas.

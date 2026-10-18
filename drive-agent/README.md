# Agent du drive

L'**agent** est le petit programme JavaScript qui tourne dans la page de l'enseigne (E.Leclerc Drive), dans la session de l'utilisateur, pour mettre sa liste de courses au panier. Depuis la décision G1 (2026-10-17), son véhicule est l'**application Android** `android/` : elle injecte `dist/agent.js` dans les pages `*.leclercdrive.fr` de sa WebView (DRV-313). Aucun identifiant ni cookie d'enseigne ne passe par Repas.

Contexte et protocole : `docs/drive/` du dépôt back (`kcharignon/repas`), en particulier `architecture.md` § 8 et le ticket `DRV-301`.

État : **squelette** (DRV-301), **protocole v1** (DRV-302), **adaptateur Leclerc** (DRV-303), **interface superposée** (DRV-304), **orchestrateur de la phase A** (DRV-305) et **choix guidé, phase B** (DRV-306) et **mode configuration** (DRV-307) et **diagnostic** (DRV-308). Un plan reçu par un transport (pont de l'application, ou fragment `#repas=`) fait démarrer le passage : récapitulatif et confirmation, produits connus mis au panier, choix des nouveaux produits, résultat. Sans plan, l'agent reste silencieux sur la page. Un message `setup` lit le magasin de la page et le rend à Repas. Une commande `diagnostic` de l'application ouvre le diagnostic aussitôt (DRV-313) ; une page ouverte sur `#repas-diagnostic` (favori de bureau) affiche l'accueil, d'où on le lance.

> `lab/` (banc d'essai du favori) et `android-lab/` (application de test) sont des outils jetables du spike. Ils restent en place jusqu'à la fin du jalon M3b et ne font pas partie de l'agent.

## Commandes

Tout se lance dans Docker (`make help` les liste toutes).

| Commande            | Rôle                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `make agent-build`  | construit `dist/agent.js` et `dist/manifest.json` (version, taille, empreinte SHA-384)                                                          |
| `make agent-verify` | construit deux fois et échoue si les deux empreintes diffèrent (rejoué par la CI)                                                               |
| `make agent-test`   | joue les tests de l'agent seul (chaîne de construction, règles de code, agent) ; `make check` les joue aussi                                    |
| `make agent-e2e`    | joue l'agent réel dans Chromium (Pixel 7) contre le faux site Leclerc (`fake-leclerc/`, `e2e/`, DRV-309), sans back ni réseau ; la CI le rejoue |
| `make agent-fake`   | lance le faux site Leclerc à la main sur 127.0.0.1:8099 (Node 24 de la machine)                                                                 |

Le dossier `dist/` n'est jamais commité.

## Structure

```
drive-agent/
  src/
    index.ts          point d'entrée : exécute l'agent au chargement (rien n'est exporté)
    agent.ts          ce que fait l'agent quand l'application l'injecte
    version.ts        AGENT_VERSION (semver)
    text.ts           `cleanText` : tout texte lu sur la page de l'enseigne en passe par là (caractères invisibles et de contrôle retirés, espaces resserrées)
    transport/        comment le message arrive et repart : `fragmentTransport` (fragment d'adresse) et `bridgeTransport` (pont de l'application)
    leclerc/          tout ce qui est propre à E.Leclerc Drive, derrière `RetailerAdapter` : magasin, recherche, panier, erreurs, cadence (voir plus bas)
    ui/               l'interface superposée en Shadow DOM : écrans, textes (`strings.ts`), styles, `ui.show(écran, props)` (voir plus bas)
    flow/             l'orchestrateur du passage (machine d'états, phase A, état de reprise, résultat) (voir plus bas)
    diagnostic/       le mode diagnostic : auto-test en lecture seule et rapport copiable (voir plus bas)
    selftest/         le test automatique de la variante de débogage de l'application : la suite d'étapes, ses garde-fous et son rapport (voir plus bas)
  protocol/           le protocole v1, partagé avec le front (alias `@drive-protocol`) : schémas JSON, types, codec, validateurs, exemples
  test/               tests Vitest de l'agent et du protocole, et entries/ : points d'entrée d'essai pour la chaîne de construction
  demo/               page de démonstration de l'interface (hors production) : chaque écran avec des données inventées
  fixtures/           données SYNTHÉTIQUES inventées (voir son README)
  fake-leclerc/       le faux site Leclerc (serveur Node, données inventées, DRV-309) : voir son README
  e2e/                les tests de bout en bout de l'agent dans Chromium contre le faux site (Playwright, DRV-309)
  scripts/build.mjs   la construction
  dist/               sorties de la construction (ignoré par Git)
```

## L'adaptateur Leclerc (`src/leclerc/`)

Seul contrat supporté : le site PC `fdN-courses.leclercdrive.fr` (faits mesurés dans `recherche.md` et `DRV-007` du dépôt back). Toutes les requêtes vont à **l'hôte de la page** (chemins relatifs, cookies de la session envoyés par le navigateur, jamais lus). `fetch` et l'horloge sont injectés : les tests n'ont ni réseau ni attente réelle.

| Fichier        | Rôle                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter.ts`   | `RetailerAdapter` (`readStore`, `searchProducts`, `setCartQuantity`, `readProductFromSearch`), `LeclercAdapter`, `browserDeps(window)`                        |
| `pacer.ts`     | `Pacer` : une requête à la fois, 800 ms + gigue jusqu'à 700 ms entre deux, 403/429 retenté une fois puis `BLOCKED`, erreur réseau retentée une fois après 2 s |
| `store.ts`     | Magasin lu dans `/magasin-<id>-<id>[-<Ville>]`, adresse du panier **sans** suffixe de ville, point de livraison                                               |
| `embedded.ts`  | Analyse tolérante du JSON de produits embarqué dans la page de recherche                                                                                      |
| `content.ts`   | Contenu net (`g`, `ml`, `piece`) : champs structurés, libellé, prix ÷ prix par mesure ; `null` plutôt qu'une valeur fausse                                    |
| `candidate.ts` | `Candidate` : produit interprété, prix en **centimes** (décision D22)                                                                                         |
| `cart.ts`      | Requête du panier (`d=<JSON>`, en-tête `zcwb`, quantité absolue) et lecture de la réponse (`lstProduitsLight`)                                                |
| `errors.ts`    | `LeclercError` : `NOT_LOGGED_IN`, `BLOCKED`, `CONTRACT_CHANGED`, `NETWORK`, `UNSUPPORTED_PAGE` (messages fixes : jamais de cookie ni de page)                 |

Un 404 n'est **pas** un blocage (requête mal formée : `CONTRACT_CHANGED`) ; seuls 403, 429 et une page de défi (`captcha-delivery.com`) sont `BLOCKED`. Les fixtures (`fixtures/leclerc/`) sont inventées.

**Les textes de la page sont nettoyés à la source** : `decodeJsString` (`embedded.ts`), par où passent tous les libellés, secondes lignes, prix par mesure et unités du contenu structuré, rend un texte sans caractère invisible ni de contrôle (`cleanText`, `src/text.ts`). Le back refuse en bloc (`422 DRIVE_CHOICE_INVALID`, tout le lot de `PUT /drive/choices`) un libellé qui porte l'un des caractères de `LABEL_FORBIDDEN_CHARACTERS_PATTERN` (`Product.php` du dépôt back : contrôles, U+2028 et U+2029, U+061C, U+200B à U+200F, U+202A à U+202E, U+2060, U+2066 à U+2069, U+FEFF) : un seul libellé marqué ferait perdre les choix de tout un passage. Une largeur nulle disparaît sans laisser d'espace, un saut de ligne ou une tabulation devient une espace. `test/label-characters.spec.ts` recopie le motif du back (`test/back-label-rules.ts`, avec le chemin du fichier du back) et éprouve **chaque point de code Unicode** : si le back en refuse un de plus, ce test échoue tant que `src/text.ts` ne le retire pas. Les libellés qui partent vers Repas repassent par `cleanText` (`labelOf`, `flow/phase-b.ts`) ; la fixture `recherche-invisibles.html` et le produit `1000032` du faux site portent de tels caractères.

## L'interface superposée (`src/ui/`)

L'agent affiche ses écrans par-dessus la page de l'enseigne, dans un **Shadow DOM fermé** attaché à un conteneur plein écran (`position: fixed`, `z-index` maximal, épinglé par des déclarations en ligne `!important` : une règle de la page ne peut ni le cacher ni le déplacer). Rien n'est créé tant qu'aucun écran n'est affiché. Tout s'affiche par `createElement` et `textContent` (`h()` et `text()` de `dom.ts`) : un libellé de produit qui contient du HTML s'affiche tel quel.

| Fichier      | Rôle                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`   | `ScreenMap` (les écrans, leurs `props` et leur réponse) et `Ui` : `show(écran, props)` rend une promesse résolue par l'action de l'utilisateur, `update(patch)` met à jour la progression, `close()`                                                                                                                                                       |
| `screens.ts` | les écrans : accueil, récapitulatif, reprise, progression, quantité, choix de produit (hôte), rôle du produit choisi, enregistrement du magasin, erreurs, fin                                                                                                                                                                                              |
| `picker.ts`  | `renderPicker(zone, props, hooks)` : la liste de produits de la phase B (DRV-306) dans la zone de l'écran de choix : cases « Ne plus jamais prendre », champ « Chercher autre chose », un produit par carte (libellé, contenu, prix, prix à l'unité de mesure, promotion, nombre à mettre au panier), grisé s'il est indisponible ou refusé ; aucune image |
| `strings.ts` | **tous** les textes (français simple, tutoiement) et les conseils de chaque code d'erreur                                                                                                                                                                                                                                                                  |
| `ui.ts`      | `createUi({ win?, mode? })` : conteneur, feuille de style, focus (premier bouton, piège de focus) ; `mode: 'open'` seulement pour les tests d'accessibilité                                                                                                                                                                                                |

Un écran remplacé par un autre ne résout plus sa promesse. **Écran de choix (phase B, DRV-306)** : `ui.show('chooser', { ingredient, position, total, mount })` affiche la barre du haut (« Passer cette fois », « J'en ai toujours », « Annuler le passage ») et appelle `mount(zone, answer)` une fois la zone dans la page ; `answer(valeur)` conclut l'écran avec `{ kind: 'content', valeur }`. La phase B y monte `renderPicker`. L'écran `placement` (« Que fais-tu de ce produit ? ») rend `'PRIMARY' | 'FALLBACK' | 'ONCE'`, ou `null` pour revenir à la liste. La démonstration s'ouvre sur http://localhost:5173/drive-agent/demo/index.html?screen=summary (`make start`) ; `e2e/agent-ui.spec.ts` y passe axe (WCAG AA, clair et sombre), les 360×640 et la page hôte hostile.

## L'orchestrateur (`src/flow/`)

La machine d'états `START → VALIDATED → CONFIRMED → PHASE_A → PHASE_B → DONE` (+ `ABORTED`, `ERROR`) de la classe `Flow` (`orchestrator.ts`) n'a aucun réseau ni DOM propres : `FlowDeps` injecte l'adaptateur, l'interface (`Ui`), `send` (le transport), `sessionStorage`, le Wake Lock et l'horloge. `agent.ts` les branche (`run(win, options)`).

| Fichier           | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator.ts` | `Flow.start(message)` (validation, magasin, reprise, récapitulatif, phases, fin), `Flow.invalid()`, `Flow.history` ; un seul passage à la fois                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `phase-a.ts`      | `settleKnownLine` : les produits dans l'ordre de priorité, le premier disponible (stock lu dans la recherche par libellé) est mis au panier avec ses `packs`, vérifié par la réponse du panier ; **le contenu lu en direct fait foi** (DRV-613) : le nombre de produits est recalculé sur le contenu de la recherche et `needed` (`packsFor`), et s'il diffère de celui du plan c'est lui qui part au panier, avec un `change` pour l'écran de fin ; jamais un produit refusé ni absent de la liste ; `priceOf` (prix lu, D22)                                              |
| `run-state.ts`    | l'état de reprise `repas:run:<runId>` (issues par ligne, phase, lignes recalculées en direct), sans donnée personnelle ; un autre passage est oublié ; un état écrit avant DRV-613 (sans `changes`) se reprend comme avant                                                                                                                                                                                                                                                                                                                                                  |
| `phase-b.ts`      | `guidedChoice` (la phase B, variante P2) : pour chaque ligne à choisir, recherche du nom (ou de `searchQuery`), liste de 8 produits au plus, « Chercher autre chose », choix, quantité (« Quantité à vérifier » si le contenu est inconnu), rôle si l'ingrédient avait déjà des produits ou un « remplace », mise au panier, issue `CHOSEN` ; « Passer cette fois » (`SKIPPED`), « J'en ai toujours » (`HAVE_AT_HOME`), cases « Ne plus jamais prendre » (`rejected`) ; jamais un produit refusé ni en rupture ; `labelOf` (libellé envoyé à Repas, 255 caractères au plus) |
| `packs.ts`        | `packsFor(needed, contenu)` : le nombre de produits d'un produit choisi, mêmes règles que `PackCalculator` du back (`needed` : quantité demandée, unité, dimension et facteur du plan) ; `null` dans le doute                                                                                                                                                                                                                                                                                                                                                               |
| `setup.ts`        | `setupHandler` (DRV-307, branché sur `FlowDeps.onSetup`) : lit le magasin de la page (`adapter.readStore()`, aucune requête), demande « Enregistrer ce magasin dans Repas ? » (écran `store`, avec le libellé ou le numéro), puis rend `setup-result` (`id`, `host`, `baseUrl`, `label`) ; « Annuler » rend un `result` `aborted` sans ligne ; une page qui n'est pas celle d'un magasin donne l'écran `UNSUPPORTED_PAGE`                                                                                                                                                   |
| `result.ts`       | `resultLines`, `endingOf` (`completed`, `partial`, `aborted`, `error`), `buildResult`, `endProps`, `changesOf` (les lignes recalculées en direct, pour l'écran de fin)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `wake-lock.ts`    | `keepAwake` : verrou d'écran, refus et absence tolérés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Le contenu en direct fait foi (DRV-613)** : la fiche d'un produit est partagée entre les utilisateurs du même magasin, et depuis la partie 1 du ticket (back) l'agent des autres ne met plus à jour le contenu d'un produit déjà connu ; le contenu mémorisé par Repas peut donc être faux ou périmé. En phase A, la recherche par libellé qui sert au stock donne aussi le contenu du produit : quand le plan porte un nombre de produits sûr (`packs`, pas `TO_CHECK`), que la ligne a un `needed` et que le contenu est lisible, l'agent recalcule le nombre avec `packsFor` (la même fonction que la phase B). S'il diffère de celui du plan, il met **le nombre calculé en direct** au panier, sans question, et l'écran de fin ajoute « Contenu différent de celui mémorisé » avec « Farine : 10 au lieu de 1 » pour chaque ligne concernée (gardée dans l'état de reprise, donc aussi après un rechargement). Sans `needed`, sans contenu lisible, ou quand le calcul n'est pas sûr (autre dimension que la quantité demandée), rien ne change : le nombre du plan, ou la question à l'utilisateur quand il est à vérifier. Le résultat renvoyé à Repas ne reprend jamais le contenu mémorisé du plan pour la quantité : `quantity` est ce que le panier du site a gardé (réponse vérifiée). Pas de requête de plus : la recherche était déjà faite pour le stock.

Erreurs : `BLOCKED` (deux réponses de suite, vu par le `Pacer`) arrête le passage, `partial`, les lignes restantes `FAILED` ; `NOT_LOGGED_IN` arrête aussitôt (`error`) ; `NETWORK` (déjà retenté une fois) n'abîme que la ligne ; `CONTRACT_CHANGED` (et tout incident imprévu, jamais son message) arrête le passage. **Phase B (DRV-306)** : `FlowDeps.phaseB(context)` (l'agent branche `guidedChoice`) reçoit `pending` (les lignes `NEW` et les lignes dont aucun produit connu n'est disponible, avec ces produits indisponibles), `record(ligne)` (sauvegarde pour la reprise, la progression avance), `stopRequested()`, `showProgress()`, `adapter` et `ui` ; une ligne qu'elle n'enregistre pas devient `UNAVAILABLE` au résultat. Une erreur réseau pendant une recherche devient un message dans la liste (on peut réessayer ou passer) et, au panier, fait échouer la seule ligne ; `BLOCKED` arrête le passage (`partial`, lignes restantes `FAILED`), les autres erreurs aussi. Le message `setup` est passé à `FlowDeps.onSetup` (DRV-307, `setupHandler`) après le contrôle du retour possible.

## Le diagnostic (`src/diagnostic/`)

Quand Leclerc change son site, l'utilisateur peut dire en un geste ce qui ne marche plus, sans rien exposer de personnel. L'agent affiche l'écran d'accueil (« Ouvre d'abord Repas » et un bouton « Diagnostic ») quand l'adresse de la page se termine par `#repas-diagnostic` (`DIAGNOSTIC_HASH` de `agent.ts`, pour le favori de bureau). L'application « Repas Drive » n'utilise plus de fragment (un fragment de 6 Ko a fait échouer le site) : son menu « Diagnostic de l'agent » envoie sur le pont le message de commande `{"v":1,"type":"command","command":"diagnostic"}` (protocole, `command.schema.json`), que l'agent valide puis traite en ouvrant l'écran du diagnostic. La commande est ignorée pendant un passage (un seul écran à la fois) et ne renvoie rien ; une commande invalide montre « liste illisible ». Sans commande, sans fragment et sans plan, l'agent reste silencieux.

| Fichier     | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks.ts` | `runChecks` : huit contrôles en lecture seule, chacun `OK`, `KO` (avec son code : `BLOCKED`, `CONTRACT_CHANGED`, `NOT_LOGGED_IN`, `UNSUPPORTED_PAGE`, `NETWORK`) ou `NOT_TESTED` : version de l'agent, page reconnue et magasin lu, origine de Repas écrite dans l'agent, stockage de session, Wake Lock, **une** recherche du mot « sel » (champs attendus présents), contenu net lu, cadre de même origine (non testé : le choix se fait dans la liste de l'agent, variante P2). Aucune écriture au panier ; après une page non prise en charge, aucune requête ; `BLOCKED` arrête les contrôles qui dépendaient de la recherche |
| `report.ts` | `reportOf` : le texte à copier (version, date à la minute en UTC, résultats), **sans** cookie, identifiant de compte, adresse, nom, numéro de magasin entier (seulement `…` et ses trois derniers chiffres) ni contenu de page : les détails ne portent que des nombres et des phrases fixes ; l'hôte n'y figure que sous la forme `fdN`                                                                                                                                                                                                                                                                                           |
| `index.ts`  | `showDiagnostic` : l'écran `diagnostic` (les lignes avancent, puis le résumé, le rapport dans une zone de texte et « Copier le rapport » ; si le navigateur refuse, le texte est sélectionné pour une copie à la main)                                                                                                                                                                                                                                                                                                                                                                                                             |

## Le test automatique (`src/selftest/`, DRV-318)

Pour remplacer la procédure manuelle de l'APK de débogage par un seul geste, l'application envoie la commande `{"v":1,"type":"command","command":"selftest"}`. **L'agent ne l'honore que si l'application a annoncé le mode débogage** : le script d'injection de la variante de débogage pose `isDebug` sur le pont (`Bridge.isDebug`) et annonce `debug: true` dans son message d'accueil ; dans toute autre variante, ou sans pont, la commande est refusée (rien à l'écran, aucune requête, rien d'envoyé). Elle est ignorée pendant un passage, un diagnostic ou un autre test (`Flow.exclusive`) ; jamais un plan ne la déclenche.

| Fichier     | Rôle                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run.ts`    | `runSelftest` : 1. le diagnostic (`runChecks`), 2. la lecture du magasin, 3. le lot de 12 recherches en série (`LOT_WORDS`), 4. l'essai de 3 produits (`PASSAGE_WORDS`) puis le nettoyage, 5. la comparaison du panier avant et après (`compareCart`) ; `pickCandidate`, `safeLabel` |
| `report.ts` | `reportOf` : le texte à copier (OK / KO par étape, durées en secondes, codes HTTP, quantités obtenues, produits trouvés par mot, état du panier), `isOk`, `stepStatuses`                                                                                                             |
| `index.ts`  | `showSelftest` : l'écran de progression (titre « Test automatique », « Arrêter »), le message `selftest-result` rendu à l'application, puis l'interface retirée                                                                                                                      |

Choix automatique : pour chacun des trois premiers mots (farine, sucre, sel), l'agent cherche le mot puis prend le **premier produit en stock pour trois exemplaires (`MIN_STOCK`), hors panier (`inCart` à 0), dont le prix est lu**, et que l'essai n'a pas déjà pris ; jamais un produit grisé, jamais un produit que l'utilisateur a déjà au panier. Le premier produit passe par les quantités 1, 3 puis 2 ; les autres sont ajoutés en quantité 1 ; tout est ensuite remis à 0. Le panier d'avant se lit sur la page de la première recherche (total) et se déduit de la première réponse du panier (nombre d'articles) ; celui d'après est la réponse du dernier retrait. Garde-fous : `MAX_PRODUCTS` (3) produits au plus, `MAX_TEST_QUANTITY` (3) exemplaires au plus (une `RangeError` sinon), arrêt immédiat sur `BLOCKED`, `NOT_LOGGED_IN` ou `UNSUPPORTED_PAGE` (et après trois recherches de suite sans résultat), nettoyage **toujours** tenté (deux essais par produit, jamais après un blocage, qui interdit toute requête) avec la liste des produits restants à retirer à la main, « Arrêter » compris. Cadence normale du `Pacer` (800 ms + gigue), jamais accélérée.

Le rapport ne contient que des nombres, des codes d'erreur, des mots de recherche fixes et des libellés de produits **nettoyés** (`safeLabel` : lettres, chiffres, ponctuation simple, 40 caractères, ni adresse, ni nom d'enseigne, de cookie ou de jeton) ; l'hôte y est `fdN` et le magasin ses trois derniers chiffres ; `test/selftest.spec.ts` éprouve ces motifs sur des libellés hostiles. Il part dans un message `selftest-result` (`protocol/selftest-result.schema.json`, 20 000 caractères au plus) que l'application copie et propose au partage.

## Construction

`scripts/build.mjs` fait de `src/index.ts` **un seul fichier** : une fonction appelée sur-le-champ (IIFE), minifiée, sans bibliothèque tierce ni variable globale, pour les WebView à jour (cible ES2022). Elle écrit :

- `dist/agent.js` : le code, précédé de `/*! Repas Drive agent X.Y.Z */` ;
- `dist/manifest.json` : `{"version", "bytes", "sha384"}`, l'empreinte étant au format `sha384-<base64>` (celui de l'attribut `integrity`).

**Reproductible** : versions épinglées par `package-lock.json`, aucune date ni chemin absolu dans le fichier, donc la même empreinte sur tous les postes et en CI. `make agent-verify` et `build.spec.ts` le vérifient.

**Budget de taille** : la construction échoue au-delà de 256 000 octets (`AGENT_MAX_BYTES=<octets>` pour un essai). C'est un garde-fou contre une bibliothèque entrée dans le fichier par mégarde, pas une limite d'un navigateur.

Vérifier l'empreinte d'un `agent.js` à la main :

```
openssl dgst -sha384 -binary drive-agent/dist/agent.js | openssl base64 -A
```

Le résultat, précédé de `sha384-`, doit être celui de `dist/manifest.json`. L'application Android compare l'empreinte de `agent.js` à celle qu'elle attend et refuse de se construire si elles diffèrent (DRV-313).

Monter `AGENT_VERSION` (`src/version.ts`) à chaque changement de l'agent.

Un favori JavaScript pour Chrome de bureau reste possible plus tard (Chrome Android, lui, ne lance aucun favori JavaScript) ; il est facultatif et n'est pas construit ici.

## Le faux site et les tests de bout en bout (DRV-309)

`fake-leclerc/` imite la structure du drive (recherche, panier, connexion, page de défi) avec des données inventées et juge la politesse de l'agent (jamais en parallèle, 800 ms au moins entre deux requêtes, forme exacte de la requête du panier). `e2e/` joue l'agent **construit** dans Chromium (Pixel 7), page du faux magasin ouverte sous `courses-test.leclercdrive.fr` (résolu vers 127.0.0.1, tout autre hôte sans adresse) :

- par le **fragment** d'adresse : plan dans `#repas=`, résultat rendu au faux Repas par navigation (`passage.spec.ts`, `choix.spec.ts`, `incidents.spec.ts`) : plan valide et invalide, magasin différent, phase A (rupture, promotion, panier déjà garni, quantité à vérifier, contenu lu en direct différent de celui du plan, contenu illisible), phase B (choix, recherche, « ne plus jamais prendre », rôle), blocage 403 / 429 / défi, site changé, 404, déconnexion, reprise après rechargement ;
- par le **pont** de l'application, avec le vrai `android/app/src/main/assets/injection.js` et un faux canal natif (`pont.spec.ts`) : plan et résultat par le pont, mode configuration, diagnostic.

Seul le Shadow DOM de l'interface est ouvert pour Playwright (`attachShadow` forcé à `open`) ; l'agent n'est pas modifié. Un test échoue si l'agent envoie deux requêtes à la fois ou plus vite que la cadence (`support/cadence.ts`). Le cadre natif (variante P1) a été abandonné à la décision G1 : `X-Frame-Options: DENY` est servi mais aucun test de cadre n'existe.

## Règles de code

L'agent tourne dans la page d'une enseigne, avec les droits de l'utilisateur. Dans `src/`, ESLint (`eslint.config.ts`, bloc `drive-agent/src`) interdit :

- `eval`, `new Function`, `setTimeout("code")`, les adresses `javascript:` et l'import dynamique : **aucun code distant** ;
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, la balise `script` : afficher avec `textContent` et `createElement` ;
- un `fetch` vers une adresse absolue (seul l'hôte de la page est permis : chemin relatif), `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `sendBeacon` ;
- tout import qui n'est pas un fichier relatif (`src/`, ou `protocol/` par `../../protocol`) : **aucune dépendance à l'exécution**. Les mêmes règles couvrent `protocol/`.

`test/rules.spec.ts` éprouve chaque règle sur un code qui l'enfreint. TypeScript est strict, avec un `tsconfig` dédié (`tsconfig.agent.json`, DOM seul, aucun type de Node). Les tests utilisent des données synthétiques : jamais de HTML brut d'une enseigne, de vrai numéro de magasin, de nom de ville, de cookie, de jeton, d'identifiant ni d'e-mail (le dépôt est public).

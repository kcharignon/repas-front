# Agent du drive

L'**agent** est le petit programme JavaScript qui tourne dans la page de l'enseigne (E.Leclerc Drive), dans la session de l'utilisateur, pour mettre sa liste de courses au panier. Depuis la décision G1 (2026-10-17), son véhicule est l'**application Android** `android/` : elle injecte `dist/agent.js` dans les pages `*.leclercdrive.fr` de sa WebView (DRV-313). Aucun identifiant ni cookie d'enseigne ne passe par Repas.

Contexte et protocole : `docs/drive/` du dépôt back (`kcharignon/repas`), en particulier `architecture.md` § 8 et le ticket `DRV-301`.

État : **squelette** (DRV-301), **protocole v1** (DRV-302), **adaptateur Leclerc** (DRV-303), **interface superposée** (DRV-304), **orchestrateur de la phase A** (DRV-305) et **choix guidé, phase B** (DRV-306) et **mode configuration** (DRV-307) et **diagnostic** (DRV-308). Un plan reçu par un transport (pont de l'application, ou fragment `#repas=`) fait démarrer le passage : récapitulatif et confirmation, produits connus mis au panier, choix des nouveaux produits, résultat. Sans plan, l'agent reste silencieux sur la page. Un message `setup` lit le magasin de la page et le rend à Repas. Une commande `diagnostic` de l'application ouvre le diagnostic aussitôt (DRV-313) ; une page ouverte sur `#repas-diagnostic` (favori de bureau) affiche l'accueil, d'où on le lance.

> `lab/` (banc d'essai du favori) et `android-lab/` (application de test) sont des outils jetables du spike. Ils restent en place jusqu'à la fin du jalon M3b et ne font pas partie de l'agent.

## Commandes

Tout se lance dans Docker (`make help` les liste toutes).

| Commande            | Rôle                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `make agent-build`  | construit `dist/agent.js` et `dist/manifest.json` (version, taille, empreinte SHA-384)                       |
| `make agent-verify` | construit deux fois et échoue si les deux empreintes diffèrent (rejoué par la CI)                            |
| `make agent-test`   | joue les tests de l'agent seul (chaîne de construction, règles de code, agent) ; `make check` les joue aussi |

Le dossier `dist/` n'est jamais commité.

## Structure

```
drive-agent/
  src/
    index.ts          point d'entrée : exécute l'agent au chargement (rien n'est exporté)
    agent.ts          ce que fait l'agent quand l'application l'injecte
    version.ts        AGENT_VERSION (semver)
    transport/        comment le message arrive et repart : `fragmentTransport` (fragment d'adresse) et `bridgeTransport` (pont de l'application)
    leclerc/          tout ce qui est propre à E.Leclerc Drive, derrière `RetailerAdapter` : magasin, recherche, panier, erreurs, cadence (voir plus bas)
    ui/               l'interface superposée en Shadow DOM : écrans, textes (`strings.ts`), styles, `ui.show(écran, props)` (voir plus bas)
    flow/             l'orchestrateur du passage (machine d'états, phase A, état de reprise, résultat) (voir plus bas)
    diagnostic/       le mode diagnostic : auto-test en lecture seule et rapport copiable (voir plus bas)
  protocol/           le protocole v1, partagé avec le front (alias `@drive-protocol`) : schémas JSON, types, codec, validateurs, exemples
  test/               tests Vitest de l'agent et du protocole, et entries/ : points d'entrée d'essai pour la chaîne de construction
  demo/               page de démonstration de l'interface (hors production) : chaque écran avec des données inventées
  fixtures/           données SYNTHÉTIQUES inventées (voir son README)
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
| `phase-a.ts`      | `settleKnownLine` : les produits dans l'ordre de priorité, le premier disponible (stock lu dans la recherche par libellé) est mis au panier avec ses `packs`, vérifié par la réponse du panier ; jamais un produit refusé ni absent de la liste ; `priceOf` (prix lu, D22)                                                                                                                                                                                                                                                                                                  |
| `run-state.ts`    | l'état de reprise `repas:run:<runId>` (issues par ligne, phase), sans donnée personnelle ; un autre passage est oublié                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `phase-b.ts`      | `guidedChoice` (la phase B, variante P2) : pour chaque ligne à choisir, recherche du nom (ou de `searchQuery`), liste de 8 produits au plus, « Chercher autre chose », choix, quantité (« Quantité à vérifier » si le contenu est inconnu), rôle si l'ingrédient avait déjà des produits ou un « remplace », mise au panier, issue `CHOSEN` ; « Passer cette fois » (`SKIPPED`), « J'en ai toujours » (`HAVE_AT_HOME`), cases « Ne plus jamais prendre » (`rejected`) ; jamais un produit refusé ni en rupture ; `labelOf` (libellé envoyé à Repas, 255 caractères au plus) |
| `packs.ts`        | `packsFor(needed, contenu)` : le nombre de produits d'un produit choisi, mêmes règles que `PackCalculator` du back (`needed` : quantité demandée, unité, dimension et facteur du plan) ; `null` dans le doute                                                                                                                                                                                                                                                                                                                                                               |
| `setup.ts`        | `setupHandler` (DRV-307, branché sur `FlowDeps.onSetup`) : lit le magasin de la page (`adapter.readStore()`, aucune requête), demande « Enregistrer ce magasin dans Repas ? » (écran `store`, avec le libellé ou le numéro), puis rend `setup-result` (`id`, `host`, `baseUrl`, `label`) ; « Annuler » rend un `result` `aborted` sans ligne ; une page qui n'est pas celle d'un magasin donne l'écran `UNSUPPORTED_PAGE`                                                                                                                                                   |
| `result.ts`       | `resultLines`, `endingOf` (`completed`, `partial`, `aborted`, `error`), `buildResult`, `endProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `wake-lock.ts`    | `keepAwake` : verrou d'écran, refus et absence tolérés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Erreurs : `BLOCKED` (deux réponses de suite, vu par le `Pacer`) arrête le passage, `partial`, les lignes restantes `FAILED` ; `NOT_LOGGED_IN` arrête aussitôt (`error`) ; `NETWORK` (déjà retenté une fois) n'abîme que la ligne ; `CONTRACT_CHANGED` (et tout incident imprévu, jamais son message) arrête le passage. **Phase B (DRV-306)** : `FlowDeps.phaseB(context)` (l'agent branche `guidedChoice`) reçoit `pending` (les lignes `NEW` et les lignes dont aucun produit connu n'est disponible, avec ces produits indisponibles), `record(ligne)` (sauvegarde pour la reprise, la progression avance), `stopRequested()`, `showProgress()`, `adapter` et `ui` ; une ligne qu'elle n'enregistre pas devient `UNAVAILABLE` au résultat. Une erreur réseau pendant une recherche devient un message dans la liste (on peut réessayer ou passer) et, au panier, fait échouer la seule ligne ; `BLOCKED` arrête le passage (`partial`, lignes restantes `FAILED`), les autres erreurs aussi. Le message `setup` est passé à `FlowDeps.onSetup` (DRV-307, `setupHandler`) après le contrôle du retour possible.

## Le diagnostic (`src/diagnostic/`)

Quand Leclerc change son site, l'utilisateur peut dire en un geste ce qui ne marche plus, sans rien exposer de personnel. L'agent affiche l'écran d'accueil (« Ouvre d'abord Repas » et un bouton « Diagnostic ») quand l'adresse de la page se termine par `#repas-diagnostic` (`DIAGNOSTIC_HASH` de `agent.ts`, pour le favori de bureau). L'application « Repas Drive » n'utilise plus de fragment (un fragment de 6 Ko a fait échouer le site) : son menu « Diagnostic de l'agent » envoie sur le pont le message de commande `{"v":1,"type":"command","command":"diagnostic"}` (protocole, `command.schema.json`), que l'agent valide puis traite en ouvrant l'écran du diagnostic. La commande est ignorée pendant un passage (un seul écran à la fois) et ne renvoie rien ; une commande invalide montre « liste illisible ». Sans commande, sans fragment et sans plan, l'agent reste silencieux.

| Fichier     | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks.ts` | `runChecks` : huit contrôles en lecture seule, chacun `OK`, `KO` (avec son code : `BLOCKED`, `CONTRACT_CHANGED`, `NOT_LOGGED_IN`, `UNSUPPORTED_PAGE`, `NETWORK`) ou `NOT_TESTED` : version de l'agent, page reconnue et magasin lu, origine de Repas écrite dans l'agent, stockage de session, Wake Lock, **une** recherche du mot « sel » (champs attendus présents), contenu net lu, cadre de même origine (non testé : le choix se fait dans la liste de l'agent, variante P2). Aucune écriture au panier ; après une page non prise en charge, aucune requête ; `BLOCKED` arrête les contrôles qui dépendaient de la recherche |
| `report.ts` | `reportOf` : le texte à copier (version, date à la minute en UTC, résultats), **sans** cookie, identifiant de compte, adresse, nom, numéro de magasin entier (seulement `…` et ses trois derniers chiffres) ni contenu de page : les détails ne portent que des nombres et des phrases fixes ; l'hôte n'y figure que sous la forme `fdN`                                                                                                                                                                                                                                                                                           |
| `index.ts`  | `showDiagnostic` : l'écran `diagnostic` (les lignes avancent, puis le résumé, le rapport dans une zone de texte et « Copier le rapport » ; si le navigateur refuse, le texte est sélectionné pour une copie à la main)                                                                                                                                                                                                                                                                                                                                                                                                             |

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

## Règles de code

L'agent tourne dans la page d'une enseigne, avec les droits de l'utilisateur. Dans `src/`, ESLint (`eslint.config.ts`, bloc `drive-agent/src`) interdit :

- `eval`, `new Function`, `setTimeout("code")`, les adresses `javascript:` et l'import dynamique : **aucun code distant** ;
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, la balise `script` : afficher avec `textContent` et `createElement` ;
- un `fetch` vers une adresse absolue (seul l'hôte de la page est permis : chemin relatif), `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `sendBeacon` ;
- tout import qui n'est pas un fichier relatif (`src/`, ou `protocol/` par `../../protocol`) : **aucune dépendance à l'exécution**. Les mêmes règles couvrent `protocol/`.

`test/rules.spec.ts` éprouve chaque règle sur un code qui l'enfreint. TypeScript est strict, avec un `tsconfig` dédié (`tsconfig.agent.json`, DOM seul, aucun type de Node). Les tests utilisent des données synthétiques : jamais de HTML brut d'une enseigne, de vrai numéro de magasin, de nom de ville, de cookie, de jeton, d'identifiant ni d'e-mail (le dépôt est public).

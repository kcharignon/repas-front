# Agent du drive

L'**agent** est le petit programme JavaScript qui tourne dans la page de l'enseigne (E.Leclerc Drive), dans la session de l'utilisateur, pour mettre sa liste de courses au panier. Depuis la décision G1 (2026-10-17), son véhicule est l'**application Android** `android/` : elle injecte `dist/agent.js` dans les pages `*.leclercdrive.fr` de sa WebView (DRV-313). Aucun identifiant ni cookie d'enseigne ne passe par Repas.

Contexte et protocole : `docs/drive/` du dépôt back (`kcharignon/repas`), en particulier `architecture.md` § 8 et le ticket `DRV-301`.

État : **squelette** (DRV-301), **protocole v1** (DRV-302), **adaptateur Leclerc** (DRV-303) et **interface superposée** (DRV-304). La construction, ses garde-fous et ses règles de code sont en place, et le protocole (messages, codec, validateurs, transports) est écrit ; l'agent lui-même ne fait encore rien (il reste silencieux sur la page) : l'orchestrateur (DRV-305) s'y ajoute et branche le tout.

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
    flow/ diagnostic/    à venir : DRV-305-306, 308
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

| Fichier      | Rôle                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`   | `ScreenMap` (les écrans, leurs `props` et leur réponse) et `Ui` : `show(écran, props)` rend une promesse résolue par l'action de l'utilisateur, `update(patch)` met à jour la progression, `close()` |
| `screens.ts` | les écrans : accueil, récapitulatif, reprise, progression, quantité, choix de produit (hôte), erreurs, fin                                                                                           |
| `strings.ts` | **tous** les textes (français simple, tutoiement) et les conseils de chaque code d'erreur                                                                                                            |
| `ui.ts`      | `createUi({ win?, mode? })` : conteneur, feuille de style, focus (premier bouton, piège de focus) ; `mode: 'open'` seulement pour les tests d'accessibilité                                          |

Un écran remplacé par un autre ne résout plus sa promesse. **Point d'extension de la phase B (DRV-306)** : `ui.show('chooser', { ingredient, position, total, mount })` affiche la barre du haut (« Passer cette fois », « J'en ai toujours », « Annuler le passage ») et appelle `mount(zone, answer)` une fois la zone dans la page ; `answer(valeur)` conclut l'écran avec `{ kind: 'content', valeur }`. La démonstration s'ouvre sur http://localhost:5173/drive-agent/demo/index.html?screen=summary (`make start`) ; `e2e/agent-ui.spec.ts` y passe axe (WCAG AA, clair et sombre), les 360×640 et la page hôte hostile.

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

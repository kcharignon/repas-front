---
name: repas-agent-dev
description: Développer l'agent JavaScript embarqué du chantier « envoyer la liste au drive Leclerc » (`drive-agent/` du dépôt `kcharignon/repas-front`) : le programme injecté dans la page leclercdrive.fr de la WebView, son protocole v1 (`drive-agent/protocol/`), son adaptateur Leclerc, son interface en Shadow DOM, sa construction reproductible et son empreinte SHA-384. À utiliser pour tout ticket DRV-30x, tout changement de `drive-agent/src`, du protocole, des schémas JSON ou des fixtures, et quand Leclerc change son site.
---

# repas-agent-dev — l'agent embarqué

L'agent s'exécute **dans la page de l'enseigne, avec les droits de l'utilisateur** : une erreur ici est une faille chez un tiers. Il est TypeScript strict, compilé en **un seul fichier** (`drive-agent/dist/agent.js`) embarqué dans l'APK Android, sans dépendance à l'exécution.

## 0. Avant toute chose

1. Lire `drive-agent/README.md` (structure, règles de code, construction, faux site), `drive-agent/protocol/README.md`, `drive-agent/fixtures/README.md`, `drive-agent/fake-leclerc/README.md` et `CLAUDE.md` du front.
2. Dans le dépôt back `kcharignon/repas` : `docs/drive/architecture.md` § 8 (protocole et comportement), `docs/drive/recherche.md` § 2 et `docs/drive/spikes/DRV-007-requete-ajout-panier.md` (contrat Leclerc mesuré), `docs/drive/consignes-agents.md`, le ticket `docs/drive/tickets/DRV-30x-*.md` (sections « Réalisation » et « Points laissés » : ce sont des contrats).
3. Règles transverses (détail : `consignes-agents.md` du back) : **aucun contact avec Leclerc** (ni curl, ni navigateur, ni émulateur ouvert sur le vrai site) ; **aucune donnée réelle** (valeurs factices `123456`, `Ville-Test`, hôte `courses-test.exemple.invalid` ou `fd0-courses.leclercdrive.fr`) ; jamais de déploiement, de release ni de secret ; une PR n'est fusionnée que si **tous** les contrôles de la CI sont verts ; commits courts en français **sans `Co-Authored-By`** ; worktree dédié quand d'autres agents travaillent ; ne pas toucher au dépôt back (dire dans le rapport ce qu'il faut cocher).

## 1. Carte du code (chemins vérifiés)

| Sujet | Où |
|---|---|
| Point d'entrée et câblage | `drive-agent/src/index.ts`, `agent.ts` (`run(win, options)`), `version.ts` (`AGENT_VERSION`) |
| Adaptateur Leclerc | `drive-agent/src/leclerc/` : `adapter.ts` (`RetailerAdapter`, `LeclercAdapter`, `browserDeps`), `pacer.ts`, `store.ts`, `embedded.ts`, `content.ts`, `candidate.ts`, `cart.ts`, `errors.ts` |
| Interface | `drive-agent/src/ui/` (`ui.ts`, `screens.ts`, `picker.ts`, `strings.ts` pour **tous** les textes, `dom.ts`) |
| Orchestrateur | `drive-agent/src/flow/` (`orchestrator.ts`, `phase-a.ts`, `phase-b.ts`, `packs.ts`, `setup.ts`, `result.ts`, `run-state.ts`, `wake-lock.ts`) |
| Diagnostic et test automatique | `drive-agent/src/diagnostic/`, `drive-agent/src/selftest/` |
| Transport | `drive-agent/src/transport/` (`bridgeTransport` pour l'application, `fragmentTransport` pour les tests et le favori de bureau) |
| Protocole | `drive-agent/protocol/` (`index.ts`, `plan.ts`, `result.ts`, `command.ts`, `selftest.ts`, `check.ts`, `codec.ts`, `*.schema.json`, `examples/valid|invalid/`) |
| Construction | `drive-agent/scripts/build.mjs` (`buildAgent`, `digestOf`), sorties `drive-agent/dist/` (jamais commité) |
| Tests | `drive-agent/test/*.spec.ts`, aides `leclerc-helpers.ts` / `flow-helpers.ts` / `selftest-helpers.ts`, `rules.spec.ts` (une preuve par règle ESLint), `build.spec.ts` ; e2e interface `e2e/agent-ui.spec.ts` ; page de démonstration `drive-agent/demo/` |
| Faux site Leclerc et e2e de l'agent (DRV-309) | `drive-agent/fake-leclerc/` (`server.ts`, `catalog.ts`, `pages.ts`, `main.ts`, `README.md`), `drive-agent/e2e/` (`passage`, `choix`, `incidents`, `pont` `.spec.ts`, `support/{agent,cadence,fixtures,plans}.ts`, `playwright.config.ts`) |
| Jetables (ne pas étendre) | `drive-agent/lab/`, `drive-agent/android-lab/` (outils du spike DRV-001/011) |

## 2. Règles de sécurité (ESLint les impose ; `drive-agent/test/rules.spec.ts` le prouve)

- **Aucun code distant ni dynamique** : pas de `eval`, `new Function`, `setTimeout("code")`, `javascript:`, import dynamique, balise `script`. Tout le code est dans `agent.js`.
- **Aucun HTML injecté** : pas de `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`. Tout s'affiche par `createElement` et **`textContent`** (`h()` et `text()` de `ui/dom.ts`). Un libellé de produit qui contient du HTML s'affiche tel quel.
- **Aucune requête hors de la page** : `fetch` seulement avec un **chemin relatif** (l'hôte de la page ; jamais `https://…` ni `//hôte`), ni `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `sendBeacon`. L'agent ne parle jamais à l'API de Repas.
- **Aucune dépendance à l'exécution** : tout import est un chemin relatif dans `drive-agent/src` ou `drive-agent/protocol`.
- **Shadow DOM fermé** en production (`createUi({ mode })` : `mode: 'open'` **seulement dans les tests d'accessibilité** ; les e2e l'ouvrent de l'extérieur en forçant `attachShadow`, sans modifier l'agent), conteneur plein écran épinglé en `!important` : la page hôte ne lit ni ne cache l'interface. Cibles ≥ 44 px, `aria-live` pour la progression, textes en français dans `strings.ts` (tutoiement).
- **Rien de personnel ni de sensible** : jamais de cookie, jeton, identifiant de compte, adresse, contenu de page ou message d'exception dans un résultat, un rapport, un journal ou l'état de reprise. Un rapport (diagnostic, test automatique) n'a que des nombres, des codes, des mots fixes et des libellés nettoyés (`safeLabel`), l'hôte réduit à `fdN` et le magasin à `…` + 3 derniers chiffres.
- **Une table (objet) indexée par une donnée de la page ou du plan se lit par `own(table, clé)`** (`drive-agent/src/own.ts`), jamais par `table[clé]` ni `clé in table` : `constructor` et `__proto__` retrouveraient un attribut de `Object.prototype` (revue de sécurité, `hostile-keys.spec.ts`). Un chemin de requête commence par `/` puis un caractère qui n'est ni `/` ni `\` (le navigateur lit `\` comme `/`).
- **Toute donnée venue de la page Leclerc est non fiable** (libellés, contenus, prix) : bornée, convertie, `null` plutôt qu'une valeur fausse, jamais interprétée comme HTML ni comme adresse de navigation.
- **Le message de plan est validé avant toute action** (`validatePlan`), l'agent confirme à l'utilisateur avant d'agir, ne valide ni ne paie jamais, ne touche ni au créneau ni au compte, ne réduit jamais le panier au-delà des produits du plan, et ne choisit jamais seul un produit « équivalent ». Le test automatique (`selftest`) n'est honoré que si l'application a annoncé `debug: true`.

## 3. Construction, taille, empreinte

- `make agent-build` produit `dist/agent.js` (IIFE minifié ES2022, précédé de `/*! Repas Drive agent X.Y.Z */`) et `dist/manifest.json` `{version, bytes, sha384}` (`sha384-<base64>`, format `integrity`). `make agent-verify` construit deux fois et échoue si les empreintes diffèrent (aucune date ni chemin absolu dans le fichier ; versions épinglées par `package-lock.json`). `make agent-test` ne joue que les tests de l'agent.
- **Budget** : 256 000 octets (`AGENT_MAX_BYTES` pour un essai) : une bibliothèque entrée par mégarde le dépasse. `agent.js` pèse aujourd'hui environ 68 Ko.
- **Cliquet de l'empreinte** : toute modification de `drive-agent/src`, du protocole, des scripts de construction ou de `package-lock.json` change l'empreinte. Après un changement voulu : `make agent-build` puis `make android-agent-hash`, relire, **commiter `android/agent.js.sha384`** et le dire dans la PR (`make check` et la construction de l'APK échouent sinon). Monter `AGENT_VERSION` (`src/version.ts`, semver) à chaque changement de l'agent.
- Vérifier à la main : `openssl dgst -sha384 -binary drive-agent/dist/agent.js | openssl base64 -A` (préfixer `sha384-`).

## 4. Protocole v1

- Source de vérité : les schémas `drive-agent/protocol/*.schema.json`. **Le schéma, `drive-agent/protocol/README.md` et `architecture.md` § 8 du back changent dans le même commit** (le dernier se met à jour dans une PR du back : la signaler dans le rapport).
- Messages : `plan` et `setup` (Repas vers agent), `result` et `setup-result` (agent vers Repas), `command` (`diagnostic`, `selftest`) et `selftest-result` (application ↔ agent). Le message `hello` du script d'injection n'est pas du protocole.
- Bornes (`LIMITS` de `protocol/types.ts`) : 64 Ko décodé, 100 lignes, 5 produits par ligne, 20 refusés, `packs` 1..99, libellés 1..255, prix 0..100 000 000 centimes, rapport de test 20 000 caractères. Identifiant de produit `^[0-9]{1,12}$` (**chaîne**), slug `^[a-z0-9-]{1,100}$`, `runId` uuid, hôte `^[a-z0-9-]+\.leclercdrive\.fr$`. Aucune clé inconnue tolérée ; validateurs **écrits à la main**, `ProtocolError { code: 'INVALID_MESSAGE', path }`.
- Exemples : tout format nouveau a des exemples dans `examples/valid/` (au moins un, plusieurs pour plan et result) et `examples/invalid/` (enveloppe `{path, why, schemaCannotSee?, message}`), tous **inventés**. Ce que JSON Schema ne sait pas dire (doublons, produit accepté et refusé) porte `"schemaCannotSee": true`. `protocol-schemas.spec.ts` (Ajv) vérifie que schémas et validateurs concordent.
- Le protocole ajoute moins de 6 Ko à l'agent (un test le mesure). Une ligne `FAILED` porte `error` (chaîne) ; un `result` en erreur porte `error: {code, message}` ; `unavailableIds` ne sert qu'à l'affichage.

## 5. Contrat Leclerc mesuré (ne pas le deviner)

- **Seul le site PC est supporté** : hôte `fdN-courses.leclercdrive.fr`, chemins `/magasin-<id>-<id>[-<Ville>]/…`. Le site mobile (`m-courses…`) a d'autres routes : page non reconnue = `UNSUPPORTED_PAGE`. La WebView de l'application est en mode ordinateur pour cela.
- **Recherche** : `GET recherche.aspx?TexteRecherche=<mot>` ; page HTML dont le JSON embarqué donne `iIdProduit`, `sLibelleLigne1/2`, `nrPVUnitaireTTC`, `nrPVParUniteDeMesureTTC`, `iQteDisponible` (0 = indisponible), `iQuantitePanier`, contenu net structuré quand il existe. Pas d'EAN. Analyse tolérante (`embedded.ts`).
- **Panier** : `POST /magasin-<id>-<id>/panier.aspx?op=1` (**sans suffixe de ville**), en-têtes `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest` et **`zcwb: ajax-manager`**, corps `d=<JSON encodé>`. Dans `d` : **identifiant en texte**, `sNoPointLivraison` lu dans la page ; à l'ajout, l'objet `objContexteProvenanceArticle` (origine 4, type de page 3, texte cherché, vue 0, `uni-2`) ; au retrait, aucun contexte. **Quantité absolue** (`eTypeAction: 1` + `iQuantite: n` fixe n dans les deux sens ; retrait = `eTypeAction: 2` + `iQuantite: 0`) : rejouer ne double rien. La réponse donne l'état du panier (`lstProduitsLight`, `iQuantitePanier`, `sTotalAPayer`) : **vérifier la quantité obtenue avec elle**, ne pas lire une page.
- **Un 404 n'est pas un blocage** (requête mal formée : `CONTRACT_CHANGED`). Seuls 403, 429 et une page de défi (`captcha-delivery.com`) sont `BLOCKED` (le mot « datadome » seul ne suffit pas).
- **Cadence** (`Pacer`) : une requête à la fois, jamais en parallèle ; 800 ms entre deux + gigue 0..700 ms ; 403/429 retenté une fois, le second de suite arrête tout (`partial` + `BLOCKED`, plus aucune requête) ; erreur réseau retentée une fois après 2 s. Ne jamais accélérer, même en test réel.
- Le choix du produit se fait dans **la liste de l'agent** (variante P2) : le site refuse les cadres (`X-Frame-Options: DENY`). Le contenu net se déduit du champ structuré, du libellé ou de `prix ÷ prix par mesure`, normalisé en `g`, `ml`, `piece`.
- À confirmer en recette réelle (DRV-505), donc à ne pas figer dans un test comme un fait : phrase « aucun résultat », réponse de connexion, libellé du magasin.

## 6. Tests (aucun réseau, aucune attente réelle)

- `fetch` **simulé** et horloge **fausse** : `fakeSite(handler)` de `drive-agent/test/leclerc-helpers.ts` (le `sleep` avance l'heure, chaque requête coûte 50 ms ; `maxInFlight()` prouve l'absence de parallélisme ; les pauses sont lues dans `sleeps`). Le DOM des tests est jsdom ; `sessionStorage`, Wake Lock et transport sont injectés (`FlowDeps`).
- Fixtures **synthétiques** dans `drive-agent/fixtures/leclerc/` : jamais un HTML brut de Leclerc, un vrai numéro de magasin, une vraie ville, un cookie, un jeton ou un e-mail (valeurs factices : `123456`, `000123`, `000001`, `Ville-Test`, `courses-test`). Elles reproduisent la **structure** décrite par `recherche.md`, pas une page réelle ; `.prettierignore` les exclut (octets figés).
- Chaque règle de sécurité, chaque code d'erreur, chaque borne a son test ; un libellé hostile (HTML, très long, adresse) est éprouvé ; `agent-ui.spec.ts` passe axe (WCAG AA, clair et sombre, 360×640, page hôte hostile).
- **Faux site Leclerc de bout en bout (DRV-309, fait)** : `drive-agent/fake-leclerc/` est un serveur Node **sans dépendance** aux données entièrement inventées (30 produits dans `catalog.ts`, magasin `000001`, point de livraison `123456`, `Ville-Test`) qui sert accueil, `recherche.aspx`, `panier.aspx?op=1` (état du panier en mémoire), connexion simulée, page de défi et un **faux Repas** (`/drive/retour`, affiche le `#result=` reçu). Il vérifie la requête du panier **à la lettre** (`zcwb`, adresse sans ville, identifiant en texte, contexte à l'ajout seulement) : tout écart reçoit la 404 générique. Il n'écoute que sur `127.0.0.1` (403 hors boucle locale, hôtes limités à `localhost`, `127.0.0.1`, `courses-test.leclercdrive.fr`), et le navigateur de test résout ce nom vers `127.0.0.1` et **tout autre hôte vers rien** (`--host-resolver-rules`) : aucune requête ne peut atteindre une enseigne. Défauts activables (`fake.setBehavior`, `POST /__fake/behavior`) : latence, `forbidden` 403, `too-many-requests` 429, `challenge`, `contract-changed`, `not-found`, `logged-out`, après N requêtes ; panier garni (`seedCart`), rupture, promotion, magasin différent. `make agent-e2e` (Docker, Pixel 7, sans back ni front) joue l'agent **construit** par le fragment d'adresse et par le pont (vrai `android/app/src/main/assets/injection.js` + faux canal natif) ; seul le Shadow DOM est ouvert pour Playwright (`attachShadow` forcé à `open`, l'agent n'est pas modifié). **Un test échoue si l'agent envoie deux requêtes à la fois ou plus vite que 800 ms** (`support/cadence.ts`, `expectPoliteAgent`) ; un test du faux site lui-même est dans `drive-agent/test/fake-leclerc.spec.ts`. `make agent-fake` le lance à la main (127.0.0.1:8099). Il ne prouve pas DataDome (recette réelle DRV-505). À distinguer de la page locale HTTPS de l'émulateur (`android/emulator/testsite.py`).

## 7. Recettes

### 7.1 Modifier le comportement de l'agent
Test d'abord (échec) → code → `AGENT_VERSION` → `make agent-test` → `make agent-e2e` (si le passage, le protocole ou l'adaptateur changent) → `make agent-verify` → `make agent-build && make android-agent-hash` → `make check`. Si l'interface change : captures Chromium de `drive-agent/demo/` lues (`/drive-agent/demo/index.html?screen=summary` sous `make start`).

### 7.2 Ajouter ou changer un champ du protocole
Types (`types.ts`) → validateur → schéma JSON → exemples valides et invalides → `protocol/README.md` → `architecture.md` § 8 (PR du back) ; additif d'abord (le front et le back recopient `needed`, `price`…) ; avertir le back (plan) et le front (`buildPlanMessage`, `validateResult`).

### 7.3 Leclerc a changé (`CONTRACT_CHANGED`, champ introuvable)
Ne rien deviner : demander à l'humain un relevé (DRV-007 : requête du site « Copier en tant que fetch », sans cookie ni numéro de magasin), corriger **l'adaptateur seul** (`src/leclerc/`), ajouter la fixture synthétique qui reproduit la **forme** changée, garder le repli `null`/`CONTRACT_CHANGED` plutôt qu'une valeur fausse.

### 7.4 Nouveau code d'erreur
`ERROR_CODES` du protocole, schémas, texte et conseil dans `strings.ts` (`ERROR_TEXTS`), écran `error-<CODE>` testé par `agent-ui.spec.ts`.

## 8. Definition of Done

- [ ] `make check` vert (lint, format, types, tests, couverture ≥ 80 %), `make agent-verify` vert, `make agent-e2e` vert si le passage, l'adaptateur ou le protocole changent (la CI le rejoue : job « Agent du drive (bout en bout, faux site Leclerc) »), taille < 256 000 octets
- [ ] `AGENT_VERSION` monté, `android/agent.js.sha384` commité si `agent.js` change
- [ ] Aucune donnée réelle (relire les fixtures, exemples et captures) ; schémas, README du protocole et `architecture.md` § 8 concordent
- [ ] PR (Quoi / Vérifié / À relire), `gh pr checks` tout vert (un contrôle instable sans rapport se relance : `gh run rerun --failed`), `gh pr merge --squash --delete-branch`, `gh issue close <n>`

## 9. Erreurs fréquentes

- Classer un 404 en blocage ; accélérer la cadence ; deux écritures en parallèle.
- Envoyer l'identifiant de produit en nombre, oublier `zcwb` ou garder le suffixe de ville dans l'adresse du panier (le site répond alors 404).
- Mettre un hôte absolu dans un `fetch`, une dépendance npm dans `src/`, un `innerHTML` « juste pour un test ».
- Oublier `make android-agent-hash` ou `AGENT_VERSION` ; modifier `package-lock.json` sans le savoir (l'empreinte change).
- Copier un vrai extrait de page, de requête ou de numéro de magasin dans une fixture ou une capture.

## 10. Interdits

Contacter Leclerc ; stocker, lire ou journaliser un cookie, un jeton ou un identifiant d'enseigne ; ajouter du code chargé à distance ; valider une commande, choisir un créneau, payer, vider le panier ; dépasser 99 par produit ; étendre `lab/` ou `android-lab/` ; `--no-verify`, force-push, push sur `main` ; fusionner une PR dont un contrôle n'est pas vert.

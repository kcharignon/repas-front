# Agent du drive

L'**agent** est le petit programme JavaScript qui tourne dans la page de l'enseigne (E.Leclerc Drive), dans la session de l'utilisateur, pour mettre sa liste de courses au panier. Depuis la décision G1 (2026-10-17), son véhicule est l'**application Android** `android/` : elle injecte `dist/agent.js` dans les pages `*.leclercdrive.fr` de sa WebView (DRV-313). Aucun identifiant ni cookie d'enseigne ne passe par Repas.

Contexte et protocole : `docs/drive/` du dépôt back (`kcharignon/repas`), en particulier `architecture.md` § 8 et le ticket `DRV-301`.

État : **squelette** (DRV-301). La construction, ses garde-fous et ses règles de code sont en place ; l'agent lui-même ne fait encore rien (il reste silencieux sur la page) : le protocole (DRV-302), l'adaptateur Leclerc (DRV-303), l'interface (DRV-304) et l'orchestrateur (DRV-305) s'y ajoutent.

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
    protocol/ leclerc/ ui/ flow/ diagnostic/    à venir : DRV-302, 303, 304, 305-306, 308
  test/               tests Vitest de l'agent, et entries/ : points d'entrée d'essai pour la chaîne de construction
  fixtures/           données SYNTHÉTIQUES inventées (voir son README)
  scripts/build.mjs   la construction
  dist/               sorties de la construction (ignoré par Git)
```

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
- tout import qui n'est pas un fichier relatif de `src/` : **aucune dépendance à l'exécution**.

`test/rules.spec.ts` éprouve chaque règle sur un code qui l'enfreint. TypeScript est strict, avec un `tsconfig` dédié (`tsconfig.agent.json`, DOM seul, aucun type de Node). Les tests utilisent des données synthétiques : jamais de HTML brut d'une enseigne, de vrai numéro de magasin, de nom de ville, de cookie, de jeton, d'identifiant ni d'e-mail (le dépôt est public).

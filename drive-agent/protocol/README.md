# Protocole v1 de l'agent du drive

Ce que Repas et l'agent s'envoient : `plan` et `setup` (Repas vers l'agent), `result` et `setup-result` (agent vers Repas), `command` (application vers l'agent, DRV-313) et `selftest-result` (agent vers application, variante de débogage, DRV-318). Le format et les règles sont décrits dans `architecture.md` § 8 du dépôt back (`kcharignon/repas`, `docs/drive/`) ; le ticket est DRV-302. **Le schéma JSON et ce document doivent rester identiques à `architecture.md` § 8** : changer le format, c'est changer les trois dans le même commit.

| Fichier                                                                                        | Rôle                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.schema.json`, `result.schema.json`, `command.schema.json`, `selftest-result.schema.json` | Les schémas JSON (draft-07), source de vérité documentaire                                                                              |
| `index.ts`                                                                                     | Le module partagé : types, constantes et limites, `encodeMessage`, `decodeMessage`, `validatePlan`, `validateResult`, `validateCommand` |
| `types.ts`, `codec.ts`, `check.ts`, `plan.ts`, `result.ts`, `command.ts`, `error.ts`           | Son contenu                                                                                                                             |
| `clean-text.ts`                                                                                | `cleanText` : le nettoyage d'un libellé (caractères que le back refuse) que l'agent et le front partagent ; ne change pas le format     |
| `examples/valid/`, `examples/invalid/`                                                         | Les exemples (au moins 6 de chaque par schéma, un seul valide pour `command`), tous rejoués par les tests                               |

Le module n'a **aucune dépendance d'exécution** et ajoute moins de 6 Ko à l'agent (un test le mesure). L'agent l'importe par chemin relatif (`../../protocol`), le front par l'alias `@drive-protocol`.

## Utiliser le module

```ts
import { decodeMessage, encodeMessage, validatePlan, ProtocolError } from '@drive-protocol'

try {
  const plan = validatePlan(decodeMessage(texteBase64url)) // PlanMessage | SetupMessage
} catch (error) {
  if (error instanceof ProtocolError) console.info(error.code, error.path) // 'INVALID_MESSAGE', 'lines[2].products[0].id'
}
```

- `encodeMessage(message)` : JSON, UTF-8, base64url sans bourrage (`-` et `_`, jamais `=`). Refuse plus de 64 Ko.
- `decodeMessage(texte)` : l'inverse. Refuse un texte qui n'est pas du base64url, plus de 64 Ko décodés, de l'UTF-8 ou du JSON invalides.
- `validatePlan(valeur)` et `validateResult(valeur)` : validateurs **écrits à la main**, aucune clé inconnue tolérée. Ils rendent le message lui-même, typé, ou lèvent `ProtocolError { code: 'INVALID_MESSAGE', path }` sur le premier champ fautif (`path` vide pour la racine).

## Précisions du format

- `setup` a les mêmes champs qu'un `plan`, sans `lines` (interdit). Son `store` est **facultatif** (DRV-320) : sans lui, Repas ne connaît pas encore le magasin et l'agent lit celui de la page ; avec lui, la page doit être celle de ce magasin (sinon `STORE_MISMATCH`). Un `plan` a toujours son `store`.
- Le `store` d'un `result` est facultatif lui aussi : il manque quand un `setup` sans magasin s'arrête avant que le magasin soit connu (`aborted`, `UNSUPPORTED_PAGE`). Celui d'un `setup-result` est obligatoire.
- `packs` et `packsStatus` d'un produit du plan sont facultatifs, ou `null`. `content` est facultatif.
- `needed` (DRV-306, facultatif, sur toute ligne) : ce que la liste demande, `{quantity, unitSymbol, dimension?, baseFactor?}`. `quantity` est un nombre de 0 (exclu) à 1 000 000 dans l'unité de la ligne (« 800 » `g`), `dimension` parmi `WEIGHT`, `VOLUME`, `COUNT`, `PACKAGE` (ou `null`), `baseFactor` le facteur de l'unité vers l'unité de base (1 pour le gramme, 1000 pour le kilo). L'agent s'en sert, pour une ligne à choisir (phase B), à calculer le nombre de produits du produit choisi (règles de `architecture.md` § 6) ; sans `needed` ou sans dimension, il demande la quantité à l'utilisateur. Depuis DRV-613 il s'en sert aussi en phase A, pour une ligne connue : le nombre de produits calculé sur le contenu lu en direct remplace celui du plan (`packs`) quand ils diffèrent (le contenu mémorisé n'est qu'un point de départ, la fiche du produit étant partagée) ; sans `needed`, rien ne change.
- `rayonHints` (DRV-642, **facultatif**, sur toute ligne du plan) : les rayons de l'enseigne où l'on prend d'habitude l'ingrédient, 0 à 3 entiers de 1 à 2 147 483 647 (`LIMITS.rayonHints`, `LIMITS.catalogId`), du plus choisi au moins choisi ; absent ou vide : rien n'est appris. L'agent range la liste de l'écran de choix (phase B et « Chercher autre chose ») : les produits dont le rayon est le premier conseillé d'abord, puis ceux du deuxième, du troisième, puis tous les autres, **sans en cacher aucun**, l'ordre du site gardé à l'intérieur de chaque groupe. Une valeur hors bornes, un quatrième rayon ou autre chose qu'une liste d'entiers rend le plan invalide (`lines[n].rayonHints[k]`), comme tout champ. **Un récepteur qui ne connaît pas la clé rejette le plan : le site n'envoie `rayonHints` qu'à une application dont l'agent est de la version 0.31.0 ou plus (`RAYON_HINTS_APP_VERSION`, `src/features/drive/appVersion.ts`).**
- `rayonId` et `familyId` (DRV-642, **facultatifs**, sur le seul produit choisi d'une ligne `CHOSEN`, jamais sur un produit refusé) : le rayon et la famille du produit chez l'enseigne (`iIdRayon`, `iIdFamille` du site), des entiers de 1 à 2 147 483 647 ; des faits du catalogue, sans donnée de personne. Absents quand le site ne les donne pas ou hors bornes, et chez les agents d'avant. Repas les mémorise pour apprendre dans quel rayon on prend d'habitude chaque ingrédient (`PUT /drive/choices`). **Un récepteur qui ne connaît pas ces clés rejette le résultat : le front d'abord (validateur du protocole), l'application Android qui embarque l'agent ensuite.**
- Un `result` peut porter `stats` (ticket L de l'audit du 2026-10-18), **facultatif** : `{requests, errors, blocks}`, trois entiers de 0 à 100 000, les trois obligatoires, aucune autre clé. Des **nombres seulement** (jamais une adresse ni un contenu) : `requests` les requêtes envoyées au site, reprises comprises ; `errors` celles sans réponse (réseau, délai d'attente) ou à réponse 4xx/5xx hors refus ; `blocks` les refus de l'anti-robot (403, 429, page de défi) ; cumulés sur tout le passage, même repris après un rechargement. Absent quand aucune requête n'est partie (annulation au récapitulatif, page non prise en charge) et chez les agents d'avant. Pas de `stats` dans un `setup-result`. **Un récepteur qui ne connaît pas `stats` rejette le message (aucune clé inconnue tolérée) : le front (validateur du protocole) doit être déployé avant l'application qui embarque cet agent.**
- Un `result` d'issue `error` porte son `error` `{code, message}` ; les autres issues peuvent en porter un (`partial` avec `BLOCKED`). Le `message` est le titre de l'erreur suivi, quand l'agent la connaît, de la **cause précise** entre parenthèses (« Le site a changé (SEARCH_NO_STATE) », « Tu n’es pas connecté (SESSION_VISITOR) ») : un code interne fixe de l'adaptateur (`drive-agent/src/leclerc/causes.ts`), jamais un morceau de page ; ce n'est pas un nouveau champ ni un nouveau code d'erreur, le format est inchangé (1 à 200 caractères). Le back et le front ne doivent pas en dépendre pour décider : c'est un texte de diagnostic.
- Une ligne `FAILED` porte le code d'erreur dans `error` (une chaîne, pas un objet).
- `unavailableIds` : 4 au plus pour `ADDED` (le produit mis au panier n'en fait pas partie), 5 sinon.
- `price` d'un produit choisi **ou d'une ligne `ADDED`** (décision D22 : Repas rafraîchit le prix mémorisé du produit connu) : `{cents, perMeasure?: {cents, unit}}`, centimes entiers de 0 à 100 000 000, `unit` parmi `kg`, `l`, `piece`.
- Les libellés, noms et requêtes ont de 1 à 255 caractères (comptés en caractères Unicode).
- `setup-result` : `baseUrl` est `https://<host>/magasin-<id>-<second identifiant>`, avec l'hôte et l'identifiant du magasin.

- `command` (DRV-313) : `{v: 1, type: "command", command}`, rien d'autre (ni `runId`, ni magasin, ni chemin de retour : l'agent ne renvoie rien à Repas). Deux commandes existent : `diagnostic` ouvre l'écran de diagnostic de l'agent (DRV-308) ; `selftest` lance le test automatique de la variante de débogage (DRV-318) et **n'est honorée que si l'application a annoncé `debug: true`** dans son message d'accueil. Elles viennent de l'application, jamais de Repas. `validateCommand` les valide ; `validatePlan` les refuse (`type`).
- `selftest-result` (DRV-318, agent vers application, jamais vers Repas) : `{v: 1, type: "selftest-result", ok, agentVersion, report}` ; `ok` est un booléen, `agentVersion` un semver, `report` un texte de 1 à 20 000 caractères, sans donnée personnelle. `validateSelftestResult` le valide ; `validateResult` le refuse (`type`).

## Les exemples

`examples/valid/` contient des messages complets (`plan-*`, `result-*`). `examples/invalid/` contient des enveloppes `{path, why, schemaCannotSee?, message}` : le chemin attendu de l'erreur, la règle enfreinte et le message fautif. Tous sont **inventés** (magasin `000000`, hôte `courses-test.leclercdrive.fr`) : jamais de donnée d'une enseigne.

Les tests (`drive-agent/test/protocol*.spec.ts`) vérifient que chaque exemple valide passe, que chaque exemple invalide échoue au bon chemin, et que les schémas JSON (via Ajv, dépendance de développement seulement) donnent le même verdict que les validateurs. **Exception** : ce que JSON Schema ne sait pas dire (identifiants en double dans `products`, `rejected` ou entre les lignes, produit à la fois accepté et refusé, adresse de base d'un `setup-result` incohérente avec l'hôte) n'est vu que par les validateurs ; ces exemples portent `"schemaCannotSee": true` et le test vérifie que le schéma les laisse passer.

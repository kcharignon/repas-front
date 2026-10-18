# Protocole v1 de l'agent du drive

Ce que Repas et l'agent s'envoient : `plan` et `setup` (Repas vers l'agent), `result` et `setup-result` (agent vers Repas), `command` (application vers l'agent, DRV-313) et `selftest-result` (agent vers application, variante de débogage, DRV-318). Le format et les règles sont décrits dans `architecture.md` § 8 du dépôt back (`kcharignon/repas`, `docs/drive/`) ; le ticket est DRV-302. **Le schéma JSON et ce document doivent rester identiques à `architecture.md` § 8** : changer le format, c'est changer les trois dans le même commit.

| Fichier                                                                                        | Rôle                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.schema.json`, `result.schema.json`, `command.schema.json`, `selftest-result.schema.json` | Les schémas JSON (draft-07), source de vérité documentaire                                                                              |
| `index.ts`                                                                                     | Le module partagé : types, constantes et limites, `encodeMessage`, `decodeMessage`, `validatePlan`, `validateResult`, `validateCommand` |
| `types.ts`, `codec.ts`, `check.ts`, `plan.ts`, `result.ts`, `command.ts`, `error.ts`           | Son contenu                                                                                                                             |
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
- `needed` (DRV-306, facultatif, sur toute ligne) : ce que la liste demande, `{quantity, unitSymbol, dimension?, baseFactor?}`. `quantity` est un nombre de 0 (exclu) à 1 000 000 dans l'unité de la ligne (« 800 » `g`), `dimension` parmi `WEIGHT`, `VOLUME`, `COUNT`, `PACKAGE` (ou `null`), `baseFactor` le facteur de l'unité vers l'unité de base (1 pour le gramme, 1000 pour le kilo). L'agent s'en sert, pour une ligne à choisir (phase B), à calculer le nombre de produits du produit choisi (règles de `architecture.md` § 6) ; sans `needed` ou sans dimension, il demande la quantité à l'utilisateur.
- Un `result` d'issue `error` porte son `error` `{code, message}` ; les autres issues peuvent en porter un (`partial` avec `BLOCKED`).
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

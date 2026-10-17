# Protocole v1 de l'agent du drive

Ce que Repas et l'agent s'envoient : `plan` et `setup` (Repas vers l'agent), `result` et `setup-result` (agent vers Repas). Le format et les règles sont décrits dans `architecture.md` § 8 du dépôt back (`kcharignon/repas`, `docs/drive/`) ; le ticket est DRV-302. **Le schéma JSON et ce document doivent rester identiques à `architecture.md` § 8** : changer le format, c'est changer les trois dans le même commit.

| Fichier                                                                | Rôle                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `plan.schema.json`, `result.schema.json`                               | Les schémas JSON (draft-07), source de vérité documentaire                                                           |
| `index.ts`                                                             | Le module partagé : types, constantes et limites, `encodeMessage`, `decodeMessage`, `validatePlan`, `validateResult` |
| `types.ts`, `codec.ts`, `check.ts`, `plan.ts`, `result.ts`, `error.ts` | Son contenu                                                                                                          |
| `examples/valid/`, `examples/invalid/`                                 | Les exemples (au moins 6 de chaque par schéma), tous rejoués par les tests                                           |

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

- `setup` a les mêmes champs qu'un `plan`, sans `lines` (interdit). Le magasin y est obligatoire.
- `packs` et `packsStatus` d'un produit du plan sont facultatifs, ou `null`. `content` est facultatif.
- Un `result` d'issue `error` porte son `error` `{code, message}` ; les autres issues peuvent en porter un (`partial` avec `BLOCKED`).
- Une ligne `FAILED` porte le code d'erreur dans `error` (une chaîne, pas un objet).
- `unavailableIds` : 4 au plus pour `ADDED` (le produit mis au panier n'en fait pas partie), 5 sinon.
- `price` d'un produit choisi **ou d'une ligne `ADDED`** (décision D22 : Repas rafraîchit le prix mémorisé du produit connu) : `{cents, perMeasure?: {cents, unit}}`, centimes entiers de 0 à 100 000 000, `unit` parmi `kg`, `l`, `piece`.
- Les libellés, noms et requêtes ont de 1 à 255 caractères (comptés en caractères Unicode).
- `setup-result` : `baseUrl` est `https://<host>/magasin-<id>-<second identifiant>`, avec l'hôte et l'identifiant du magasin.

## Les exemples

`examples/valid/` contient des messages complets (`plan-*`, `result-*`). `examples/invalid/` contient des enveloppes `{path, why, schemaCannotSee?, message}` : le chemin attendu de l'erreur, la règle enfreinte et le message fautif. Tous sont **inventés** (magasin `000000`, hôte `courses-test.leclercdrive.fr`) : jamais de donnée d'une enseigne.

Les tests (`drive-agent/test/protocol*.spec.ts`) vérifient que chaque exemple valide passe, que chaque exemple invalide échoue au bon chemin, et que les schémas JSON (via Ajv, dépendance de développement seulement) donnent le même verdict que les validateurs. **Exception** : ce que JSON Schema ne sait pas dire (identifiants en double dans `products`, `rejected` ou entre les lignes, produit à la fois accepté et refusé, adresse de base d'un `setup-result` incohérente avec l'hôte) n'est vu que par les validateurs ; ces exemples portent `"schemaCannotSee": true` et le test vérifie que le schéma les laisse passer.

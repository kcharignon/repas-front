# 0002 — SDK typé généré depuis le contrat OpenAPI du back

- **Statut** : Accepted
- **Date** : 2026-10-15
- **Liens** : [0001](0001-stack-du-front.md), ADR 0007 §15 et 0016 du dépôt back (contrat versionné, `ETag` / `If-Match`)

## Contexte

Le back publie le contrat complet de l'API dans `docs/api/openapi.json` (généré par les attributs OpenAPI des controllers, vérifié en CI
par `make openapi-check`). Le front doit en tirer ses types pour qu'un changement de l'API casse la compilation, pas la production, sans
couplage de code entre les deux dépôts.

## Décision

1. **Le contrat est figé à un commit du dépôt back** : `api/contract.json` (`repository`, `ref`, `path`). `api/openapi.json` en est la copie
   commitée, relue dans le diff d'une PR comme toute modification de l'API.
2. **Les types sont générés, jamais écrits à la main** : `openapi-typescript` produit `src/api/schema.d.ts` (chemins, paramètres, corps,
   réponses). `src/api/types.ts` ne fait que donner des noms métier à ces types (`Recipe = components['schemas']['RecipeDTO']`).
3. **Client `openapi-fetch`** (`createApiClient`) : appels typés par chemin (`client.GET('/api/v1/recipes/{id}', { params: { path: { id } } })`).
4. **`createAuthFetch`** pose le jeton d'accès (en mémoire, fourni par la session) et, sur un `401`, demande un jeton neuf (cookie de refresh,
   ADR 0015 du back) puis rejoue la requête **une seule fois** ; la connexion et le refresh eux-mêmes ne sont jamais rejoués.
5. **`unwrap`** rend les données ou lève une `ApiError` (`status`, `message` du back, `retryAfter` d'un `429`, statut 0 si le réseau tombe).
6. **Version des ressources** (ADR 0016 du back) : `versionOf(response)` lit l'`ETag`, `ifMatch(version)` construit `If-Match`.
7. **Commandes** : `npm run api:update [-- <ref>]` fige le contrat sur un commit (par défaut le dernier de `main`) et régénère ; `api:check`
   (hors réseau, dans `npm run check`) vérifie que les types commités viennent du contrat commité ; `api:verify` (CI) vérifie que le contrat
   commité est bien le fichier du commit figé.
8. **Surcharge de pair** : `openapi-typescript` déclare `typescript@^5` ; la génération est identique avec TypeScript 6 (vérifié), on
   force le pair par `overrides` dans `package.json`. À retirer quand l'outil déclare TypeScript 6.

## Conséquences

- Positives : types de bout en bout, un changement d'API est visible dans le diff du front, aucune dépendance de code vers le back.
- Négatives : le front doit mettre le contrat à jour à la main quand le back évolue (`api:update`) ; la surcharge de pair est une dette.

## Alternatives écartées

- Générateur de SDK complet (`@hey-api/openapi-ts`, `orval`) : plus de code généré à relire, API instable (0.x), `operationId` du back peu
  lisibles (`get_api_list_available_ingredients`). Les appels par chemin d'`openapi-fetch` sont déjà typés et lisibles.
- Récupérer le contrat à chaque build : un back qui change casserait un build du front sans qu'aucun commit ne le montre.

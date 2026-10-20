# Exemples de contrat du back

Copies à l'octet près de `docs/drive/samples/` du dépôt back `kcharignon/repas`, produites par `make drive-samples` côté back
(réponses réelles de l'API pour une même liste envoyée de 5 lignes ; valeurs inventées : magasin `123456` / `Ville-Test`).

Commit du back : `87e31ea28d940b72d5599f23f0fd47fd015b7e88`

Ne pas modifier à la main. Mettre à jour : `make samples-update ref=<sha>` (ou `npm run samples:update -- <sha> [<chemin du dépôt back>]`),
puis relire le diff : c'est le contrat que le front fige. Le test `src/features/drive/__tests__/contract.spec.ts` les confronte au
contrat OpenAPI figé (`api/openapi.json`), à `buildPlanMessage` et au protocole de l'agent ; `npm run samples:verify` (réseau)
vérifie qu'ils sont bien ceux du commit ci-dessus.

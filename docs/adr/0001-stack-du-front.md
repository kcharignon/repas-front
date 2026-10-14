# 0001 — Stack, outillage et qualité du front

- **Statut** : Accepted
- **Date** : 2026-10-15
- **Liens** : `docs/front-vuejs-plan.md` (dépôt back, sections 4 et 6), ADR 0007, 0008, 0014 et 0015 du dépôt back

## Contexte

Le back Symfony expose une API JSON `/api/v1` documentée par un contrat OpenAPI versionné. Le front remplace les pages Twig : il doit
rester simple à maintenir seul (un développeur, assisté), couvrir toute l'application, et offrir les mêmes garde-fous que le back
(analyse statique, tests, CI, dépendances à jour, avis de sécurité).

## Décision

1. **Vue 3 + TypeScript strict + Vite** (`create-vue`), Composition API et `<script setup>`, Vue Router, Pinia pour le peu d'état global.
2. **Données serveur : TanStack Query** (cache, invalidation après écriture, états de chargement et d'erreur uniformes).
3. **Client API généré depuis le contrat** (`openapi-typescript` + `openapi-fetch`) : aucun type d'API écrit à la main.
4. **Équivalents des garde-fous du back** :

   | Back (PHP) | Front |
   |---|---|
   | PHPStan | `vue-tsc` (TypeScript `strict` + `noUncheckedIndexedAccess`) |
   | Règles de style | oxlint + ESLint (`eslint-plugin-vue`, TypeScript), Prettier |
   | PHPUnit, couverture à seuil | Vitest + Vue Test Utils, seuil de couverture qui ne baisse jamais |
   | Tests de bout en bout (Chromium) | Playwright (bureau et mobile) |
   | `composer audit` | `npm audit --omit=dev --audit-level=high` en CI |
   | Dependabot (ADR 0014) | Dependabot hebdomadaire, mineures et correctifs groupés, majeures à la main |
   | `make quality` | `npm run check` |

5. **Sortie de test sans bruit** : un `console.warn` ou `console.error` pendant un test le fait échouer.
6. **Node 24 LTS** (`.nvmrc`, CI), `npm` comme gestionnaire de paquets.
7. **Les avis de sécurité des outils de développement** (chaîne de lint) sont listés par `npm audit` mais ne bloquent pas la CI : ils
   n'atteignent pas le bundle de production. Les dépendances de production sont bloquantes dès « high ».

## Conséquences

- Positives : types de bout en bout (contrat → client → composants), mêmes exigences que le back, une seule commande (`npm run check`).
- Négatives : chaîne d'outils jeune (Vite 8, Vue Router 5, Pinia 4, TypeScript 6, ESLint 10) ; les montées majeures sont à faire à la main.

## Alternatives écartées

- `pnpm` / `yarn` : un gestionnaire de plus à installer sans gain pour un projet de cette taille.
- Un kit de composants complet (Vuetify, PrimeVue) : voir l'ADR du design system.

# CLAUDE.md

Guide pour travailler sur `repas-front`, le front Vue.js de l'application Repas (back : `kcharignon/repas`, Symfony / PHP).
Objectif : couvrir **toutes** les pages Twig du back (inventaire de parité dans `docs/front-vuejs-plan.md` du dépôt back), puis
basculer la production avec l'utilisateur. Le Twig du back ne se supprime **qu'avec l'accord explicite de l'utilisateur**.

## Source de vérité

- `docs/adr/` : décisions d'architecture du front (index dans `docs/adr/README.md`). Changer une convention = ADR + ce fichier dans le même commit.
- Contrat de l'API : `docs/api/openapi.json` du dépôt back, figé à un commit précis (`api/contract.json`), types générés dans `src/api/schema.d.ts` ([ADR 0002](docs/adr/0002-sdk-genere-depuis-le-contrat-openapi.md)). Mettre le contrat à jour : `npm run api:update`, relire le diff.
- Plan, inventaire de parité, design, bascule : `docs/front-vuejs-plan.md` du dépôt back.

## Stack

Vue 3 (Composition API, `<script setup>`), TypeScript strict, Vite, Vue Router, Pinia, TanStack Query (données serveur), client
OpenAPI généré (`openapi-typescript` + `openapi-fetch`), Tailwind CSS + composants headless (Reka UI), Vitest, Playwright.
Node 24 (`.nvmrc`) : `nvm use`.

## Commandes

- `npm run dev` : serveur de développement ; `npm run build`.
- `npm run check` : lint (oxlint + ESLint), format (Prettier), types (`vue-tsc`), tests. **À passer avant chaque commit.**
- `npm run api:update [-- <ref>]` : figer le contrat sur un commit du back et régénérer les types ; `api:check` (dans `check`) et `api:verify` (CI) le contrôlent.
- `npm run test:coverage` : couverture (seuil dans `vitest.config.ts`, il ne baisse jamais) ; `npm run test:e2e` : Playwright.
- `npm run audit:prod` : avis de sécurité des dépendances de production.

## Règles

- **Pas de bruit** : un `console.warn` / `console.error` pendant un test fait échouer le test (`src/__tests__/setup.ts`).
- **Pas de chaîne en dur** dans un composant : textes dans `vue-i18n` (français seul).
- **Pas de logique métier** dans les composants : elle reste dans le back. Le front affiche, saisit, appelle l'API et relit l'état.
- **Types de l'API générés, jamais écrits à la main** : un changement de contrat doit casser la compilation, pas la production.
- Jeton d'accès **en mémoire uniquement** (jamais `localStorage`) ; refresh par cookie `HttpOnly` (ADR 0015 du back).
- Accessibilité : WCAG AA, cibles tactiles ≥ 44 px, clavier, thème clair et sombre, `prefers-reduced-motion`.
- Un test avant de fusionner ; une page ou un composant visible passe aussi un test visuel dans Chromium (captures lues, mobile et bureau).

## Git et PR

- Commits courts en français au style `feat:` / `fix:` / `chore:` / `docs:` / `test:` / `refactor:`, **sans `Co-Authored-By`**.
- Une branche par unité logique, PR vers `main` avec la description du modèle (Quoi / Vérifié / À relire), **sans pied d'attribution**.
- **Sur ce dépôt, Claude peut créer et fusionner ses PR** (autorisation de l'utilisateur, 2026-10-15), seulement une fois la CI verte,
  en squash. Jamais de push direct sur `main`, jamais de force-push, jamais de `--no-verify`.
- Sur le dépôt back (`kcharignon/repas`) la règle reste l'inverse : Claude ouvre les PR, l'humain les fusionne.

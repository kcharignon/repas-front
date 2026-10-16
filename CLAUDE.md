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
**Tout tourne dans Docker** ([ADR 0004](docs/adr/0004-front-dans-docker.md)) : `make up` (http://localhost:5173, branché sur le back de développement), `make check`, `make e2e`. Node 24 (`.nvmrc`) n'est utile que hors Docker.

## Commandes

`make help` les liste toutes (mêmes sections que le back). Les principales :

- `make start` / `stop` / `restart` / `logs` / `status` : le front dans Docker (http://localhost:5173), relais `/api` et `/images` vers le back (`http://php`, réseau `repas_default` : le back de développement doit tourner).
- `make fixtures` : comptes et données de démonstration dans la base du back (`admin@repas.fr` administrateur, `user@repas.fr`, mot de passe `M0t 2 p@sse`), dev seulement, sans rien vider.
- `make check` : lint (oxlint + ESLint), format (Prettier), types (`vue-tsc`), types de l'API, tests. **À passer avant chaque commit.** `make quality` ajoute l'audit et la vérification du contrat.
- `make test-coverage` : seuil dans `vitest.config.ts`, il ne baisse jamais ; `make e2e` : Playwright dans le conteneur contre le vrai back (compte `admin@repas.fr` par défaut, `E2E_EMAIL` / `E2E_PASSWORD` pour un autre) ; `make e2e-visual` : captures, vidéos, rapport sur http://localhost:9323 ; `make lighthouse` : budgets Lighthouse sur l'image de production (`scripts/lighthouse.mjs`) ; `make e2e-offline` : lecture hors-ligne contre l'image de production ([ADR 0006](docs/adr/0006-pwa-et-lecture-hors-ligne.md)). Une vue n'affiche une erreur de lecture que s'il n'y a rien à montrer (`hasFailed`).
- `make prod` : l'image de production (Caddy) sur http://localhost:8081 ; `make api-update` (`ref=<sha>`) : figer le contrat sur un commit du back et régénérer les types.
- Sans Docker : `npm run check`, `npm run test:e2e`, `npm run audit:prod`.

## Déploiement

- Publier une release GitHub (`gh release create vX.Y.Z --target main --generate-notes`) construit l'image, la publie sur GHCR et lance `./deploy.sh front vX.Y.Z` sur le serveur ([ADR 0007](docs/adr/0007-deploiement-par-release.md), ADR 0017 du back). L'infrastructure (`deploy/`, bordure, sauvegardes, retour arrière) est dans le dépôt back, skill `/repas-ops`.
- L'image de production ne contient ni nom de domaine ni secret ; ne jamais en ajouter. La politique de contenu (`docker/Caddyfile`) n'autorise aucune image externe : toutes viennent de `/images` (icônes de rayons rapatriées, PR back #54).

## Règles

- **Pas de bruit** : un `console.warn` / `console.error` pendant un test fait échouer le test (`src/__tests__/setup.ts`).
- **Design** : composants dans `src/design/` (préfixe `Ui`), jetons dans `src/design/theme.css`, catalogue sur `/design` ([ADR 0003](docs/adr/0003-design-system-basilic-et-safran.md)) ; toute couleur passe par un jeton, jamais un hexadécimal dans un composant.
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

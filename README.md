# repas-front

Front Vue.js de l'application [Repas](https://github.com/kcharignon/repas) (recettes, ingrédients, listes de courses).
Il remplace à terme les pages Twig du back ; le seul couplage entre les deux dépôts est le contrat OpenAPI de l'API.

Le plan d'ensemble (architecture, parité avec Twig, design, bascule en production) est dans
[`docs/front-vuejs-plan.md`](https://github.com/kcharignon/repas/blob/main/docs/front-vuejs-plan.md) du dépôt back.
Les décisions du front sont dans [`docs/adr/`](docs/adr/README.md), les conventions dans [`CLAUDE.md`](CLAUDE.md).

## Démarrer

```bash
nvm use            # Node 24 (.nvmrc)
npm ci
npm run dev        # http://localhost:5173
```

## Qualité

| Commande | Rôle |
|---|---|
| `npm run check` | lint (oxlint + ESLint), format (Prettier), types (`vue-tsc`), tests : à passer avant chaque commit |
| `npm run test:coverage` | tests unitaires avec seuil de couverture |
| `npm run test:e2e` | Playwright (bureau et mobile) |
| `npm run audit:prod` | avis de sécurité des dépendances de production |

La CI (`.github/workflows/ci.yml`) rejoue tout cela ; Dependabot propose chaque lundi les mises à jour.

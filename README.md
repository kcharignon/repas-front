# repas-front

Front Vue.js de l'application [Repas](https://github.com/kcharignon/repas) (recettes, ingrédients, listes de courses).
Il remplace à terme les pages Twig du back ; le seul couplage entre les deux dépôts est le contrat OpenAPI de l'API.

Le plan d'ensemble (architecture, parité avec Twig, design, bascule en production) est dans
[`docs/front-vuejs-plan.md`](https://github.com/kcharignon/repas/blob/main/docs/front-vuejs-plan.md) du dépôt back.
Les décisions du front sont dans [`docs/adr/`](docs/adr/README.md), les conventions dans [`CLAUDE.md`](CLAUDE.md).

## Démarrer (Docker, aucune installation de Node)

Le front tourne dans Docker et se branche sur le back de développement. Pré-requis : le back du dépôt
[`repas`](https://github.com/kcharignon/repas) lancé (`docker compose up -d`), car le front rejoint son réseau Docker
(`repas_default`) et lui parle sur `http://php`.

```bash
make up            # http://localhost:5173 (rechargement à chaud), /api et /images relayés vers le back
make logs          # logs du front
make down
```

| Commande | Rôle |
|---|---|
| `make check` | lint (oxlint + ESLint), format (Prettier), types (`vue-tsc`), tests : à passer avant chaque commit |
| `make test` | tests unitaires avec seuil de couverture |
| `make e2e` | Playwright (Chromium bureau et mobile) dans le conteneur, contre le front **et le vrai back** |
| `make e2e-visual` | idem avec capture, vidéo et trace de chaque test, puis rapport sur http://localhost:9323 |
| `make prod` | image de production (Caddy : statique + relais vers le back) sur http://localhost:8081 |
| `make api-update` | figer le contrat de l'API sur le dernier commit du back et régénérer les types (`src/api/schema.d.ts`) |

Les tests qui ouvrent une session lisent `E2E_EMAIL` et `E2E_PASSWORD` dans l'environnement (jamais dans le dépôt) :
`E2E_EMAIL=… E2E_PASSWORD=… make e2e`. Un autre back : `REPAS_API_URL` (et `REPAS_BACK_NETWORK` pour son réseau Docker).

Sans Docker (Node 24, `.nvmrc`) : `npm ci`, `npm run dev`, `npm run check` ; le proxy vise alors `https://localhost:8443`.

## Qualité

| Commande | Rôle |
|---|---|
| `npm run check` | (ou `make check`) lint, format, types, tests |
| `npm run test:coverage` | tests unitaires avec seuil de couverture |
| `npm run test:e2e` | Playwright (bureau et mobile) |
| `npm run audit:prod` | avis de sécurité des dépendances de production |

La CI (`.github/workflows/ci.yml`) rejoue tout cela ; Dependabot propose chaque lundi les mises à jour.

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
make start         # http://localhost:5173 (rechargement à chaud), /api et /images relayés vers le back
make fixtures      # comptes et données de démonstration dans la base du back (dev seulement)
```

Puis connexion avec **`admin@repas.fr`** (administrateur) ou **`user@repas.fr`** (8 recettes, une liste en cours et une en pause),
mot de passe **`M0t 2 p@sse`**. `make fixtures` ne vide rien et peut être relancé ; il demande le back à jour (`make fixtures-demo` côté back).

`make help` liste toutes les commandes, regroupées comme dans le back :

| Commande | Rôle |
|---|---|
| `make start` / `stop` / `restart` / `logs` / `status` | le front dans Docker et son lien avec le back |
| `make check` | lint (oxlint + ESLint), format (Prettier), types (`vue-tsc`), types de l'API, tests : à passer avant chaque commit |
| `make test` / `test-coverage` / `audit` / `outdated` / `quality` | tests, seuil de couverture, avis de sécurité, dépendances en retard, tout ce que la CI joue hors navigateurs |
| `make e2e` | Playwright (Chromium bureau et mobile) dans le conteneur, contre le front **et le vrai back** (compte `admin@repas.fr` par défaut) |
| `make e2e-offline` | joue la lecture hors-ligne (service worker, réseau coupé) contre l'**image de production** et le vrai back |
| `make e2e-visual` | idem avec capture, vidéo et trace de chaque test, puis rapport sur http://localhost:9323 |
| `make prod` | image de production (Caddy : statique + relais vers le back) sur http://localhost:8081 |
| `make api-update` | figer le contrat de l'API sur le dernier commit du back (`ref=<sha>` pour un autre) et régénérer les types |
| `make sh` / `make npm c="run lint"` | un shell ou une commande npm dans le conteneur |

Un autre compte pour les e2e : `E2E_EMAIL=… E2E_PASSWORD=… make e2e`. Un autre back : `REPAS_API_URL` (et `BACK_NETWORK` pour son réseau Docker).

Sans Docker (Node 24, `.nvmrc`) : `npm ci`, `npm run dev`, `npm run check` ; le proxy vise alors `https://localhost:8443`.

## Qualité


La CI (`.github/workflows/ci.yml`) rejoue tout cela ; Dependabot propose chaque lundi les mises à jour.

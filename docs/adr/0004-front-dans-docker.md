# 0004 — Le front tourne dans Docker, branché sur le back de développement

- **Statut** : Accepted
- **Date** : 2026-10-15
- **Liens** : [0001](0001-stack-du-front.md), ADR 0015 du dépôt back (cookie de rafraîchissement `Secure`, `Path=/api/auth`), plan du front (section 10)

## Contexte

Le développeur n'a pas Node sur son poste et veut lancer le front en local, le voir, et rejouer les tests de bout en bout contre son
back de développement (docker compose du dépôt `repas`). Le front et l'API doivent être servis **sous une même origine** : pas de CORS
et le cookie de rafraîchissement (`Secure`, `SameSite=Strict`) est posé sur l'origine du front.

## Décision

1. **`Dockerfile` à quatre étages** : `deps` (npm ci, Node 24), `dev` (+ Chromium de Playwright, serveur Vite avec rechargement à chaud),
   `build` (`vite build`), `prod` (Caddy : fichiers statiques, repli SPA, relais `/api` et `/images` vers le back, en-têtes de
   sécurité dont une CSP sans script en ligne).
2. **`compose.yaml`** : service `front` (port 5173, code monté, `node_modules` dans un volume renouvelé par l'entrypoint quand
   `package-lock.json` change), `e2e` et `e2e-report` (profils), `prod` (profil, port 8081). L'utilisateur du conteneur est `node` (uid
   1000) : les fichiers écrits dans le dépôt (rapports, captures) appartiennent au développeur.
3. **Branchement sur le back** : le front rejoint le **réseau Docker du back** (`repas_default`, externe) et parle au service `php` sur
   `http://php` (le Caddy du back répond en HTTP sous ce nom). Vite (dev) et Caddy (prod) relaient `/api` et `/images`, et réécrivent le
   `Host` vers `php`. Un autre back : `REPAS_API_URL`, `REPAS_BACK_NETWORK`. Hors Docker, le proxy vise `https://localhost:8443`.
4. **Tests de bout en bout dans le conteneur** (`make e2e`) : le conteneur `e2e` partage la pile réseau du `front` (`network_mode:
   service:front`), donc l'application est sur `http://localhost:5173`, un contexte sûr pour Chromium (le cookie `Secure` est accepté) ;
   le vrai back répond derrière le proxy. Identifiants de session par `E2E_EMAIL` / `E2E_PASSWORD` (environnement, jamais le dépôt).
   `make e2e-visual` conserve capture, vidéo et trace de chaque test dans un rapport HTML (http://localhost:9323).
5. **CI** : `docker build --target prod` puis fumée (le front est servi, repli SPA, CSP), et hadolint sur le `Dockerfile`.

## Conséquences

- Positives : `make up` suffit, mêmes outils en local et en CI, l'image `prod` est celle de la future mise en production (même origine
  que l'API), et les e2e valident le vrai contrat avec le vrai back.
- Négatives : l'image `dev` est lourde (Chromium) ; le back de développement doit tourner pour que le front le joigne ; le réseau
  `repas_default` dépend du nom du dossier du back (surchargeable).

## Alternatives écartées

- `host.docker.internal:8080` : dépend de l'hôte (Windows, WSL, Linux) et casse les cookies `Secure`.
- Le front servi par le Caddy du back : couple les deux dépôts ; la bascule de production s'y fera, pas le développement.
- Playwright en dehors de Docker : demande Node et les navigateurs sur le poste.

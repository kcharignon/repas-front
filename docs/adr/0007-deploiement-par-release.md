# 0007 — Déploiement : une release GitHub publie l'image et la met en production

- **Statut** : Accepted
- **Date** : 2026-10-16
- **Liens** : [0004](0004-front-dans-docker.md), [0005](0005-session-du-front.md), ADR 0017 du dépôt back (`kcharignon/repas`, `docs/adr/0017-deploiement-et-releases.md`), `.github/workflows/release.yml`

## Contexte

Le front est une image Caddy (`prod` du `Dockerfile`) qui sert les fichiers statiques. En production il est derrière la bordure Caddy du back : celle-ci porte le HTTPS, le nom de domaine et le relais de `/api` et `/images` vers le back. L'infrastructure (Compose, bordure, `deploy.sh`, sauvegardes) appartient au dépôt back.

## Décision

1. Publier une release GitHub (`vX.Y.Z`, `-rc1` pour un essai) sur ce dépôt construit l'image `prod`, la publie sur `ghcr.io/kcharignon/repas-front:vX.Y.Z` et déploie **ce seul service** : `ssh deploy@serveur 'cd /opt/repas && ./deploy.sh front vX.Y.Z'`. Le back n'est ni reconstruit ni redémarré.
2. Le workflow refuse un tag qui n'est pas une version, un commit absent de `main`, et ne déploie qu'après la CI complète (`ci.yml` appelé par `release.yml`).
3. `deploy.sh` vérifie que le SPA répond après le déploiement et revient seul à la version précédente sinon. Le front n'a aucune base de données : le retour arrière est complet.
4. L'image ne connaît aucun nom de domaine ni secret : elle est identique en développement, en essai et en production. Rien n'est cuit dans l'image au déploiement.
5. Le contrat d'API (`api/contract.json`) est figé à un commit du back : un changement cassant de l'API sort en deux temps (back compatible d'abord, puis front).

## Conséquences

- Positives : front et back sortent indépendamment ; une version est annulable en une commande ; aucune construction sur le serveur de 1 Go.
- Négatives : le déploiement dépend des secrets `PROD_SSH_*` de l'environnement GitHub `production` et du `deploy.sh` du back déjà installé sur le serveur (première installation : voir le skill `repas-ops` du back).
- Garde-fou : le job `docker` de la CI construit et essaie l'image de production ; le déploiement lui-même est essayé par `make deploy-smoke` du back.

## Alternatives écartées

- Un `deploy.sh` propre au front : deux scripts à garder alignés sur un même `compose.yaml`.
- Servir le front depuis le back : les deux versions ne sortiraient plus indépendamment.

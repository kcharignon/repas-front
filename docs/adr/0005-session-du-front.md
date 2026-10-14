# 0005 — Session du front : jeton en mémoire, refresh par cookie, garde de routes

- **Statut** : Accepted
- **Date** : 2026-10-15
- **Liens** : [0002](0002-sdk-genere-depuis-le-contrat-openapi.md), [0004](0004-front-dans-docker.md), ADR 0008 et 0015 du dépôt back

## Décision

1. **Le jeton d'accès (JWT, 1 h) vit en mémoire** dans le store Pinia `session` : jamais `localStorage`, jamais `sessionStorage`, jamais un
   cookie lisible par script. Un test de bout en bout vérifie qu'aucun stockage ne contient de JWT.
2. **Au chargement de la page**, la garde de routes appelle `restore()` : `POST /api/auth/refresh` échange le cookie `HttpOnly` de
   rafraîchissement contre un jeton neuf, puis `GET /api/v1/me` donne l'utilisateur. Sans cookie valide, la session est anonyme.
3. **Un seul rafraîchissement à la fois** : dix requêtes en `401` simultanées n'en déclenchent qu'un, puis sont rejouées une fois
   (`createAuthFetch`, ADR 0002). Un refresh en `401` est retenté **une fois** après 300 ms (course entre onglets, ADR 0015 §5 du back),
   puis la session est perdue.
4. **Connexion, inscription, déconnexion** : `login` (`POST /api/login_check`), `register` (`POST /api/v1/users` puis `login`), `logout`
   (`POST /api/auth/logout`, le jeton est oublié même si le back est injoignable).
5. **Garde de routes** (`sessionGuard`) : une route est protégée par défaut ; `meta.public` l'ouvre à tous (catalogue du design),
   `meta.guestOnly` la réserve aux visiteurs (connexion, inscription). Un anonyme est renvoyé à `/connexion?redirect=<page voulue>` ; la
   redirection n'accepte qu'un chemin du site (`safeRedirect` refuse `//autre-site`, `https://…`).
6. **Messages d'erreur** : `401` « Identifiants invalides. » (le back ne dit pas pourquoi), `429` avec le délai de `Retry-After`, `409`
   e-mail déjà pris, `422` le message de validation du back tel quel, réseau « Le serveur est injoignable ».
7. **Tests** : un faux back (`stubApi`) remplace `fetch`, un appel non prévu fait échouer le test ; la suite de bout en bout joue la vraie
   connexion contre le vrai back (`make e2e`, identifiants par l'environnement).

## Conséquences

- Positives : une faille XSS ne peut pas voler de jeton durable ; la session survit au rechargement et à l'expiration sans ressaisie.
- Négatives : un rechargement coûte deux appels (refresh puis `/me`) avant le premier écran protégé ; plusieurs onglets partagent le
  cookie mais pas le jeton (chacun rafraîchit pour lui, la rotation côté back l'absorbe grâce à la grâce de 10 s).

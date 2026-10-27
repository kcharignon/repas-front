# 0005 — Session du front : jeton en mémoire, refresh par cookie, garde de routes

- **Statut** : Accepted
- **Date** : 2026-10-15
- **Liens** : [0002](0002-sdk-genere-depuis-le-contrat-openapi.md), [0004](0004-front-dans-docker.md), ADR 0008, 0015, 0020 et 0026 du dépôt back

## Décision

1. **Le jeton d'accès (JWT, 1 h) vit en mémoire** dans le store Pinia `session` : jamais `localStorage`, jamais `sessionStorage`, jamais un
   cookie lisible par script. Un test de bout en bout vérifie qu'aucun stockage ne contient de JWT.
2. **Au chargement de la page**, la garde de routes appelle `restore()` : `POST /api/auth/refresh` échange le cookie `HttpOnly` de
   rafraîchissement contre un jeton neuf, puis `GET /api/v1/me` donne l'utilisateur. Sans cookie valide, la session est anonyme.
3. **Un seul rafraîchissement à la fois** : dix requêtes en `401` simultanées n'en déclenchent qu'un, puis sont rejouées une fois
   (`createAuthFetch`, ADR 0002). Un refresh en `401` est retenté **une fois** après 300 ms (course entre onglets, ADR 0015 §5 du back),
   puis la session est perdue. **Seul un `401` met fin à la session** : un `429`, une réponse `5xx` ou une erreur de réseau la laissent telle quelle (indice,
   utilisateur et copie hors-ligne gardés) ; le rafraîchissement n'est alors pas redemandé avant un délai d'attente (2 s, doublé à chaque échec de suite,
   30 s au plus ; le `Retry-After` du back est suivi jusqu'à une minute), et un appel qui arrive pendant ce délai n'en lance pas un autre ; la requête dont le jeton a expiré échoue alors comme un réseau
   coupé (« injoignable »), pas comme une session perdue.
4. **Connexion, inscription, déconnexion** : `login` (`POST /api/login_check`), `register` (`POST /api/v1/users` seul : le compte attend la confirmation de son adresse, pas de session), `sendEmailVerification` et `confirmEmail` (routes publiques de confirmation d'adresse, ADR 0020 du back), `logout`
   (`POST /api/auth/logout`, le jeton est oublié même si le back est injoignable).
   **Mot de passe oublié** (ADR 0026 du back) : `sendPasswordReset` (`POST /api/v1/users/password-reset/send`, `204` que l'adresse ait un compte ou non) et `resetPassword`
   (`POST /api/v1/users/password-reset/confirm`, `422 INVALID_PASSWORD_RESET_TOKEN` pour un lien inconnu, déjà utilisé ou expiré). **Aucune connexion automatique** : le back ferme toutes
   les sessions du compte et n'en ouvre aucune, donc `resetPassword` efface la copie locale de la session (`clear()`) et l'écran renvoie à
   `/connexion?mot-de-passe=change`, qui annonce que le nouveau mot de passe est enregistré. `clear()` efface aussi ce que le drive garde pour le compte :
   le brouillon de passage (`repas.drive.run`) et le résultat du dernier envoi en mémoire (`src/session/accountData.ts`, où s'ajoute tout nouveau
   magasin ou toute nouvelle clé qui porte des données du compte).
5. **Garde de routes** (`sessionGuard`) : une route est protégée par défaut ; `meta.public` l'ouvre à tous (catalogue du design, lien de nouveau mot de passe `/mot-de-passe-oublie/confirmation?token=…`),
   `meta.guestOnly` la réserve aux visiteurs (connexion, inscription, demande du lien `/mot-de-passe-oublie`). Un anonyme est renvoyé à `/connexion?redirect=<page voulue>` ; la
   redirection n'accepte qu'un chemin du site (`safeRedirect` refuse `//autre-site`, `https://…`).
6. **Messages d'erreur** : `401` « Identifiants invalides. » (le back ne dit pas pourquoi), `403 EMAIL_NOT_VERIFIED` « adresse pas encore confirmée » avec un lien vers `/verification-email`, `429` avec le délai de `Retry-After`, `409`
   e-mail déjà pris, `422` le message de validation du back tel quel, réseau « Le serveur est injoignable ».
7. **Plusieurs onglets** : l'indice `repas.session` est lu par tous les onglets. Quand l'un met fin à la session, l'événement `storage` du navigateur
   l'apprend aux autres (`src/session/crossTab.ts`) : ils oublient l'utilisateur, les données en mémoire et la copie hors-ligne, puis mènent à la
   connexion ; la copie hors-ligne vérifie aussi l'indice avant chaque écriture, donc un onglet qui n'a pas encore reçu l'événement ne la réécrit pas.
8. **Liaison d'Alexa** : la page `/alexa/lier` affiche l'adresse e-mail du compte connecté (`GET /api/v1/me`) et le nom d'hôte seul de l'adresse de retour ;
   « Ce n'est pas toi ? » ferme la session et revient à la connexion avec les mêmes paramètres.
9. **Tests** : un faux back (`stubApi`) remplace `fetch`, un appel non prévu fait échouer le test ; la suite de bout en bout joue la vraie
   connexion contre le vrai back (`make e2e`, identifiants par l'environnement).

## Conséquences

- Positives : une faille XSS ne peut pas voler de jeton durable ; la session survit au rechargement et à l'expiration sans ressaisie.
- Négatives : un rechargement coûte deux appels (refresh puis `/me`) avant le premier écran protégé ; plusieurs onglets partagent le
  cookie mais pas le jeton (chacun rafraîchit pour lui, la rotation côté back l'absorbe grâce à la grâce de 10 s).

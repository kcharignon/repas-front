# 0006 — PWA : application installable et liste en cours lisible hors-ligne

- **Statut** : Accepted ; amendé le 2026-10-18 (envoi de la liste au drive)
- **Date** : 2026-10-15
- **Liens** : [0004](0004-front-dans-docker.md), [0005](0005-session-du-front.md), [0008](0008-envoi-de-la-liste-au-drive.md), plan du front (phase 5) du dépôt back

## Contexte

La liste de courses se consulte en magasin, sur téléphone, souvent avec un réseau faible ou absent (sous-sol, caves de centre commercial).
Il faut que l'application s'ouvre et montre la liste en cours sans réseau. L'édition hors-ligne (file d'attente de modifications à rejouer,
résolution de conflits avec `If-Match`) est un autre chantier, hors périmètre.

## Décision

1. **Application installable** : manifeste (`vite-plugin-pwa`, nom, couleurs, icônes 192/512 et « maskable » tirées du logo), `theme-color`,
   icône Apple. `start_url` : `/liste`.
2. **Coque en cache, aucune donnée d'API dans le service worker** : le service worker (généré par Workbox, mise à jour automatique)
   précharge les scripts, styles, polices et icônes ; les navigations hors-ligne reçoivent `index.html` (sauf `/api` et `/images`), les images
   de `/images` sont servies en cache puis rafraîchies. **Aucune réponse de `/api` n'est jamais mise en cache par le service worker** : une
   réponse d'API dépend de l'utilisateur, et un cache d'URL la montrerait au suivant. Le service worker n'existe qu'en production
   (`import.meta.env.PROD`), jamais sous `make start`.
3. **La copie de la liste vit dans l'application, au nom de l'utilisateur** (`src/offline/persistence.ts`) : seuls le résumé de la liste active et
   le détail de cette liste sont gardés (`localStorage`, clé `repas.cache`, avec l'identifiant de l'utilisateur et la date, au plus 7 jours,
   écriture groupée par seconde). Relue seulement pour **le même utilisateur** ; **à la fin de la session** (déconnexion, session perdue) le
   cache des requêtes en mémoire est vidé et la copie effacée. (Avant, le cache mémoire survivait à un changement d'utilisateur dans
   l'onglet : corrigé au passage.)
4. **Reprise de session sans réseau** : un échec **réseau** (et non un `401`) au rafraîchissement ne perd pas la session (l'indice
   `repas.session` est gardé) et l'utilisateur est repris depuis sa copie (`repas.user`, sans jeton, effacée avec la session). Le jeton
   revient au premier appel réussi (le `401` déclenche le rafraîchissement, ADR 0005).
5. **Lire sans réseau, échouer clairement en écriture** : le client de requêtes passe en `networkMode: 'always'` (une lecture ou une écriture
   sans réseau échoue tout de suite au lieu d'attendre en silence, sans réessai si le navigateur se dit hors-ligne). Un bandeau « Hors
   connexion » s'affiche ; la liste dit de quand date sa copie ; cocher une ligne revient en arrière avec le message « serveur injoignable ».
6. **Un échec de relecture ne remplace pas ce qui est à l'écran** : les vues n'affichent l'erreur que s'il n'y a **rien** à montrer
   (`hasFailed`). Vrai aussi en ligne (back en panne au retour de focus).
7. **Tests** : unitaires (persistance, session sans réseau, bandeau, client de requêtes) ; `make e2e-offline` joue le scénario réel (coupure du
   réseau avec Chromium) contre **l'image de production**, seule où le service worker existe ; les autres e2e bloquent les service workers.
8. **Une nouvelle version recharge l'application seule** (2026-10-16) : `skipWaiting` et `clientsClaim` sont réglés à la main dans
   `vite.config.ts` (`vite-plugin-pwa` ne les règle pas seul avec `injectRegister: false`) : sans eux, la nouvelle version attendait que
   toutes les fenêtres soient fermées, et un téléphone qui garde l'application ouverte en arrière-plan restait sur l'ancienne. Le
   navigateur ne cherche une version qu'à l'ouverture d'une page : `src/pwaUpdate.ts` la cherche aussi au retour au premier plan (au
   plus une fois par minute) et toutes les heures. Une version trouvée s'active, prend la main et la page se recharge une fois
   (`registerType: 'autoUpdate'`). Un formulaire en cours de saisie à ce moment-là est perdu : les versions sont rares (quelques-unes
   par semaine) ; le rechargement automatique est une demande de l'utilisateur.

## Conséquences

- Positives : la liste en cours s'ouvre sans réseau, aucune fuite d'une session à l'autre, application installable.
- Négatives : `vite-plugin-pwa` / Workbox ajoutent une chaîne de dépendances de build (284 paquets de développement) ; la copie hors-ligne est
  en clair dans le navigateur de l'utilisateur (une liste de courses, pas un secret) ; pas d'édition hors-ligne.
- À surveiller : si l'on garde un jour d'autres données hors-ligne, étendre `shouldDehydrateQuery` (liste blanche) et non l'ouvrir.

## Amendement du 2026-10-18 (ADR 0008)

La liste de courses se consulte en magasin, mais elle s'**envoie** aussi au drive depuis le téléphone. Ce que cela change à ce qui précède :

9. **Rien du drive n'est gardé hors ligne.** Ni le service worker (aucune réponse de `/api`, § 2) ni la copie hors ligne (liste blanche : la liste en cours et son résumé, § 3) ne gardent le plan, les choix, les réglages ou l'estimation du drive ; le plan est relu à chaque ouverture de l'écran d'envoi.
10. **Une action du drive demande le réseau.** Envoyer, ouvrir le drive, enregistrer ses réglages et terminer ou rouvrir une liste depuis l'écran du retour sont désactivés hors connexion, avec leur explication (§ 5).
11. **Le rechargement par une nouvelle version (§ 8) peut tomber pendant un envoi** : l'utilisateur est alors dans l'écran du drive de l'application. Le passage en cours est retrouvé par son brouillon (`repas.drive.run` dans `localStorage`, ADR 0008 § 6) et le résultat est gardé dès le démarrage de l'application, avant que l'écran du retour existe.

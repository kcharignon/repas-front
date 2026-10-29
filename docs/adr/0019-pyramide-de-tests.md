# ADR 0019 : Pyramide de tests : peu de bout en bout, le reste en composant et en unitaire

Statut : Accepted (2026-10-30). Mise en oeuvre dans les PR #236 à #244 ; côté back, même logique (ADR 0010 du back, règles 12 et 13).

## Contexte

Le job Playwright de la CI durait **1234 s** : 1024 exécutions de tests e2e, chaque test joué deux fois (téléphone et bureau), en un seul processus, avec beaucoup de captures écrites pour rien. Le job « Qualité et tests » prenait environ 190 s. Beaucoup de ces tests e2e vérifiaient en navigateur ce qu'un test de composant prouve aussi bien et en quelques millisecondes : un texte, un refus du back, un enchaînement d'étapes, une date de saison.

Après le chantier : le job Playwright dure **150 à 190 s**, « Qualité et tests » **114 s**, la CI complète environ **3 min 20**, avec la même couverture (les seuils Vitest ont même été remontés).

## Décision

1. **Ce qui reste en e2e, et seulement cela** : ce que jsdom ne sait pas faire. La mise en page et le débordement à un viewport ; le contraste (axe, thèmes clair et sombre) ; le clavier et le focus réels ; le service worker et le hors-ligne ; `public/theme-init.js` au démarrage (`theme-startup.spec`) et la cascade CSS réelle des saisons ; le pont natif dans une vraie page ; un parcours nominal par fonctionnalité.
2. **Ce qui descend** :
   - **Composant** : Vitest + `@vue/test-utils` + jsdom, routeur et stores réels, API simulée à la frontière `fetch` (`stubApi`, `appContext()` de `src/__tests__/helpers.ts`). C'est le lieu des textes, états (chargement, vide, erreur, chaque code du back), enchaînements d'étapes et refus.
   - **Unitaire pur** : logique sans DOM. Le fichier porte `// @vitest-environment node` en première ligne, à condition de n'importer aucun `.vue`, même indirectement (le routeur en charge) : en `node`, Vitest compile les composants pour le rendu serveur et fausse la couverture (c'est pourquoi `legacy.spec.ts` reste en jsdom).
3. **Comment l'e2e est joué** : une seule fois, sur le projet `mobile` (Pixel 7) ; le bureau seulement pour les tests étiquetés `@bureau` (en plus) ou `@bureau-seul` (à la place), constantes de `e2e/support/test.ts`. 4 processus en CI (`fullyParallel` quand l'API est simulée ; un seul avec le vrai back, compte partagé), `E2E_PORT` pour jouer deux suites côte à côte. **Un test e2e par écran**, les deux thèmes dans la même visite (`e2e/support/screen.ts` : `axeBothThemes`, `switchTheme`, qui attend la fin des transitions). Les captures ne s'écrivent que derrière `E2E_SHOTS`.
4. **Règle de revue pour retirer ou descendre un test** : lire les deux tests (l'e2e retiré et son remplaçant) ; vérifier que le remplaçant asserte le même comportement, pas seulement le même composant ; **contrôle par mutation** (casser le code de production, constater que le test de bas niveau échoue, restaurer ; un mutant qui survit veut dire un test à écrire ou à garder en e2e) ; **tableau de remplacement dans la PR** (e2e retiré, remplaçant, mutation faite). Jamais de `waitForTimeout` ni de `setTimeout` réel : fausses minuteries ; jamais de variable de module modifiée par un test.
5. **Filets** : seuils de couverture Vitest en cliquet dans `vitest.config.ts` (aujourd'hui 96 % lignes, 94 % fonctions, 89 % branches, 95 % instructions, pour une mesure de 97,8 / 96,2 / 91,4 / 96,6) : ils ne baissent jamais. Les specs `e2e/` sont type-vérifiées (`tsconfig.e2e.json`, par `vue-tsc --build`, donc `make check` et la CI).
6. **Budget indicatif** : un nouvel écran = un test e2e (mise en page + axe des deux thèmes + un parcours nominal). Si le job Playwright dépasse environ 4 min, on regarde d'abord ce qui peut descendre avant de découper en tranches ; `--shard=i/n` fonctionne tel quel le jour où il le faudra.
7. **Parité côté back** : la CI du back joue aussi sa suite en parallèle avec couverture (`make test-ci`, ParaTest) : voir l'ADR 0010 du back, règle 13, qui n'est pas recopiée ici.

## Conséquences

- Une PR d'écran écrit d'abord ses tests de composant, puis un seul test e2e ; elle n'ajoute pas de boucle « chaque viewport × chaque thème ».
- **Perdu, honnêtement** : des axes de bureau (1280 px) ont été retirés sur plusieurs pages (recettes des autres, unités, ingrédients de base, fusion, petites pages) ; seul le shell (`design`), l'administration des comptes, la liste et l'authentification gardent un passage au bureau. Les largeurs intermédiaires (390 et 412 px) ne sont plus jouées : 360 px, le cas le plus étroit, tient lieu. Le cas « ingrédient commun » de la fusion n'est plus en e2e (il reste en unitaire).
- **Limites connues** : jsdom ne voit ni la couleur ni la mise en page (un test qui en dépend reste en e2e) ; les faux back des e2e ne sont pas validés contre le contrat (c'est `contract.spec.ts` et `make e2e` contre le vrai back) ; quatre faux back du drive coexistent car leurs états diffèrent ; l'équivalence d'un test descendu repose sur la mutation, donc sur le soin du relecteur.

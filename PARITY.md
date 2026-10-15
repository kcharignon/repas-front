# Recette de parité avec les pages Twig

Chaque route du back Twig (`bin/console debug:router`, hors `/api`) et son équivalent dans le front. La bascule en production exige que **toutes
les lignes** soient cochées et jouées par l'utilisateur pendant le « dogfooding » (plan du front, phases 6 et 7). Mis à jour à chaque PR.

Légende des tests : **U** = test unitaire (`src/**/__tests__`), **E** = test de bout en bout contre le vrai back (`e2e/`, `make e2e`), les deux
avec axe (WCAG AA, clair et sombre) pour les pages. État : ✅ fait et testé · 🟡 fait, à jouer à la main · ⬜ pas fait.

## Accès et compte

| Twig | Vue | Écran | Tests | État |
|---|---|---|---|---|
| `GET\|POST /login` | `/connexion` | connexion (retour à la page demandée, 401, 429 avec délai) | U `AuthViews`, E `session` | ✅ |
| `ANY /logout` | bouton « Se déconnecter » (`/moi`) | déconnexion, jetons révoqués côté back | U `Account`, E `session` | ✅ |
| `GET\|POST /registration` | `/inscription` | inscription puis connexion (409 e-mail pris, 422 du back) | U `AuthViews`, E `session` (axe) | ✅ |
| `GET /` | `/` → `/liste` | accueil = liste de courses en cours | U `App`, E `shopping-list` | ✅ |
| `GET\|POST /user/{id}` | `/moi` | nombre de personnes par défaut, mot de passe (déconnexion ensuite) | U `Account`, E `account` | ✅ |

## Listes de courses

| Twig | Vue | Écran | Tests | État |
|---|---|---|---|---|
| `GET /shopping-list/active` | `/liste` | liste en cours (créée **explicitement**, plus par une lecture) | U `ShoppingListView`, E `shopping-list` | ✅ |
| `GET /shopping-list` | `/listes` | toutes les listes, statut, création | U `ShoppingLists`, E `shopping-lists` | ✅ |
| `GET /shopping-list/{id}` | `/listes/:id` | détail d'une liste (lignes, recettes) | U `ShoppingLists` | ✅ |
| `POST /shopping-list/create` | « Nouvelle liste » | l'ancienne passe en pause, les terminées sont supprimées (back) | U, E `shopping-lists` | ✅ |
| `POST /shopping-list/{id}/rename` | « Renommer » | nom vide = date, `If-Match` | U, E | ✅ |
| `POST /shopping-list/{id}/activated` | « Reprendre cette liste » | | U, E | ✅ |
| `POST /shopping-list/{id}/paused` | « Mettre en pause » | | U, E | ✅ |
| `POST /shopping-list/{id}/stopped` | « Terminer » | | U | ✅ |
| `DELETE /shopping-list/{id}` | « Supprimer » (confirmation) | | U, E | ✅ |
| `POST /shopping-list/line/{id}/tick` et `/uncheck` | case à cocher | mise à jour optimiste, retour en arrière si refus, liste terminée gardée à l'écran | U, E `shopping-list` | ✅ |
| `PUT /shopping-list/meal/{id}/serving/{n}` | − / + d'un repas | `If-Match`, 412 → relecture | U | ✅ |
| `POST /shopping-list/active/recipe/{id}/add` et `/remove` | « Ajouter à la liste » / retrait | depuis les recettes et depuis la liste ; liste créée si absente | U `Recipes`, E `recipes` | ✅ |
| `POST /shopping-list/active/ingredient/{slug}/add` et `/remove` | − / + d'un rayon | | U `Ingredients`, E `ingredients` | ✅ |

## Recettes

| Twig | Vue | Écran | Tests | État |
|---|---|---|---|---|
| `GET /recipes`, `ANY /recipe/type/{slug}` | `/recettes?type=` | types en puces, recherche par nom, bouton de planification | U `Recipes`, E `recipes` | ✅ |
| `GET /recipe/{id}` | `/recettes/:id` | détail, ingrédients, planification | U, E | ✅ |
| `GET\|POST /recipe` | `/recettes/nouvelle` | éditeur (liste d'ingrédients filtrable, unités de l'ingrédient) | U `RecipeEditor`, E `recipe-editor` | ✅ |
| `GET\|POST /recipe/{id}/update` | `/recettes/:id/modifier` | même éditeur, `If-Match` | U, E | ✅ |
| `DELETE /recipe/{id}` | « Supprimer » (confirmation, 409 expliqué) | | U, E | ✅ |
| `POST /recipe/{id}/copy` | « Copier » | | U, E | ✅ |
| `GET /recipes/other-people` | `/recettes/autres` | | U, E | ✅ |

## Rayons et ingrédients

| Twig | Vue | Écran | Tests | État |
|---|---|---|---|---|
| `GET /department` | `/rayons` | | U `Ingredients`, E `ingredients` | ✅ |
| `GET /department/{slug}` | `/rayons/:slug` | ingrédients, quantité dans la liste, − / + | U, E | ✅ |
| `GET\|POST /ingredient` | `/ingredients/nouveau` | coefficient seulement si les unités diffèrent | U, E | ✅ |
| `GET\|POST /ingredient/{slug}` | `/ingredients/:slug/modifier` | | U, E | ✅ |
| `POST /ingredient/{slug}/delete` | « Supprimer » (409 expliqué) | | U, E | ✅ |
| `GET /ingredients/{slug}/units` | liste d'unités de l'éditeur de recette | | U `RecipeEditor` | ✅ |

## Administration (`ROLE_ADMIN`)

| Twig | Vue | Tests | État |
|---|---|---|---|
| `/admin/unit`, `/create`, `/{slug}/update` | `/admin/unites` | U `Admin`, E `admin` | ✅ |
| `/admin/department`, `/create`, `/{slug}/update` | `/admin/rayons` | U | ✅ |
| `/admin/recipe-type`, `/create`, `/{id}/update` | `/admin/types-de-recette` | U | ✅ |
| `/admin/conversion`, `/create`, `/{id}/update` | `/admin/conversions` | U, E (axe) | ✅ |
| `GET /admin/user` | `/admin/utilisateurs` | U, E | ✅ |

`POST /unit` (`view_unit_add`) est un contrôleur vide (`TODO`) dans le Twig : rien à reprendre.

## Inventaire négatif (ce que Twig faisait sans le dire)

| Comportement | Dans le front | Vérifié |
|---|---|---|
| Une page protégée renvoie à la connexion puis à la page voulue | garde de routes, `safeRedirect` refuse les autres sites | U `guard`, E `session` |
| Un utilisateur ordinaire n'accède à aucune page `/admin` | garde `admin` + le back refuse (403) | U, E `admin` |
| La ressource d'un autre n'existe pas (404) | « Cet élément n'existe plus. » | U |
| Ajouter une recette ou un ingrédient crée la liste en cours si besoin | création explicite avant l'ajout | U |
| Cocher la dernière ligne termine la liste | la liste reste à l'écran avec « Courses terminées » ; la décocher la reprend | U, E |
| Supprimer une recette ou un ingrédient encore utilisé est refusé | message qui dit pourquoi (409) | U |
| Deux onglets modifient la même liste ou recette | `ETag` / `If-Match`, 412 → message et relecture | U |
| Changer son mot de passe coupe les sessions | déconnexion et retour à la connexion | U |
| Magasin sans réseau | liste en cours lisible hors-ligne, modifications refusées clairement (hors parité Twig : nouveauté) | U, E `offline` |
| Plafonds de débit (connexion, inscription, refresh) | message avec le délai (`Retry-After`) | U |

## Anciennes adresses Twig

Chaque adresse de l'interface Twig mène à son équivalent (`src/router/legacy.ts`, table du plan du front, section 10 : signets et liens reçus survivent à la bascule). Les formulaires de création et de modification de l'administration (`/admin/unit/create`, `/admin/unit/{slug}/update`…) retombent sur la liste, qui les ouvre en fenêtre. Une adresse inconnue affiche une page « Page introuvable » (U `legacy`, E `not-found` avec axe).

## Écarts connus avec Twig (relecture template par template, scripts `ajax.js` / `mobile.js` compris)

Tout le reste est repris à l'identique ou mieux ; ces deux écarts sont à trancher pendant le dogfooding.

| Twig | Front | À décider |
|---|---|---|
| Quantités de la liste arrondies à l'**entier supérieur** (`round(0, 'ceil')`), une décimale dans la page d'un rayon | quantité exacte, deux décimales au plus (« 1,6 kg ») : c'est la maquette validée | garder, ou arrondir à l'entier supérieur à l'affichage (un seul endroit : `formatQuantity`, `src/features/shopping-lists/format.ts`) |
| « Se souvenir de moi » : sans la case, la session s'arrête à la fermeture du navigateur (`always_remember_me: false`) | pas de case : le cookie de rafraîchissement dure toujours 30 jours glissants (ADR back 0015) | sur un poste partagé on ne peut pas refuser d'être retenu ; l'ajout demande le back (cookie de session et famille de jetons non persistante), donc une PR back que l'humain merge |

## Mesures (image de production, `make lighthouse`)

Mobile simulé (réseau lent, CPU x4), compte de démonstration : performance 94 à 100, accessibilité 100, bonnes pratiques 100, SEO 100 sur la connexion, la liste, mes listes, les recettes et les rayons. Budgets tenus par le script : performance ≥ 90, accessibilité et bonnes pratiques 100, SEO ≥ 90.

## Pas encore repris (hors des routes Twig)

- Pagination et recherche des listes qui grossissent (côté back aussi : roadmap).
- Vérification d'e-mail à l'inscription (décision produit).

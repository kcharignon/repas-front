# ADR 0017 : Recettes des autres, par catégorie et avec une recherche par nom

Statut : Accepted (2026-10-28). Back : `GET /api/v1/recipes/other-people`, paramètre `q` et `typeSlug` (back #316, ADR 0019 du back amendée).

## Contexte

L'écran `/recettes/autres` (`OtherRecipesView.vue`) listait les recettes des autres par ordre de slug, 200 à la fois (« Voir plus »). Sans repère, trouver « la tarte aux pommes » demandait de tout lire.

## Décision

1. **Sans recherche, une section par catégorie.** Le back rend la liste triée par catégorie (l'ordre des types du produit), puis nom ; le front **ne trie rien** : `groupByType` (`otherRecipeGroups.ts`) ouvre une section à chaque changement de `typeSlug` (titre `h2` = `typeName`, majuscule initiale). La catégorie n'est pas répétée sur chaque ligne.
2. **Avec une recherche, une liste simple.** Le champ (`UiSearchField`, `type="search"`, étiquette lue par les lecteurs d'écran, bouton « Effacer la recherche » de 44 px qui rend le focus au champ) envoie `q` au back, qui classe par pertinence **toutes catégories confondues** : le front ne regroupe pas, il montre la catégorie (`typeName`, discrète) sous le nom de chaque ligne.
3. **Les conventions de la recherche d'ingrédients** (Rayons) : 2 caractères au moins (`MIN_OTHERS_SEARCH_LENGTH`, sinon la liste n'est pas filtrée et aucun appel de recherche ne part), attente d'une pause de 250 ms (`useDebounced`), `maxlength` 100 (le back refuse plus en `422`), annulation d'une requête périmée (le `signal` de TanStack Query), état vide `empty-search` (`SeasonEmpty`) avec « Aucune recette ne ressemble à « … ». ». Effacer le champ revient **tout de suite** à la liste par catégories (déjà en cache).
4. **Une clé de cache par recherche** (`recipeKeys.others(search)`) ; pendant qu'une recherche s'affine, les résultats de la précédente restent affichés (atténués, `aria-busy`), jamais ceux de la liste par catégories (autre ordre) ; une erreur ne les garde pas.
5. **« Voir plus » inchangé** : `offset` sur la liste en cours (avec `q` le cas échéant), `totalItems` est le vrai nombre ; la clé de recherche est lue dans la clé de la requête, pas dans la saisie du moment.
6. Le champ n'est pas montré quand le back n'a aucune recette à proposer (« Rien de nouveau à copier pour le moment. »).

## Conséquences

- Aucune logique de tri ni de pertinence dans le front ; un changement d'ordre des catégories ou du classement reste côté back.
- Mise en ligne : le back d'abord (le champ `typeSlug` et le paramètre `q` n'existent pas avant), le site ensuite ; avec l'ancien back, `q` serait ignoré et les sections regrouperaient mal.

# ADR 0018 : La première lettre d'un nom de recette ou d'ingrédient est une majuscule

Statut : Accepted (2026-10-28). Back : la même règle, en silence, à l'enregistrement (`StringTool::capitalizeFirst`, back v1.5.0), et les noms existants sont déjà migrés.

## Contexte

Les noms étaient enregistrés tels que tapés : « pâtes carbonara », « œufs », « de la farine T55 » côtoyaient « Tarte aux pommes » dans les listes. Le propriétaire veut que tous les noms de recettes et d'ingrédients commencent par une majuscule.

## Décision

1. **Seule la première lettre change.** `capitalizeFirst` (`src/design/capitalizeFirst.ts`, pur) met la première lettre en majuscule en français (`é` donne `É`, la ligature `œ` donne `Œ`) et garde la suite telle que tapée. Les espaces de tête sont conservés, la lettre qui suit passe en majuscule ; un premier caractère qui n'est pas une lettre (chiffre, parenthèse, apostrophe) reste tel quel. Idempotent.
2. **Une option du champ commun, pas une logique par écran.** `UiTextInput` a une propriété `capitalize-first` : la première lettre tapée ou collée passe en majuscule tout de suite, le curseur reste où il était (une majuscule a la même longueur), et `autocapitalize="sentences"` demande déjà la majuscule au clavier du téléphone. **Pendant une composition** (clavier mobile, IME) on ne touche à rien (`isComposing`) : la correction se fait à la fin de la composition (`compositionend`), pour ne pas casser l'auto-complétion d'Android. Elle se refait aussi à la sortie du champ (`blur`).
3. **Ceinture et bretelles à l'envoi.** `useSaveRecipe` et `useSaveIngredient` passent le nom par `trim()` puis `capitalizeFirst` avant `POST` et `PUT`, quel que soit le chemin qui a rempli le formulaire (un nom lu en minuscules d'avant la migration, par exemple) ; le back l'appliquerait de toute façon.
4. **Où c'est branché** : le nom de la recette (`RecipeEditorView.vue`) et le nom de l'ingrédient (`IngredientEditorView.vue`, création et modification). Le front n'a pas d'autre endroit où l'on saisit un nom de recette ou d'ingrédient (la copie d'une recette n'envoie pas de nom, le back garde celui de l'original).
5. **Ce qui n'est PAS touché** : les champs de recherche (un texte cherché reste libre), les noms d'unités, de rayons, de catégories, de listes de courses, de magasin et de produits du drive, les e-mails.

## Conséquences

- Aucun changement de contrat d'API ni de texte : le front envoie seulement un nom déjà corrigé.
- Tout nouveau champ « nom » de recette ou d'ingrédient reçoit `capitalize-first` ; un champ de recherche ne le reçoit jamais.

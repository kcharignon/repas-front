/** Une recette des autres, telle que le back la rend. */
export interface OtherRecipe {
  id: string
  name: string
  typeName: string
  typeSlug: string
}

export interface OtherRecipeGroup {
  typeSlug: string
  typeName: string
  recipes: OtherRecipe[]
}

/**
 * Découpe la liste, déjà triée par catégorie par le back, en sections : une nouvelle s'ouvre à chaque changement de `typeSlug`.
 * Le front ne trie rien (l'ordre des catégories est celui du produit), il lit l'ordre reçu, d'une page à l'autre.
 */
export function groupByType(recipes: readonly OtherRecipe[]): OtherRecipeGroup[] {
  const groups: OtherRecipeGroup[] = []

  for (const recipe of recipes) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.typeSlug === recipe.typeSlug) {
      last.recipes.push(recipe)
    } else {
      groups.push({ typeSlug: recipe.typeSlug, typeName: recipe.typeName, recipes: [recipe] })
    }
  }

  return groups
}

/** Les noms de types sont saisis librement (« plat », « Boisson ») : on les affiche tous avec une majuscule. */
export function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

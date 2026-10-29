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

/** Une recette copiée pendant cette visite et la place qu'elle avait dans la liste affichée. */
export interface CopiedPin {
  recipe: OtherRecipe
  index: number
}

/**
 * Une recette copiée n'est plus « à copier » : à la relecture le back ne la rend plus. On la garde pourtant à sa place pour la visite,
 * avec son bouton « Copiée », au lieu de la faire disparaître sous le doigt de l'utilisateur. Une recette que le back rend encore
 * (relecture pas encore arrivée) n'est pas ajoutée deux fois.
 */
export function keepCopied(
  recipes: readonly OtherRecipe[],
  pins: readonly CopiedPin[],
): OtherRecipe[] {
  const result = [...recipes]
  const present = new Set(recipes.map((recipe) => recipe.id))

  for (const pin of [...pins].sort((a, b) => a.index - b.index)) {
    if (present.has(pin.recipe.id)) continue
    present.add(pin.recipe.id)
    result.splice(Math.min(pin.index, result.length), 0, pin.recipe)
  }

  return result
}

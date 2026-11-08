/** Une recette des autres, telle que le back la rend. */
export interface OtherRecipe {
  id: string
  name: string
  typeName: string
  typeSlug: string
  /** Recette copiée de Marmiton : la pastille « Marmiton ». Un back qui ne le rend pas encore : pas de pastille. */
  fromMarmiton?: boolean
  /** Seul l'administrateur le reçoit à vrai : il a déjà sa copie de cette version commune (MAR-005), « Ma copie » remplace « Copier ». */
  alreadyCopied?: boolean
  /** L'identifiant de cette copie (vrai ssi `alreadyCopied`), même renommée ou d'un autre type : « Ma copie » l'ouvre. */
  copyId?: string | null
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

/**
 * À qui est la recette qu'on regarde, et que peut-on en faire ? (ADR 0037 du back, amendement MAR-005)
 *  - `mine` : la sienne (Ajouter à la liste, Modifier, Supprimer) ;
 *  - `other` : celle d'un autre (Copier seulement) ;
 *  - `common` : la version commune d'une recette Marmiton, sans propriétaire, vue par l'administrateur seul, qui la corrige ou la supprime ;
 *  - `unknown` : pas encore su, la zone des actions reste vide.
 */
export type RecipeStance = 'mine' | 'other' | 'common' | 'unknown'

export interface StanceInput {
  isAdmin: boolean
  /** `canEdit` de la fiche : la sienne, ou n'importe quelle recette lue par un administrateur. Absent d'un back plus ancien. */
  canEdit: boolean | undefined
  /** Les identifiants de SES recettes du même type, `undefined` tant que la liste n'est pas lue. */
  mineIds: readonly string[] | undefined
  id: string
  /** L'adresse Marmiton de la fiche, déjà jugée par `marmitonSourceUrl` (`null` : aucune). */
  sourceUrl: string | null
  originalId: string | null | undefined
}

/**
 * Pour un utilisateur ordinaire `canEdit` suffit (vrai : la sienne ; faux : celle d'un autre), sans attendre la liste de ses recettes.
 * Pour l'administrateur il est vrai pour toute recette lue : la liste de SES recettes dit si elle est la sienne. Parmi les autres, la version
 * commune est celle d'une recette Marmiton (`sourceUrl`) qui n'est la copie d'aucune autre (`originalId` nul) : la fiche ne dit pas plus.
 * Un back qui ne rend pas `canEdit` : la liste seule, comme avant.
 */
export function stanceOf(input: StanceInput): RecipeStance {
  if (!input.isAdmin && input.canEdit !== undefined) return input.canEdit ? 'mine' : 'other'
  if (input.mineIds === undefined) return 'unknown'
  if (input.mineIds.includes(input.id)) return 'mine'

  return input.isAdmin &&
    input.canEdit === true &&
    input.sourceUrl !== null &&
    input.originalId === null
    ? 'common'
    : 'other'
}

/** Même nom à la casse et aux espaces près : sert à retrouver parmi ses recettes la copie d'une recette. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')
}

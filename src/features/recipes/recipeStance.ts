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
  /** `ownerless` de la fiche : vrai si c'est la version commune (sans propriétaire). Absent d'un back plus ancien. */
  ownerless: boolean | undefined
}

/**
 * Pour un utilisateur ordinaire `canEdit` suffit (vrai : la sienne ; faux : celle d'un autre), sans attendre la liste de ses recettes.
 * Pour l'administrateur il est vrai pour toute recette lue : `ownerless` du back dit que c'est la version commune, sinon la liste de SES
 * recettes dit si elle est la sienne. Un back qui ne rend pas `canEdit` : la liste seule, comme avant.
 */
export function stanceOf(input: StanceInput): RecipeStance {
  if (!input.isAdmin && input.canEdit !== undefined) return input.canEdit ? 'mine' : 'other'
  if (input.isAdmin && input.canEdit === true && input.ownerless === true) return 'common'
  if (input.mineIds === undefined) return 'unknown'

  return input.mineIds.includes(input.id) ? 'mine' : 'other'
}

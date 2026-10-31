import type { ListDestination } from '@/api'

/** Les valeurs du choix « Liste de courses » d'un produit qui ne sont pas un type : le reste est l'identifiant d'un type (ADR 0036). */
export const FOLLOW_DEPARTMENT = 'default'
export const MAIN_LIST = 'main'

/**
 * Le choix lu sur le produit, sous la forme du formulaire. Un type qui n'existe plus se lit « comme son rayon » (le back le dit déjà
 * `DEFAULT`, ce garde-fou couvre une liste de types pas encore relue).
 */
export function choiceOf(
  destination: ListDestination | undefined,
  typeIds: readonly string[],
): string {
  if (destination?.mode === 'MAIN') return MAIN_LIST
  if (
    destination?.mode === 'TYPE' &&
    destination.typeId != null &&
    typeIds.includes(destination.typeId)
  )
    return destination.typeId

  return FOLLOW_DEPARTMENT
}

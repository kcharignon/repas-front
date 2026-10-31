import type { PlannedMealList } from '@/api'
import { i18n } from '@/i18n'

import { isTyped } from './queries'

/**
 * « Boucherie, Marché et Liste principale » : les listes qui ont reçu quelque chose en planifiant une recette (ADR 0036). La principale se
 * dit « Liste principale » (jamais « Principale » : ce mot est celui d'une pastille), les types par leur nom d'abord, « et » avant la dernière.
 */
export function plannedListNames(lists: readonly PlannedMealList[]): string {
  // Les types par leur nom, dans l'ordre du back, puis la liste principale à la fin : « Boucherie, Marché et Liste principale »
  const names = [
    ...lists.filter(isTyped).map((list) => list.name),
    ...lists.filter((list) => !isTyped(list)).map(() => i18n.global.t('listTypes.main')),
  ]

  const last = names.pop()

  return names.length === 0 ? (last ?? '') : `${names.join(', ')} et ${last}`
}

/** Le message dit seulement quand la recette est allée dans une liste d'un type : sans type, rien ne change à l'écran. */
export function shouldTellWhere(lists: readonly PlannedMealList[] | undefined): boolean {
  return lists !== undefined && lists.some(isTyped)
}

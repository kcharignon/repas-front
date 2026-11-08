import type { ShoppingListRowInclude } from '@/api'
import { lowerFirst } from '@/design/lowerFirst'
import { unitLabel, withDe } from '@/features/ingredients/equationMath'
import { formatQuantity } from './format'

/** « 2 jaunes d'œuf », « 200 g de farine complète » : la quantité d'UNE partie qu'une ligne de la liste contient, accordée. */
function includeText(include: ShoppingListRowInclude): string {
  const name = lowerFirst(include.name)
  const symbol = include.unitSymbol ?? ''
  if (symbol === '')
    return `${formatQuantity(include.quantity, '')} ${unitLabel(name, include.quantity)}`

  return `${formatQuantity(include.quantity, symbol)} ${withDe(name)}`
}

/**
 * Ce que la ligne d'un ingrédient découpé contient : « 2 jaunes d'œuf et 2 blancs d'œuf » (le texte entier : « Comprend … », voir
 * `shoppingList.includes`). Vide quand la ligne ne contient aucune partie (un compte sans partie, ou un back plus ancien).
 */
export function includesText(includes: readonly ShoppingListRowInclude[] | undefined): string {
  if (includes === undefined || includes.length === 0) return ''

  const texts = includes.map(includeText)
  if (texts.length === 1) return texts[0] ?? ''

  // « A et B », « A, B et C »
  return `${texts.slice(0, -1).join(', ')} et ${texts[texts.length - 1]}`
}

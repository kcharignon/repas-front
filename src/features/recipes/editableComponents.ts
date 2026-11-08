import type { RecipeComponent, UsableRecipe } from '@/api'
import type { EditableComponent } from './RecipeComponentRow.vue'
import { formatTimes, parseTimes } from './componentsText'

let nextKey = 1

/** Une recette utilisée lue avec la recette (COMP-006) : ses lignes servent à repérer celle qui ne se convertit pas. */
export function fromRecipeComponent(component: RecipeComponent): EditableComponent {
  return {
    key: nextKey++,
    recipeId: component.recipeId,
    name: component.name,
    serving: component.serving,
    secret: component.secret === true,
    times: formatTimes(component.multiplier),
    missingIngredient:
      component.convertible === false
        ? (component.rows.find((row) => row.convertible === false)?.ingredientName ?? null)
        : null,
  }
}

/** Une recette choisie dans la feuille : elle entre à 1 fois, la recette comme elle est écrite. */
export function fromUsableRecipe(recipe: UsableRecipe): EditableComponent {
  return {
    key: nextKey++,
    recipeId: recipe.id,
    name: recipe.name,
    serving: recipe.serving,
    secret: recipe.secret,
    times: '1',
    missingIngredient: null,
  }
}

/** Les recettes utilisées telles que le back les attend, dans l'ordre où elles s'affichent ; `null` si un nombre est invalide. */
export function toPayload(
  components: readonly EditableComponent[],
): { recipeId: string; multiplier: number }[] | null {
  const payload: { recipeId: string; multiplier: number }[] = []
  for (const component of components) {
    const multiplier = parseTimes(component.times)
    if (multiplier === null) return null
    payload.push({ recipeId: component.recipeId, multiplier })
  }

  return payload
}

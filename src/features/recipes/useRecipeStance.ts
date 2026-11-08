import { computed } from 'vue'

import { useSessionStore } from '@/session/session'
import { marmitonSourceUrl } from './marmitonSourceUrl'
import { useRecipe, useRecipesByType } from './queries'
import { stanceOf } from './recipeStance'

/**
 * La recette lue et à qui elle est (`recipeStance.ts`) : la fiche et l'éditeur en tirent les mêmes actions. Le détail d'une recette est
 * lisible par tous ; `canEdit` du back dit à un utilisateur ordinaire si elle est la sienne, et pour l'administrateur (à qui il est vrai
 * partout) on lit la liste de SES recettes du même type. Tant que ce n'est pas su : `unknown`.
 */
export function useRecipeStance(id: () => string) {
  const session = useSessionStore()
  const recipe = useRecipe(id)
  const mine = useRecipesByType(() => recipe.data.value?.typeSlug ?? null)

  // Le lien d'origine d'une recette copiée de Marmiton : lu de la réponse, jamais composé ici
  const sourceUrl = computed(() => marmitonSourceUrl(recipe.data.value?.sourceUrl))
  const ownership = computed(() => {
    const data = recipe.data.value
    if (data === undefined) return 'unknown' as const

    return stanceOf({
      isAdmin: session.isAdmin,
      canEdit: data.canEdit,
      mineIds: mine.data.value?.member?.map((candidate) => candidate.id),
      id: data.id,
      ownerless: data.ownerless,
    })
  })

  return {
    recipe,
    mine,
    sourceUrl,
    /** L'identifiant de SA copie de la version commune (`null` : il n'en a pas). */
    copyId: computed(() => recipe.data.value?.copyId ?? null),
    ownership,
    isMine: computed(() => ownership.value === 'mine'),
    isCommon: computed(() => ownership.value === 'common'),
  }
}

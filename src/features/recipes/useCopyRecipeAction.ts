import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import { notifyFailure } from '@/notifications/failures'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { useCopiedRecipesStore } from './copiedRecipes'
import { copiedMessage } from './componentsText'
import { recipeKeys, useCopyRecipe } from './queries'

/** La recette qu'on copie : sa fiche connaît déjà les recettes qu'elle utilise (`components`), une ligne de liste non. */
interface Copyable {
  id: string
  name: string
  components?: readonly { name: string }[]
}

/**
 * « Copier » une recette d'un autre, de la liste comme de la fiche : on reste où l'on est (la copie ne s'ouvre pas), un message le
 * confirme et le bouton de cette recette dit « Copiée » pour la visite. Un refus du back est dit par le retour commun des écritures
 * (un toast) : rien n'est marqué copié. `onCopied` laisse l'écran faire ce qu'il doit une fois la copie réussie.
 *
 * Une recette qui en utilise d'autres les copie aussi (COMP-006, ADR 0040 du back) : le message dit tout ce qui est copié. Sa fiche a déjà
 * les noms ; depuis une liste on relit la copie, sans bloquer le bouton « Copiée » (si cette lecture échoue, le message d'avant, sans les noms).
 * `inline` : le refus pour le plafond de recettes est dit sur l'écran (`failure`) et non par un toast (la fiche).
 */
export function useCopyRecipeAction(options: { inline?: boolean } = {}) {
  const { t } = useI18n()
  const copy = useCopyRecipe()
  const copied = useCopiedRecipesStore()
  const notifications = useNotificationsStore()
  const queryClient = useQueryClient()
  const { api } = useSessionStore()
  const failure = ref<string | null>(null)

  /** Les recettes utilisées de la copie qu'on vient de faire, lues sans jamais échouer. */
  async function componentsOf(copyId: string | null): Promise<{ name: string }[]> {
    if (copyId === null || copyId === '') return []
    try {
      const read = await queryClient.fetchQuery({
        queryKey: recipeKeys.detail(copyId),
        queryFn: () =>
          unwrap(api.GET('/api/v1/recipes/{id}', { params: { path: { id: copyId } } })),
      })

      return read.components ?? []
    } catch {
      return []
    }
  }

  function run(recipe: Copyable, onCopied?: () => void) {
    failure.value = null
    copy.mutate(recipe.id, {
      onSuccess: (copyId) => {
        copied.add(recipe.id)
        onCopied?.()
        const known = recipe.components
        void (known !== undefined ? Promise.resolve(known) : componentsOf(copyId)).then(
          (components) => notifications.push('success', copiedMessage(recipe.name, components)),
        )
      },
      onError: (error) => {
        // Copier dépasserait le plafond de recettes (la recette et celles qu'elle utilise) : rien n'a été copié
        if (error instanceof ApiError && error.message === 'RECIPE_LIMIT_REACHED') {
          if (options.inline === true) failure.value = t('recipes.componentErrors.copyLimit')
          else notifications.push('error', t('recipes.componentErrors.copyLimit'))
        } else notifyFailure(error)
      },
    })
  }

  return { copy: run, pending: copy.isPending, isCopied: copied.has, failure }
}

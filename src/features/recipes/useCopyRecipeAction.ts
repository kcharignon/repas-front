import { useI18n } from 'vue-i18n'

import { useNotificationsStore } from '@/notifications/store'
import { useCopiedRecipesStore } from './copiedRecipes'
import { useCopyRecipe } from './queries'

/**
 * « Copier » une recette d'un autre, de la liste comme de la fiche : on reste où l'on est (la copie ne s'ouvre pas), un message le
 * confirme et le bouton de cette recette dit « Copiée » pour la visite. Un refus du back est dit par le retour commun des écritures
 * (`createQueryClient`) : rien n'est marqué copié. `onCopied` laisse l'écran faire ce qu'il doit une fois la copie réussie.
 */
export function useCopyRecipeAction() {
  const { t } = useI18n()
  const copy = useCopyRecipe()
  const copied = useCopiedRecipesStore()
  const notifications = useNotificationsStore()

  function run(recipe: { id: string; name: string }, onCopied?: () => void) {
    copy.mutate(recipe.id, {
      onSuccess: () => {
        copied.add(recipe.id)
        notifications.push('success', t('recipes.copiedToast', { name: recipe.name }))
        onCopied?.()
      },
    })
  }

  return { copy: run, pending: copy.isPending, isCopied: copied.has }
}

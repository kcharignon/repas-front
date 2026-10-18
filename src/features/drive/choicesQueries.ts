import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import type { DriveChoicePayload } from '@/api'
import { useSessionStore } from '@/session/session'

export const choiceKeys = {
  all: ['drive', 'choices'] as const,
}

/** Les préférences de produits de l'utilisateur pour l'enseigne, triées par ingrédient (`GET /drive/choices`). */
export function useDriveChoices(enabled: () => boolean) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: choiceKeys.all,
    queryFn: () =>
      unwrap(api.GET('/api/v1/drive/choices', { params: { query: { retailer: 'leclerc' } } })),
    enabled: computed(enabled),
  })
}

/**
 * Remplace la préférence d'un ingrédient. L'échec s'affiche dans l'écran (`silent`), à l'endroit de l'action ; la mutation
 * attend la relecture des préférences pour que l'écran montre l'état enregistré.
 */
export function useReplaceChoice(slug: () => string) {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: DriveChoicePayload) =>
      unwrap(
        api.PUT('/api/v1/drive/choices/{ingredientSlug}', {
          params: { path: { ingredientSlug: slug() } },
          body,
        }),
      ),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: choiceKeys.all }),
  })
}

/** Oublie la préférence d'un ingrédient (`DELETE`). */
export function useForgetChoice(slug: () => string) {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (storeId: string) =>
      unwrap(
        api.DELETE('/api/v1/drive/choices/{ingredientSlug}', {
          params: {
            path: { ingredientSlug: slug() },
            query: { retailer: 'leclerc', storeId },
          },
        }),
      ),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: choiceKeys.all }),
  })
}

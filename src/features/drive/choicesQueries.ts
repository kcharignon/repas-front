import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import { useUnits } from '@/features/ingredients/queries'
import type { ChoiceIntent, DriveChoicePayload } from '@/api'
import { useSessionStore } from '@/session/session'

import { cachedRetailer } from './queries'

export const choiceKeys = {
  all: ['drive', 'choices'] as const,
}

/** Les préférences de produits de l'utilisateur pour l'enseigne, triées par ingrédient (`GET /drive/choices`). */
export function useDriveChoices(enabled: () => boolean) {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: choiceKeys.all,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/drive/choices', {
          params: { query: { retailer: cachedRetailer(queryClient).id } },
        }),
      ),
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
            query: { retailer: cachedRetailer(queryClient).id, storeId },
          },
        }),
      ),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: choiceKeys.all }),
  })
}

/**
 * Enregistre la contenance corrigée d'un produit (`PUT /drive/choices`, une intention `ADD_PRODUCT` : `packSizeCorrection`). L'échec s'affiche à côté du champ
 * (`silent`) ; en cas de succès les préférences sont relues, pour que l'écran montre l'état enregistré.
 */
export function useCorrectPackSize() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ storeId, intent }: { storeId: string; intent: ChoiceIntent }) =>
      unwrap(
        api.PUT('/api/v1/drive/choices', {
          body: { retailer: cachedRetailer(queryClient).id, storeId, choices: [intent] },
        }),
      ),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: choiceKeys.all }),
  })
}

/** Le nom des unités de Repas par slug, au singulier (« tranche ») : de quoi dire la contenance d'un produit (DRV-652). Vide tant que la liste n'est pas lue. */
export function useUnitNames() {
  const units = useUnits()

  return computed(
    () => new Map((units.data.value?.member ?? []).map((unit) => [unit.slug, unit.name] as const)),
  )
}

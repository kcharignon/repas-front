import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import type { ChoiceIntent, DriveStorePayload } from '@/api'
import { useSessionStore } from '@/session/session'

export const driveKeys = {
  all: ['drive'] as const,
  settings: ['drive', 'settings'] as const,
  appInfo: ['drive', 'app-info'] as const,
  plan: (listId: string) => ['drive', 'plan', listId] as const,
}

/**
 * Les réglages du drive : l'interrupteur de la fonction (`enabled`) et le magasin de l'utilisateur. Sans interrupteur
 * allumé, aucune action du drive n'est proposée ; en cas d'échec de lecture, on ne propose rien non plus.
 */
export function useDriveSettings(enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: driveKeys.settings,
    queryFn: () => unwrap(api.GET('/api/v1/drive/settings')),
    enabled: computed(enabled),
  })
}

/**
 * Le plan d'une liste envoyée : ce que le back sait de chaque ligne (produits classés, refusés, nombre de produits). Il dépend des
 * choix mémorisés, qui changent entre deux ouvertures : il est relu à chaque ouverture de l'écran, jamais gardé.
 */
export function useDrivePlan(listId: () => string, enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => driveKeys.plan(listId())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/drive/plans/{shoppingListId}', {
          params: { path: { shoppingListId: listId() } },
        }),
      ),
    enabled: computed(enabled),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Enregistre ce que le passage a appris (`PUT /drive/choices`), lot après lot (200 intentions au plus par appel, un seul lot presque
 * toujours). L'écran du retour dit lui-même l'échec et propose de réessayer : pas de notification en plus.
 */
export function useSaveChoices() {
  const { api } = useSessionStore()

  return useMutation({
    mutationFn: async ({ storeId, batches }: { storeId: string; batches: ChoiceIntent[][] }) => {
      for (const choices of batches)
        await unwrap(
          api.PUT('/api/v1/drive/choices', { body: { retailer: 'leclerc', storeId, choices } }),
        )
    },
    meta: { silent: true },
  })
}

/**
 * Enregistre le magasin de l'utilisateur (`PUT /drive/settings`) ; il remplace le précédent. L'échec s'affiche dans l'écran
 * (`silent`) ; en cas de succès, tout ce que le drive a lu pour l'ancien magasin (choix, plans) est relu.
 */
export function useSaveDriveSettings() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (store: DriveStorePayload) =>
      unwrap(api.PUT('/api/v1/drive/settings', { body: { retailer: 'leclerc', store } })),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: driveKeys.all }),
  })
}

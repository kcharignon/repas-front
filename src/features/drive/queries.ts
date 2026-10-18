import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import { useSessionStore } from '@/session/session'

export const driveKeys = {
  settings: ['drive', 'settings'] as const,
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
export function useDrivePlan(listId: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => driveKeys.plan(listId())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/drive/plans/{shoppingListId}', {
          params: { path: { shoppingListId: listId() } },
        }),
      ),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import { useSessionStore } from '@/session/session'

export const driveKeys = {
  settings: ['drive', 'settings'] as const,
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

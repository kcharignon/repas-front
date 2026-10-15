import { useMutation } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import { useSessionStore } from '@/session/session'

export interface SettingsForm {
  defaultServing: number
  newPassword: string | null
  actualPassword: string | null
}

/** Nombre de personnes par défaut et mot de passe : les erreurs (422 : mot de passe actuel erroné…) vont dans le formulaire. */
export function useUpdateSettings() {
  const session = useSessionStore()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (form: SettingsForm) => {
      await unwrap(session.api.PUT('/api/v1/me/settings', { body: form }))
    },
  })
}

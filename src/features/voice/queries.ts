import { useMutation } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import { useSessionStore } from '@/session/session'
import type { AuthorizationRequest } from './authorization'

/**
 * « Autoriser » : le back émet un code et rend l'adresse de retour complète (`?state=…&code=…`). Les échecs (`422`, `429`, `404`)
 * se disent dans la page, pas dans une notification.
 */
export function useAuthorizeAlexa() {
  const { api } = useSessionStore()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (request: AuthorizationRequest): Promise<string | undefined> => {
      const answer = await unwrap(api.POST('/api/v1/voice/alexa/authorize', { body: request }))

      return answer.redirectUrl
    },
  })
}

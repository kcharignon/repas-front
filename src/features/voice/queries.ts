import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import type { VoiceLink } from '@/api'
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

export const voiceKeys = {
  links: ['voice', 'links'] as const,
}

/** Ce que « Moi » sait de l'assistant vocal : la fonction est-elle allumée, et quelles liaisons l'utilisateur a-t-il ? */
export interface VoiceState {
  available: boolean
  links: VoiceLink[]
}

const UNAVAILABLE: VoiceState = { available: false, links: [] }

/** Fonction coupée : le back répond `404 VOICE_DISABLED` à toute la famille de routes. */
const isDisabled = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404 && error.message === 'VOICE_DISABLED'

/** Une fonction coupée le reste jusqu'à une prochaine ouverture du site : on ne la redemande pas à chaque retour sur « Moi ». */
const DISABLED_STALE_MS = 10 * 60 * 1000

/**
 * Les liaisons de l'utilisateur. La fonction coupée n'est pas une erreur : c'est une réponse (`available` faux), gardée comme
 * toute autre, que la section lit pour disparaître. Elle n'est relue ni au retour du focus ni au retour sur « Moi » avant dix minutes.
 */
export function useVoiceLinks() {
  const { api } = useSessionStore()

  return useQuery<VoiceState>({
    queryKey: voiceKeys.links,
    queryFn: async () => {
      try {
        const answer = await unwrap(api.GET('/api/v1/voice/links'))

        return { available: true, links: answer.member ?? [] }
      } catch (error) {
        if (isDisabled(error)) return UNAVAILABLE
        throw error
      }
    },
    staleTime: (query) => (query.state.data?.available === false ? DISABLED_STALE_MS : 15_000),
    refetchOnWindowFocus: (query) => query.state.data?.available !== false,
  })
}

/**
 * « Délier Alexa » : supprime toutes les liaisons listées (il peut y en avoir plusieurs après une nouvelle liaison). Le `DELETE` est
 * rejoué sans risque ; la liste est ensuite relue et la section revient à « aucune liaison » sans recharger la page.
 */
export function useUnlinkAlexa() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (links: readonly VoiceLink[]) => {
      await Promise.all(
        links.map((link) =>
          unwrap(api.DELETE('/api/v1/voice/links/{id}', { params: { path: { id: link.id } } })),
        ),
      )
    },
    onSuccess: () =>
      queryClient.setQueryData<VoiceState>(voiceKeys.links, { available: true, links: [] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: voiceKeys.links }),
  })
}

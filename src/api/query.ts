import { MutationCache, QueryClient } from '@tanstack/vue-query'

import { isStale, notifyFailure } from '@/notifications/failures'
import { ApiError } from './errors'

/**
 * Réglages communs des données serveur : on ne rejoue pas une erreur du back (4xx : la rejouer donne le même refus), on
 * relit à la reprise de focus (le téléphone revient de la poche, la liste a pu changer ailleurs).
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // Un échec d'écriture se dit toujours à l'utilisateur ; si la ressource a changé ailleurs (412, 409) on relit tout.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent === true) return
        notifyFailure(error)
        if (isStale(error)) void client.invalidateQueries()
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  })

  return client
}

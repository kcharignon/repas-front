import { QueryClient } from '@tanstack/vue-query'

import { ApiError } from './errors'

/**
 * Réglages communs des données serveur : on ne rejoue pas une erreur du back (4xx : la rejouer donne le même refus), on
 * relit à la reprise de focus (le téléphone revient de la poche, la liste a pu changer ailleurs).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  })
}

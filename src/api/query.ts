import type { Ref } from 'vue'
import { MutationCache, QueryClient } from '@tanstack/vue-query'

import { isStale, notifyFailure } from '@/notifications/failures'
import { ApiError } from './errors'

/**
 * Réglages communs des données serveur : on ne rejoue pas une erreur du back (4xx : la rejouer donne le même refus), on
 * relit à la reprise de focus (le téléphone revient de la poche, la liste a pu changer ailleurs). Sans réseau on n'attend pas
 * en silence : la lecture échoue tout de suite (l'écran garde ce qu'il a déjà), l'écriture le dit (`networkMode: 'always'`).
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
        networkMode: 'always',
        staleTime: 15_000,
        retry: (failureCount, error) =>
          failureCount < 2 &&
          navigator.onLine &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { networkMode: 'always' },
    },
  })

  return client
}

/**
 * Une lecture a échoué **et** l'écran n'a rien à montrer. Une relecture ratée (réseau perdu, back en panne) laisse les
 * données déjà affichées : l'écran les garde plutôt que de les remplacer par une erreur.
 */
export function hasFailed(query: {
  isError: Readonly<Ref<boolean>>
  data: Readonly<Ref<unknown>>
}): boolean {
  return query.isError.value && query.data.value === undefined
}

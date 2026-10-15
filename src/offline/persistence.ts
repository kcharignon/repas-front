import { watch } from 'vue'
import { dehydrate, hydrate } from '@tanstack/vue-query'
import type { DehydratedState, Query, QueryClient } from '@tanstack/vue-query'

import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

/**
 * Lecture hors-ligne de la liste de courses en cours (plan du front, phase 5) : seule la liste active, résumé et détail, est
 * gardée dans le navigateur, **au nom de l'utilisateur** ; elle disparaît à la déconnexion et n'est jamais montrée à quelqu'un
 * d'autre. L'édition hors-ligne reste hors périmètre : une écriture sans réseau échoue clairement.
 */
const KEY = 'repas.cache'
const MAX_AGE_MS = 7 * 24 * 3600 * 1000
const THROTTLE_MS = 1000

interface Envelope {
  userId: string
  savedAt: number
  state: DehydratedState
}

const storage = (): Storage | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

function read(): Envelope | null {
  try {
    const raw = storage()?.getItem(KEY)

    return raw ? (JSON.parse(raw) as Envelope) : null
  } catch {
    return null
  }
}

function erase() {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Stockage indisponible : rien n'a été gardé.
  }
}

/** Les requêtes qu'on garde : le résumé de la liste active et le détail de cette liste. */
const keptBy = (client: QueryClient) => {
  const activeId = client.getQueryData<{ shoppingListId?: string | null }>(
    shoppingListKeys.activeSummary,
  )?.shoppingListId

  return (query: Query): boolean => {
    if (query.state.status !== 'success') return false
    const key = query.queryKey

    if (key.join('/') === shoppingListKeys.activeSummary.join('/')) return true

    return activeId != null && key.join('/') === shoppingListKeys.detail(activeId).join('/')
  }
}

function save(client: QueryClient, userId: string) {
  const state = dehydrate(client, { shouldDehydrateQuery: keptBy(client) })
  try {
    if (state.queries.length === 0) erase()
    else
      storage()?.setItem(
        KEY,
        JSON.stringify({ userId, savedAt: Date.now(), state } satisfies Envelope),
      )
  } catch {
    // Quota plein ou stockage refusé : l'application marche, seulement sans copie hors-ligne.
  }
}

/**
 * Branche la copie hors-ligne sur la session : à la connexion (ou au retour sur l'application) on relit la copie de CET
 * utilisateur, ensuite chaque changement de la liste active la met à jour ; à la fin de session tout est oublié, en mémoire
 * comme dans le navigateur.
 */
export function keepActiveListOffline(client: QueryClient) {
  const session = useSessionStore()
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    unsubscribe?.()
    unsubscribe = null
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return watch(
    () => session.user?.id ?? null,
    (userId, previous) => {
      stop()
      if (previous !== null && previous !== undefined) {
        client.clear()
        erase()
      }
      if (userId === null) return

      const saved = read()
      if (saved?.userId === userId && Date.now() - saved.savedAt < MAX_AGE_MS) {
        hydrate(client, saved.state)
        // La copie est montrée tout de suite, mais jamais crue : elle date d'avant le rechargement (la liste a pu changer, ou
        // l'écriture différée n'a pas eu lieu), donc le premier écran la relit même si elle est « fraîche » (staleTime).
        void client.invalidateQueries({ queryKey: shoppingListKeys.all })
      } else erase()

      unsubscribe = client.getQueryCache().subscribe(() => {
        timer ??= setTimeout(() => {
          timer = null
          save(client, userId)
        }, THROTTLE_MS)
      })
    },
    { immediate: true, flush: 'sync' },
  )
}

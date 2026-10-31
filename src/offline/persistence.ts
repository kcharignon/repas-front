import { watch } from 'vue'
import { dehydrate, hydrate } from '@tanstack/vue-query'
import type { DehydratedState, Query, QueryClient } from '@tanstack/vue-query'

import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { hasSessionHint, useSessionStore } from '@/session/session'
import { eraseOfflineCopy, OFFLINE_COPY_KEY } from './offlineCopy'

/**
 * Lecture hors-ligne de la liste de courses en cours (plan du front, phase 5) : seules les listes en cours, résumé, liste des listes
 * en cours et détail de chacune (la principale et une par type de liste, ADR 0036), sont gardées dans le navigateur, **au nom de l'utilisateur** ; elle disparaît à la déconnexion et n'est jamais montrée à quelqu'un
 * d'autre. L'édition hors-ligne reste hors périmètre : une écriture sans réseau échoue clairement.
 */
const KEY = OFFLINE_COPY_KEY
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

/**
 * Les requêtes qu'on garde : le résumé de la liste active, la liste des listes en cours, et le détail de chacune (la principale et celle de
 * chaque type de liste). Rien d'autre : ni « Mes listes », ni les listes en pause ou envoyées.
 */
const keptBy = (client: QueryClient) => {
  const activeId = client.getQueryData<{ shoppingListId?: string | null }>(
    shoppingListKeys.activeSummary,
  )?.shoppingListId
  const kept = new Set<string>(
    (client.getQueryData<{ member?: { id: string }[] }>(shoppingListKeys.open)?.member ?? []).map(
      (list) => shoppingListKeys.detail(list.id).join('/'),
    ),
  )
  if (activeId != null) kept.add(shoppingListKeys.detail(activeId).join('/'))

  return (query: Query): boolean => {
    if (query.state.status !== 'success') return false
    const key = query.queryKey.join('/')

    return (
      key === shoppingListKeys.activeSummary.join('/') ||
      key === shoppingListKeys.open.join('/') ||
      kept.has(key)
    )
  }
}

function save(client: QueryClient, userId: string) {
  // Une autre fenêtre a pu mettre fin à la session depuis l'écriture demandée : la copie ne se réécrit pas, elle s'efface.
  if (!hasSessionHint()) {
    eraseOfflineCopy()

    return
  }
  const state = dehydrate(client, { shouldDehydrateQuery: keptBy(client) })
  try {
    if (state.queries.length === 0) eraseOfflineCopy()
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
        eraseOfflineCopy()
      }
      if (userId === null) return

      const saved = read()
      if (saved?.userId === userId && Date.now() - saved.savedAt < MAX_AGE_MS) {
        hydrate(client, saved.state)
        // La copie est montrée tout de suite, mais jamais crue : elle date d'avant le rechargement (la liste a pu changer, ou
        // l'écriture différée n'a pas eu lieu), donc le premier écran la relit même si elle est « fraîche » (staleTime).
        void client.invalidateQueries({ queryKey: shoppingListKeys.all })
      } else eraseOfflineCopy()

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

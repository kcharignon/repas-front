import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { me } from '@/__tests__/helpers'
import { keepActiveListOffline } from '@/offline/persistence'
import { useSessionStore } from '@/session/session'
import { shoppingListKeys } from '@/features/shopping-lists/queries'

const KEY = 'repas.cache'
const list = { id: 'list-1', displayName: 'Ma liste' }
const summary = { shoppingListId: 'list-1' }

const seed = (client: QueryClient) => {
  client.setQueryData(shoppingListKeys.activeSummary, summary)
  client.setQueryData(shoppingListKeys.detail('list-1'), list)
}

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')

describe('liste en cours gardée hors-ligne', () => {
  let client: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setActivePinia(createPinia())
    client = new QueryClient()
  })
  afterEach(() => vi.useRealTimers())

  const signIn = async (id = me.id) => {
    const session = useSessionStore()
    session.user = { ...me, id }
    await nextTick()
  }

  it("relit la copie de l'utilisateur à son retour", async () => {
    const first = new QueryClient()
    keepActiveListOffline(first)
    await signIn()
    seed(first)
    await vi.advanceTimersByTimeAsync(1100)
    const restarted = new QueryClient()
    setActivePinia(createPinia())

    keepActiveListOffline(restarted)
    await signIn()

    expect(restarted.getQueryData(shoppingListKeys.detail('list-1'))).toEqual(list)
    expect(restarted.getQueryData(shoppingListKeys.activeSummary)).toEqual(summary)
  })

  it("marque la copie à relire : un écran ne s'en contente pas même si elle date de quelques secondes", async () => {
    const first = new QueryClient()
    keepActiveListOffline(first)
    await signIn()
    seed(first)
    await vi.advanceTimersByTimeAsync(1100)
    const restarted = new QueryClient()
    setActivePinia(createPinia())

    keepActiveListOffline(restarted)
    await signIn()

    expect(restarted.getQueryState(shoppingListKeys.detail('list-1'))?.isInvalidated).toBe(true)
    expect(restarted.getQueryState(shoppingListKeys.activeSummary)?.isInvalidated).toBe(true)
  })

  it("ne garde que le résumé de la liste active et son détail, au nom de l'utilisateur", async () => {
    keepActiveListOffline(client)
    await signIn()
    seed(client)
    client.setQueryData(shoppingListKeys.detail('autre'), { id: 'autre' })
    client.setQueryData(['recipes'], [{ name: 'privé' }])

    await vi.advanceTimersByTimeAsync(1100)

    expect(saved().userId).toBe(me.id)
    expect(saved().state.queries.map((query: { queryKey: unknown[] }) => query.queryKey)).toEqual([
      shoppingListKeys.activeSummary,
      shoppingListKeys.detail('list-1'),
    ])
  })

  it('regroupe les changements rapprochés en une seule écriture', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    keepActiveListOffline(client)
    await signIn()

    seed(client)
    client.setQueryData(shoppingListKeys.detail('list-1'), { ...list, displayName: 'Renommée' })
    await vi.advanceTimersByTimeAsync(1100)

    expect(setItem.mock.calls.filter(([key]) => key === KEY)).toHaveLength(1)
    expect(JSON.stringify(saved())).toContain('Renommée')
    setItem.mockRestore()
  })

  it("ne montre jamais la copie d'un autre utilisateur", async () => {
    const first = new QueryClient()
    keepActiveListOffline(first)
    await signIn('autre-utilisateur')
    seed(first)
    await vi.advanceTimersByTimeAsync(1100)
    const restarted = new QueryClient()
    setActivePinia(createPinia())

    keepActiveListOffline(restarted)
    await signIn(me.id)

    expect(restarted.getQueryData(shoppingListKeys.detail('list-1'))).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('oublie une copie trop ancienne', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        userId: me.id,
        savedAt: Date.now() - 8 * 24 * 3600 * 1000,
        state: { mutations: [], queries: [] },
      }),
    )
    keepActiveListOffline(client)

    await signIn()

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignore une copie illisible', async () => {
    localStorage.setItem(KEY, '{pas du json')
    keepActiveListOffline(client)

    await signIn()

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('efface la copie quand il ne reste plus de liste active à garder', async () => {
    keepActiveListOffline(client)
    await signIn()
    seed(client)
    await vi.advanceTimersByTimeAsync(1100)
    expect(saved()).not.toBeNull()

    client.removeQueries({ queryKey: shoppingListKeys.all })
    client.setQueryData(['autre'], 1)
    await vi.advanceTimersByTimeAsync(1100)

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('oublie tout à la déconnexion : mémoire et navigateur', async () => {
    keepActiveListOffline(client)
    await signIn()
    seed(client)
    await vi.advanceTimersByTimeAsync(1100)

    useSessionStore().user = null
    await nextTick()

    expect(client.getQueryData(shoppingListKeys.detail('list-1'))).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("n'écrit plus après la déconnexion", async () => {
    keepActiveListOffline(client)
    await signIn()
    useSessionStore().user = null
    await nextTick()

    seed(client)
    await vi.advanceTimersByTimeAsync(1100)

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("marche sans stockage (navigation privée) : l'application n'en souffre pas", async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    keepActiveListOffline(client)
    await signIn()
    seed(client)

    await expect(vi.advanceTimersByTimeAsync(1100)).resolves.not.toThrow()
  })
})

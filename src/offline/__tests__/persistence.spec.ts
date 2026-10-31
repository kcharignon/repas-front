import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { calls, json, me, stubApi } from '@/__tests__/helpers'
import { keepActiveListOffline } from '@/offline/persistence'
import { followSessionAcrossTabs } from '@/session/crossTab'
import { useSessionStore } from '@/session/session'
import { routes } from '@/router'
import { shoppingListKeys } from '@/features/shopping-lists/queries'

const KEY = 'repas.cache'
const list = { id: 'list-1', displayName: 'Ma liste' }
const summary = { shoppingListId: 'list-1' }

const seed = (client: QueryClient) => {
  client.setQueryData(shoppingListKeys.activeSummary, summary)
  client.setQueryData(shoppingListKeys.detail('list-1'), list)
}

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')

/** Ce qu'une fenêtre connectée laisse dans le navigateur : l'indice de session, que les copies hors-ligne vérifient avant d'écrire. */
const HINT = 'repas.session'

describe('liste en cours gardée hors-ligne', () => {
  let client: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setActivePinia(createPinia())
    client = new QueryClient()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const signIn = async (id = me.id) => {
    try {
      localStorage.setItem(HINT, '1')
    } catch {
      // Stockage refusé (test de la navigation privée) : l'indice n'existe pas, la copie non plus
    }
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

  it('garde toutes les listes en cours (la principale et une par type), pas les autres', async () => {
    keepActiveListOffline(client)
    await signIn()
    seed(client)
    client.setQueryData(shoppingListKeys.open, {
      member: [{ id: 'list-1' }, { id: 'list-boucherie' }, { id: 'list-marche' }],
    })
    client.setQueryData(shoppingListKeys.detail('list-boucherie'), { id: 'list-boucherie' })
    client.setQueryData(shoppingListKeys.detail('list-marche'), { id: 'list-marche' })
    client.setQueryData(shoppingListKeys.detail('en-pause'), { id: 'en-pause' })
    client.setQueryData(shoppingListKeys.collection, { member: [] })

    await vi.advanceTimersByTimeAsync(1100)

    const keys = saved().state.queries.map((query: { queryKey: string[] }) =>
      query.queryKey.join('/'),
    )
    expect(keys.sort()).toEqual(
      [
        'shopping-lists/active/summary',
        'shopping-lists/detail/list-1',
        'shopping-lists/detail/list-boucherie',
        'shopping-lists/detail/list-marche',
        'shopping-lists/open',
      ].sort(),
    )
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

  it('garde la copie quand le renouvellement de la session est refusé (429, 5xx) ou le réseau coupé', async () => {
    const first = new QueryClient()
    keepActiveListOffline(first)
    await signIn()
    seed(first)
    await vi.advanceTimersByTimeAsync(1100)
    localStorage.setItem('repas.user', JSON.stringify({ ...me, id: me.id }))

    for (const refused of [
      () => json({ error: { message: 'x' } }, { status: 429 }),
      () => json({ error: { message: 'x' } }, { status: 503 }),
      () => {
        throw new TypeError('Failed to fetch')
      },
    ]) {
      const restarted = new QueryClient()
      setActivePinia(createPinia())
      stubApi({ 'POST /api/auth/refresh': refused })
      keepActiveListOffline(restarted)

      await useSessionStore().restore()

      expect(useSessionStore().isAuthenticated).toBe(true)
      expect(restarted.getQueryData(shoppingListKeys.detail('list-1'))).toEqual(list)
      expect(saved().userId).toBe(me.id)
    }
  })

  it("n'écrit pas la copie quand l'indice de session a disparu du navigateur, même sans événement reçu", async () => {
    keepActiveListOffline(client)
    await signIn()
    seed(client)
    await vi.advanceTimersByTimeAsync(1100)
    expect(saved()).not.toBeNull()

    // Une autre fenêtre met fin à la session : elle efface l'indice et la copie, celle-ci ne l'a pas encore su
    client.setQueryData(shoppingListKeys.detail('list-1'), {
      ...list,
      displayName: 'Modifiée après',
    })
    localStorage.removeItem(HINT)
    localStorage.removeItem(KEY)
    await vi.advanceTimersByTimeAsync(1100)

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  describe('fin de session sur une page fraîche (aucun utilisateur déjà connu)', () => {
    const stored = JSON.stringify({ userId: me.id, savedAt: Date.now(), state: { queries: [] } })
    const freshPage = () => {
      localStorage.setItem(HINT, '1')
      localStorage.setItem('repas.user', JSON.stringify(me))
      localStorage.setItem(KEY, stored)
      setActivePinia(createPinia())
      keepActiveListOffline(new QueryClient())
    }

    it('efface la copie quand le renouvellement répond 401 au chargement de la page', async () => {
      stubApi({
        'POST /api/auth/refresh': () => json({ error: { message: 'x' } }, { status: 401 }),
      })
      freshPage()

      const restoring = useSessionStore().restore()
      await vi.advanceTimersByTimeAsync(400)
      await restoring

      expect(useSessionStore().isAuthenticated).toBe(false)
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('efface la copie quand le mot de passe est changé depuis une page fraîche', async () => {
      stubApi({
        'POST /api/v1/users/password-reset/confirm': () => new Response(null, { status: 204 }),
      })
      freshPage()

      await useSessionStore().resetPassword('le-secret', 'un nouveau mot de passe')

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('efface la copie à la déconnexion depuis une page fraîche', async () => {
      stubApi({ 'POST /api/auth/logout': () => new Response(null, { status: 204 }) })
      freshPage()

      await useSessionStore().logout()

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it.each([
      ['429', () => json({ error: { message: 'x' } }, { status: 429 })],
      ['503', () => json({ error: { message: 'x' } }, { status: 503 })],
      [
        'réseau coupé',
        () => {
          throw new TypeError('Failed to fetch')
        },
      ],
    ])('garde la copie quand le renouvellement échoue (%s)', async (_label, refused) => {
      stubApi({ 'POST /api/auth/refresh': refused })
      freshPage()

      await useSessionStore().restore()

      expect(useSessionStore().isAuthenticated).toBe(true)
      expect(localStorage.getItem(KEY)).toBe(stored)
    })
  })

  describe('deux fenêtres', () => {
    const logoutRoute = 'POST /api/auth/logout'

    /** Deux fenêtres du même navigateur (même stockage), chacune avec son store de session et sa copie hors-ligne. */
    async function twoWindows() {
      const windowB = createPinia()
      setActivePinia(windowB)
      const clientB = new QueryClient()
      keepActiveListOffline(clientB)
      const router = createRouter({ history: createMemoryHistory(), routes })
      await router.push('/liste')
      const stopFollowing = followSessionAcrossTabs(router)
      await signIn()
      const sessionB = useSessionStore()

      const windowA = createPinia()
      setActivePinia(windowA)
      const clientA = new QueryClient()
      keepActiveListOffline(clientA)
      const sessionA = useSessionStore()
      sessionA.user = { ...me }
      await nextTick()

      return { clientB, sessionA, sessionB, router, stopFollowing }
    }

    /** L'événement que le navigateur envoie aux AUTRES fenêtres quand l'une efface l'indice de session. */
    const signedOutEvent = () =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: HINT,
          oldValue: '1',
          newValue: null,
          storageArea: localStorage,
        }),
      )

    it("une fenêtre se déconnecte pendant que l'autre écrit : la seconde ne réécrit rien", async () => {
      stubApi({ [logoutRoute]: () => new Response(null, { status: 204 }) })
      const { clientB, sessionA, sessionB, stopFollowing } = await twoWindows()
      seed(clientB)
      await vi.advanceTimersByTimeAsync(1100)
      expect(saved()).not.toBeNull()

      // La fenêtre B change la liste : son écriture est en attente (1 s)
      clientB.setQueryData(shoppingListKeys.detail('list-1'), {
        ...list,
        displayName: 'Écrite par B',
      })
      // La fenêtre A se déconnecte : indice, copie de l'utilisateur et copie hors-ligne partent du navigateur
      await sessionA.logout()
      expect(localStorage.getItem(KEY)).toBeNull()

      await vi.advanceTimersByTimeAsync(1100)
      expect(localStorage.getItem(KEY)).toBeNull()

      signedOutEvent()
      expect(sessionB.isAuthenticated).toBe(false)
      expect(clientB.getQueryData(shoppingListKeys.detail('list-1'))).toBeUndefined()

      // Plus aucune écriture ensuite, même si la fenêtre B reçoit encore des données
      seed(clientB)
      await vi.advanceTimersByTimeAsync(1100)
      expect(localStorage.getItem(KEY)).toBeNull()
      stopFollowing()
    })

    it("l'événement de stockage met fin à la session de l'autre fenêtre et à sa copie en mémoire", async () => {
      const fetchMock = stubApi({ [logoutRoute]: () => new Response(null, { status: 204 }) })
      const { clientB, sessionA, sessionB, stopFollowing } = await twoWindows()
      seed(clientB)
      await vi.advanceTimersByTimeAsync(1100)

      await sessionA.logout()
      signedOutEvent()

      expect(sessionB.isAuthenticated).toBe(false)
      expect(clientB.getQueryData(shoppingListKeys.detail('list-1'))).toBeUndefined()
      expect(localStorage.getItem(KEY)).toBeNull()
      expect(calls(fetchMock)).toEqual([logoutRoute])
      stopFollowing()
    })
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

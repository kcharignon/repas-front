import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api'
import { calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'

describe('session', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  describe('login', () => {
    it("garde le jeton en mémoire et charge l'utilisateur", async () => {
      const fetchMock = stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
      })
      const session = useSessionStore()

      await session.login('alexiane@example.com', 'secret')

      expect(session.isAuthenticated).toBe(true)
      expect(session.user).toEqual(me)
      expect(calls(fetchMock)).toEqual(['POST /api/login_check', 'GET /api/v1/me'])
      const meRequest = fetchMock.mock.calls[1]?.[0] as Request
      expect(meRequest.headers.get('Authorization')).toBe('Bearer jeton')
      expect(JSON.stringify(localStorage)).not.toContain('jeton')
    })

    it('refuse des identifiants invalides sans ouvrir de session', async () => {
      stubApi({
        'POST /api/login_check': () =>
          json({ error: { message: 'Invalid credentials.' } }, { status: 401 }),
      })
      const session = useSessionStore()

      const error = await session.login('a@b.fr', 'mauvais').catch((caught: unknown) => caught)

      expect(error).toMatchObject({ status: 401 })
      expect(error).toBeInstanceOf(ApiError)
      expect(session.isAuthenticated).toBe(false)
    })
  })

  describe('restore', () => {
    it('retrouve la session par le cookie de rafraîchissement, une seule fois', async () => {
      const fetchMock = stubApi({
        'POST /api/auth/refresh': () => json({ token: 'neuf' }),
        'GET /api/v1/me': () => json(me),
      })
      const session = useSessionStore()

      await session.restore()
      await session.restore()

      expect(session.isAuthenticated).toBe(true)
      expect(calls(fetchMock)).toEqual(['POST /api/auth/refresh', 'GET /api/v1/me'])
    })

    it('reste anonyme sans cookie valide, après un second essai (course entre onglets)', async () => {
      vi.useFakeTimers()
      const fetchMock = stubApi({
        'POST /api/auth/refresh': () => json({ error: { message: 'x' } }, { status: 401 }),
      })
      const session = useSessionStore()

      const restoring = session.restore()
      await vi.advanceTimersByTimeAsync(400)
      await restoring
      vi.useRealTimers()

      expect(session.isAuthenticated).toBe(false)
      expect(session.restored).toBe(true)
      expect(calls(fetchMock)).toEqual(['POST /api/auth/refresh', 'POST /api/auth/refresh'])
    })

    it('reste anonyme sans réessayer quand le back est injoignable', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      })
      vi.stubGlobal('fetch', fetchMock)
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(false)
      expect(session.restored).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('rafraîchit une seule fois pour plusieurs requêtes en 401 et les rejoue avec le jeton neuf', async () => {
    let expired = false
    const fetchMock = stubApi({
      'POST /api/login_check': () => json({ token: 'jeton' }),
      'GET /api/v1/me': (request) =>
        expired && request.headers.get('Authorization') !== 'Bearer neuf'
          ? json({}, { status: 401 })
          : json(me),
      'POST /api/auth/refresh': () => json({ token: 'neuf' }),
    })
    const session = useSessionStore()
    await session.login('a@b.fr', 'x')
    expired = true
    fetchMock.mockClear()

    const responses = await Promise.all([
      session.api.GET('/api/v1/me'),
      session.api.GET('/api/v1/me'),
      session.api.GET('/api/v1/me'),
    ])

    expect(calls(fetchMock).filter((call) => call === 'POST /api/auth/refresh')).toHaveLength(1)
    expect(responses.map(({ response }) => response.status)).toEqual([200, 200, 200])
  })

  describe('register', () => {
    it("inscrit puis connecte l'utilisateur", async () => {
      const fetchMock = stubApi({
        'POST /api/v1/users': () => new Response(null, { status: 201 }),
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
      })
      const session = useSessionStore()

      await session.register('alexiane@example.com', 'un-mot-de-passe', 4)

      expect(calls(fetchMock)).toEqual([
        'POST /api/v1/users',
        'POST /api/login_check',
        'GET /api/v1/me',
      ])
      expect(session.isAuthenticated).toBe(true)
    })

    it("n'ouvre pas de session quand l'inscription est refusée (409)", async () => {
      stubApi({
        'POST /api/v1/users': () =>
          json({ error: { message: 'Email already used' } }, { status: 409 }),
      })
      const session = useSessionStore()

      await expect(session.register('a@b.fr', 'un-mot-de-passe', 4)).rejects.toMatchObject({
        status: 409,
      })
      expect(session.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('révoque la connexion côté back et oublie le jeton', async () => {
      const fetchMock = stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        'POST /api/auth/logout': () => new Response(null, { status: 204 }),
      })
      const session = useSessionStore()
      await session.login('a@b.fr', 'x')

      await session.logout()

      expect(session.isAuthenticated).toBe(false)
      expect(calls(fetchMock)).toContain('POST /api/auth/logout')
    })

    it('déconnecte quand même si le back est injoignable', async () => {
      stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        'POST /api/auth/logout': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      const session = useSessionStore()
      await session.login('a@b.fr', 'x')

      await session.logout()

      expect(session.isAuthenticated).toBe(false)
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api'
import { bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useDriveReturnStore } from '@/features/drive/returnStore'
import { useSessionStore } from '@/session/session'

describe('session', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
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
      expect(localStorage.getItem('repas.session')).toBe('1')
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
    // Une session a existé sur ce navigateur (posé par la connexion précédente)
    beforeEach(() => localStorage.setItem('repas.session', '1'))

    it("ne sollicite pas le back pour un visiteur qui ne s'est jamais connecté", async () => {
      localStorage.clear()
      const fetchMock = stubApi({})
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(false)
      expect(session.restored).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

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
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(calls(fetchMock)).toEqual(['POST /api/auth/refresh', 'POST /api/auth/refresh'])
    })

    it('retrouve la session au second essai quand le premier est refusé (course entre onglets)', async () => {
      vi.useFakeTimers()
      let attempts = 0
      const fetchMock = stubApi({
        'POST /api/auth/refresh': () =>
          ++attempts === 1
            ? json({ error: { message: 'x' } }, { status: 401 })
            : json({ token: 'neuf' }),
        'GET /api/v1/me': () => json(me),
      })
      const session = useSessionStore()

      const restoring = session.restore()
      await vi.advanceTimersByTimeAsync(400)
      await restoring
      vi.useRealTimers()

      expect(session.isAuthenticated).toBe(true)
      expect(calls(fetchMock)).toEqual([
        'POST /api/auth/refresh',
        'POST /api/auth/refresh',
        'GET /api/v1/me',
      ])
    })

    it.each([
      [429, 'trop de renouvellements'],
      [500, 'erreur du serveur'],
      [502, 'serveur en cours de redéploiement'],
      [503, 'serveur indisponible'],
      [504, 'délai dépassé'],
    ])(
      'un refus %i du renouvellement (%s) garde la session, l’indice et la copie de l’utilisateur, sans réessayer',
      async (status) => {
        localStorage.setItem('repas.user', JSON.stringify(me))
        localStorage.setItem('repas.cache', '{"copie":"hors-ligne"}')
        const fetchMock = stubApi({
          'POST /api/auth/refresh': () => json({ error: { message: 'x' } }, { status }),
        })
        const session = useSessionStore()

        await session.restore()

        expect(session.user).toEqual(me)
        expect(session.isAuthenticated).toBe(true)
        expect(session.restored).toBe(true)
        expect(localStorage.getItem('repas.session')).toBe('1')
        expect(JSON.parse(localStorage.getItem('repas.user') ?? 'null')).toEqual(me)
        expect(localStorage.getItem('repas.cache')).toBe('{"copie":"hors-ligne"}')
        expect(calls(fetchMock)).toEqual(['POST /api/auth/refresh'])
      },
    )

    it('une réponse 200 sans jeton ne met pas fin à la session', async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({ 'POST /api/auth/refresh': () => json({}) })
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(true)
      expect(localStorage.getItem('repas.session')).toBe('1')
    })

    it('une erreur de réseau garde l’indice et la copie de l’utilisateur', async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({
        'POST /api/auth/refresh': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toEqual(me)
      expect(localStorage.getItem('repas.session')).toBe('1')
      expect(localStorage.getItem('repas.user')).not.toBeNull()
    })

    it('garde la session quand la lecture de l’utilisateur répond 429 ou 5xx après un jeton valide', async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({
        'POST /api/auth/refresh': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json({ error: { message: 'x' } }, { status: 503 }),
      })
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toEqual(me)
      expect(localStorage.getItem('repas.session')).toBe('1')
    })

    it('met fin à la session quand la lecture de l’utilisateur répond 401 après un jeton valide', async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({
        'POST /api/auth/refresh': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json({ error: { message: 'x' } }, { status: 401 }),
      })
      vi.useFakeTimers()
      const session = useSessionStore()

      const restoring = session.restore()
      await vi.advanceTimersByTimeAsync(400)
      await restoring
      vi.useRealTimers()

      expect(session.isAuthenticated).toBe(false)
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(localStorage.getItem('repas.user')).toBeNull()
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

  describe('renouvellement refusé sans que la session soit perdue', () => {
    const refresh = 'POST /api/auth/refresh'
    const expiredToken = () => json({ error: { message: 'Expired JWT Token' } }, { status: 401 })

    /** Une session ouverte dont le jeton a expiré : chaque appel de l'API passe par le renouvellement. */
    async function openSession(answers: (attempt: number) => Response | Promise<Response>) {
      let attempts = 0
      let expired = false
      const fetchMock = stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': (request) =>
          expired && request.headers.get('Authorization') !== 'Bearer neuf'
            ? expiredToken()
            : json(me),
        [refresh]: () => answers(++attempts),
      })
      const session = useSessionStore()
      await session.login('a@b.fr', 'x')
      expired = true
      fetchMock.mockClear()

      return { session, fetchMock }
    }

    afterEach(() => vi.useRealTimers())

    it('ne se déconnecte pas sur un 429 : l’utilisateur, l’indice et sa copie restent', async () => {
      vi.useFakeTimers()
      const { session } = await openSession(() => json({}, { status: 429 }))

      const { response } = await session.api.GET('/api/v1/me')

      expect(response.status).toBe(401)
      expect(session.isAuthenticated).toBe(true)
      expect(localStorage.getItem('repas.session')).toBe('1')
      expect(localStorage.getItem('repas.user')).not.toBeNull()
    })

    it('ne redemande pas tant que le délai d’attente court, puis redemande une fois qu’il est passé', async () => {
      vi.useFakeTimers()
      const { session, fetchMock } = await openSession(() => json({}, { status: 503 }))

      await session.api.GET('/api/v1/me')
      await session.api.GET('/api/v1/me')
      await session.api.GET('/api/v1/me')

      expect(calls(fetchMock).filter((call) => call === refresh)).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(2_100)
      await session.api.GET('/api/v1/me')

      expect(calls(fetchMock).filter((call) => call === refresh)).toHaveLength(2)
      expect(session.isAuthenticated).toBe(true)
    })

    it('allonge le délai à chaque échec de suite, sans dépasser 30 secondes', async () => {
      vi.useFakeTimers()
      const { session, fetchMock } = await openSession(() => json({}, { status: 502 }))
      const refreshes = () => calls(fetchMock).filter((call) => call === refresh).length

      // Délais attendus : 2 s, 4 s, 8 s, 16 s, 30 s, 30 s
      for (const [index, delay] of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000].entries()) {
        await session.api.GET('/api/v1/me')
        expect(refreshes()).toBe(index + 1)
        await vi.advanceTimersByTimeAsync(delay - 100)
        await session.api.GET('/api/v1/me')
        expect(refreshes(), `avant ${delay} ms`).toBe(index + 1)
        await vi.advanceTimersByTimeAsync(200)
      }
    })

    it('suit le Retry-After du back (au plus une minute)', async () => {
      vi.useFakeTimers()
      const { session, fetchMock } = await openSession(() =>
        json({}, { status: 429, headers: { 'Retry-After': '45' } }),
      )
      const refreshes = () => calls(fetchMock).filter((call) => call === refresh).length

      await session.api.GET('/api/v1/me')
      await vi.advanceTimersByTimeAsync(40_000)
      await session.api.GET('/api/v1/me')
      expect(refreshes()).toBe(1)

      await vi.advanceTimersByTimeAsync(6_000)
      await session.api.GET('/api/v1/me')
      expect(refreshes()).toBe(2)
    })

    it('reprend dès qu’un renouvellement aboutit : jeton neuf, délai oublié', async () => {
      vi.useFakeTimers()
      const { session, fetchMock } = await openSession((attempt) =>
        attempt === 1 ? json({}, { status: 503 }) : json({ token: 'neuf' }),
      )

      await session.api.GET('/api/v1/me')
      await vi.advanceTimersByTimeAsync(2_100)
      const { response } = await session.api.GET('/api/v1/me')

      expect(response.status).toBe(200)
      expect(calls(fetchMock).filter((call) => call === refresh)).toHaveLength(2)
      expect(session.isAuthenticated).toBe(true)
    })

    it('met fin à la session sur un 401 du renouvellement, après un second essai', async () => {
      vi.useFakeTimers()
      const { session, fetchMock } = await openSession(() => expiredToken())

      const request = session.api.GET('/api/v1/me')
      await vi.advanceTimersByTimeAsync(400)
      await request

      expect(calls(fetchMock).filter((call) => call === refresh)).toHaveLength(2)
      expect(session.isAuthenticated).toBe(false)
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(localStorage.getItem('repas.user')).toBeNull()
    })
  })

  describe('register', () => {
    it("inscrit sans connecter : le compte attend la confirmation de l'adresse", async () => {
      const fetchMock = stubApi({
        'POST /api/v1/users': () => new Response(null, { status: 201 }),
      })
      const session = useSessionStore()

      await session.register('alexiane@example.com', 'un-mot-de-passe', 4)

      expect(calls(fetchMock)).toEqual(['POST /api/v1/users'])
      expect(session.isAuthenticated).toBe(false)
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

  describe("confirmation de l'adresse", () => {
    it('demande un nouveau lien pour une adresse', async () => {
      const fetchMock = stubApi({
        'POST /api/v1/users/email-verification/send': () => new Response(null, { status: 204 }),
      })
      const session = useSessionStore()

      await session.sendEmailVerification('alexiane@example.com')

      expect(calls(fetchMock)).toEqual(['POST /api/v1/users/email-verification/send'])
      expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'alexiane@example.com' })
    })

    it('confirme avec le secret du lien', async () => {
      const fetchMock = stubApi({
        'POST /api/v1/users/email-verification/confirm': () => new Response(null, { status: 204 }),
      })
      const session = useSessionStore()

      await session.confirmEmail('le-secret')

      expect(await bodyOf(fetchMock, 0)).toEqual({ token: 'le-secret' })
    })

    it('refuse un lien périmé ou déjà utilisé (422)', async () => {
      stubApi({
        'POST /api/v1/users/email-verification/confirm': () =>
          json({ error: { message: 'INVALID_EMAIL_VERIFICATION_TOKEN' } }, { status: 422 }),
      })
      const session = useSessionStore()

      await expect(session.confirmEmail('vieux')).rejects.toMatchObject({ status: 422 })
    })
  })

  describe('mot de passe oublié', () => {
    const send = 'POST /api/v1/users/password-reset/send'
    const confirm = 'POST /api/v1/users/password-reset/confirm'

    it('demande le lien pour une adresse, sans ouvrir de session', async () => {
      const fetchMock = stubApi({ [send]: () => new Response(null, { status: 204 }) })
      const session = useSessionStore()

      await session.sendPasswordReset('alexiane@example.com')

      expect(calls(fetchMock)).toEqual([send])
      expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'alexiane@example.com' })
      expect(session.isAuthenticated).toBe(false)
    })

    it('fixe le mot de passe avec le secret du lien, sans ouvrir de session', async () => {
      const fetchMock = stubApi({ [confirm]: () => new Response(null, { status: 204 }) })
      const session = useSessionStore()

      await session.resetPassword('le-secret', 'un nouveau mot de passe')

      expect(calls(fetchMock)).toEqual([confirm])
      expect(await bodyOf(fetchMock, 0)).toEqual({
        token: 'le-secret',
        password: 'un nouveau mot de passe',
      })
      expect(session.isAuthenticated).toBe(false)
    })

    it('oublie la session locale : le back vient de fermer toutes celles du compte', async () => {
      stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        [confirm]: () => new Response(null, { status: 204 }),
      })
      const session = useSessionStore()
      await session.login('alexiane@example.com', 'ancien')

      await session.resetPassword('le-secret', 'un nouveau mot de passe')

      expect(session.isAuthenticated).toBe(false)
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(localStorage.getItem('repas.user')).toBeNull()
    })

    it('garde la session quand le lien est refusé (422)', async () => {
      stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        [confirm]: () =>
          json({ error: { message: 'INVALID_PASSWORD_RESET_TOKEN' } }, { status: 422 }),
      })
      const session = useSessionStore()
      await session.login('alexiane@example.com', 'ancien')

      await expect(session.resetPassword('vieux', 'un nouveau mot de passe')).rejects.toMatchObject(
        { status: 422, message: 'INVALID_PASSWORD_RESET_TOKEN' },
      )
      expect(session.isAuthenticated).toBe(true)
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
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(calls(fetchMock)).toContain('POST /api/auth/logout')
    })

    it('efface aussi le brouillon du drive et le résultat du dernier envoi', async () => {
      stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        'POST /api/auth/logout': () => new Response(null, { status: 204 }),
      })
      const session = useSessionStore()
      await session.login('a@b.fr', 'x')
      localStorage.setItem('repas.drive.run', '{"runId":"x"}')
      const driveReturn = useDriveReturnStore()
      driveReturn.receive({ kind: 'invalid', detail: 'champ' })
      expect(driveReturn.event).not.toBeNull()

      await session.logout()

      expect(localStorage.getItem('repas.drive.run')).toBeNull()
      expect(driveReturn.event).toBeNull()
      expect(driveReturn.status).toBe('idle')
    })

    it('efface le brouillon du drive même si le back est injoignable', async () => {
      stubApi({
        'POST /api/login_check': () => json({ token: 'jeton' }),
        'GET /api/v1/me': () => json(me),
        'POST /api/auth/logout': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      const session = useSessionStore()
      await session.login('a@b.fr', 'x')
      localStorage.setItem('repas.drive.run', '{"runId":"x"}')

      await session.logout()

      expect(localStorage.getItem('repas.drive.run')).toBeNull()
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

  describe('sans réseau au démarrage', () => {
    const offline = () => {
      throw new TypeError('Failed to fetch')
    }

    beforeEach(() => localStorage.setItem('repas.session', '1'))

    it("reprend l'utilisateur de la dernière session et garde l'indice de session", async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      const fetchMock = stubApi({ 'POST /api/auth/refresh': offline })
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toEqual(me)
      expect(session.isAuthenticated).toBe(true)
      expect(localStorage.getItem('repas.session')).toBe('1')
      expect(calls(fetchMock)).toEqual(['POST /api/auth/refresh'])
    })

    it("reste anonyme sans copie de l'utilisateur, mais n'oublie pas la session", async () => {
      stubApi({ 'POST /api/auth/refresh': offline })
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(false)
      expect(localStorage.getItem('repas.session')).toBe('1')
    })

    it("reprend l'utilisateur quand le réseau tombe entre le jeton et sa lecture", async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({
        'POST /api/auth/refresh': () => json({ token: 'jeton' }),
        'GET /api/v1/me': offline,
      })
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toEqual(me)
    })

    it('ignore une copie illisible', async () => {
      localStorage.setItem('repas.user', '{pas du json')
      stubApi({ 'POST /api/auth/refresh': offline })
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(false)
    })

    it("une session refusée (401) efface l'indice et la copie de l'utilisateur", async () => {
      localStorage.setItem('repas.user', JSON.stringify(me))
      stubApi({
        'POST /api/auth/refresh': () => json({ error: { message: 'x' } }, { status: 401 }),
      })
      const session = useSessionStore()

      await session.restore()

      expect(session.isAuthenticated).toBe(false)
      expect(localStorage.getItem('repas.session')).toBeNull()
      expect(localStorage.getItem('repas.user')).toBeNull()
    })
  })

  it("garde une copie de l'utilisateur (sans jeton) et l'efface à la déconnexion", async () => {
    stubApi({
      'POST /api/login_check': () => json({ token: 'jeton-secret' }),
      'GET /api/v1/me': () => json(me),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    const session = useSessionStore()

    await session.login('a@b.fr', 'x')

    expect(JSON.parse(localStorage.getItem('repas.user') ?? 'null')).toEqual(me)
    expect(JSON.stringify(localStorage)).not.toContain('jeton-secret')

    await session.logout()

    expect(localStorage.getItem('repas.user')).toBeNull()
  })
})

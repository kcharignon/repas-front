// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient, createAuthFetch, ifMatch, unwrap, versionOf } from '@/api'
import type { AuthProvider } from '@/api'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init })

const authorizations = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchMock.mock.calls.map(([request]) => (request as Request).headers.get('Authorization'))

function auth(
  token: string | null,
  refreshed: string | null = null,
): AuthProvider & { refresh: ReturnType<typeof vi.fn<() => Promise<string | null>>> } {
  return { token: () => token, refresh: vi.fn<() => Promise<string | null>>(async () => refreshed) }
}

describe('createAuthFetch', () => {
  it("pose le jeton d'accès sur la requête", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}))
    const request = createAuthFetch({ auth: auth('jeton'), fetch: fetchMock })

    await request(new Request('http://localhost/api/v1/me'))

    expect(authorizations(fetchMock)).toEqual(['Bearer jeton'])
  })

  it('ne pose pas d’en-tête sans jeton', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}))
    const request = createAuthFetch({ auth: auth(null), fetch: fetchMock })

    await request(new Request('http://localhost/api/v1/health'))

    expect(authorizations(fetchMock)).toEqual([null])
  })

  it('sur un 401 demande un jeton neuf et rejoue la requête une seule fois, corps compris', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: 'Expired' } }, { status: 401 }))
      .mockImplementationOnce(async (request) =>
        json({ rejoue: await new Request(request).text() }),
      )
    const provider = auth('périmé', 'neuf')
    const request = createAuthFetch({ auth: provider, fetch: fetchMock })

    const response = await request(
      new Request('http://localhost/api/v1/recipes', { method: 'POST', body: '{"name":"x"}' }),
    )

    expect(authorizations(fetchMock)).toEqual(['Bearer périmé', 'Bearer neuf'])
    expect(provider.refresh).toHaveBeenCalledTimes(1)
    expect(await response.json()).toEqual({ rejoue: '{"name":"x"}' })
  })

  it('ne rejoue pas plus d’une fois : un second 401 est rendu tel quel', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}, { status: 401 }))
    const request = createAuthFetch({ auth: auth('périmé', 'neuf'), fetch: fetchMock })

    const response = await request(new Request('http://localhost/api/v1/me'))

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rend le 401 quand la session est perdue (refresh sans jeton)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}, { status: 401 }))
    const request = createAuthFetch({ auth: auth('périmé', null), fetch: fetchMock })

    const response = await request(new Request('http://localhost/api/v1/me'))

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('échoue comme un réseau coupé, pas comme un 401, quand le renouvellement n’a pas dit si la session tient', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}, { status: 401 }))
    const provider = { ...auth('périmé', null), unreachable: () => true }
    const request = createAuthFetch({ auth: provider, fetch: fetchMock })

    await expect(request(new Request('http://localhost/api/v1/me'))).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['/api/login_check', '/api/auth/refresh', '/api/auth/logout'])(
    'ne tente pas de refresh sur %s (un 401 y veut dire identifiants refusés)',
    async (path) => {
      const fetchMock = vi.fn<typeof fetch>(async () => json({}, { status: 401 }))
      const provider = auth(null, 'neuf')
      const request = createAuthFetch({ auth: provider, fetch: fetchMock })

      const response = await request(new Request(`http://localhost${path}`, { method: 'POST' }))

      expect(response.status).toBe(401)
      expect(provider.refresh).not.toHaveBeenCalled()
    },
  )
})

describe('createApiClient', () => {
  it('lit une ressource avec les types du contrat', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ id: 'u1', email: 'a@b.fr' }))
    const client = createApiClient({
      baseUrl: 'http://localhost',
      auth: auth('jeton'),
      fetch: fetchMock,
    })

    const me = await unwrap(client.GET('/api/v1/me'))

    expect(me).toMatchObject({ id: 'u1' })
    expect(authorizations(fetchMock)).toEqual(['Bearer jeton'])
  })
})

describe('unwrap', () => {
  const client = (fetchMock: typeof globalThis.fetch) =>
    createApiClient({ baseUrl: 'http://localhost', auth: auth('jeton'), fetch: fetchMock })

  it('lève une ApiError avec le message du back', async () => {
    const api = client(async () =>
      json({ error: { message: 'Recipe id x not found' } }, { status: 404 }),
    )

    const error = await unwrap(api.GET('/api/v1/me')).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Recipe id x not found', retryAfter: null })
  })

  it('porte le délai d’un 429', async () => {
    const api = client(async () =>
      json({ error: { message: 'Too many' } }, { status: 429, headers: { 'Retry-After': '42' } }),
    )

    const error = await unwrap(api.GET('/api/v1/me')).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: 429, retryAfter: 42 })
  })

  it('transforme une panne réseau en ApiError de statut 0', async () => {
    const api = client(async () => {
      throw new TypeError('Failed to fetch')
    })

    const error = await unwrap(api.GET('/api/v1/me')).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: 0, message: 'Failed to fetch' })
  })

  it('rend undefined pour une réponse sans contenu (204)', async () => {
    const api = client(async () => new Response(null, { status: 204 }))

    expect(await unwrap(api.PUT('/api/v1/shopping-lists/active'))).toBeUndefined()
  })
})

describe('version (ETag / If-Match)', () => {
  it("lit la version dans l'ETag", () => {
    expect(versionOf(new Response(null, { headers: { ETag: '"3"' } }))).toBe(3)
  })

  it.each([[null], ['3'], ['W/"3"'], ['"abc"']])(
    "ignore un ETag qui n'est pas une version : %s",
    (etag) => {
      const headers: Record<string, string> = etag === null ? {} : { ETag: etag }

      expect(versionOf(new Response(null, { headers }))).toBeNull()
    },
  )

  it('construit If-Match, ou rien sans version', () => {
    expect(ifMatch(3)).toEqual({ 'If-Match': '"3"' })
    expect(ifMatch(null)).toEqual({})
    expect(ifMatch(undefined)).toEqual({})
  })
})

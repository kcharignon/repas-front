import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import { json, me, stubApi } from '@/__tests__/helpers'
import { routes } from '@/router'
import { safeRedirect, sessionGuard } from '@/session/guard'

describe('safeRedirect', () => {
  it.each([
    ['/moi', '/moi'],
    ['/recettes?type=plat', '/recettes?type=plat'],
  ])('garde la page du site %s', (value, expected) => {
    expect(safeRedirect(value)).toBe(expected)
  })

  it.each([
    ['//autre-site.fr'],
    ['https://autre-site.fr'],
    ['moi'],
    [undefined],
    [['/moi']],
    [null],
  ])('renvoie à l’accueil pour %s', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})

describe('sessionGuard', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  const router = () => {
    const instance = createRouter({ history: createMemoryHistory(), routes })
    instance.beforeEach(sessionGuard)

    return instance
  }

  const anonymous = () => stubApi({ 'POST /api/auth/refresh': () => json({}, { status: 401 }) })
  const authenticated = () =>
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
    })

  it('renvoie un anonyme vers la connexion en gardant la page voulue', async () => {
    vi.useFakeTimers()
    anonymous()
    const app = router()

    const navigation = app.push('/moi')
    await vi.advanceTimersByTimeAsync(400)
    await navigation
    vi.useRealTimers()

    expect(app.currentRoute.value.name).toBe('login')
    expect(app.currentRoute.value.query.redirect).toBe('/moi')
  })

  it('laisse un utilisateur connecté entrer', async () => {
    authenticated()
    const app = router()

    await app.push('/moi')

    expect(app.currentRoute.value.name).toBe('account')
  })

  it('renvoie un utilisateur connecté de la connexion vers la page demandée', async () => {
    authenticated()
    const app = router()

    await app.push('/connexion?redirect=/moi')

    expect(app.currentRoute.value.name).toBe('account')
  })

  it('ne renvoie jamais vers un autre site après la connexion', async () => {
    authenticated()
    const app = router()

    await app.push('/connexion?redirect=//autre-site.fr')

    expect(app.currentRoute.value.name).toBe('home')
  })

  it('laisse le catalogue du design à tout le monde', async () => {
    vi.useFakeTimers()
    anonymous()
    const app = router()

    const navigation = app.push('/design')
    await vi.advanceTimersByTimeAsync(400)
    await navigation
    vi.useRealTimers()

    expect(app.currentRoute.value.name).toBe('design')
  })
})

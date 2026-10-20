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
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => vi.unstubAllGlobals())

  const router = () => {
    const instance = createRouter({ history: createMemoryHistory(), routes })
    instance.beforeEach(sessionGuard)

    return instance
  }

  // Un ancien visiteur (une session a existé) dont le cookie ne vaut plus rien
  const anonymous = () => {
    localStorage.setItem('repas.session', '1')

    return stubApi({ 'POST /api/auth/refresh': () => json({}, { status: 401 }) })
  }
  const authenticated = () => {
    localStorage.setItem('repas.session', '1')

    return stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
    })
  }

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

    expect(app.currentRoute.value.name).toBe('shopping-list')
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

  describe('mot de passe oublié', () => {
    it.each([
      ['/mot-de-passe-oublie', 'forgot-password'],
      ['/mot-de-passe-oublie/confirmation?token=le-secret', 'reset-password'],
    ])('laisse un visiteur sans compte ouvrir %s, sans aucun appel', async (path, name) => {
      const fetchMock = stubApi({})
      const app = router()

      await app.push(path)

      expect(app.currentRoute.value.name).toBe(name)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('renvoie un utilisateur connecté de la demande du lien vers l’accueil', async () => {
      authenticated()
      const app = router()

      await app.push('/mot-de-passe-oublie')

      expect(app.currentRoute.value.name).toBe('shopping-list')
    })

    it('laisse un utilisateur connecté ouvrir le lien reçu par e-mail', async () => {
      authenticated()
      const app = router()

      await app.push('/mot-de-passe-oublie/confirmation?token=le-secret')

      expect(app.currentRoute.value.name).toBe('reset-password')
    })
  })
})

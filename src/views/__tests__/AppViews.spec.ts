import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import App from '@/App.vue'
import { useSessionStore } from '@/session/session'
import AccountView from '@/views/AccountView.vue'
import HomeView from '@/views/HomeView.vue'

const signedIn = {
  'POST /api/login_check': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'POST /api/auth/logout': () => new Response(null, { status: 204 }),
}

describe('vues de l’application connectée', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("l'accueil salue l'utilisateur", async () => {
    stubApi(signedIn)
    const { plugins } = appContext()
    await useSessionStore().login('alexiane@example.com', 'x')

    const wrapper = mount(HomeView, { global: { plugins } })

    expect(wrapper.find('h1').text()).toBe('Bonjour alexiane@example.com')
  })

  it('le compte déconnecte et renvoie à la connexion', async () => {
    const fetchMock = stubApi(signedIn)
    const { plugins, router } = appContext()
    await router.push('/moi')
    await useSessionStore().login('alexiane@example.com', 'x')
    const wrapper = mount(AccountView, { global: { plugins } })

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Se déconnecter')
      ?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))

    expect(calls(fetchMock)).toContain('POST /api/auth/logout')
    expect(useSessionStore().isAuthenticated).toBe(false)
  })

  it('la coque propose la navigation et marque la page courante', async () => {
    const { plugins, router } = appContext()
    await router.push('/moi')
    await router.isReady()

    // La coque est la route parente : on monte l'application, dont le <RouterView> la rend.
    const wrapper = mount(App, { global: { plugins } })
    await vi.waitFor(() =>
      expect(wrapper.findAll('a[aria-current="page"]').length).toBeGreaterThan(0),
    )

    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current.every((link) => link.attributes('href') === '/moi')).toBe(true)
    expect(wrapper.findAll('nav')).toHaveLength(2)
  })
})

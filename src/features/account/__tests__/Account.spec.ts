import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import AccountView from '@/views/AccountView.vue'

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'PUT /api/v1/me/settings': () => new Response(null, { status: 204 }),
  'POST /api/auth/logout': () => new Response(null, { status: 204 }),
}

async function open(handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/moi')
  const wrapper = mount(AccountView, { global: { plugins: context.plugins } })

  return { wrapper, context, fetchMock }
}

const settingsBody = async (fetchMock: ReturnType<typeof stubApi>) => {
  const put = fetchMock.mock.calls
    .map(([call]) => call as Request)
    .find((request) => request.method === 'PUT' && request.url.endsWith('/me/settings'))

  return put?.json()
}

const forms = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) => wrapper.findAll('form')

describe('réglages du compte', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("montre l'adresse e-mail et le nombre de personnes actuel", async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).toContain(me.email)
    expect(wrapper.find('input').element).toHaveProperty('value', '4')
  })

  it('crédite Flaticon et renvoie vers la licence des icônes', async () => {
    const { wrapper } = await open()

    const credits = wrapper.get('[data-testid="account-credits"]')
    expect(credits.text()).toContain('Crédits')
    expect(credits.text()).toContain('créées par leurs auteurs')
    expect(credits.findAll('a').map((link) => link.attributes('href'))).toEqual([
      'https://www.flaticon.com',
      '/images/ingredient/license/license.html',
    ])
    expect(
      credits.findAll('a').every((link) => link.attributes('rel') === 'noopener noreferrer'),
    ).toBe(true)
  })

  it('enregistre le nombre de personnes sans toucher au mot de passe', async () => {
    const { wrapper, fetchMock } = await open()

    await forms(wrapper)[0]?.find('input').setValue('6')
    await forms(wrapper)[0]?.trigger('submit')
    await flushPromises()

    expect(await settingsBody(fetchMock)).toEqual({
      defaultServing: 6,
      newPassword: null,
      actualPassword: null,
    })
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Réglages enregistrés.',
    ])
    expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/me').length).toBeGreaterThan(1)
  })

  it('refuse moins d’une personne sans appeler le back', async () => {
    const { wrapper, fetchMock } = await open()

    await forms(wrapper)[0]?.find('input').setValue('0')
    await forms(wrapper)[0]?.trigger('submit')

    expect(wrapper.text()).toContain('Au moins une personne.')
    expect(calls(fetchMock).filter((call) => call.startsWith('PUT'))).toEqual([])
  })

  it('dit quoi corriger dans le formulaire du mot de passe, sans appeler le back', async () => {
    const { wrapper, fetchMock } = await open()
    const inputs = forms(wrapper)[1]?.findAll('input') ?? []

    await inputs[1]?.setValue('court')
    await inputs[2]?.setValue('autre')
    await forms(wrapper)[1]?.trigger('submit')

    expect(wrapper.text()).toContain('Entre ton mot de passe actuel.')
    expect(wrapper.text()).toContain('8 caractères au moins.')
    expect(wrapper.text()).toContain('Les deux mots de passe ne correspondent pas.')
    expect(calls(fetchMock).filter((call) => call.startsWith('PUT'))).toEqual([])
  })

  it('change le mot de passe puis renvoie à la connexion (les jetons sont révoqués)', async () => {
    const { wrapper, context, fetchMock } = await open()
    const inputs = forms(wrapper)[1]?.findAll('input') ?? []

    await inputs[0]?.setValue('ancien-mdp')
    await inputs[1]?.setValue('nouveau-mdp-123')
    await inputs[2]?.setValue('nouveau-mdp-123')
    await forms(wrapper)[1]?.trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('login'))

    expect(await settingsBody(fetchMock)).toEqual({
      defaultServing: 4,
      newPassword: 'nouveau-mdp-123',
      actualPassword: 'ancien-mdp',
    })
    expect(calls(fetchMock)).toContain('POST /api/auth/logout')
    expect(useSessionStore().isAuthenticated).toBe(false)
    expect(useNotificationsStore().items[0]?.text).toContain('reconnecte-toi')
  })

  it('dit que le mot de passe actuel est incorrect', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/me/settings': () =>
        json({ error: { message: 'INVALID_PASSWORD' } }, { status: 422 }),
    })
    const inputs = forms(wrapper)[1]?.findAll('input') ?? []

    await inputs[0]?.setValue('mauvais')
    await inputs[1]?.setValue('nouveau-mdp-123')
    await inputs[2]?.setValue('nouveau-mdp-123')
    await forms(wrapper)[1]?.trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Le mot de passe actuel est incorrect.')
    expect(useSessionStore().isAuthenticated).toBe(true)
  })

  it('affiche tel quel un autre refus de validation du back', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/me/settings': () =>
        json({ error: { message: 'newPassword: Cette chaîne est trop courte.' } }, { status: 422 }),
    })
    const inputs = forms(wrapper)[1]?.findAll('input') ?? []

    await inputs[0]?.setValue('ancien-mdp')
    await inputs[1]?.setValue('12345678')
    await inputs[2]?.setValue('12345678')
    await forms(wrapper)[1]?.trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('newPassword: Cette chaîne est trop courte.')
  })

  it('déconnecte depuis le compte', async () => {
    const { wrapper, context } = await open()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Se déconnecter')
      ?.trigger('click')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('login'))
  })
})

// Le décor d'Halloween (ADR 0010) : un interrupteur sous le choix du thème, visible du 15 octobre au 1er novembre seulement.
// Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts).
describe('décor d’Halloween', () => {
  const switchOf = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.find('[role="switch"]')

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-season')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.removeAttribute('data-season')
  })

  it('hors saison : aucun interrupteur, aucun thème saisonnier', async () => {
    const { wrapper } = await open()

    expect(switchOf(wrapper).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Halloween')
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)
  })

  it('en saison : l’interrupteur est là, juste sous le choix du thème, et activé par défaut', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const { wrapper } = await open()

    const toggle = switchOf(wrapper)
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('Décor d’Halloween')
    expect(document.documentElement.dataset.season).toBe('halloween')
    const section = toggle.element.closest('section')
    expect(section?.querySelector('h2')?.textContent).toBe('Thème')
  })

  it('le couper retire le thème saisonnier et se retient ; le rallumer le remet', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    const { wrapper } = await open()

    await switchOf(wrapper).trigger('click')
    await flushPromises()

    expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)
    expect(localStorage.getItem('repas.season')).toBe('off')

    await switchOf(wrapper).trigger('click')
    await flushPromises()

    expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.season).toBe('halloween')
    expect(localStorage.getItem('repas.season')).toBeNull()
  })

  it('un décor coupé auparavant s’affiche coupé', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    localStorage.setItem('repas.season', 'off')

    const { wrapper } = await open()

    expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)
  })
})

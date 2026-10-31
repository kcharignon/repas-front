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
    expect(credits.get('h2').text()).toBe('Crédits')
    expect(credits.text()).toContain('créées par leurs auteurs')
    expect(credits.findAll('a').map((link) => link.text())).toEqual([
      'Flaticon',
      'Licence et auteurs',
    ])
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

// Le décor saisonnier (ADR 0010, 0011) : un interrupteur sous le choix du thème, visible en saison seulement (du 15 octobre au
// 1er novembre, du 15 novembre au 5 janvier), dont le libellé suit la saison. Hors de ces tests, la suite tourne le 15 juin
// (src/__tests__/setup.ts).
describe('décor saisonnier', () => {
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
    expect(wrapper.text()).not.toContain('Noël')
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)
  })

  it('le 14 novembre et le 3 février : aucun interrupteur', async () => {
    for (const date of [new Date(2026, 10, 14, 12), new Date(2027, 1, 3, 12)]) {
      vi.setSystemTime(date)

      const { wrapper } = await open()

      expect(switchOf(wrapper).exists()).toBe(false)
    }
  })

  it('le 1er janvier l’interrupteur est celui de Noël, le 6 janvier celui de la galette : Noël ne s’attarde pas', async () => {
    vi.setSystemTime(new Date(2027, 0, 1, 12))
    const noel = await open()
    expect(noel.wrapper.text()).toContain('Décor de Noël')
    expect(switchOf(noel.wrapper).attributes('aria-checked')).toBe('true')

    vi.setSystemTime(new Date(2027, 0, 6, 12))
    const galette = await open()

    expect(galette.wrapper.text()).not.toContain('Décor de Noël')
    expect(galette.wrapper.text()).toContain('Décor de la galette')
    expect(document.documentElement.dataset.season).toBe('galette')
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
    expect(localStorage.getItem('repas.season')).toBe('halloween')

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

  describe('Noël', () => {
    it('le libellé suit la saison : « Décor de Noël », sous le choix du thème, activé par défaut', async () => {
      vi.setSystemTime(new Date(2026, 11, 20, 12))

      const { wrapper } = await open()

      const toggle = switchOf(wrapper)
      expect(toggle.attributes('aria-checked')).toBe('true')
      expect(wrapper.text()).toContain('Décor de Noël')
      expect(wrapper.text()).not.toContain('Halloween')
      expect(document.documentElement.dataset.season).toBe('noel')
      expect(toggle.element.closest('section')?.querySelector('h2')?.textContent).toBe('Thème')
    })

    it('le couper retire le thème de Noël et se retient ; le rallumer le remet', async () => {
      vi.setSystemTime(new Date(2027, 0, 1, 12))
      const { wrapper } = await open()

      await switchOf(wrapper).trigger('click')
      await flushPromises()

      expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
      expect(document.documentElement.hasAttribute('data-season')).toBe(false)
      expect(localStorage.getItem('repas.season')).toBe('noel')

      await switchOf(wrapper).trigger('click')
      await flushPromises()

      expect(document.documentElement.dataset.season).toBe('noel')
      expect(localStorage.getItem('repas.season')).toBeNull()
    })

    it('couper Halloween ne coupe pas Noël : l’interrupteur est activé', async () => {
      vi.setSystemTime(new Date(2026, 11, 20, 12))
      localStorage.setItem('repas.season', 'halloween')

      const { wrapper } = await open()

      expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
      expect(document.documentElement.dataset.season).toBe('noel')
    })

    it('couper Noël garde Halloween coupé ou non selon la préférence', async () => {
      vi.setSystemTime(new Date(2026, 11, 20, 12))
      localStorage.setItem('repas.season', 'off')
      const { wrapper } = await open()

      await switchOf(wrapper).trigger('click')
      await flushPromises()

      expect(localStorage.getItem('repas.season')).toBe('halloween,noel')
    })
  })
})

// L'aperçu des thèmes (ADR 0013) : une section réservée à l'administrateur, une pastille par saison de `SEASONS`.
describe('aperçu des thèmes', () => {
  const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }
  const previewGroup = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.find('[role="group"][aria-label="Aperçu des thèmes"]')

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.removeAttribute('data-season')
  })

  it('un utilisateur ordinaire ne voit pas la section', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).not.toContain('Aperçu des thèmes')
    expect(previewGroup(wrapper).exists()).toBe(false)
  })

  it('l’administrateur choisit un thème, et revient au thème du moment, sans rien écrire', async () => {
    const { wrapper } = await open({ 'GET /api/v1/me': () => json(admin) })
    const group = previewGroup(wrapper)
    const chips = group.findAll('button')
    const written = JSON.stringify({ ...localStorage })

    expect(chips.map((chip) => chip.text())).toEqual([
      'Thème du moment',
      'Sans décor',
      'Galette & crêpes',
      'Saint-Valentin',
      'Pâques',
      'Été',
      'Automne',
      'Halloween',
      'Noël',
    ])
    expect(chips[0]!.attributes('aria-pressed')).toBe('true')

    // Chaque saison du registre a sa pastille, dans l'ordre de l'année, et chaque pastille pose sa saison.
    for (const [index, season] of [
      [2, 'galette'],
      [3, 'valentin'],
      [4, 'paques'],
      [5, 'ete'],
      [6, 'automne'],
      [7, 'halloween'],
      [8, 'noel'],
    ] as const) {
      await chips[index]!.trigger('click')
      await flushPromises()
      expect(document.documentElement.dataset.season).toBe(season)
      expect(previewGroup(wrapper).findAll('button')[index]!.attributes('aria-pressed')).toBe(
        'true',
      )
    }

    await chips[1]!.trigger('click')
    await flushPromises()
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)

    await chips[0]!.trigger('click')
    await flushPromises()
    expect(document.documentElement.hasAttribute('data-season')).toBe(false)
    expect(chips[0]!.attributes('aria-pressed')).toBe('true')
    expect(JSON.stringify({ ...localStorage })).toBe(written)
  })
})

describe('entrée « Types de liste » (LST-006)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('est dans « Moi » pour tout compte, avec son sous-titre, et mène à l’écran des types', async () => {
    const { wrapper, fetchMock } = await open()
    await flushPromises()

    const entry = wrapper.findAll('a').find((link) => link.text().includes('Types de liste'))
    expect(entry?.text()).toBe('Types de listeSépare tes courses par magasin.')
    expect(entry?.attributes('href')).toBe('/moi/types-de-liste')
    // L'entrée ne lit rien : un compte sans type ne coûte aucune requête de plus
    expect(calls(fetchMock).filter((call) => call.includes('shopping-list-types'))).toEqual([])
  })
})

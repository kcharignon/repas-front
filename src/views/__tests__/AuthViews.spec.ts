import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'

const loggedIn = {
  'POST /api/login_check': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

async function mountView(view: typeof LoginView | typeof RegisterView, path: string) {
  const { router, plugins } = appContext()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins } })

  return { wrapper, router }
}

const fill = async (wrapper: ReturnType<typeof mount>, values: Record<string, string>) => {
  for (const [selector, value] of Object.entries(values))
    await wrapper.find(selector).setValue(value)
}

describe('LoginView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('connecte, puis va à la page demandée avant la connexion', async () => {
    stubApi(loggedIn)
    const { wrapper, router } = await mountView(LoginView, '/connexion?redirect=/moi')

    await fill(wrapper, {
      'input[type=email]': 'alexiane@example.com',
      'input[type=password]': 'secret',
    })
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('account'))
  })

  it('va à la liste de courses sans page demandée', async () => {
    stubApi(loggedIn)
    const { wrapper, router } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('shopping-list'))
  })

  it('dit « Identifiants invalides. » sur un 401 et reste sur la page', async () => {
    stubApi({
      'POST /api/login_check': () =>
        json({ error: { message: 'Invalid credentials.' } }, { status: 401 }),
    })
    const { wrapper, router } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Identifiants invalides.')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('explique une adresse pas encore confirmée (403) et propose de renvoyer le lien', async () => {
    stubApi({
      'POST /api/login_check': () =>
        json({ error: { message: 'EMAIL_NOT_VERIFIED' } }, { status: 403 }),
    })
    const { wrapper, router } = await mountView(LoginView, '/connexion')

    await fill(wrapper, { 'input[type=email]': 'alexiane@example.com' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le lien reçu par e-mail pour activer votre compte.",
    )
    const resend = wrapper.find('a[href^="/verification-email"]')
    expect(resend.text()).toBe('Renvoyer le lien de confirmation')
    expect(resend.attributes('href')).toBe('/verification-email?email=alexiane@example.com')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('ne propose pas de renvoyer le lien pour un mauvais mot de passe', async () => {
    stubApi({
      'POST /api/login_check': () =>
        json({ error: { message: 'Invalid credentials.' } }, { status: 401 }),
    })
    const { wrapper } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('a[href^="/verification-email"]').exists()).toBe(false)
  })

  it.each([
    [60, 'Trop de tentatives. Réessayez dans 1 minute'],
    [600, 'Trop de tentatives. Réessayez dans 10 minutes'],
  ])('annonce le délai d’un 429 (Retry-After %i s)', async (seconds, expected) => {
    stubApi({
      'POST /api/login_check': () =>
        json(
          { error: { message: 'Too many' } },
          { status: 429, headers: { 'Retry-After': String(seconds) } },
        ),
    })
    const { wrapper } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(expected)
  })

  it('signale un serveur injoignable', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Réessayez dans un instant.',
    )
  })

  it('propose de créer un compte', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion')

    expect(wrapper.find('a[href="/inscription"]').text()).toBe('Créer un compte')
  })
})

describe('RegisterView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('inscrit avec le nombre de personnes choisi et mène à la vérification de la boîte mail', async () => {
    const fetchMock = stubApi({
      'POST /api/v1/users': () => new Response(null, { status: 201 }),
    })
    const { wrapper, router } = await mountView(RegisterView, '/inscription')

    await fill(wrapper, {
      'input[type=email]': 'alexiane@example.com',
      'input[type=password]': 'un-mot-de-passe',
      'input[type=number]': '2',
    })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock)[0]).toBe('POST /api/v1/users')
    expect(await bodyOf(fetchMock, 0)).toEqual({
      email: 'alexiane@example.com',
      password: 'un-mot-de-passe',
      defaultServing: 2,
    })
    // Pas de connexion : le compte attend la confirmation de l'adresse
    expect(calls(fetchMock)).toEqual(['POST /api/v1/users'])
    // Les routes sont chargées en différé : on attend l'arrivée
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('check-email'))
    expect(router.currentRoute.value.query.email).toBe('alexiane@example.com')
  })

  it('explique un e-mail déjà pris (409)', async () => {
    stubApi({
      'POST /api/v1/users': () =>
        json({ error: { message: 'Email already used' } }, { status: 409 }),
    })
    const { wrapper } = await mountView(RegisterView, '/inscription')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Cette adresse e-mail est déjà utilisée.')
  })

  it('affiche tel quel le message de validation du back (422)', async () => {
    stubApi({
      'POST /api/v1/users': () =>
        json({ error: { message: 'password: Cette chaîne est trop courte.' } }, { status: 422 }),
    })
    const { wrapper } = await mountView(RegisterView, '/inscription')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('password: Cette chaîne est trop courte.')
  })

  it.each([
    [429, "Trop d'inscriptions depuis cette adresse. Réessayez plus tard."],
    [500, 'Le serveur est injoignable. Réessayez dans un instant.'],
  ])('répond clairement à un %i', async (status, expected) => {
    stubApi({ 'POST /api/v1/users': () => json({ error: { message: 'x' } }, { status }) })
    const { wrapper } = await mountView(RegisterView, '/inscription')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(expected)
  })
})

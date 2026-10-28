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
    // La page « Moi » est chargée à la demande, comme celle de la liste ci-dessous : plus d'une seconde sous charge et sous couverture.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('account'), {
      timeout: 5000,
    })
  })

  it('va à la liste de courses sans page demandée', async () => {
    stubApi(loggedIn)
    const { wrapper, router } = await mountView(LoginView, '/connexion')

    await wrapper.find('form').trigger('submit')
    // La page de la liste est chargée à la demande : sa première compilation prend jusqu'à une demi-seconde, plus sous charge.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('shopping-list'), {
      timeout: 5000,
    })
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
      "Ton adresse e-mail n'est pas encore confirmée. Ouvre le lien reçu par e-mail pour activer ton compte.",
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
    [60, 'Trop de tentatives. Réessaie dans 1 minute'],
    [600, 'Trop de tentatives. Réessaie dans 10 minutes'],
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
      'Le serveur est injoignable. Réessaie dans un instant.',
    )
  })

  it('propose de créer un compte', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion')

    expect(wrapper.find('a[href="/inscription"]').text()).toBe('Créer un compte')
  })

  it('propose « Mot de passe oublié ? », qui mène à la demande du lien', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion')

    const forgot = wrapper.find('a[href="/mot-de-passe-oublie"]')
    expect(forgot.text()).toBe('Mot de passe oublié ?')
    // Un lien, pas un second bouton : « Se connecter » reste la seule décision de l'écran
    expect(wrapper.findAll('button')).toHaveLength(1)
  })

  it('transmet l’adresse déjà saisie à la demande du lien', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion')

    await fill(wrapper, { 'input[type=email]': 'alexiane@example.com' })

    expect(wrapper.find('a[href^="/mot-de-passe-oublie"]').attributes('href')).toBe(
      '/mot-de-passe-oublie?email=alexiane@example.com',
    )
  })

  it('annonce que le nouveau mot de passe est enregistré, après la réinitialisation', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion?mot-de-passe=change')

    expect(wrapper.find('[role="status"]').text()).toBe(
      'Ton nouveau mot de passe est enregistré. Tu peux te connecter.',
    )
  })

  it('annonce que le compte est prêt, une fois le premier mot de passe choisi', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion?compte=pret')

    expect(wrapper.find('[role="status"]').text()).toBe(
      'Ton compte est prêt. Connecte-toi avec ton mot de passe.',
    )
  })

  it('ne confond pas la fin de l’inscription avec un mot de passe changé', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion?compte=pret')

    expect(wrapper.text()).not.toContain('nouveau mot de passe')
  })

  it('n’annonce rien sans la réinitialisation', async () => {
    const { wrapper } = await mountView(LoginView, '/connexion')

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})

describe('RegisterView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ne demande que l’adresse e-mail, avec un seul bouton principal', async () => {
    const { wrapper } = await mountView(RegisterView, '/inscription')

    expect(wrapper.find('h1').text()).toBe('Créer un compte')
    expect(wrapper.text()).toContain('Tu recevras un lien pour choisir ton mot de passe.')
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]!.attributes('type')).toBe('email')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.find('button[type=submit]').text()).toBe('Créer mon compte')
  })

  it('envoie l’adresse seule et mène à « Vérifie ta boîte mail »', async () => {
    const fetchMock = stubApi({
      'POST /api/v1/users': () => new Response(null, { status: 204 }),
    })
    const { wrapper, router } = await mountView(RegisterView, '/inscription')

    await fill(wrapper, { 'input[type=email]': 'alexiane@example.com' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Pas de connexion, pas d'autre appel : la réponse est la même pour toute adresse
    expect(calls(fetchMock)).toEqual(['POST /api/v1/users'])
    // Ni mot de passe ni nombre de personnes : le mot de passe se choisit après le clic sur le lien reçu
    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'alexiane@example.com' })
    // Les routes sont chargées en différé : on attend l'arrivée
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('check-email'))
    expect(router.currentRoute.value.query.email).toBe('alexiane@example.com')
  })

  it('affiche une adresse refusée par le back (422) avec une phrase claire', async () => {
    stubApi({
      'POST /api/v1/users': () =>
        json({ error: { message: 'email: Cette valeur n’est pas valide.' } }, { status: 422 }),
    })
    const { wrapper, router } = await mountView(RegisterView, '/inscription')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Cette adresse e-mail n’est pas valide. Vérifie-la, puis réessaie.',
    )
    expect(router.currentRoute.value.name).toBe('register')
  })

  it.each([
    [429, null, 'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie plus tard.'],
    [
      429,
      '60',
      'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie dans 1 minute.',
    ],
    [
      429,
      '1800',
      'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie dans 30 minutes.',
    ],
    [500, null, 'Le serveur est injoignable. Réessaie dans un instant.'],
  ])('répond clairement à un %i (Retry-After %s)', async (status, retryAfter, expected) => {
    stubApi({
      'POST /api/v1/users': () =>
        json(
          { error: { message: 'x' } },
          { status, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } },
        ),
    })
    const { wrapper } = await mountView(RegisterView, '/inscription')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(expected)
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })
})

// La confidentialité (STORE-010) : un lien discret sur les écrans d'authentification, lisible sans connexion
describe('lien « Confidentialité » des écrans de connexion et d’inscription', () => {
  it.each([
    ['la connexion', LoginView, '/connexion'],
    ['l’inscription', RegisterView, '/inscription'],
  ] as const)('est sur l’écran de %s et mène à /confidentialite', async (_name, view, path) => {
    const { wrapper } = await mountView(view, path)

    const link = wrapper.findAll('a').find((candidate) => candidate.text() === 'Confidentialité')
    expect(link?.attributes('href')).toBe('/confidentialite')
  })
})

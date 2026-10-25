import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import AlexaLinkView from '../AlexaLinkView.vue'

const authorize = 'POST /api/v1/voice/alexa/authorize'
const query =
  'client_id=repas-alexa&redirect_uri=https%3A%2F%2Fpitangui.amazon.com%2Fapi%2Fskill%2Flink%2FM2AAAAAAAAAAAA&state=etat-1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&response_type=code&scope=voice'
const back = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA?state=etat-1&code=le-code'

const assign = vi.fn<(url: string) => void>()

async function open(search: string, handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(`/alexa/lier${search}`)
  const wrapper = mount(AlexaLinkView, { global: { plugins: context.plugins } })
  fetchMock.mockClear()

  return { wrapper, context, fetchMock }
}

const authorizeButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.findAll('button').find((button) => button.text() === 'Autoriser')!

describe("page d'autorisation d'Alexa", () => {
  beforeEach(() => {
    assign.mockReset()
    vi.stubGlobal('location', { ...window.location, assign })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('ne dit qu’une phrase, avec deux boutons, et n’appelle rien avant le geste', async () => {
    const { wrapper, fetchMock } = await open(`?${query}`)

    expect(wrapper.find('h1').text()).toBe('Alexa veut ajouter des produits à ta liste de courses.')
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Autoriser',
      'Annuler',
    ])
    expect(calls(fetchMock)).toEqual([])
    expect(assign).not.toHaveBeenCalled()
  })

  it('« Autoriser » envoie les cinq paramètres puis suit l’adresse reçue du back, et elle seule', async () => {
    const { wrapper, fetchMock } = await open(`?${query}`, {
      [authorize]: () => json({ redirectUrl: back }),
    })

    await authorizeButton(wrapper).trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([authorize])
    expect(await bodyOf(fetchMock, 0)).toEqual({
      clientId: 'repas-alexa',
      redirectUri: 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA',
      state: 'etat-1',
      codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      codeChallengeMethod: 'S256',
    })
    expect(assign).toHaveBeenCalledExactlyOnceWith(back)
    // Un second clic ne demande pas un second code
    expect(authorizeButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('ne suit pas une adresse qui n’est pas une adresse web', async () => {
    const { wrapper } = await open(`?${query}`, {
      [authorize]: () => json({ redirectUrl: 'javascript:alert(1)' }),
    })

    await authorizeButton(wrapper).trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Réessaie dans un instant.',
    )
  })

  it('« Annuler » mène à l’accueil sans rien envoyer', async () => {
    const { wrapper, context, fetchMock } = await open(`?${query}`)

    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()

    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('shopping-list'), {
      timeout: 5000,
    })
    expect(calls(fetchMock)).not.toContain(authorize)
    expect(assign).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'Ce lien ne marche pas. Reprends depuis l’application Alexa.'],
    [
      '?client_id=repas-alexa&state=etat-1',
      'Ce lien ne marche pas. Reprends depuis l’application Alexa.',
    ],
  ])(
    'des paramètres manquants (%s) : une phrase et l’accueil, aucun appel',
    async (search, text) => {
      const { wrapper, fetchMock } = await open(search)

      expect(wrapper.find('[role="alert"]').text()).toBe(text)
      expect(wrapper.find('a').attributes('href')).toBe('/')
      expect(wrapper.find('button').exists()).toBe(false)
      expect(calls(fetchMock)).toEqual([])
    },
  )

  it.each([
    [
      422,
      'VOICE_AUTHORIZATION_REFUSED',
      {},
      'Alexa ne peut pas être liée avec ce lien. Reprends depuis l’application Alexa.',
    ],
    [
      429,
      'VOICE_RATE_LIMITED',
      { 'Retry-After': '600' },
      'Trop d’essais pour le moment. Réessaie dans quelques minutes.',
    ],
    [404, 'VOICE_DISABLED', {}, 'Cette fonction n’est pas encore disponible.'],
  ])(
    'refus %i : une phrase et l’accueil, jamais de redirection',
    async (status, code, headers, text) => {
      const { wrapper } = await open(`?${query}`, {
        [authorize]: () => json({ error: { message: code } }, { status, headers }),
      })

      await authorizeButton(wrapper).trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(text)
      expect(wrapper.find('a').attributes('href')).toBe('/')
      expect(wrapper.find('button').exists()).toBe(false)
      expect(assign).not.toHaveBeenCalled()
    },
  )

  it('un échec passager garde les boutons pour recommencer', async () => {
    let attempts = 0
    const { wrapper } = await open(`?${query}`, {
      [authorize]: () =>
        ++attempts === 1
          ? json({ error: { message: 'x' } }, { status: 500 })
          : json({ redirectUrl: back }),
    })

    await authorizeButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Une erreur est survenue. Réessaie.')
    expect(assign).not.toHaveBeenCalled()

    await authorizeButton(wrapper).trigger('click')
    await flushPromises()
    expect(assign).toHaveBeenCalledExactlyOnceWith(back)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, stubApi } from '@/__tests__/helpers'
import CheckEmailView from '@/views/CheckEmailView.vue'
import ConfirmEmailView from '@/views/ConfirmEmailView.vue'

async function mountView(view: typeof CheckEmailView | typeof ConfirmEmailView, path: string) {
  const { router, plugins } = appContext()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins } })

  return { wrapper, router }
}

// Renvoyer le lien, c'est redemander l'inscription : la même route, la même réponse `204` pour toute adresse
const send = 'POST /api/v1/users'
const confirm = 'POST /api/v1/users/email-verification/confirm'

describe('CheckEmailView', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("annonce l'envoi du lien à l'adresse de l'inscription", async () => {
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    expect(wrapper.find('h1').text()).toBe('Vérifie ta boîte mail')
    expect(wrapper.text()).toContain(
      'Un message vient de partir à a@example.com. Ouvre-le pour continuer.',
    )
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('ne dit jamais qu’un compte vient d’être créé : la réponse est la même pour toute adresse', async () => {
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    expect(wrapper.text()).not.toMatch(/créé|activé|inscri/i)
  })

  it("renvoie le lien, annonce l'envoi et attend une minute avant le suivant", async () => {
    const fetchMock = stubApi({ [send]: () => new Response(null, { status: 204 }) })
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'a@example.com' })
    expect(wrapper.find('[role="status"]').text()).toBe('Un nouveau message vient de partir.')
    const button = wrapper.find('button[type=submit]')
    expect(button.text()).toBe('Renvoyer le lien dans 60 s')
    expect(button.attributes('disabled')).toBeDefined()

    vi.advanceTimersByTime(60_000)
    await flushPromises()

    expect(wrapper.find('button[type=submit]').text()).toBe('Renvoyer le lien')
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })

  it("demande l'adresse quand elle n'est pas connue (arrivée depuis un lien périmé)", async () => {
    const fetchMock = stubApi({ [send]: () => new Response(null, { status: 204 }) })
    const { wrapper } = await mountView(CheckEmailView, '/verification-email')

    expect(wrapper.text()).toContain('Indique ton adresse e-mail pour recevoir un nouveau lien.')
    await wrapper.find('input[type=email]').setValue('b@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'b@example.com' })
  })

  it.each([
    [429, 'Trop de demandes. Réessaie plus tard.'],
    [422, "Cette adresse e-mail n'est pas valide."],
    [500, 'Le serveur est injoignable. Réessaie dans un instant.'],
  ])("explique un refus de l'API (%i) sans bloquer le bouton", async (status, expected) => {
    stubApi({ [send]: () => json({ error: { message: 'x' } }, { status }) })
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(expected)
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })

  it('propose de revenir à la connexion', async () => {
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    expect(wrapper.find('a[href="/connexion"]').text()).toBe('Retour à la connexion')
  })
})

describe('ConfirmEmailView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('confirme avec le secret du lien dès l’ouverture et propose de choisir le mot de passe', async () => {
    const fetchMock = stubApi({ [confirm]: () => new Response(null, { status: 204 }) })
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email?token=le-secret')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([confirm])
    expect(await bodyOf(fetchMock, 0)).toEqual({ token: 'le-secret' })
    // Le compte est actif sans mot de passe : il se choisit par « mot de passe oublié », pas à la connexion
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Ton adresse est confirmée. Il te reste à choisir ton mot de passe.',
    )
    expect(wrapper.find('a[href="/mot-de-passe-oublie"]').text()).toBe('Choisir mon mot de passe')
    expect(wrapper.find('a[href="/connexion"]').exists()).toBe(false)
  })

  it('annonce la confirmation en cours tant que le back n’a pas répondu', async () => {
    stubApi({ [confirm]: () => new Promise<Response>(() => {}) })
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email?token=le-secret')

    expect(wrapper.find('[role="status"]').text()).toBe('Confirmation en cours…')
  })

  it('explique un lien périmé ou déjà utilisé (422) et propose un nouveau lien', async () => {
    stubApi({
      [confirm]: () =>
        json({ error: { message: 'INVALID_EMAIL_VERIFICATION_TOKEN' } }, { status: 422 }),
    })
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email?token=vieux')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "Ce lien n'est plus valable : il a déjà servi ou il a expiré.",
    )
    expect(wrapper.find('a[href="/verification-email"]').text()).toBe('Recevoir un nouveau lien')
    expect(wrapper.find('a[href="/connexion"]').exists()).toBe(true)
  })

  it("traite une adresse sans secret comme un lien invalide, sans appeler l'API", async () => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain("Ce lien n'est plus valable")
  })

  it('laisse réessayer quand le back est injoignable, avec le même lien', async () => {
    let attempts = 0
    stubApi({
      [confirm]: () => {
        attempts += 1

        return attempts === 1
          ? json({ error: { message: 'x' } }, { status: 500 })
          : new Response(null, { status: 204 })
      },
    })
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email?token=le-secret')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Réessaie dans un instant.',
    )

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="status"]').text()).toContain('Ton adresse est confirmée')
  })
})

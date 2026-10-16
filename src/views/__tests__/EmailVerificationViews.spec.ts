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

const send = 'POST /api/v1/users/email-verification/send'
const confirm = 'POST /api/v1/users/email-verification/confirm'

describe('CheckEmailView', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("annonce l'envoi du lien à l'adresse de l'inscription", async () => {
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    expect(wrapper.find('h1').text()).toBe('Vérifiez votre boîte mail')
    expect(wrapper.text()).toContain('Un lien de confirmation a été envoyé à a@example.com.')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it("renvoie le lien, annonce l'envoi et attend une minute avant le suivant", async () => {
    const fetchMock = stubApi({ [send]: () => new Response(null, { status: 204 }) })
    const { wrapper } = await mountView(CheckEmailView, '/verification-email?email=a%40example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'a@example.com' })
    expect(wrapper.find('[role="status"]').text()).toBe(
      "Si un compte attend cette adresse, un nouveau lien vient d'être envoyé.",
    )
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

    expect(wrapper.text()).toContain("Saisissez l'adresse de votre compte")
    await wrapper.find('input[type=email]').setValue('b@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'b@example.com' })
  })

  it.each([
    [429, 'Trop de demandes. Réessayez plus tard.'],
    [422, "Cette adresse e-mail n'est pas valide."],
    [500, 'Le serveur est injoignable. Réessayez dans un instant.'],
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

  it('confirme avec le secret du lien dès l’ouverture et mène à la connexion', async () => {
    const fetchMock = stubApi({ [confirm]: () => new Response(null, { status: 204 }) })
    const { wrapper } = await mountView(ConfirmEmailView, '/confirmation-email?token=le-secret')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([confirm])
    expect(await bodyOf(fetchMock, 0)).toEqual({ token: 'le-secret' })
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Votre adresse est confirmée : votre compte est activé.',
    )
    expect(wrapper.find('a[href="/connexion"]').text()).toBe('Se connecter')
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
      'Le serveur est injoignable. Réessayez dans un instant.',
    )

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="status"]').text()).toContain('votre compte est activé')
  })
})

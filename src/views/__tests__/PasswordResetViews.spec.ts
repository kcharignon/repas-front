import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, stubApi } from '@/__tests__/helpers'
import fr from '@/i18n/fr'
import ForgotPasswordView from '@/views/ForgotPasswordView.vue'
import ResetPasswordView from '@/views/ResetPasswordView.vue'

async function mountView(view: typeof ForgotPasswordView | typeof ResetPasswordView, path: string) {
  const { router, plugins } = appContext()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins }, attachTo: document.body })

  return { wrapper, router }
}

const send = 'POST /api/v1/users/password-reset/send'
const confirm = 'POST /api/v1/users/password-reset/confirm'
const sent204 = () => new Response(null, { status: 204 })
const invalidToken = () =>
  json({ error: { message: 'INVALID_PASSWORD_RESET_TOKEN' } }, { status: 422 })

describe('ForgotPasswordView', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('demande l’adresse, avec un seul bouton principal et le retour à la connexion', async () => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')

    expect(wrapper.find('h1').text()).toBe('Mot de passe oublié')
    expect(wrapper.text()).toContain('Tu recevras un lien pour choisir un nouveau mot de passe.')
    expect(wrapper.findAll('input')).toHaveLength(1)
    expect(wrapper.find('input').attributes('type')).toBe('email')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.find('button[type=submit]').text()).toBe('Envoyer le lien')
    expect(wrapper.find('a[href="/connexion"]').text()).toBe('Retour à la connexion')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reprend l’adresse déjà saisie sur la connexion', async () => {
    const { wrapper } = await mountView(
      ForgotPasswordView,
      '/mot-de-passe-oublie?email=a%40example.com',
    )

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('a@example.com')
  })

  it('envoie l’adresse et dit qu’un lien vient de partir, pour 30 minutes', async () => {
    const fetchMock = stubApi({ [send]: sent204 })
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')

    await wrapper.find('input').setValue('a@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([send])
    expect(await bodyOf(fetchMock, 0)).toEqual({ email: 'a@example.com' })
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Si un compte existe pour cette adresse, un lien vient de partir. Il est valable 30 minutes.',
    )
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('dit la même chose pour toute adresse : rien ne montre qu’un compte existe', async () => {
    stubApi({ [send]: sent204 })
    const messages: string[] = []
    for (const address of ['inscrit@example.com', 'inconnu@example.com']) {
      const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')
      await wrapper.find('input').setValue(address)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      messages.push(wrapper.find('[role="status"]').text())
    }

    expect(messages[0]).toBe(messages[1])
    expect(messages[0]).not.toContain('@')
  })

  it('attend une minute avant de renvoyer le lien, puis le propose en discret', async () => {
    stubApi({ [send]: sent204 })
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')
    await wrapper.find('input').setValue('a@example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const button = wrapper.find('button[type=submit]')
    expect(button.text()).toBe('Renvoyer le lien dans 60 s')
    expect(button.attributes('disabled')).toBeDefined()
    // Une fois le lien parti, ce n'est plus le bouton principal (une seule décision par écran)
    expect(button.classes()).toContain('border-primary')

    vi.advanceTimersByTime(60_000)
    await flushPromises()

    expect(wrapper.find('button[type=submit]').text()).toBe('Renvoyer le lien')
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })

  it('repart à zéro quand l’adresse change après l’envoi', async () => {
    stubApi({ [send]: sent204 })
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')
    await wrapper.find('input').setValue('a@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await wrapper.find('input').setValue('b@example.com')

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('button[type=submit]').text()).toBe('Envoyer le lien')
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })

  it.each([
    [
      429,
      '60',
      'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans 1 minute.',
    ],
    [
      429,
      '600',
      'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans 10 minutes.',
    ],
    [
      429,
      '90',
      'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans 2 minutes.',
    ],
    [429, null, 'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie plus tard.'],
    [422, null, 'Cette adresse e-mail n’est pas valide. Vérifie-la, puis réessaie.'],
    [500, null, 'Le serveur est injoignable. Aucun lien n’est parti. Réessaie dans un instant.'],
  ])('explique un refus de l’API (%i, Retry-After %s)', async (status, retryAfter, expected) => {
    stubApi({
      [send]: () =>
        json(
          { error: { message: 'x' } },
          { status, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } },
        ),
    })
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')
    await wrapper.find('input').setValue('a@example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(expected)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('button[type=submit]').text()).toBe('Envoyer le lien')
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })

  it('signale un serveur injoignable (réseau coupé) et laisse réessayer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const { wrapper } = await mountView(ForgotPasswordView, '/mot-de-passe-oublie')
    await wrapper.find('input').setValue('a@example.com')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Aucun lien n’est parti. Réessaie dans un instant.',
    )
    expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
  })
})

describe('ResetPasswordView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const path = '/mot-de-passe-oublie/confirmation?token=le-secret'
  const fill = async (
    wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'],
    a: string,
    b = a,
  ) => {
    const [password, confirmation] = wrapper.findAll('input')
    await password!.setValue(a)
    await confirmation!.setValue(b)
  }

  it('demande deux fois le nouveau mot de passe, avec un seul bouton, sans appeler l’API', async () => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ResetPasswordView, path)

    expect(wrapper.find('h1').text()).toBe('Choisis un nouveau mot de passe')
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      expect(input.attributes('type')).toBe('password')
      expect(input.attributes('autocomplete')).toBe('new-password')
    }
    expect(wrapper.text()).toContain('Nouveau mot de passe')
    expect(wrapper.text()).toContain('Confirme ton mot de passe')
    expect(wrapper.text()).toContain('8 caractères au moins.')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.find('button[type=submit]').text()).toBe('Enregistrer mon mot de passe')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enregistre avec le secret du lien, puis renvoie à la connexion avec la bonne nouvelle', async () => {
    const fetchMock = stubApi({ [confirm]: sent204 })
    const { wrapper, router } = await mountView(ResetPasswordView, path)

    await fill(wrapper, 'un nouveau mot de passe')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([confirm])
    expect(await bodyOf(fetchMock, 0)).toEqual({
      token: 'le-secret',
      password: 'un nouveau mot de passe',
    })
    // Aucune connexion automatique : le seul appel est la confirmation
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query).toEqual({ 'mot-de-passe': 'change' })
  })

  it('refuse un mot de passe de moins de 8 caractères sous le champ, sans appeler l’API', async () => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ResetPasswordView, path)

    await fill(wrapper, '1234567')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ton mot de passe doit avoir 8 caractères au moins.')
    const [password] = wrapper.findAll('input')
    expect(password!.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(password!.element)
  })

  it('accepte 8 caractères exactement', async () => {
    const fetchMock = stubApi({ [confirm]: sent204 })
    const { wrapper } = await mountView(ResetPasswordView, path)

    await fill(wrapper, '12345678')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock)).toEqual([confirm])
  })

  it('refuse deux mots de passe différents sous le second champ, sans appeler l’API', async () => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ResetPasswordView, path)

    await fill(wrapper, 'un nouveau mot de passe', 'un autre mot de passe')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Les deux mots de passe ne sont pas les mêmes.')
    const [, confirmation] = wrapper.findAll('input')
    expect(confirmation!.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(confirmation!.element)
  })

  it('efface le message d’un champ dès qu’on le corrige', async () => {
    stubApi({})
    const { wrapper } = await mountView(ResetPasswordView, path)
    await fill(wrapper, 'court')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    // Une seule phrase à la fois : le message remplace l'aide « 8 caractères au moins. »
    expect(wrapper.text().match(/8 caractères au moins/g)).toHaveLength(1)

    await wrapper.findAll('input')[0]!.setValue('un mot de passe assez long')

    expect(wrapper.text()).not.toContain('Ton mot de passe doit avoir')
    expect(wrapper.text()).toContain('8 caractères au moins.')
  })

  it('montre la page d’erreur quand le lien est inconnu, déjà utilisé ou expiré (422)', async () => {
    stubApi({ [confirm]: invalidToken })
    const { wrapper } = await mountView(ResetPasswordView, path)
    await fill(wrapper, 'un nouveau mot de passe')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Ce lien ne marche plus')
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Il a déjà servi, ou il a expiré. Ton mot de passe n’a pas changé.',
    )
    expect(wrapper.find('input').exists()).toBe(false)
    const newLink = wrapper.find('a[href="/mot-de-passe-oublie"]')
    expect(newLink.text()).toBe('Demander un nouveau lien')
    expect(wrapper.find('a[href="/connexion"]').text()).toBe('Retour à la connexion')
  })

  it.each([
    ['sans secret dans l’adresse', '/mot-de-passe-oublie/confirmation'],
    ['avec un secret vide', '/mot-de-passe-oublie/confirmation?token='],
    [
      'avec un secret plus long que le contrat ne le permet',
      `/mot-de-passe-oublie/confirmation?token=${'a'.repeat(257)}`,
    ],
  ])('montre la même page d’erreur %s, sans appeler l’API', async (_name, address) => {
    const fetchMock = stubApi({})
    const { wrapper } = await mountView(ResetPasswordView, address)
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('h1').text()).toBe('Ce lien ne marche plus')
    expect(wrapper.find('a[href="/mot-de-passe-oublie"]').text()).toBe('Demander un nouveau lien')
  })

  it('explique le refus du mot de passe par le back (422 de validation) sous le champ, lien conservé', async () => {
    let attempts = 0
    const fetchMock = stubApi({
      [confirm]: () => {
        attempts += 1

        return attempts === 1
          ? json({ error: { message: 'password: trop court' } }, { status: 422 })
          : sent204()
      },
    })
    const { wrapper } = await mountView(ResetPasswordView, path)
    await fill(wrapper, 'un nouveau mot de passe')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Choisis un nouveau mot de passe')
    expect(wrapper.text()).toContain(
      'Ce mot de passe n’est pas accepté. Choisis-en un autre, de 8 caractères au moins.',
    )
    expect(wrapper.findAll('input')[0]!.attributes('aria-invalid')).toBe('true')

    // Le lien n'est pas consommé : un autre mot de passe passe avec le même secret
    await wrapper.findAll('input')[0]!.setValue('un autre mot de passe')
    await wrapper.findAll('input')[1]!.setValue('un autre mot de passe')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await bodyOf(fetchMock, 1)).toEqual({
      token: 'le-secret',
      password: 'un autre mot de passe',
    })
  })

  it.each([
    [
      429,
      '600',
      'Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie dans 10 minutes.',
    ],
    [
      429,
      '60',
      'Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie dans 1 minute.',
    ],
    [
      429,
      null,
      'Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie plus tard.',
    ],
    [
      500,
      null,
      'Le serveur est injoignable. Ton mot de passe n’a pas changé. Réessaie dans un instant.',
    ],
  ])(
    'garde le formulaire rempli sur un refus passager (%i, Retry-After %s)',
    async (status, retryAfter, expected) => {
      stubApi({
        [confirm]: () =>
          json(
            { error: { message: 'x' } },
            { status, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } },
          ),
      })
      const { wrapper } = await mountView(ResetPasswordView, path)
      await fill(wrapper, 'un nouveau mot de passe')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(expected)
      expect(wrapper.findAll('input')).toHaveLength(2)
      expect((wrapper.findAll('input')[0]!.element as HTMLInputElement).value).toBe(
        'un nouveau mot de passe',
      )
      expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined()
    },
  )

  it('signale un serveur injoignable (réseau coupé) sans perdre la saisie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const { wrapper } = await mountView(ResetPasswordView, path)
    await fill(wrapper, 'un nouveau mot de passe')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Ton mot de passe n’a pas changé. Réessaie dans un instant.',
    )
    expect(wrapper.findAll('input')).toHaveLength(2)
  })
})

// Les textes de ces écrans suivent `docs/drive/principes-produit.md` (§ 3) : des phrases de 15 mots au plus. Le tutoiement, le glossaire et
// l'absence d'avertissement sont gardés par `voice-and-glossary.spec.ts`, qui lit ces groupes.
describe('les textes du mot de passe oublié', () => {
  const sentences = (text: string) =>
    text
      .split(/\s*\|\s*|(?<=[.?!])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence !== '')
  const words = (sentence: string) => sentence.replace(/\{[a-z]+\}/g, 'x').split(/\s+/).length

  const groups: [string, Record<string, string>][] = [
    ['forgotPassword', fr.forgotPassword],
    ['resetPassword', fr.resetPassword],
    [
      'login',
      { forgotPassword: fr.login.forgotPassword, passwordChanged: fr.login.passwordChanged },
    ],
  ]

  it.each(groups)('%s : chaque phrase tient en 15 mots au plus', (_name, texts) => {
    const tooLong = Object.entries(texts).flatMap(([key, text]) =>
      sentences(text)
        .filter((sentence) => words(sentence) > 15)
        .map((sentence) => `${key} : « ${sentence} »`),
    )

    expect(tooLong).toEqual([])
  })
})

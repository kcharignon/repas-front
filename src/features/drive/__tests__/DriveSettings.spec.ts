import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import DriveSettingsView from '../DriveSettingsView.vue'
import { StoreReadError } from '../storeReader'

// La lecture par l'application n'est pas branchée : on la simule, comme le fera l'intégration.
const reader = vi.hoisted(() => ({
  can: vi.fn<() => boolean>(() => false),
  read: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../storeReader', async (original) => ({
  ...(await original<typeof import('../storeReader')>()),
  canReadStoreFromApp: reader.can,
  readStoreFromApp: reader.read,
}))

const base = 'https://exemple.leclercdrive.fr/magasin-123456-123456'
const stored = { id: '123456', label: null, baseUrl: base }
const settingsOf = (store: unknown = null, enabled = true) => ({
  enabled,
  retailer: 'leclerc',
  store,
})

const choice = (slug: string, over: object = {}) => ({
  ingredientSlug: slug,
  ingredientName: slug,
  haveAtHome: false,
  accepted: [],
  rejected: [],
  updatedAt: '2026-10-18T10:00:00+02:00',
  ...over,
})
const product = { productId: 'p', retailerProductId: '1', label: 'Farine', content: null }
const choices = [
  choice('farine', { accepted: [{ rank: 1, product }], rejected: [product] }),
  choice('beurre', { accepted: [{ rank: 1, product }] }),
  choice('sel', { haveAtHome: true }),
]

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}
const noContent = () => new Response(null, { status: 204 })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })

async function open(
  handlers: Parameters<typeof stubApi>[0] = {},
  path = '/drive/reglages',
  settings: unknown = settingsOf(stored),
) {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/drive/settings': () => json(settings),
    'GET /api/v1/drive/choices': () => json({ member: choices, totalItems: choices.length }),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(DriveSettingsView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  await flushPromises()

  return { wrapper, context, fetchMock }
}

type Wrapper = Awaited<ReturnType<typeof open>>['wrapper']
const field = (wrapper: Wrapper, label: string) =>
  wrapper
    .findAll('label')
    .find((candidate) => candidate.text() === label)
    ?.attributes('for')
const type = async (wrapper: Wrapper, label: string, value: string) =>
  wrapper.find(`#${CSS.escape(field(wrapper, label) ?? '')}`).setValue(value)
const submit = async (wrapper: Wrapper) => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => reader.can.mockReturnValue(false))
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'repasNative')
  document.body.innerHTML = ''
  window.dispatchEvent(new Event('online'))
  reader.read.mockReset()
})

describe('réglages du drive : le drive coupé ou illisible', () => {
  it('dit que la fonction n’est pas activée et ne propose rien d’autre', async () => {
    const { wrapper } = await open({}, '/drive/reglages', settingsOf(null, false))

    expect(wrapper.text()).toContain('L’envoi au drive n’est pas encore activé')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.findAll('section')).toHaveLength(0)
  })

  it('dit quand la lecture échoue', async () => {
    const { wrapper } = await open({ 'GET /api/v1/drive/settings': failure(500, 'boom') })

    expect(wrapper.find('[role="alert"]').text()).toContain('Le serveur est injoignable')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

describe('réglages du drive : le magasin', () => {
  it('sans magasin : « aucun magasin », le motif de l’envoi et un formulaire vide', async () => {
    const { wrapper } = await open({}, '/drive/reglages?magasin=requis', settingsOf(null))

    expect(wrapper.text()).toContain('Aucun magasin enregistré.')
    expect(wrapper.text()).toContain(
      'Choisissez d’abord votre magasin pour envoyer une liste au drive.',
    )
    expect(
      wrapper.find(`#${CSS.escape(field(wrapper, 'Adresse de votre magasin') ?? '')}`).element,
    ).toHaveProperty('value', '')
    expect(wrapper.text()).toContain('Vous n’avez pas encore enregistré votre magasin')
  })

  it('montre « Magasin …456 » faute de nom, et le nom s’il existe', async () => {
    const noName = await open()
    expect(noName.wrapper.text()).toContain('Magasin …456')
    expect(noName.wrapper.text()).not.toContain('Aucun magasin')
    noName.wrapper.unmount()

    const named = await open({}, '/drive/reglages', settingsOf({ ...stored, label: 'Ville-Test' }))
    expect(named.wrapper.find('#store-title + div p').text()).toContain('Ville-Test')
    expect(named.wrapper.text()).toContain('Magasin …456')
  })

  it('enregistre l’adresse (ramenée à l’adresse de base) et le nom, puis retire le motif de l’envoi', async () => {
    const { wrapper, fetchMock, context } = await open(
      { 'PUT /api/v1/drive/settings': noContent },
      '/drive/reglages?magasin=requis',
      settingsOf(null),
    )

    await type(wrapper, 'Adresse de votre magasin', `  ${base}/accueil?x=1 `)
    await type(wrapper, 'Nom de votre magasin (facultatif)', ' Ville-Test ')
    await submit(wrapper)

    const index = fetchMock.mock.calls.findIndex(([input]) => (input as Request).method === 'PUT')
    expect(await bodyOf(fetchMock, index)).toEqual({
      retailer: 'leclerc',
      store: { id: '123456', baseUrl: base, label: 'Ville-Test' },
    })
    expect(useNotificationsStore().items.map((item) => item.text)).toContain('Magasin enregistré.')
    await vi.waitFor(() => expect(context.router.currentRoute.value.query.magasin).toBeUndefined())
    // Le magasin enregistré, les réglages et les produits sont relus
    expect(
      calls(fetchMock).filter((call) => call === 'GET /api/v1/drive/settings').length,
    ).toBeGreaterThan(1)
  })

  it('enregistre un magasin sans nom : le nom est vide (null)', async () => {
    const { wrapper, fetchMock } = await open({ 'PUT /api/v1/drive/settings': noContent })

    await type(wrapper, 'Nom de votre magasin (facultatif)', '   ')
    await submit(wrapper)

    const index = fetchMock.mock.calls.findIndex(([input]) => (input as Request).method === 'PUT')
    expect(await bodyOf(fetchMock, index)).toMatchObject({ store: { id: '123456', label: null } })
  })

  it('refuse tout de suite une adresse qui n’est pas celle d’un magasin', async () => {
    const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(null))

    await type(wrapper, 'Adresse de votre magasin', 'https://exemple.example.com/magasin-1-1')
    await submit(wrapper)

    expect(wrapper.text()).toContain('Cette adresse n’est pas celle d’un magasin Leclerc Drive')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/settings')
  })

  it('affiche le refus du back (422)', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/drive/settings': failure(422, 'DRIVE_STORE_INVALID'),
    })

    await submit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'Cette adresse n’est pas celle d’un magasin',
    )
    expect(useNotificationsStore().items).toHaveLength(0)
  })

  it('prévient quand l’adresse saisie est celle d’un autre magasin', async () => {
    const { wrapper } = await open()
    expect(wrapper.text()).not.toContain('C’est un autre magasin')

    await type(
      wrapper,
      'Adresse de votre magasin',
      'https://exemple.leclercdrive.fr/magasin-999000-999000',
    )

    expect(wrapper.text()).toContain('C’est un autre magasin')
  })

  it('sans réseau : lecture seule, enregistrement impossible', async () => {
    const { wrapper } = await open()

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(wrapper.text()).toContain('Hors connexion')
    const save = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Enregistrer mon magasin')
    expect(save?.attributes('disabled')).toBeDefined()
  })
})

describe('réglages du drive : la lecture du magasin par l’application', () => {
  const readButton = (wrapper: Wrapper) =>
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Lire mon magasin dans l’application')

  it('n’affiche pas le bouton tant que la lecture n’est pas branchée', async () => {
    const { wrapper } = await open()

    expect(readButton(wrapper)).toBeUndefined()
  })

  it('remplit l’adresse avec le magasin lu, sans garder le nom d’un autre magasin', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue({
      id: '999000',
      baseUrl: 'https://autre.leclercdrive.fr/magasin-999000-999000',
      label: null,
    })
    const { wrapper } = await open(
      {},
      '/drive/reglages',
      settingsOf({ ...stored, label: 'Ville-Test' }),
    )

    await readButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Magasin …000 lu dans l’application')
    const address = wrapper.find(`#${CSS.escape(field(wrapper, 'Adresse de votre magasin') ?? '')}`)
    expect((address.element as HTMLInputElement).value).toBe(
      'https://autre.leclercdrive.fr/magasin-999000-999000',
    )
    const name = wrapper.find(
      `#${CSS.escape(field(wrapper, 'Nom de votre magasin (facultatif)') ?? '')}`,
    )
    expect((name.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('C’est un autre magasin')
  })

  it('garde le nom quand c’est le même magasin', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue({ id: '123456', baseUrl: base })
    const { wrapper } = await open(
      {},
      '/drive/reglages',
      settingsOf({ ...stored, label: 'Ville-Test' }),
    )

    await readButton(wrapper)?.trigger('click')
    await flushPromises()

    const name = wrapper.find(
      `#${CSS.escape(field(wrapper, 'Nom de votre magasin (facultatif)') ?? '')}`,
    )
    expect((name.element as HTMLInputElement).value).toBe('Ville-Test')
  })

  it.each([
    ['CANCELLED', 'Aucun magasin choisi'],
    ['NOT_FOUND', 'n’a pas trouvé de magasin'],
    ['UNAVAILABLE', 'ne peut pas lire votre magasin'],
    ['FAILED', 'La lecture a échoué'],
  ] as const)('dit pourquoi la lecture a échoué (%s)', async (code, text) => {
    reader.can.mockReturnValue(true)
    reader.read.mockRejectedValue(new StoreReadError(code))
    const { wrapper } = await open()

    await readButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain(text)
  })

  it('refuse un magasin lu dont l’adresse ne convient pas', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue({ id: '1', baseUrl: 'https://exemple.example.com/magasin-1-1' })
    const { wrapper } = await open()

    await readButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('La lecture a échoué')
  })

  it('traite une erreur inattendue comme un échec', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockRejectedValue(new Error('boom'))
    const { wrapper } = await open()

    await readButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('La lecture a échoué')
  })
})

describe('réglages du drive : l’application et les produits', () => {
  it('hors de l’application, propose de l’installer et mène à l’aide', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Vous utilisez Repas dans un navigateur')
    expect(wrapper.find('a[href="/drive/aide"]').text()).toBe('Aide d’installation')
  })

  it('dans l’application, montre sa version et que le drive est prêt', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info')
        reply({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true })
    })
    Object.assign(globalThis, { repasNative: native.bridge })
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Version 0.5.0'))

    expect(wrapper.text()).toContain('Le drive est prêt dans cette application.')
    expect(wrapper.text()).not.toContain('navigateur')
  })

  it('dans une application dont le drive ne peut pas fonctionner, demande de la mettre à jour', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info')
        reply({ v: 1, type: 'app.info', version: '0.1.0', versionCode: 1, drive: false })
    })
    Object.assign(globalThis, { repasNative: native.bridge })
    const { wrapper } = await open()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Version 0.1.0'))
    expect(wrapper.text()).toContain('mettez-la à jour')
  })

  it('dit quand l’application ne répond pas comme prévu', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info') reply({ v: 1, type: 'error', code: 'UNSUPPORTED' })
    })
    Object.assign(globalThis, { repasNative: native.bridge })
    const { wrapper } = await open()

    await vi.waitFor(() => expect(wrapper.text()).toContain('L’application ne répond pas'))
  })

  it('résume les produits mémorisés et mène à leur gestion', async () => {
    const { wrapper } = await open()

    const summary = wrapper.findAll('dd').map((value) => value.text())
    // Avec produits : farine et beurre ; avec refusés : farine ; « j'en ai toujours » : sel
    expect(summary).toEqual(['2', '1', '1'])
    expect(wrapper.find('a[href="/drive/produits"]').text()).toBe('Gérer mes produits')
  })

  it('sans magasin, ne lit pas les produits', async () => {
    const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(null))

    expect(calls(fetchMock)).not.toContain('GET /api/v1/drive/choices')
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.find('a[href="/drive/produits"]').exists()).toBe(true)
  })

  it('dit quand les produits ne se lisent pas', async () => {
    const { wrapper } = await open({ 'GET /api/v1/drive/choices': failure(500, 'boom') })

    expect(wrapper.find('#products-title ~ div [role="alert"]').text()).toContain('injoignable')
  })
})

describe('réglages du drive : la note de vie privée', () => {
  it('s’affiche au-dessus de la section du magasin et mène à la note complète de l’aide', async () => {
    const { wrapper, context } = await open()

    const note = wrapper.find('#drive-privacy-note-title')
    const store = wrapper.find('#store-title')
    expect(note.text()).toBe('Votre vie privée')
    expect(
      note.element.compareDocumentPosition(store.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const link = wrapper.find('a[href="/drive/aide#vie-privee"]')
    expect(link.text()).toBe('Lisez la note complète')
    await link.trigger('click')
    // La page d'aide se charge à la demande : on attend la fin de la navigation
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-help'))
    expect(context.router.currentRoute.value.hash).toBe('#vie-privee')
  })

  it('reste là sans magasin enregistré (avant la première activation), mais pas quand le drive est coupé', async () => {
    const empty = await open({}, '/drive/reglages', settingsOf(null))
    expect(empty.wrapper.find('#drive-privacy-note-title').exists()).toBe(true)
    document.body.innerHTML = ''

    const off = await open({}, '/drive/reglages', settingsOf(null, false))
    expect(off.wrapper.find('#drive-privacy-note-title').exists()).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, rateLimited, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import DriveSettingsView from '../DriveSettingsView.vue'
import { StoreReadError } from '../storeReader'

// La lecture par l'application (storeReader, testé à part avec un faux pont) est simulée ici : on éprouve l'écran.
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
/** Un faux back qui se souvient du magasin qu'on lui écrit, comme le vrai : les réglages relus après l'écriture le montrent. */
function rememberingStore(initial: unknown = null) {
  let saved = initial

  return {
    'GET /api/v1/drive/settings': () => json(settingsOf(saved)),
    'PUT /api/v1/drive/settings': async (request: Request) => {
      saved = ((await request.clone().json()) as { store: unknown }).store

      return noContent()
    },
  }
}

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
  it('sans magasin : « aucun magasin », la saisie à la main et un formulaire vide', async () => {
    const { wrapper } = await open({}, '/drive/reglages', settingsOf(null))

    expect(wrapper.find('h1').text()).toBe('Réglages du drive')
    expect(wrapper.text()).toContain('Aucun magasin enregistré.')
    expect(wrapper.text()).not.toContain('Choisis ton magasin')
    expect(
      wrapper.find(`#${CSS.escape(field(wrapper, 'Adresse de ton magasin') ?? '')}`).element,
    ).toHaveProperty('value', '')
    expect(wrapper.text()).toContain('Tu n’as pas encore enregistré ton magasin')
  })

  it('envoyé ici faute de magasin : « Choisis ton magasin » et rien d’autre à décider (DRV-622)', async () => {
    const { wrapper } = await open(
      {},
      '/drive/reglages?magasin=requis&retour=liste',
      settingsOf(null),
    )

    expect(wrapper.find('h1').text()).toBe('Choisis ton magasin')
    expect(wrapper.text()).toContain(
      'Pour envoyer ta liste, Repas doit connaître ton magasin Leclerc.',
    )
    // Pas de réglage à côté : ni l'application, ni les produits, ni note de vie privée (DRV-628)
    expect(wrapper.text()).not.toContain('Application Repas')
    expect(wrapper.text()).not.toContain('Produits dont Repas se souvient')
    expect(wrapper.find('#drive-privacy-note-title').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('vie privée')
    // Le retour mène à la liste, pas à « Moi »
    expect(wrapper.find('a[href="/liste"]').text()).toBe('Retour à la liste')
    expect(wrapper.find('a[href="/moi"]').exists()).toBe(false)
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

    await type(wrapper, 'Adresse de ton magasin', `  ${base}/accueil?x=1 `)
    await type(wrapper, 'Nom de ton magasin (facultatif)', ' Ville-Test ')
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

    await type(wrapper, 'Nom de ton magasin (facultatif)', '   ')
    await submit(wrapper)

    const index = fetchMock.mock.calls.findIndex(([input]) => (input as Request).method === 'PUT')
    expect(await bodyOf(fetchMock, index)).toMatchObject({ store: { id: '123456', label: null } })
  })

  it('refuse tout de suite une adresse qui n’est pas celle d’un magasin', async () => {
    const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(null))

    await type(wrapper, 'Adresse de ton magasin', 'https://exemple.example.com/magasin-1-1')
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

  it('trop d’écritures (429) : le dit à côté du formulaire, sans notification, et laisse réessayer', async () => {
    let limited = true
    const { wrapper, fetchMock } = await open({
      'PUT /api/v1/drive/settings': () =>
        limited ? rateLimited(1)() : new Response(null, { status: 204 }),
    })

    await submit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(useNotificationsStore().items).toHaveLength(0)
    expect(calls(fetchMock).filter((call) => call === 'PUT /api/v1/drive/settings')).toHaveLength(1)

    limited = false
    await submit(wrapper)

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(calls(fetchMock).filter((call) => call === 'PUT /api/v1/drive/settings')).toHaveLength(2)
  })

  it('prévient quand l’adresse saisie est celle d’un autre magasin', async () => {
    const { wrapper } = await open()
    expect(wrapper.text()).not.toContain('Ce n’est pas ton magasin actuel')

    await type(
      wrapper,
      'Adresse de ton magasin',
      'https://exemple.leclercdrive.fr/magasin-999000-999000',
    )

    expect(wrapper.text()).toContain(
      'Ce n’est pas ton magasin actuel. Les produits habituels de l’ancien magasin ne seront plus proposés. Tu les choisiras de nouveau.',
    )
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

describe('réglages du drive : la lecture du magasin par l’application (un seul geste, DRV-623)', () => {
  const button = (wrapper: Wrapper, name: string) =>
    wrapper.findAll('button').find((candidate) => candidate.text() === name)
  const body = () => document.body
  const dialogButton = (name: string) =>
    [...body().querySelectorAll('[role="dialog"] button')].find(
      (candidate) => candidate.textContent.trim() === name,
    ) as HTMLButtonElement | undefined
  const puts = (fetchMock: ReturnType<typeof stubApi>) =>
    fetchMock.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === 'PUT')
  const found = (id: string, host = 'exemple') => ({
    id,
    baseUrl: `https://${host}.leclercdrive.fr/magasin-${id}-${id}`,
    label: null,
  })

  it('n’affiche pas le bouton tant que la lecture n’est pas branchée, et laisse la saisie ouverte', async () => {
    const { wrapper } = await open()

    expect(button(wrapper, 'Lire mon magasin dans l’application')).toBeUndefined()
    expect(button(wrapper, 'Changer de magasin')).toBeUndefined()
    // Sans l'application, la saisie est le seul moyen : elle n'est pas repliée
    expect(wrapper.find('details').attributes('open')).toBeDefined()
  })

  it('avec l’application : la saisie à la main est repliée sous « Saisir l’adresse à la main »', async () => {
    reader.can.mockReturnValue(true)
    const { wrapper } = await open({}, '/drive/reglages', settingsOf(null))

    expect(wrapper.find('details summary').text()).toBe('Saisir l’adresse à la main')
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    // Elle garde son bouton
    expect(wrapper.find('details form').text()).toContain('Enregistrer mon magasin')
  })

  it('premier enregistrement : le magasin lu est enregistré tout seul, sans « Enregistrer mon magasin »', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper, fetchMock } = await open(
      rememberingStore(),
      '/drive/reglages',
      settingsOf(null),
    )

    await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
    await flushPromises()

    expect(puts(fetchMock)).toHaveLength(1)
    expect(
      await bodyOf(
        fetchMock,
        fetchMock.mock.calls.findIndex(([i]) => (i as Request).method === 'PUT'),
      ),
    ).toEqual({
      retailer: 'leclerc',
      store: {
        id: '999000',
        baseUrl: 'https://exemple.leclercdrive.fr/magasin-999000-999000',
        label: null,
      },
    })
    expect(wrapper.text()).toContain('Magasin …000 enregistré.')
    expect(wrapper.text()).not.toContain('Vérifie, puis enregistre')
    // Le même geste, désormais, sert à changer de magasin
    expect(button(wrapper, 'Changer de magasin')).toBeDefined()
    expect(button(wrapper, 'Lire mon magasin dans l’application')).toBeUndefined()
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('envoyé ici faute de magasin : « Choisir mon magasin » lit et enregistre, puis rend la liste à sa confirmation', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper, fetchMock, context } = await open(
      rememberingStore(),
      '/drive/reglages?magasin=requis&retour=liste',
      settingsOf(null),
    )
    expect(button(wrapper, 'Lire mon magasin dans l’application')).toBeUndefined()

    await button(wrapper, 'Choisir mon magasin')?.trigger('click')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('shopping-list'))

    expect(puts(fetchMock)).toHaveLength(1)
    expect(context.router.currentRoute.value.query).toEqual({ envoyer: '1' })
    expect(useNotificationsStore().items.map((item) => item.text)).toContain(
      'Magasin …000 enregistré.',
    )
  })

  it('venu de l’écran de l’envoi d’une liste déjà envoyée : le magasin enregistré, on y retourne', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper, context } = await open(
      rememberingStore(),
      '/drive/reglages?magasin=requis&retour=envoi&liste=l1',
      settingsOf(null),
    )
    expect(wrapper.find('a[href="/listes/l1"]').text()).toBe('Retour à la liste')

    await button(wrapper, 'Choisir mon magasin')?.trigger('click')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-send'))

    expect(context.router.currentRoute.value.params.listId).toBe('l1')
    // L'envoi attendait le magasin : une fois enregistré, l'écran d'envoi ouvre le drive sans redemander
    expect(context.router.currentRoute.value.query.ouvrir).toBe('1')
  })

  it('le même magasin relu : rien n’est écrit, aucun écran de plus', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue({ id: '123456', baseUrl: base, label: null })
    const { wrapper, fetchMock } = await open(
      {},
      '/drive/reglages',
      settingsOf({ ...stored, label: 'Ville-Test' }),
    )

    await button(wrapper, 'Changer de magasin')?.trigger('click')
    await flushPromises()

    expect(puts(fetchMock)).toHaveLength(0)
    expect(wrapper.text()).toContain('Magasin …456 enregistré.')
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('rejoué : le même résultat reçu deux fois n’enregistre qu’une fois', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper, fetchMock } = await open(
      rememberingStore(),
      '/drive/reglages',
      settingsOf(null),
    )

    // Deux touches coup sur coup : la seconde est ignorée tant que la lecture n'est pas finie
    const read = button(wrapper, 'Lire mon magasin dans l’application')
    await read?.trigger('click')
    await read?.trigger('click')
    await flushPromises()
    expect(reader.read).toHaveBeenCalledTimes(1)
    // Puis le même magasin relu, une fois enregistré : rien de plus n'est écrit
    await button(wrapper, 'Changer de magasin')?.trigger('click')
    await flushPromises()

    expect(reader.read).toHaveBeenCalledTimes(2)
    expect(puts(fetchMock)).toHaveLength(1)
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('un autre magasin que celui qui est enregistré : confirmation explicite, rien n’est écrit avant', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000', 'autre'))
    const { wrapper, fetchMock } = await open(
      rememberingStore({ ...stored, label: 'Ville-Test' }),
      '/drive/reglages',
    )

    await button(wrapper, 'Changer de magasin')?.trigger('click')
    await vi.waitFor(() => expect(dialogButton('Changer de magasin')).toBeDefined())

    expect(puts(fetchMock)).toHaveLength(0)
    const dialog = body().querySelector('[role="dialog"]')?.textContent ?? ''
    expect(dialog).toContain('Utiliser le magasin …000 ?')
    expect(dialog).toContain(
      'Ce n’est pas ton magasin actuel. Les produits habituels de l’ancien magasin ne seront plus proposés. Tu les choisiras de nouveau.',
    )
    expect(dialogButton('Garder l’ancien')).toBeDefined()

    dialogButton('Changer de magasin')?.click()
    await vi.waitFor(() => expect(puts(fetchMock)).toHaveLength(1))
    // Le nom de l'ancien magasin ne suit pas
    expect(
      await bodyOf(
        fetchMock,
        fetchMock.mock.calls.findIndex(([i]) => (i as Request).method === 'PUT'),
      ),
    ).toEqual({
      retailer: 'leclerc',
      store: {
        id: '999000',
        baseUrl: 'https://autre.leclercdrive.fr/magasin-999000-999000',
        label: null,
      },
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …000 enregistré.'))
  })

  it('« Garder l’ancien » : rien n’est écrit, le magasin enregistré reste', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(stored))

    await button(wrapper, 'Changer de magasin')?.trigger('click')
    await vi.waitFor(() => expect(dialogButton('Garder l’ancien')).toBeDefined())
    dialogButton('Garder l’ancien')?.click()
    await vi.waitFor(() => expect(body().querySelector('[role="dialog"]')).toBeNull())

    expect(puts(fetchMock)).toHaveLength(0)
    expect(wrapper.text()).toContain('Magasin …456')
    expect(wrapper.text()).not.toContain('enregistré.')
  })

  it('une lecture refusée par le serveur (DRIVE_STORE_INVALID) : trois phrases, rien n’est enregistré', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper } = await open(
      { 'PUT /api/v1/drive/settings': failure(422, 'DRIVE_STORE_INVALID') },
      '/drive/reglages',
      settingsOf(null),
    )

    await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Repas n’a pas pu utiliser ce magasin. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
    )
    expect(wrapper.text()).toContain('Aucun magasin enregistré.')
    expect(wrapper.text()).not.toContain('enregistré.Changer')
    expect(button(wrapper, 'Lire mon magasin dans l’application')).toBeDefined()
    // La saisie à la main s'ouvre : le repli est à un geste
    expect(wrapper.find('details').attributes('open')).toBeDefined()
    expect(useNotificationsStore().items).toHaveLength(0)
  })

  it('un autre refus du serveur (429) : le dit sans rien enregistrer', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue(found('999000'))
    const { wrapper } = await open(
      { 'PUT /api/v1/drive/settings': rateLimited(1) },
      '/drive/reglages',
      settingsOf(null),
    )

    await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.',
    )
    expect(wrapper.text()).toContain('Aucun magasin enregistré.')
  })

  it.each([
    [
      'BUSY',
      'Un envoi au drive est déjà en cours dans l’application. Rien n’est enregistré. Termine-le ou abandonne-le, puis réessaie.',
    ],
    [
      'CANCELLED',
      'Aucun magasin choisi. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
    ],
    [
      'NOT_FOUND',
      'L’application n’a pas trouvé de magasin sur la page. Rien n’est enregistré. Choisis-en un sur le site du drive, puis réessaie.',
    ],
    [
      'UNAVAILABLE',
      'L’application ne peut pas lire ton magasin pour le moment. Rien n’est enregistré. Saisis son adresse à la main.',
    ],
    [
      'FAILED',
      'La lecture a échoué. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
    ],
  ] as const)(
    'dit pourquoi la lecture a échoué (%s), en trois phrases, sans rien enregistrer',
    async (code, text) => {
      reader.can.mockReturnValue(true)
      reader.read.mockRejectedValue(new StoreReadError(code))
      const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(null))

      await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toBe(text)
      expect(puts(fetchMock)).toHaveLength(0)
      expect(wrapper.find('details').attributes('open')).toBeDefined()
    },
  )

  it('refuse un magasin lu dont l’adresse ne convient pas', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockResolvedValue({ id: '1', baseUrl: 'https://exemple.example.com/magasin-1-1' })
    const { wrapper, fetchMock } = await open({}, '/drive/reglages', settingsOf(null))

    await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('La lecture a échoué')
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('traite une erreur inattendue comme un échec', async () => {
    reader.can.mockReturnValue(true)
    reader.read.mockRejectedValue(new Error('boom'))
    const { wrapper } = await open({}, '/drive/reglages', settingsOf(null))

    await button(wrapper, 'Lire mon magasin dans l’application')?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('La lecture a échoué')
  })

  it('sans réseau : la lecture ne se lance pas', async () => {
    reader.can.mockReturnValue(true)
    const { wrapper } = await open({}, '/drive/reglages', settingsOf(null))

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(
      button(wrapper, 'Lire mon magasin dans l’application')?.attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('Hors connexion')
  })
})

describe('réglages du drive : l’application et les produits', () => {
  it('hors de l’application, propose de l’installer et mène à l’aide', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Tu utilises Repas dans un navigateur')
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

    // Rien à faire : « prêt » n'est pas dit (DRV-628)
    expect(wrapper.text()).not.toContain('prêt')
    expect(wrapper.text()).not.toContain('navigateur')
    // Déjà installée : l'aide ne propose pas de l'installer, elle mène à la mise à jour
    const help = wrapper.find('a[href="/drive/aide#mise-a-jour"]')
    expect(help.text()).toBe('Mettre à jour l’application')
    expect(wrapper.text()).not.toContain('Aide d’installation')
  })

  it('dans une application dont le drive ne peut pas fonctionner, demande de la mettre à jour', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info')
        reply({ v: 1, type: 'app.info', version: '0.1.0', versionCode: 1, drive: false })
    })
    Object.assign(globalThis, { repasNative: native.bridge })
    const { wrapper } = await open()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Version 0.1.0'))
    expect(wrapper.text()).toContain('mets-la à jour')
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

  it('n’écrit jamais un compteur à zéro : seulement ce qui existe (DRV-628)', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/choices': () =>
        json({
          member: [
            {
              ingredientSlug: 'sel',
              ingredientName: 'Sel',
              haveAtHome: true,
              accepted: [],
              rejected: [],
            },
          ],
          totalItems: 1,
        }),
    })

    expect(wrapper.findAll('dd').map((value) => value.text())).toEqual(['1'])
    expect(wrapper.text()).toContain('J’en ai toujours')
    expect(wrapper.text()).not.toContain('Articles avec des produits')
    expect(wrapper.text()).not.toContain('à ne plus proposer')
  })

  it('sans aucun produit retenu, ne garde que le lien « Gérer mes produits »', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/choices': () => json({ member: [], totalItems: 0 }),
    })

    expect(wrapper.find('dl').exists()).toBe(false)
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

describe('réglages du drive : « Ton magasin » en premier (DRV-628)', () => {
  it('est le premier bloc, sans note de vie privée au-dessus ni lien vers les conditions', async () => {
    const { wrapper } = await open()

    // Le premier titre de section est « Ton magasin » : rien avant lui que le retour et le titre de la page
    expect(wrapper.find('h2').text()).toBe('Ton magasin')
    expect(wrapper.find('#drive-privacy-note-title').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('vie privée')
    expect(wrapper.text()).not.toContain('jamais')
    expect(wrapper.find('a[href="/drive/conditions"]').exists()).toBe(false)
  })

  it('reste ainsi sans magasin enregistré (avant la première activation)', async () => {
    const empty = await open({}, '/drive/reglages', settingsOf(null))

    expect(empty.wrapper.find('h2').text()).toBe('Ton magasin')
    expect(empty.wrapper.text()).not.toContain('vie privée')
  })

  it('ne dit rien du magasin au-delà de son nom : ni explication, ni mécanisme', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).not.toContain('Repas remplit le panier de ce magasin')
    expect(wrapper.text()).not.toContain('propres à ce magasin')
  })
})

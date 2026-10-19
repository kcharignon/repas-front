import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { fakeNative } from '@/features/drive/bridge/__tests__/fakeNative'
import ShoppingListDetailView from '@/features/shopping-lists/ShoppingListDetailView.vue'
import ShoppingListView from '@/features/shopping-lists/ShoppingListView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

type Status = 'ACTIVE' | 'SENT' | 'COMPLETED'

const detail = (status: Status = 'ACTIVE', rowCount = 2) => ({
  id: 'l1',
  name: 'Courses du week-end',
  displayName: 'Courses du week-end',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status,
  version: 7,
  isActive: status === 'ACTIVE',
  isPaused: false,
  isCompleted: status === 'COMPLETED',
  isSent: status === 'SENT',
  sentAt: status === 'SENT' ? '2026-10-15T18:30:00+02:00' : null,
  rowCount,
  recipeCount: 1,
  departments:
    rowCount === 0
      ? []
      : [
          {
            slug: 'divers',
            name: 'Divers',
            image: 'images/divers.png',
            rows: [
              { id: 'r1', ingredientName: 'Sel', quantity: 5, unitSymbol: 'g', checked: false },
              { id: 'r2', ingredientName: 'Farine', quantity: 1, unitSymbol: 'kg', checked: true },
            ],
          },
        ],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: 'images/plat.png',
      meals: [{ id: 'm1', recipeId: 'rec1', recipeName: 'Gratin', serving: 4 }],
    },
  ],
})

const none = { shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }
const store = {
  id: '123456',
  label: null,
  baseUrl: 'https://courses-test.leclercdrive.fr/magasin-123456-123456',
}
const settings = (enabled: boolean) => () => json({ enabled, retailer: 'leclerc', store })

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

const noContent = () => new Response(null, { status: 204 })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })

const body = () => document.body

const button = (label: string) =>
  [...body().querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === label)

const menuItem = (label: string) =>
  [...body().querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent.trim() === label,
  )

const menuItems = () =>
  [...body().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim())

/** Ouvre « ⋮ » (« Plus d'actions ») et attend l'action `label`. */
async function openMenu(label: string) {
  body().querySelector<HTMLButtonElement>('button[aria-label="Plus d’actions"]')?.click()
  await vi.waitFor(() => expect(menuItem(label)).toBeDefined())

  return menuItem(label) as HTMLElement
}

/** « ⋮ » puis l'action `label` du menu. */
const choose = async (label: string) => (await openMenu(label)).click()

/** Les actions visibles de la rangée : libellé, ou nom accessible pour « ⋮ ». */
const rowActions = () =>
  [
    ...body().querySelectorAll('[data-test="list-actions"] a, [data-test="list-actions"] button'),
  ].map((action) => action.getAttribute('aria-label') ?? action.textContent.trim())

const dialogButton = (label: string) =>
  [...body().querySelectorAll('[role="dialog"] button')].find(
    (candidate) => candidate.textContent.trim() === label,
  ) as HTMLButtonElement

const requests = (fetchMock: ReturnType<typeof stubApi>, method: string, suffix: string) =>
  fetchMock.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === method && request.url.endsWith(suffix))

async function signedIn() {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()

  return context
}

/**
 * Le faux pont de l'application Repas. `version` : celle qu'elle annonce à `app.info` ; `'silent'` : une ancienne application qui ne
 * répond pas ; `'held'` : elle répond quand le test appelle `release` ; `'browser'` : aucun pont (un navigateur ordinaire).
 */
let release: (() => void) | null = null
function installApp(version: string | 'silent' | 'held' | 'browser' = '1.0.0') {
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info' || version === 'silent') return
    const info = (number: string) =>
      reply({ v: 1, type: 'app.info', version: number, versionCode: 1, drive: true })
    // `held` : l'application répond quand le test le décide (une application à jour)
    if (version === 'held') release = () => info('1.0.0')
    else info(version)
  })
  if (version !== 'browser') (globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
  window.dispatchEvent(new Event('online'))
})

describe('liste envoyée au drive (page de la liste)', () => {
  const openSent = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists/l1': () => json(detail('SENT')),
      ...handlers,
    })
    const context = await signedIn()
    await context.router.push('/listes/l1')
    const wrapper = mount(ShoppingListDetailView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, context, fetchMock }
  }

  it('montre le statut et la date d’envoi, jamais « Terminée »', async () => {
    const { wrapper } = await openSent()

    expect(wrapper.find('header p').text()).toBe('Envoyée au drive le 15 octobre 2026')
    expect(wrapper.text()).not.toContain('Terminée')
    expect(wrapper.text()).toContain(
      'Cette liste est envoyée au drive : elle n’est plus modifiable.',
    )
  })

  it('n’affiche pas la progression des cases cochées : « 0 sur 6 articles dans le panier » contredirait « Le panier est rempli » (DRV-626)', async () => {
    const { wrapper } = await openSent()

    expect(wrapper.text()).not.toMatch(/articles dans le panier/)
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/\d+ %/)
  })

  it('l’affiche toujours sur une liste en cours (la liste se coche en magasin)', async () => {
    const { wrapper } = await openSent({
      'GET /api/v1/shopping-lists/l1': () => json(detail('ACTIVE')),
    })

    expect(wrapper.text()).toMatch(/\d+ sur \d+ articles dans le panier/)
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
  })

  it('ne propose que reprendre l’envoi, terminer, rouvrir et supprimer', async () => {
    const { wrapper } = await openSent()

    // Une rangée : la reprise de l'envoi, « Terminer », puis « ⋮ » qui range la réouverture et la suppression
    expect(rowActions()).toEqual(['Reprendre l’envoi', 'Terminer', 'Plus d’actions'])
    expect(wrapper.find('header a').attributes('href')).toBe('/drive/envoi/l1')
    await openMenu('Rouvrir la liste')
    expect(menuItems()).toEqual(['Rouvrir la liste', 'Supprimer'])
  })

  it('est en lecture seule : cases désactivées, pas de + ni de −, pas de retrait de recette', async () => {
    const { wrapper } = await openSent()

    const boxes = wrapper.findAll('[role="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect(boxes.every((box) => box.attributes('disabled') !== undefined)).toBe(true)
    // L'état coché est conservé : un envoi ne modifie jamais `checked`
    expect(boxes.map((box) => box.attributes('aria-checked'))).toEqual(['false', 'true'])

    await wrapper.findAll('[role="tab"]')[1]?.trigger('mousedown', { button: 0 })
    await flushPromises()
    expect(wrapper.text()).toContain('Gratin')
    expect(wrapper.find('button[aria-label^="Une personne"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Retirer"]').exists()).toBe(false)
  })

  it('rouvre la liste après confirmation, avec la version lue', async () => {
    const { fetchMock } = await openSent({
      'POST /api/v1/shopping-lists/l1/reopen': noContent,
    })

    await choose('Rouvrir la liste')
    await vi.waitFor(() => expect(body().textContent).toContain('La liste redevient modifiable.'))
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/reopen')
    dialogButton('Rouvrir la liste').click()
    await flushPromises()

    const [reopen] = requests(fetchMock, 'POST', '/reopen')
    expect(reopen?.headers.get('If-Match')).toBe('"7"')
  })

  it('propose « Rouvrir la liste » quand la fonction est coupée (DRIVE_ENABLED faux), et la rouvre', async () => {
    const { wrapper, fetchMock } = await openSent({
      'GET /api/v1/drive/settings': settings(false),
      'POST /api/v1/shopping-lists/l1/reopen': noContent,
    })

    expect(wrapper.find('header').exists()).toBe(true)
    expect(button('Envoyer au drive')).toBeUndefined()
    const item = await openMenu('Rouvrir la liste')
    expect(item.getAttribute('aria-disabled')).toBeNull()

    item.click()
    await vi.waitFor(() => expect(dialogButton('Rouvrir la liste')).toBeDefined())
    dialogButton('Rouvrir la liste').click()
    await flushPromises()

    const [reopen] = requests(fetchMock, 'POST', '/reopen')
    expect(reopen?.headers.get('If-Match')).toBe('"7"')
  })

  it('rouvre puis relit la liste, qui redevient modifiable', async () => {
    let reopened = false
    const { wrapper } = await openSent({
      'GET /api/v1/shopping-lists/l1': () => json(detail(reopened ? 'ACTIVE' : 'SENT')),
      'GET /api/v1/drive/settings': settings(false),
      'POST /api/v1/shopping-lists/l1/reopen': () => {
        reopened = true

        return noContent()
      },
    })

    await choose('Rouvrir la liste')
    await vi.waitFor(() => expect(dialogButton('Rouvrir la liste')).toBeDefined())
    dialogButton('Rouvrir la liste').click()

    await vi.waitFor(() => expect(wrapper.find('header p').text()).toBe('En cours'))
    expect(
      wrapper.findAll('[role="checkbox"]').some((box) => box.attributes('disabled') !== undefined),
    ).toBe(false)
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('termine une liste envoyée', async () => {
    const { fetchMock } = await openSent({
      'POST /api/v1/shopping-lists/l1/complete': noContent,
    })

    button('Terminer')?.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/complete')
  })

  it('désactive la réouverture sans réseau', async () => {
    await openSent()

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    const reopen = await openMenu('Rouvrir la liste')
    expect(reopen.getAttribute('aria-disabled')).toBe('true')
    reopen.click()
    await flushPromises()
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('dit qu’une liste n’est plus envoyée (409 SHOPPING_LIST_NOT_SENT) et la relit', async () => {
    const { fetchMock } = await openSent({
      'POST /api/v1/shopping-lists/l1/reopen': failure(409, 'SHOPPING_LIST_NOT_SENT'),
    })

    await choose('Rouvrir la liste')
    await vi.waitFor(() => expect(dialogButton('Rouvrir la liste')).toBeDefined())
    dialogButton('Rouvrir la liste').click()

    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvre la liste pour voir où elle en est.',
      ]),
    )
    await vi.waitFor(() =>
      expect(
        calls(fetchMock).filter((call) => call === 'GET /api/v1/shopping-lists/l1').length,
      ).toBeGreaterThan(1),
    )
  })
})

describe('liste en cours : envoi au drive (page /liste)', () => {
  const openActive = async (
    handlers: Parameters<typeof stubApi>[0] = {},
    list = detail('ACTIVE'),
    enabled = true,
    path = '/liste',
    app: Parameters<typeof installApp>[0] = '1.0.0',
  ) => {
    const native = installApp(app)
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists/active/summary': () =>
        json({ shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
      'GET /api/v1/shopping-lists/l1': () => json(list),
      'GET /api/v1/drive/settings': settings(enabled),
      ...handlers,
    })
    const context = await signedIn()
    await context.router.push(path)
    const wrapper = mount(ShoppingListView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, context, fetchMock, native }
  }

  it('propose « Envoyer au drive » quand la fonction est allumée et la liste non vide', async () => {
    await openActive()

    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())
  })

  it('une seule rangée : « Envoyer au drive » à gauche, « Terminer » à côté, le reste dans « ⋮ »', async () => {
    await openActive()
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    expect(rowActions()).toEqual(['Envoyer au drive', 'Terminer', 'Plus d’actions'])
    expect(button('Envoyer au drive')?.classList).toContain('bg-accent')
    expect(button('Terminer')?.classList).toContain('border-primary')
    expect(body().querySelectorAll('[data-test="list-actions"]')).toHaveLength(1)
    await openMenu('Renommer')
    expect(menuItems()).toEqual(['Renommer', 'Mettre en pause', 'Supprimer'])
  })

  it.each([
    ['dans un navigateur', 'browser' as const, true],
    ['drive coupé', '1.0.0' as const, false],
  ])(
    'sans « Envoyer au drive » (%s), « Terminer » devient l’action principale',
    async (_case, app, enabled) => {
      const { fetchMock } = await openActive({}, detail('ACTIVE'), enabled, '/liste', app)
      await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/drive/settings'))
      await flushPromises()

      expect(rowActions()).toEqual(['Terminer', 'Plus d’actions'])
      expect(button('Terminer')?.classList).toContain('bg-primary')
      await openMenu('Renommer')
      expect(menuItems()).toEqual(['Renommer', 'Mettre en pause', 'Supprimer'])
    },
  )

  it('« Terminer » à côté de l’envoi termine la liste', async () => {
    const { fetchMock } = await openActive({
      'POST /api/v1/shopping-lists/l1/complete': noContent,
    })
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Terminer')?.click()

    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/complete'),
    )
  })

  const fromMenu = async (label: string) => {
    const opened = await openActive({ 'POST /api/v1/shopping-lists/l1/pause': noContent })
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())
    await choose(label)

    return opened
  }

  it('« Mettre en pause » du menu met la liste en pause', async () => {
    const { fetchMock } = await fromMenu('Mettre en pause')

    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/pause'),
    )
  })

  it('« Renommer » du menu ouvre le renommage, avec le nom actuel', async () => {
    await fromMenu('Renommer')

    await vi.waitFor(() =>
      expect(body().querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe(
        'Courses du week-end',
      ),
    )
  })

  it('« Supprimer » du menu ouvre la confirmation qui existait, sans rien supprimer avant elle', async () => {
    const { fetchMock } = await fromMenu('Supprimer')

    await vi.waitFor(() => expect(body().textContent).toContain('Supprimer la liste ?'))
    expect(calls(fetchMock).some((request) => request.startsWith('DELETE'))).toBe(false)
  })

  describe('quand « Terminer » ne tient pas sur la rangée (320 px, grands caractères)', () => {
    // jsdom ne fait aucune mise en page : « Terminer » est placé sur une deuxième ligne, cachée par la rangée
    const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!
    afterEach(() => Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTop))

    it('il est caché de la rangée et passe en tête de « ⋮ », d’où il termine la liste', async () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get(this: HTMLElement) {
          return this.textContent.trim() === 'Terminer' && this.closest('[data-test]') ? 60 : 0
        },
      })
      const { fetchMock } = await openActive({
        'POST /api/v1/shopping-lists/l1/complete': noContent,
      })
      await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

      await vi.waitFor(() => expect(button('Terminer')?.classList).toContain('invisible'))
      await choose('Terminer')
      expect(menuItems()[0]).toBe('Terminer')

      await vi.waitFor(() =>
        expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/l1/complete'),
      )
    })
  })

  it('ne le propose pas dans un navigateur, où il ne pourrait rien faire (DRV-641)', async () => {
    const { fetchMock } = await openActive({}, detail('ACTIVE'), true, '/liste', 'browser')

    await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/drive/settings'))
    await flushPromises()
    expect(button('Envoyer au drive')).toBeUndefined()
    // Les autres actions d'une liste en cours restent là
    expect(button('Terminer')).toBeDefined()
  })

  it('dans un navigateur, ignore aussi la reprise « envoyer » : aucune confirmation, aucun envoi', async () => {
    const { fetchMock } = await openActive(
      {},
      detail('ACTIVE'),
      true,
      '/liste?envoyer=1',
      'browser',
    )
    await flushPromises()

    expect(body().querySelector('[role="dialog"]')).toBeNull()
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
  })

  it('ne le propose pas quand la fonction est coupée', async () => {
    const { fetchMock } = await openActive({}, detail('ACTIVE'), false)

    await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/drive/settings'))
    await flushPromises()
    expect(button('Envoyer au drive')).toBeUndefined()
  })

  it('ne le propose pas quand la liste est vide', async () => {
    await openActive({}, detail('ACTIVE', 0))
    await flushPromises()

    expect(button('Envoyer au drive')).toBeUndefined()
  })

  it('ne le propose pas quand les réglages ne se lisent pas', async () => {
    await openActive({ 'GET /api/v1/drive/settings': failure(500, 'boom') })
    await flushPromises()

    expect(button('Envoyer au drive')).toBeUndefined()
  })

  it('demande confirmation, enregistre l’envoi avec la version lue puis ouvre l’écran d’envoi', async () => {
    const { fetchMock, context } = await openActive({
      'POST /api/v1/shopping-lists/l1/send': noContent,
    })
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Envoyer au drive')?.click()
    await vi.waitFor(() =>
      expect(body().textContent).toContain(
        'La liste ne sera plus modifiable. Tu pourras la rouvrir.',
      ),
    )
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
    dialogButton('Envoyer au drive').click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-send'))

    const [send] = requests(fetchMock, 'POST', '/send')
    expect(send?.headers.get('If-Match')).toBe('"7"')
    expect(context.router.currentRoute.value.params.listId).toBe('l1')
  })

  const tooOldSentence = 'Mets à jour l’application pour envoyer ta liste.'

  it.each([['0.1.9'], ['0.0.9'], ['silent'], ['pas-une-version']])(
    'application %s : ni verrou ni confirmation, la phrase de mise à jour et son bouton (DRV-641)',
    async (app) => {
      const { fetchMock, context } = await openActive(
        { 'POST /api/v1/shopping-lists/l1/send': noContent },
        detail('ACTIVE'),
        true,
        '/liste',
        app,
      )
      await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

      button('Envoyer au drive')?.click()
      await vi.waitFor(() => expect(body().textContent).toContain(tooOldSentence), {
        timeout: 6000,
      })

      expect(body().textContent).not.toContain('La liste ne sera plus modifiable')
      const update = body().querySelector('[role="dialog"] a[href="/drive/aide"]')
      expect(update?.textContent.trim()).toBe('Mettre à jour')
      expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
      expect(context.router.currentRoute.value.name).not.toBe('drive-settings')
      // La liste reste modifiable : le bouton est de nouveau disponible
      await vi.waitFor(() => expect(button('Envoyer au drive')?.disabled).toBe(false))
    },
    10000,
  )

  it('pendant la lecture de la version, le bouton est grisé et rien n’est enregistré', async () => {
    const { fetchMock } = await openActive(
      { 'POST /api/v1/shopping-lists/l1/send': noContent },
      detail('ACTIVE'),
      true,
      '/liste',
      'held',
    )
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Envoyer au drive')?.click()
    await vi.waitFor(() => expect(button('Envoyer au drive')?.disabled).toBe(true))
    expect(body().querySelector('[role="dialog"]')).toBeNull()
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')

    release?.()
    await vi.waitFor(() => expect(body().textContent).toContain('La liste ne sera plus modifiable'))
    expect(button('Envoyer au drive')?.disabled).toBe(false)
  })

  it('application trop ancienne et aucun magasin : la phrase d’abord, les réglages jamais', async () => {
    const { context } = await openActive(
      { 'GET /api/v1/drive/settings': () => json({ enabled: true, retailer: 'leclerc' }) },
      detail('ACTIVE'),
      true,
      '/liste',
      '0.1.0',
    )
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Envoyer au drive')?.click()

    await vi.waitFor(() => expect(body().textContent).toContain(tooOldSentence))
    expect(context.router.currentRoute.value.name).toBe('shopping-list')
  })

  it('revenu des réglages avec une application trop ancienne : la phrase, pas de confirmation ni de verrou', async () => {
    const { fetchMock } = await openActive(
      { 'POST /api/v1/shopping-lists/l1/send': noContent },
      detail('ACTIVE'),
      true,
      '/liste?envoyer=1',
      '0.1.0',
    )

    await vi.waitFor(() => expect(body().textContent).toContain(tooOldSentence))
    expect(body().textContent).not.toContain('La liste ne sera plus modifiable')
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
  })

  it.each([['0.1.10'], ['0.2.0'], ['0.0.0-dev']])(
    'application %s : la confirmation, comme avant',
    async (app) => {
      const { fetchMock } = await openActive(
        { 'POST /api/v1/shopping-lists/l1/send': noContent },
        detail('ACTIVE'),
        true,
        '/liste',
        app,
      )
      await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

      button('Envoyer au drive')?.click()

      await vi.waitFor(() =>
        expect(body().textContent).toContain('La liste ne sera plus modifiable'),
      )
      expect(body().textContent).not.toContain(tooOldSentence)
      expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
    },
  )

  it('mène aux réglages du drive, sans confirmation, quand aucun magasin n’est enregistré', async () => {
    const { fetchMock, context } = await openActive({
      'GET /api/v1/drive/settings': () => json({ enabled: true, retailer: 'leclerc' }),
    })
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Envoyer au drive')?.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-settings'))

    // Le magasin est demandé en un geste, et l'écran du magasin sait quelle liste l'attend (DRV-622)
    expect(context.router.currentRoute.value.query).toEqual({ magasin: 'requis', retour: 'liste' })
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
  })

  it('revenu de l’écran du magasin, rouvre la confirmation de l’envoi sans retoucher « Envoyer au drive »', async () => {
    const { fetchMock, context } = await openActive(
      { 'POST /api/v1/shopping-lists/l1/send': noContent },
      detail('ACTIVE'),
      true,
      '/liste?envoyer=1',
    )

    await vi.waitFor(() => expect(dialogButton('Envoyer au drive')).toBeDefined())
    // La demande est consommée : un rechargement ne rouvre pas la confirmation
    await vi.waitFor(() => expect(context.router.currentRoute.value.query.envoyer).toBeUndefined())
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')

    dialogButton('Envoyer au drive').click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-send'))
    expect(requests(fetchMock, 'POST', '/send')).toHaveLength(1)
  })

  it('sans « envoyer » dans l’adresse, n’ouvre aucune confirmation tout seul', async () => {
    await openActive()
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())
    await flushPromises()

    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it('ne rouvre pas la confirmation d’une liste que le drive n’accepte pas (fonction coupée)', async () => {
    const { context } = await openActive({}, detail('ACTIVE'), false, '/liste?envoyer=1')
    await flushPromises()

    expect(body().querySelector('[role="dialog"]')).toBeNull()
    // Rien ne s'ouvre : la demande reste dans l'adresse, sans effet
    expect(context.router.currentRoute.value.query.envoyer).toBe('1')
  })

  it('désactive l’envoi sans réseau', async () => {
    await openActive()
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect(button('Envoyer au drive')?.disabled).toBe(true)
  })

  const send = async (handlers: Parameters<typeof stubApi>[0]) => {
    const opened = await openActive(handlers)
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())
    button('Envoyer au drive')?.click()
    await vi.waitFor(() => expect(dialogButton('Envoyer au drive')).toBeDefined())
    dialogButton('Envoyer au drive').click()

    return opened
  }

  it.each([
    [
      422,
      'SHOPPING_LIST_EMPTY',
      'La liste est vide : il n’y a rien à envoyer au drive. Ta liste n’a pas changé. Ajoute des articles, puis envoie-la.',
    ],
    [
      409,
      'SHOPPING_LIST_NOT_SENDABLE',
      'Seule une liste en cours peut être envoyée au drive. Rien n’a été changé. Ouvre une liste en cours.',
    ],
    [
      404,
      'DRIVE_DISABLED',
      'L’envoi au drive n’est pas disponible pour le moment. Ta liste n’a pas changé. Réessaie plus tard.',
    ],
    [
      412,
      'outdated',
      "Modifié ailleurs entre-temps : la page vient d'être rechargée, refais ton action.",
    ],
  ])(
    'explique le refus %i %s en français simple et reste sur la liste',
    async (status, code, message) => {
      const { context } = await send({
        'POST /api/v1/shopping-lists/l1/send': failure(status, code),
      })

      await vi.waitFor(() =>
        expect(useNotificationsStore().items.map((item) => item.text)).toEqual([message]),
      )
      expect(context.router.currentRoute.value.name).not.toBe('drive-send')
      await vi.waitFor(() => expect(body().querySelector('[role="dialog"]')).toBeNull())
    },
  )

  it('retire le bouton quand le drive est coupé entre-temps (404 DRIVE_DISABLED)', async () => {
    let enabled = true
    await send({
      'GET /api/v1/drive/settings': () => json({ enabled, retailer: 'leclerc', store }),
      'POST /api/v1/shopping-lists/l1/send': () => {
        enabled = false

        return failure(404, 'DRIVE_DISABLED')()
      },
    })

    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeUndefined())
  })

  it('relit la liste envoyée depuis un autre appareil quand on coche une ligne (409 SHOPPING_LIST_SENT)', async () => {
    let sentElsewhere = false
    const { wrapper } = await openActive({
      'GET /api/v1/shopping-lists/l1': () => json(detail(sentElsewhere ? 'SENT' : 'ACTIVE')),
      'POST /api/v1/shopping-list-rows/r1/tick': () => {
        sentElsewhere = true

        return failure(409, 'SHOPPING_LIST_SENT')()
      },
    })

    await wrapper.find('[role="checkbox"]').trigger('click')

    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable. Rien n’a été changé. Rouvre-la pour la modifier.',
      ]),
    )
    // La ligne est revenue à son état, la liste est relue : lecture seule, avec ses nouvelles actions
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(
        'Cette liste est envoyée au drive : elle n’est plus modifiable.',
      ),
    )
    expect(wrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('[role="checkbox"]').attributes('disabled')).toBeDefined()
    expect(await openMenu('Rouvrir la liste')).toBeDefined()
  })

  it('ne crée aucune liste toute seule quand il n’y en a pas d’active', async () => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists/active/summary': () => json(none),
    })
    const context = await signedIn()
    const wrapper = mount(ShoppingListView, { global: { plugins: context.plugins } })

    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Aucune liste en cours'))
    await flushPromises()

    expect(calls(fetchMock).filter((call) => call.startsWith('PUT'))).toEqual([])
    expect(wrapper.text()).toContain('Créer ma liste')
  })
})

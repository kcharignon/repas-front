import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
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

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('ne propose que reprendre l’envoi, terminer, rouvrir et supprimer', async () => {
    const { wrapper } = await openSent()

    const actions = [...wrapper.findAll('header a, header button')].map((action) => action.text())
    expect(actions).toEqual(['Reprendre l’envoi', 'Terminer', 'Rouvrir la liste', 'Supprimer'])
    expect(wrapper.find('header a').attributes('href')).toBe('/drive/envoi/l1')
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

    button('Rouvrir la liste')?.click()
    await vi.waitFor(() =>
      expect(body().textContent).toContain('Le panier Leclerc ne sera pas vidé.'),
    )
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

    const actions = [...wrapper.findAll('header a, header button')].map((action) => action.text())
    expect(actions).toContain('Rouvrir la liste')
    expect(button('Envoyer au drive')).toBeUndefined()
    expect(button('Rouvrir la liste')?.disabled).toBe(false)

    button('Rouvrir la liste')?.click()
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

    button('Rouvrir la liste')?.click()
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

    expect(button('Rouvrir la liste')?.disabled).toBe(true)
  })

  it('dit qu’une liste n’est plus envoyée (409 SHOPPING_LIST_NOT_SENT) et la relit', async () => {
    const { fetchMock } = await openSent({
      'POST /api/v1/shopping-lists/l1/reopen': failure(409, 'SHOPPING_LIST_NOT_SENT'),
    })

    button('Rouvrir la liste')?.click()
    await vi.waitFor(() => expect(dialogButton('Rouvrir la liste')).toBeDefined())
    dialogButton('Rouvrir la liste').click()

    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        'Cette liste n’est plus envoyée au drive.',
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
  ) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists/active/summary': () =>
        json({ shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
      'GET /api/v1/shopping-lists/l1': () => json(list),
      'GET /api/v1/drive/settings': settings(enabled),
      ...handlers,
    })
    const context = await signedIn()
    const wrapper = mount(ShoppingListView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, context, fetchMock }
  }

  it('propose « Envoyer au drive » quand la fonction est allumée et la liste non vide', async () => {
    await openActive()

    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())
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
        'La liste ne sera plus modifiable. Vous pourrez la rouvrir.',
      ),
    )
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
    dialogButton('Envoyer au drive').click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-send'))

    const [send] = requests(fetchMock, 'POST', '/send')
    expect(send?.headers.get('If-Match')).toBe('"7"')
    expect(context.router.currentRoute.value.params.listId).toBe('l1')
  })

  it('mène aux réglages du drive, sans confirmation, quand aucun magasin n’est enregistré', async () => {
    const { fetchMock, context } = await openActive({
      'GET /api/v1/drive/settings': () => json({ enabled: true, retailer: 'leclerc' }),
    })
    await vi.waitFor(() => expect(button('Envoyer au drive')).toBeDefined())

    button('Envoyer au drive')?.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-settings'))

    expect(context.router.currentRoute.value.query.magasin).toBe('requis')
    expect(calls(fetchMock)).not.toContain('POST /api/v1/shopping-lists/l1/send')
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
      'La liste est vide : ajoutez des articles avant de l’envoyer au drive.',
    ],
    [409, 'SHOPPING_LIST_NOT_SENDABLE', 'Seule une liste en cours peut être envoyée au drive.'],
    [404, 'DRIVE_DISABLED', 'L’envoi au drive n’est pas disponible pour le moment.'],
    [
      412,
      'outdated',
      "Modifié ailleurs entre-temps : la page vient d'être rechargée, refaites votre action.",
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
        'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable.',
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
    expect(button('Rouvrir la liste')).toBeDefined()
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

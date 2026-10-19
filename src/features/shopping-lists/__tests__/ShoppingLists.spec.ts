import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import ShoppingListDetailView from '@/features/shopping-lists/ShoppingListDetailView.vue'
import ShoppingListsView from '@/features/shopping-lists/ShoppingListsView.vue'
import { useSessionStore } from '@/session/session'

const member = [
  {
    id: 'a',
    displayName: 'Courses du week-end',
    status: 'ACTIVE',
    isActive: true,
    isPaused: false,
    isCompleted: false,
    createdAt: '2026-10-14T10:00:00+02:00',
  },
  {
    id: 'p',
    displayName: 'Dîner entre amis',
    status: 'PAUSED',
    isActive: false,
    isPaused: true,
    isCompleted: false,
    createdAt: '2026-10-10T10:00:00+02:00',
  },
  {
    id: 'c',
    displayName: 'Liste du 1 octobre 2026',
    status: 'COMPLETED',
    isActive: false,
    isPaused: false,
    isCompleted: true,
    createdAt: '2026-10-01T10:00:00+02:00',
  },
]

const detailOf = (
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  name: string | null = 'Dîner entre amis',
) => ({
  id: 'p',
  name,
  displayName: name ?? 'Liste du 10 octobre 2026',
  dateLabel: '10 octobre 2026',
  createdAt: '2026-10-10T10:00:00+02:00',
  status,
  version: 5,
  isActive: status === 'ACTIVE',
  isPaused: status === 'PAUSED',
  isCompleted: status === 'COMPLETED',
  rowCount: 1,
  recipeCount: 1,
  departments: [
    {
      slug: 'divers',
      name: 'Divers',
      image: 'images/divers.png',
      rows: [{ id: 'r1', ingredientName: 'sel', quantity: 5, unitSymbol: 'g', checked: false }],
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

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

async function signedIn() {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()

  return context
}

describe('ShoppingListsView', () => {
  afterEach(() => vi.unstubAllGlobals())

  const open = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists': () => json({ member, totalItems: 3 }),
      ...handlers,
    })
    const context = await signedIn()
    const wrapper = mount(ShoppingListsView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.findAll('li').length).toBeGreaterThan(0))

    return { wrapper, context, fetchMock }
  }

  it('liste les listes avec leur statut, la plus récente en premier', async () => {
    const { wrapper } = await open()

    const items = wrapper.findAll('li')
    expect(items.map((item) => item.text())).toEqual([
      expect.stringContaining('Courses du week-end'),
      expect.stringContaining('Dîner entre amis'),
      expect.stringContaining('Liste du 1 octobre 2026'),
    ])
    expect(items.map((item) => item.find('a > span:last-child').text())).toEqual([
      'En cours',
      'En pause',
      'Terminée',
    ])
    expect(items[1]?.text()).toContain('10 octobre 2026')
  })

  it('montre une liste envoyée avec son badge court et sa date d’envoi', async () => {
    const sent = {
      id: 's',
      displayName: 'Courses envoyées',
      status: 'SENT',
      isActive: false,
      isPaused: false,
      isCompleted: false,
      isSent: true,
      sentAt: '2026-10-15T18:30:00+02:00',
      createdAt: '2026-10-14T10:00:00+02:00',
    }
    const { wrapper } = await open({
      'GET /api/v1/shopping-lists': () => json({ member: [sent, ...member], totalItems: 4 }),
    })

    const item = wrapper.findAll('li')[0]

    expect(item?.find('a > span:last-child').text()).toBe('Envoyée')
    expect(item?.text()).toContain('Envoyée au drive le 15 octobre 2026')
    expect(item?.find('a').attributes('href')).toBe('/listes/s')
  })

  it('ouvre la liste active sur /liste et les autres sur /listes/:id', async () => {
    const { wrapper } = await open()

    const hrefs = wrapper.findAll('li a').map((link) => link.attributes('href'))

    expect(hrefs).toEqual(['/liste', '/listes/p', '/listes/c'])
  })

  it('crée une liste puis va à la liste en cours', async () => {
    const { wrapper, context, fetchMock } = await open({
      'POST /api/v1/shopping-lists': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/shopping-lists/n' } }),
    })

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Nouvelle liste')
      ?.trigger('click')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('shopping-list'))

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists')
  })

  it("dit qu'il n'y a aucune liste", async () => {
    stubApi({ ...session, 'GET /api/v1/shopping-lists': () => json({ member: [], totalItems: 0 }) })
    const context = await signedIn()
    const wrapper = mount(ShoppingListsView, { global: { plugins: context.plugins } })

    await vi.waitFor(() => expect(wrapper.text()).toContain("Tu n'as encore aucune liste."))
  })

  it('signale un back injoignable', async () => {
    stubApi({
      ...session,
      'GET /api/v1/shopping-lists': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    const context = await signedIn()
    const wrapper = mount(ShoppingListsView, { global: { plugins: context.plugins } })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  })
})

describe('ShoppingListDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const open = async (
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
    handlers: Parameters<typeof stubApi>[0] = {},
  ) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/shopping-lists/p': () => json(detailOf(status)),
      ...handlers,
    })
    const context = await signedIn()
    await context.router.push('/listes/p')
    const wrapper = mount(ShoppingListDetailView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, context, fetchMock }
  }

  const button = (label: string) =>
    [...document.body.querySelectorAll('button')].find(
      (candidate) => candidate.textContent.trim() === label,
    )

  it('montre une liste en pause, avec ses actions, sans retrait de recette', async () => {
    const { wrapper } = await open('PAUSED')

    expect(wrapper.find('h1').text()).toBe('Dîner entre amis')
    expect(wrapper.text()).toContain('En pause')
    expect(button('Reprendre cette liste')).toBeDefined()
    expect(button('Mettre en pause')).toBeUndefined()
    expect(button('Terminer')).toBeUndefined()
    // Retirer une recette ne vaut que pour la liste active (route `active/recipes/{id}` du back)
    expect(wrapper.find('button[aria-label^="Retirer"]').exists()).toBe(false)
  })

  it('reprend une liste en pause', async () => {
    const { fetchMock } = await open('PAUSED', {
      'POST /api/v1/shopping-lists/p/activate': () => new Response(null, { status: 204 }),
    })

    button('Reprendre cette liste')?.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/p/activate')
  })

  it.each([
    ['Mettre en pause', 'pause'],
    ['Terminer', 'complete'],
  ])('%s une liste active', async (label, action) => {
    const { fetchMock } = await open('ACTIVE', {
      [`POST /api/v1/shopping-lists/p/${action}`]: () => new Response(null, { status: 204 }),
    })

    button(label)?.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain(`POST /api/v1/shopping-lists/p/${action}`)
  })

  it('renomme avec la version lue, un nom vide rétablit la date', async () => {
    const { fetchMock } = await open('PAUSED', {
      'PATCH /api/v1/shopping-lists/p': () => new Response(null, { status: 204 }),
    })

    button('Renommer')?.click()
    await vi.waitFor(() => expect(document.body.querySelector('input')).not.toBeNull())
    const input = document.body.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('Dîner entre amis')
    input.value = '  Apéro du samedi  '
    input.dispatchEvent(new Event('input'))
    document.body.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    const patch = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PATCH')
    expect(await patch?.json()).toEqual({ name: 'Apéro du samedi' })
    expect(patch?.headers.get('If-Match')).toBe('"5"')
  })

  it('supprime après confirmation puis revient aux listes', async () => {
    const { fetchMock, context } = await open('PAUSED', {
      'DELETE /api/v1/shopping-lists/p': () => new Response(null, { status: 204 }),
    })

    button('Supprimer')?.click()
    await vi.waitFor(() => expect(document.body.textContent).toContain('Supprimer la liste ?'))
    expect(calls(fetchMock)).not.toContain('DELETE /api/v1/shopping-lists/p')
    const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (candidate) => candidate.textContent.trim() === 'Supprimer',
    ) as HTMLButtonElement
    confirm.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('shopping-lists'))

    expect(calls(fetchMock)).toContain('DELETE /api/v1/shopping-lists/p')
  })

  it("dit qu'une liste inconnue n'existe plus", async () => {
    stubApi({
      ...session,
      'GET /api/v1/shopping-lists/p': () => json({ error: { message: 'x' } }, { status: 404 }),
    })
    const context = await signedIn()
    await context.router.push('/listes/p')
    const wrapper = mount(ShoppingListDetailView, { global: { plugins: context.plugins } })

    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toBe("Cet élément n'existe plus."),
    )
  })
})

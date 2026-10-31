import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import ShoppingListsView from '@/features/shopping-lists/ShoppingListsView.vue'
import ShoppingListView from '@/features/shopping-lists/ShoppingListView.vue'
import { useSessionStore } from '@/session/session'

// Plusieurs listes en cours, une par type de liste (ADR 0036, LST-007) : les pastilles, la liste montrée et ses actions.
const row = (id: string, name: string, checked = false) => ({
  id,
  ingredientName: name,
  ingredientSlug: name.toLowerCase(),
  quantity: 2,
  unitSlug: 'kilo',
  unitSymbol: 'kg',
  checked,
  departmentSlug: 'viandes',
  departmentName: 'Viandes',
})

const detail = (id: string, displayName: string, rows: ReturnType<typeof row>[], version = 3) => ({
  id,
  name: id === 'list-main' ? null : displayName,
  displayName,
  dateLabel: '31 octobre 2026',
  createdAt: '2026-10-31T10:00:00+02:00',
  status: 'ACTIVE',
  version,
  isActive: true,
  isPaused: false,
  isCompleted: false,
  isSent: false,
  rowCount: rows.length,
  recipeCount: 1,
  departments: [{ slug: 'viandes', name: 'Viandes', image: '', rows }],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: '',
      meals: [{ id: 'm1', recipeId: 'rec1', recipeName: 'Hachis parmentier', serving: 4 }],
    },
  ],
})

const mainList = detail('list-main', 'Liste du 31 octobre 2026', [row('r1', 'Pâtes')])
const boucherie = detail(
  'list-b',
  'Boucherie',
  [row('r2', 'Merguez'), row('r3', 'Poulet', true)],
  7,
)
const marche = detail('list-m', 'Marché', [row('r4', 'Poireaux')])

const openList = (id: string, name: string, typeId: string | null, unchecked: number) => ({
  id,
  name,
  typeId,
  rowCount: unchecked,
  uncheckedCount: unchecked,
  version: 1,
})
const withTypes = {
  member: [
    openList('list-main', 'Liste du 31 octobre 2026', null, 4),
    openList('list-b', 'Boucherie', 't1', 3),
    openList('list-m', 'Marché', 't2', 7),
  ],
  totalItems: 3,
}
const onlyMain = {
  member: [openList('list-main', 'Liste du 31 octobre 2026', null, 4)],
  totalItems: 1,
}

const backWith = (open: unknown, extra: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/shopping-lists/open': () => json(open),
    'GET /api/v1/shopping-lists/active/summary': () =>
      json({ shoppingListId: 'list-main', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
    'GET /api/v1/shopping-lists/list-main': () => json(mainList),
    'GET /api/v1/shopping-lists/list-b': () => json(boucherie),
    'GET /api/v1/shopping-lists/list-m': () => json(marche),
    ...extra,
  })

const mounted: VueWrapper[] = []

async function mountList(path = '/liste') {
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(ShoppingListView, { global: { plugins: context.plugins } })
  mounted.push(wrapper as VueWrapper)
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Chargement'))

  return { wrapper, context }
}

const pills = (wrapper: VueWrapper) => wrapper.findAll('[role="group"] button')
const pillTexts = (wrapper: VueWrapper) =>
  pills(wrapper).map((pill) => pill.text().replace(/\s+/g, ' '))

describe('ShoppingListView : plusieurs listes en cours', () => {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('sans type, aucune pastille et le bouton garde son texte', async () => {
    backWith(onlyMain)

    const { wrapper } = await mountList()

    expect(pills(wrapper)).toHaveLength(0)
    expect(wrapper.find('h1').text()).toBe('Liste du 31 octobre 2026')
    expect(wrapper.text()).toContain('Terminer')
    expect(wrapper.text()).not.toContain('Terminer cette liste')
  })

  it("si la lecture des listes en cours échoue, l'écran reste celui de la principale", async () => {
    backWith(onlyMain, { 'GET /api/v1/shopping-lists/open': () => json({}, { status: 500 }) })

    const { wrapper } = await mountList()

    expect(pills(wrapper)).toHaveLength(0)
    expect(wrapper.find('h1').text()).toBe('Liste du 31 octobre 2026')
  })

  it('montre une pastille par liste en cours avec les articles à cocher, la principale d’abord', async () => {
    backWith(withTypes)

    const { wrapper } = await mountList()

    expect(pillTexts(wrapper)).toEqual([
      'Principale 4 à cocher',
      'Boucherie 3 à cocher',
      'Marché 7 à cocher',
    ])
    // La principale est montrée d'abord, sa pastille est enfoncée
    expect(pills(wrapper).map((pill) => pill.attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(wrapper.find('h1').text()).toBe('Liste du 31 octobre 2026')
    expect(wrapper.text()).toContain('Terminer cette liste')
  })

  it('une pastille montre la liste du type, ses lignes et son nom', async () => {
    backWith(withTypes)
    const { wrapper, context } = await mountList()

    await pills(wrapper)[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Boucherie'))

    expect(wrapper.text()).toContain('Merguez')
    expect(wrapper.text()).not.toContain('Pâtes')
    expect(pills(wrapper)[1]!.attributes('aria-pressed')).toBe('true')
    // Le choix est dans l'adresse : on peut y revenir, et « Voir » y mène
    expect(context.router.currentRoute.value.query.liste).toBe('list-b')

    await pills(wrapper)[0]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Liste du 31 octobre 2026'))
    expect(context.router.currentRoute.value.query.liste).toBeUndefined()
  })

  it('s’ouvre sur la liste demandée par l’adresse (« Voir »)', async () => {
    backWith(withTypes)

    const { wrapper } = await mountList('/liste?liste=list-m')

    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Marché'))
    expect(pills(wrapper)[2]!.attributes('aria-pressed')).toBe('true')
  })

  it('retombe sur la principale quand la liste demandée n’est plus en cours', async () => {
    backWith(withTypes)

    const { wrapper } = await mountList('/liste?liste=list-fantome')

    expect(wrapper.find('h1').text()).toBe('Liste du 31 octobre 2026')
    expect(pills(wrapper)[0]!.attributes('aria-pressed')).toBe('true')
  })

  it('« Terminer cette liste » ne termine que la liste montrée', async () => {
    const fetchMock = backWith(withTypes, {
      'POST /api/v1/shopping-lists/list-b/complete': () => new Response(null, { status: 204 }),
    })
    const { wrapper } = await mountList('/liste?liste=list-b')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Boucherie'))

    const complete = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Terminer cette liste')
    await complete!.trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-lists/list-b/complete')
    expect(calls(fetchMock).filter((call) => call.endsWith('/complete'))).toHaveLength(1)
  })

  it('cocher agit sur la liste montrée', async () => {
    const fetchMock = backWith(withTypes, {
      'POST /api/v1/shopping-list-rows/r2/tick': () => new Response(null, { status: 204 }),
    })
    const { wrapper } = await mountList('/liste?liste=list-b')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Boucherie'))

    await wrapper.find('[role="checkbox"]').trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-list-rows/r2/tick')
  })

  it('le nombre de personnes d’une liste de type ne pose pas de contrôle de version (If-Match)', async () => {
    const fetchMock = backWith(withTypes, {
      'PUT /api/v1/meals/m1/serving': () => new Response(null, { status: 204 }),
    })
    const { wrapper } = await mountList('/liste?liste=list-b')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Boucherie'))
    await wrapper.findAll('[role="tab"]')[1]!.trigger('mousedown')
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Hachis parmentier'))

    await wrapper
      .find('button[aria-label="Une personne de plus pour Hachis parmentier"]')
      .trigger('click')
    await flushPromises()

    const put = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PUT')
    expect(put?.headers.get('If-Match')).toBeNull()
  })

  it('le nombre de personnes de la liste principale garde son contrôle de version', async () => {
    const fetchMock = backWith(withTypes, {
      'PUT /api/v1/meals/m1/serving': () => new Response(null, { status: 204 }),
    })
    const { wrapper } = await mountList()
    await wrapper.findAll('[role="tab"]')[1]!.trigger('mousedown')
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Hachis parmentier'))

    await wrapper
      .find('button[aria-label="Une personne de plus pour Hachis parmentier"]')
      .trigger('click')
    await flushPromises()

    const put = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PUT')
    expect(put?.headers.get('If-Match')).toBe('"3"')
  })

  it('un refus parce qu’une liste du repas est partie au drive le dit en une phrase', async () => {
    backWith(withTypes, {
      'PUT /api/v1/meals/m1/serving': () =>
        json({ error: { message: 'SHOPPING_LIST_SENT' } }, { status: 409 }),
    })
    const { wrapper } = await mountList()
    await wrapper.findAll('[role="tab"]')[1]!.trigger('mousedown')
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Hachis parmentier'))

    await wrapper
      .find('button[aria-label="Une personne de plus pour Hachis parmentier"]')
      .trigger('click')
    await flushPromises()

    const { useNotificationsStore } = await import('@/notifications/store')
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Une des listes de ce repas est partie au drive. Rouvre-la, puis réessaie.',
    ])
  })

  it('sans liste principale en cours, montre la première liste d’un type au lieu de « Aucune liste »', async () => {
    backWith(
      { member: [openList('list-b', 'Boucherie', 't1', 3)], totalItems: 1 },
      {
        'GET /api/v1/shopping-lists/active/summary': () =>
          json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
      },
    )

    const { wrapper } = await mountList()

    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Boucherie'))
    expect(wrapper.text()).not.toContain('Aucune liste en cours')
  })
})

describe('ShoppingListsView : une liste de type en cours', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ouvre la liste du type sur l’écran Liste, à sa pastille', async () => {
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/shopping-lists': () =>
        json({
          member: [
            {
              id: 'list-b',
              displayName: 'Boucherie',
              status: 'ACTIVE',
              isActive: true,
              isPaused: false,
              isCompleted: false,
              isSent: false,
              createdAt: '2026-10-31T10:00:00+02:00',
              typeId: 't1',
            },
          ],
          totalItems: 1,
        }),
    })
    const context = appContext()
    await useSessionStore().restore()
    const wrapper = mount(ShoppingListsView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Boucherie'))

    expect(wrapper.find('a').attributes('href')).toBe('/liste?liste=list-b')
  })
})

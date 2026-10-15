import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import ShoppingListView from '@/features/shopping-lists/ShoppingListView.vue'
import { useSessionStore } from '@/session/session'

type Row = {
  id: string
  ingredientName: string
  quantity: number
  unitSymbol: string
  checked: boolean
}

const row = (id: string, name: string, quantity: number, unit: string, checked = false): Row => ({
  id,
  ingredientName: name,
  quantity,
  unitSymbol: unit,
  checked,
})

const detail = (
  rows: Row[] = [row('r1', 'Courgettes', 4, ''), row('r2', 'Poulet', 1.6, 'kg', true)],
) => ({
  id: 'list-1',
  name: null,
  displayName: 'Liste du 14 octobre 2026',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status: 'ACTIVE',
  isActive: true,
  isPaused: false,
  isCompleted: false,
  rowCount: rows.length,
  recipeCount: 1,
  departments: [
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/department/legumes.png', rows },
  ],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: 'images/type/plat.png',
      meals: [{ id: 'm1', recipeId: 'rec1', recipeName: 'Gratin de courgettes', serving: 4 }],
    },
  ],
})

const active = {
  shoppingListId: 'list-1',
  quantityByIngredientSlug: {},
  plannedRecipeIds: ['rec1'],
}

const backWith = (extra: Parameters<typeof stubApi>[0] = {}, list = detail()) =>
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/shopping-lists/active/summary': () => json(active),
    'GET /api/v1/shopping-lists/list-1': () => json(list),
    ...extra,
  })

async function mountList() {
  const context = appContext()
  await useSessionStore().restore()
  const wrapper = mount(ShoppingListView, { global: { plugins: context.plugins } })
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Chargement'))

  return wrapper
}

const checkbox = (wrapper: Awaited<ReturnType<typeof mountList>>, name: string) =>
  wrapper
    .findAll('[role="checkbox"]')
    .find((box) => box.element.closest('label')?.textContent.includes(name))

describe('ShoppingListView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('montre la liste par rayon avec sa progression', async () => {
    backWith()

    const wrapper = await mountList()

    expect(wrapper.find('h1').text()).toBe('Liste du 14 octobre 2026')
    expect(wrapper.find('h2').text()).toBe('Fruits et légumes')
    expect(wrapper.text()).toContain('Courgettes')
    expect(wrapper.text().replace(/\s/g, ' ')).toContain('1,6 kg')
    expect(wrapper.find('[role="progressbar"]').attributes('aria-label')).toBe(
      '1 sur 2 articles dans le panier',
    )
    expect(wrapper.find('img').attributes('src')).toBe('/images/department/legumes.png')
  })

  it('coche une ligne tout de suite, puis le back confirme', async () => {
    let release: () => void = () => undefined
    const fetchMock = backWith({
      'POST /api/v1/shopping-list-rows/r1/tick': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }))
        }),
    })
    const wrapper = await mountList()

    await checkbox(wrapper, 'Courgettes')?.trigger('click')

    // L'écran a changé avant la réponse du back
    await vi.waitFor(() =>
      expect(checkbox(wrapper, 'Courgettes')?.attributes('aria-checked')).toBe('true'),
    )
    expect(wrapper.find('[role="progressbar"]').attributes('aria-label')).toBe(
      '2 sur 2 articles dans le panier',
    )
    release()
    await flushPromises()
    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-list-rows/r1/tick')
  })

  it('décoche une ligne cochée', async () => {
    const fetchMock = backWith({
      'POST /api/v1/shopping-list-rows/r2/uncheck': () => new Response(null, { status: 204 }),
    })
    const wrapper = await mountList()

    await checkbox(wrapper, 'Poulet')?.trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/shopping-list-rows/r2/uncheck')
  })

  it('remet la ligne dans son état quand le back refuse', async () => {
    const fetchMock = backWith({
      'POST /api/v1/shopping-list-rows/r1/tick': () =>
        json({ error: { message: 'Forbidden' } }, { status: 403 }),
    })
    const wrapper = await mountList()

    await checkbox(wrapper, 'Courgettes')?.trigger('click')
    await vi.waitFor(() =>
      expect(checkbox(wrapper, 'Courgettes')?.attributes('aria-checked')).toBe('false'),
    )

    // et la liste est relue
    await vi.waitFor(() =>
      expect(
        calls(fetchMock).filter((call) => call === 'GET /api/v1/shopping-lists/list-1').length,
      ).toBeGreaterThan(1),
    )
  })

  it("explique qu'il n'y a rien à acheter", async () => {
    backWith({}, detail([]))

    const wrapper = await mountList()

    expect(wrapper.text()).toContain("Rien à acheter pour l'instant")
  })

  it("propose de créer la liste quand il n'y en a pas, puis l'affiche", async () => {
    let created = false
    const fetchMock = backWith({
      'GET /api/v1/shopping-lists/active/summary': () =>
        json(
          created
            ? active
            : { shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] },
        ),
      'PUT /api/v1/shopping-lists/active': () => {
        created = true

        return new Response(null, { status: 204 })
      },
    })
    const wrapper = await mountList()
    expect(wrapper.find('h1').text()).toBe('Aucune liste en cours')

    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Liste du 14 octobre 2026'))

    expect(calls(fetchMock)).toContain('PUT /api/v1/shopping-lists/active')
  })

  it('signale un back injoignable', async () => {
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/shopping-lists/active/summary': () =>
        json({ error: { message: 'boom' } }, { status: 500 }),
    })
    const context = appContext()
    await useSessionStore().restore()
    // 500 : le client ne réessaie que deux fois ; on le coupe pour ne pas attendre
    context.queryClient.setDefaultOptions({ queries: { retry: false } })

    const wrapper = mount(ShoppingListView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Réessayez dans un instant.',
    )
  })

  it("garde la liste à l'écran quand cocher la dernière ligne la termine, et propose d'en commencer une", async () => {
    let completed = false
    backWith({
      'GET /api/v1/shopping-lists/active/summary': () =>
        json(
          completed
            ? { shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }
            : active,
        ),
      'GET /api/v1/shopping-lists/list-1': () =>
        json(
          completed
            ? {
                ...detail([row('r1', 'Courgettes', 4, '', true)]),
                status: 'COMPLETED',
                isCompleted: true,
              }
            : detail([row('r1', 'Courgettes', 4, '')]),
        ),
      'POST /api/v1/shopping-list-rows/r1/tick': () => {
        completed = true

        return new Response(null, { status: 204 })
      },
    })
    const wrapper = await mountList()

    await checkbox(wrapper, 'Courgettes')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Courses terminées'))

    expect(wrapper.find('h1').text()).toBe('Liste du 14 octobre 2026')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Nouvelle liste')).toBe(
      true,
    )
  })

  describe('recettes planifiées', () => {
    const openRecipes = async (wrapper: Awaited<ReturnType<typeof mountList>>) => {
      await wrapper.findAll('[role="tab"]')[1]?.trigger('mousedown', { button: 0 })
      await flushPromises()
    }

    it('liste les repas par type avec leur nombre de personnes', async () => {
      backWith()
      const wrapper = await mountList()

      await openRecipes(wrapper)

      expect(wrapper.text()).toContain('Gratin de courgettes')
      expect(wrapper.find('[aria-live="polite"]').text()).toBe('4')
    })

    it('change le nombre de personnes par un de plus ou de moins', async () => {
      const fetchMock = backWith({
        'PUT /api/v1/meals/m1/serving': () => new Response(null, { status: 204 }),
      })
      const wrapper = await mountList()
      await openRecipes(wrapper)

      await wrapper
        .find('button[aria-label="Une personne de plus pour Gratin de courgettes"]')
        .trigger('click')
      await wrapper
        .find('button[aria-label="Une personne de moins pour Gratin de courgettes"]')
        .trigger('click')
      await flushPromises()

      const bodies = await Promise.all(
        fetchMock.mock.calls
          .map(([input]) => input as Request)
          .filter(
            (request) => request.method === 'PUT' && request.url.endsWith('/meals/m1/serving'),
          )
          .map((request) => request.json()),
      )
      expect(bodies).toEqual([{ serving: 5 }, { serving: 3 }])
    })

    it('ne descend pas sous une personne', async () => {
      const list = detail()
      list.recipeTypes[0]!.meals[0]!.serving = 1
      backWith({}, list)
      const wrapper = await mountList()
      await openRecipes(wrapper)

      const fewer = wrapper.find(
        'button[aria-label="Une personne de moins pour Gratin de courgettes"]',
      )

      expect(fewer.attributes('disabled')).toBeDefined()
    })

    it('retire une recette de la liste', async () => {
      const fetchMock = backWith({
        'DELETE /api/v1/shopping-lists/active/recipes/rec1': () =>
          new Response(null, { status: 204 }),
      })
      const wrapper = await mountList()
      await openRecipes(wrapper)

      await wrapper
        .find('button[aria-label="Retirer Gratin de courgettes de la liste"]')
        .trigger('click')
      await flushPromises()

      expect(calls(fetchMock)).toContain('DELETE /api/v1/shopping-lists/active/recipes/rec1')
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import PlanButton from '@/features/recipes/PlanButton.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// Planifier une recette avec des types de liste (ADR 0036, LST-007) : le message qui dit où elle est allée, et ce que « planifiée » veut dire.
const summary = (planned: string[], quantities: Record<string, number> = {}) => ({
  shoppingListId: 'list-main',
  quantityByIngredientSlug: quantities,
  plannedRecipeIds: planned,
})
const openList = (id: string, name: string, typeId: string | null) => ({
  id,
  name,
  typeId,
  rowCount: 1,
  uncheckedCount: 1,
  version: 1,
})
const typedBackend = {
  member: [
    openList('list-main', 'Liste du 31 octobre 2026', null),
    openList('list-b', 'Boucherie', 't1'),
  ],
  totalItems: 2,
}
const boucherieDetail = (recipeIds: string[]) => ({
  id: 'list-b',
  displayName: 'Boucherie',
  status: 'ACTIVE',
  version: 2,
  isActive: true,
  departments: [
    {
      slug: 'viandes',
      name: 'Viandes',
      image: '',
      rows: [
        {
          id: 'row-1',
          ingredientName: 'Merguez',
          ingredientSlug: 'merguez',
          quantity: 3,
          unitSlug: 'piece',
          unitSymbol: '',
          checked: false,
          departmentSlug: 'viandes',
          departmentName: 'Viandes',
        },
      ],
    },
  ],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: '',
      meals: recipeIds.map((recipeId) => ({
        id: `m-${recipeId}`,
        recipeId,
        recipeName: 'x',
        serving: 4,
      })),
    },
  ],
})

async function open(handlers: Parameters<typeof stubApi>[0] = {}, planned: string[] = []) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/shopping-lists/active/summary': () => json(summary(planned)),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/')
  const wrapper = mount(PlanButton, {
    props: { recipeId: 'r1', name: 'Hachis parmentier', variant: 'icon' },
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('button').attributes('disabled')).toBeUndefined())

  return { wrapper, fetchMock, context }
}

const messages = () => useNotificationsStore().items

describe('PlanButton avec des types de liste', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('dit dans quelles listes la recette est allée, avec « Voir » vers la première', async () => {
    const { wrapper, context } = await open({
      'GET /api/v1/shopping-lists/open': () => json(typedBackend),
      'GET /api/v1/shopping-lists/list-b': () => json(boucherieDetail([])),
      'PUT /api/v1/shopping-lists/active/recipes/r1': () =>
        json({
          lists: [
            { id: 'list-main', name: 'Liste du 31 octobre 2026', typeId: null },
            { id: 'list-b', name: 'Boucherie', typeId: 't1' },
            { id: 'list-m', name: 'Marché', typeId: 't2' },
          ],
        }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(messages().map((message) => message.text)).toEqual([
      'Ajouté à Boucherie, Marché et Liste principale.',
    ])
    const action = messages()[0]!.action
    expect(action?.label).toBe('Voir')
    action?.run()
    await flushPromises()
    expect(context.router.currentRoute.value.fullPath).toBe('/liste?liste=list-main')
  })

  it('une seule liste : « Ajouté à Boucherie. »', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/shopping-lists/active/recipes/r1': () =>
        json({ lists: [{ id: 'list-b', name: 'Boucherie', typeId: 't1' }] }),
      'GET /api/v1/shopping-lists/open': () => json(typedBackend),
      'GET /api/v1/shopping-lists/list-b': () => json(boucherieDetail([])),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(messages().map((message) => message.text)).toEqual(['Ajouté à Boucherie.'])
  })

  it('n’a rien à dire quand la recette n’est allée que dans la liste principale', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/shopping-lists/active/recipes/r1': () =>
        json({ lists: [{ id: 'list-main', name: 'Liste du 31 octobre 2026', typeId: null }] }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(messages()).toEqual([])
  })

  it('n’a rien à dire quand le back répond 204 (un ancien back, ou aucun type)', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/shopping-lists/active/recipes/r1': () => new Response(null, { status: 204 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(messages()).toEqual([])
  })

  it('relit toutes les listes ouvertes après la planification', async () => {
    let opened = 0
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/shopping-lists/open': () => {
        opened += 1

        return json(typedBackend)
      },
      'GET /api/v1/shopping-lists/list-b': () => json(boucherieDetail([])),
      'PUT /api/v1/shopping-lists/active/recipes/r1': () =>
        json({ lists: [{ id: 'list-b', name: 'Boucherie', typeId: 't1' }] }),
    })
    await vi.waitFor(() => expect(opened).toBe(1))

    await wrapper.find('button').trigger('click')
    await flushPromises()

    await vi.waitFor(() => expect(opened).toBe(2))
    expect(
      calls(fetchMock).filter((call) => call === 'GET /api/v1/shopping-lists/list-b').length,
    ).toBe(2)
  })

  it('une recette planifiée seulement dans la liste d’un type compte comme planifiée', async () => {
    const { wrapper } = await open({
      'GET /api/v1/shopping-lists/open': () => json(typedBackend),
      'GET /api/v1/shopping-lists/list-b': () => json(boucherieDetail(['r1'])),
    })

    await vi.waitFor(() => expect(wrapper.find('button').attributes('aria-pressed')).toBe('true'))
    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Retirer Hachis parmentier de la liste de courses',
    )
  })

  it('une liste du repas partie au drive : le texte dit quoi faire', async () => {
    const { wrapper } = await open({
      'PUT /api/v1/shopping-lists/active/recipes/r1': () =>
        json({ error: { message: 'SHOPPING_LIST_SENT' } }, { status: 409 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(messages().map((message) => message.text)).toEqual([
      'Une des listes de ce repas est partie au drive. Rouvre-la, puis réessaie.',
    ])
  })
})

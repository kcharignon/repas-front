import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipesView from '@/features/recipes/RecipesView.vue'
import { useSessionStore } from '@/session/session'

const types = {
  member: [
    { slug: 'entree', name: 'Entrée', image: 'images/entree.png', order: 1 },
    { slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 2 },
    { slug: 'dessert', name: 'Dessert', image: 'images/dessert.png', order: 3 },
  ],
  totalItems: 3,
}
const plats = {
  member: [
    { id: 'r1', name: 'Gratin de courgettes' },
    { id: 'r2', name: 'Pâtes carbonara' },
  ],
  totalItems: 2,
}
const summary = (planned: string[] = [], listId: string | null = 'list-1') => ({
  shoppingListId: listId,
  quantityByIngredientSlug: {},
  plannedRecipeIds: planned,
})
const recipe = {
  id: 'r1',
  name: 'Gratin de courgettes',
  serving: 4,
  typeSlug: 'plat',
  typeName: 'Plat',
  version: 2,
  rows: [
    {
      ingredientSlug: 'courgette',
      ingredientName: 'courgette',
      ingredientImage: 'images/courgette.png',
      quantity: 600,
      unitSlug: 'gramme',
      unitSymbol: 'g',
    },
    {
      ingredientSlug: 'lait',
      ingredientName: 'lait',
      ingredientImage: 'images/lait.png',
      quantity: 0.5,
      unitSlug: 'litre',
      unitSymbol: 'l',
    },
  ],
}

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/recipe-types/plat/recipes': () => json(plats),
  'GET /api/v1/recipe-types/entree/recipes': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/shopping-lists/active/summary': () => json(summary()),
}

async function signedIn(path = '/recettes') {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)

  return context
}

describe('RecipesView', () => {
  afterEach(() => vi.unstubAllGlobals())

  const open = async (handlers: Parameters<typeof stubApi>[0] = {}, path = '/recettes') => {
    const fetchMock = stubApi({ ...session, ...handlers })
    const context = await signedIn(path)
    const wrapper = mount(RecipesView, { global: { plugins: context.plugins } })

    return { wrapper, context, fetchMock }
  }

  it('propose les types et montre les recettes du premier par défaut', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipe-types/entree/recipes': () =>
        json({ member: [{ id: 'e1', name: 'Salade' }], totalItems: 1 }),
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Salade'))

    expect(
      wrapper
        .findAll('[aria-pressed]')
        .filter((chip) => chip.attributes('aria-pressed') === 'true')
        .map((chip) => chip.text()),
    ).toEqual(['Entrée'])
  })

  it("garde le type dans l'adresse et change de type au clic", async () => {
    const { wrapper, context } = await open({}, '/recettes?type=plat')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Dessert')
      ?.trigger('click')

    await vi.waitFor(() => expect(context.router.currentRoute.value.query.type).toBe('dessert'))
  })

  it('filtre par nom sans tenir compte de la casse', async () => {
    const { wrapper } = await open({}, '/recettes?type=plat')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Pâtes carbonara'))

    await wrapper.find('input[type="search"]').setValue('GRATIN')

    expect(wrapper.text()).toContain('Gratin de courgettes')
    expect(wrapper.text()).not.toContain('Pâtes carbonara')
    await wrapper.find('input[type="search"]').setValue('zzz')
    expect(wrapper.text()).toContain('Aucune recette ne correspond.')
  })

  it('montre quelles recettes sont déjà dans la liste', async () => {
    const { wrapper } = await open(
      { 'GET /api/v1/shopping-lists/active/summary': () => json(summary(['r2'])) },
      '/recettes?type=plat',
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Dans la liste'))

    const pressed = wrapper.findAll('li button').map((button) => button.attributes('aria-pressed'))

    expect(pressed).toEqual(['false', 'true'])
  })

  it('planifie une recette dans la liste en cours', async () => {
    const { wrapper, fetchMock } = await open(
      { 'PUT /api/v1/shopping-lists/active/recipes/r1': () => new Response(null, { status: 204 }) },
      '/recettes?type=plat',
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper
      .find('button[aria-label="Ajouter Gratin de courgettes à la liste de courses"]')
      .trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('PUT /api/v1/shopping-lists/active/recipes/r1')
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/shopping-lists/active')
  })

  it("crée la liste d'abord quand il n'y en a pas", async () => {
    const { wrapper, fetchMock } = await open(
      {
        'GET /api/v1/shopping-lists/active/summary': () => json(summary([], null)),
        'PUT /api/v1/shopping-lists/active': () => new Response(null, { status: 204 }),
        'PUT /api/v1/shopping-lists/active/recipes/r1': () => new Response(null, { status: 204 }),
      },
      '/recettes?type=plat',
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper
      .find('button[aria-label="Ajouter Gratin de courgettes à la liste de courses"]')
      .trigger('click')
    await flushPromises()

    const writes = calls(fetchMock).filter((call) => call.startsWith('PUT'))
    expect(writes).toEqual([
      'PUT /api/v1/shopping-lists/active',
      'PUT /api/v1/shopping-lists/active/recipes/r1',
    ])
  })

  it('retire une recette planifiée', async () => {
    const { wrapper, fetchMock } = await open(
      {
        'GET /api/v1/shopping-lists/active/summary': () => json(summary(['r1'])),
        'DELETE /api/v1/shopping-lists/active/recipes/r1': () =>
          new Response(null, { status: 204 }),
      },
      '/recettes?type=plat',
    )
    await vi.waitFor(() => expect(wrapper.text()).toContain('Dans la liste'))

    await wrapper
      .find('button[aria-label="Retirer Gratin de courgettes de la liste de courses"]')
      .trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('DELETE /api/v1/shopping-lists/active/recipes/r1')
  })

  it('dit quand il n’y a aucune recette de ce type', async () => {
    const { wrapper } = await open()

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Vous n'avez pas encore de recette de ce type."),
    )
  })

  it('signale un back injoignable', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipe-types': () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  })
})

describe('OtherRecipesView', () => {
  afterEach(() => vi.unstubAllGlobals())

  const others = { member: [{ id: 'o1', name: 'Ramen', typeName: 'Plat' }], totalItems: 1 }

  it('liste les recettes à copier et ouvre la copie', async () => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/recipes/other-people': () => json(others),
      'POST /api/v1/recipes/o1/copy': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/copie-1' } }),
    })
    const context = await signedIn('/recettes/autres')
    const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ramen'))

    await wrapper.find('button[aria-label="Copier Ramen dans mes recettes"]').trigger('click')
    await vi.waitFor(() => expect(context.router.currentRoute.value.params.id).toBe('copie-1'))

    expect(calls(fetchMock)).toContain('POST /api/v1/recipes/o1/copy')
  })

  it("dit qu'il n'y a rien à copier", async () => {
    stubApi({
      ...session,
      'GET /api/v1/recipes/other-people': () => json({ member: [], totalItems: 0 }),
    })
    const context = await signedIn('/recettes/autres')
    const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Rien de nouveau à copier pour le moment.'),
    )
  })
})

describe('RecipeDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const open = async (mineIds: string[], handlers: Parameters<typeof stubApi>[0] = {}) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/recipes/r1': () => json(recipe),
      'GET /api/v1/recipe-types/plat/recipes': () =>
        json({ member: mineIds.map((id) => ({ id, name: 'x' })), totalItems: mineIds.length }),
      ...handlers,
    })
    const context = await signedIn('/recettes/r1')
    const wrapper = mount(RecipeDetailView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, context, fetchMock }
  }

  it('montre la recette et ses ingrédients', async () => {
    const { wrapper } = await open([])

    expect(wrapper.find('h1').text()).toBe('Gratin de courgettes')
    expect(wrapper.text()).toContain('Pour 4 personnes')
    expect(wrapper.findAll('li').map((row) => row.text().replace(/\s/g, ' '))).toEqual([
      'courgette600 g',
      'lait0,5 l',
    ])
  })

  it("ne propose de supprimer qu'une recette à soi", async () => {
    const other = await open([])
    expect(other.wrapper.findAll('button').some((button) => button.text() === 'Supprimer')).toBe(
      false,
    )
    other.wrapper.unmount()

    const mine = await open(['r1'])
    await vi.waitFor(() =>
      expect(mine.wrapper.findAll('button').some((button) => button.text() === 'Supprimer')).toBe(
        true,
      ),
    )
  })

  it('supprime après confirmation puis revient aux recettes du même type', async () => {
    const { wrapper, context, fetchMock } = await open(['r1'], {
      'DELETE /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() =>
      expect(wrapper.findAll('button').some((button) => button.text() === 'Supprimer')).toBe(true),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Supprimer')
      ?.trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Supprimer la recette ?'))
    const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent.trim() === 'Supprimer',
    ) as HTMLButtonElement
    confirm.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipes'))

    expect(calls(fetchMock)).toContain('DELETE /api/v1/recipes/r1')
    expect(context.router.currentRoute.value.query.type).toBe('plat')
  })

  it("dit qu'une recette inconnue n'existe plus", async () => {
    stubApi({
      ...session,
      'GET /api/v1/recipes/r1': () => json({ error: { message: 'x' } }, { status: 404 }),
    })
    const context = await signedIn('/recettes/r1')
    const wrapper = mount(RecipeDetailView, { global: { plugins: context.plugins } })

    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toBe("Cet élément n'existe plus."),
    )
  })
})

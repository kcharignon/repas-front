import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useCopiedRecipesStore } from '@/features/recipes/copiedRecipes'
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

  describe('catégories vides', () => {
    const counted = (counts: Array<number | undefined>) => ({
      member: types.member.map((type, index) => ({
        ...type,
        ...(counts[index] === undefined ? {} : { recipeCount: counts[index] }),
      })),
      totalItems: 3,
    })
    const tileNames = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
      wrapper.findAll('[role="group"] button').map((tile) => tile.text())

    it('masque le type sans recette et choisit le premier type non vide', async () => {
      const { wrapper } = await open({
        'GET /api/v1/recipe-types': () => json(counted([0, 2, 0])),
      })
      await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

      expect(tileNames(wrapper)).toEqual(['Plat'])
      expect(wrapper.find('[aria-pressed="true"]').text()).toBe('Plat')
    })

    it('affiche les types non vides', async () => {
      const { wrapper } = await open({
        'GET /api/v1/recipe-types': () => json(counted([1, 2, 3])),
      })
      await vi.waitFor(() => expect(tileNames(wrapper)).toEqual(['Entrée', 'Plat', 'Dessert']))
    })

    it("garde l'état vide quand tous les types sont à zéro", async () => {
      const { wrapper } = await open({
        'GET /api/v1/recipe-types': () => json(counted([0, 0, 0])),
      })
      await vi.waitFor(() => expect(wrapper.text()).toContain('Tu n'))

      expect(tileNames(wrapper)).toEqual([])
    })

    it("n'efface jamais un type quand le back ne rend pas recipeCount", async () => {
      const { wrapper } = await open({
        'GET /api/v1/recipe-types': () => json(counted([undefined, 0, undefined])),
      })
      await vi.waitFor(() => expect(tileNames(wrapper)).toEqual(['Entrée', 'Dessert']))
    })
  })

  it("montre l'image de chaque type et l'écrit avec une majuscule", async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipe-types': () =>
        json({
          member: [
            { slug: 'plat', name: 'plat', image: 'images/recipe/type/meal.svg', order: 1 },
            { slug: 'boisson', name: 'Boisson', image: 'https://exemple.test/drink.png', order: 2 },
          ],
          totalItems: 2,
        }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('[aria-pressed]').length).toBeGreaterThan(1))

    const tiles = wrapper.findAll('[role="group"] button')

    expect(tiles.map((tile) => tile.text())).toEqual(['Plat', 'Boisson'])
    expect(tiles.map((tile) => tile.find('img').attributes('src'))).toEqual([
      '/images/recipe/type/meal.svg',
      'https://exemple.test/drink.png',
    ])
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
    await vi.waitFor(() => expect(wrapper.find('button[aria-pressed="true"]').exists()).toBe(true))

    const pressed = wrapper.findAll('li button').map((button) => button.attributes('aria-pressed'))

    expect(pressed).toEqual(['false', 'true'])
    // Sur les cartes le bouton est rond et sans texte : l'état passe par le nom accessible
    expect(wrapper.find('li button').text()).toBe('')
    expect(wrapper.findAll('li button').map((button) => button.attributes('aria-label'))).toEqual([
      'Ajouter Gratin de courgettes à la liste de courses',
      'Retirer Pâtes carbonara de la liste de courses',
    ])
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
    await vi.waitFor(() =>
      expect(
        wrapper
          .find('button[aria-label="Retirer Gratin de courgettes de la liste de courses"]')
          .exists(),
      ).toBe(true),
    )

    await wrapper
      .find('button[aria-label="Retirer Gratin de courgettes de la liste de courses"]')
      .trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('DELETE /api/v1/shopping-lists/active/recipes/r1')
  })

  it('dit quand il n’y a aucune recette de ce type', async () => {
    const { wrapper } = await open()

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Tu n'as pas encore de recette de ce type."),
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

  const others = {
    member: [{ id: 'o1', name: 'Ramen', typeName: 'Plat', typeSlug: 'plat' }],
    totalItems: 1,
  }

  it('liste les recettes à copier, chacune avec son bouton « Copier »', async () => {
    stubApi({ ...session, 'GET /api/v1/recipes/other-people': () => json(others) })
    const context = await signedIn('/recettes/autres')
    const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ramen'))

    expect(wrapper.find('button[aria-label="Copier Ramen dans mes recettes"]').text()).toBe(
      'Copier',
    )
  })

  it('charge la page suivante par « Voir plus » quand le total dépasse ce qui est affiché', async () => {
    const offsets: (string | null)[] = []
    stubApi({
      ...session,
      'GET /api/v1/recipes/other-people': (request) => {
        const offset = new URL(request.url).searchParams.get('offset')
        offsets.push(offset)

        return json(
          offset === null
            ? {
                member: [{ id: 'o1', name: 'Ramen', typeName: 'Plat', typeSlug: 'plat' }],
                totalItems: 2,
              }
            : {
                member: [{ id: 'o2', name: 'Tarte', typeName: 'Dessert', typeSlug: 'dessert' }],
                totalItems: 2,
              },
        )
      },
    })
    const context = await signedIn('/recettes/autres')
    const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ramen'))
    expect(wrapper.text()).not.toContain('Tarte')

    const more = wrapper.findAll('button').find((button) => button.text() === 'Voir plus')
    await more?.trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Tarte'))
    expect(wrapper.text()).toContain('Ramen')
    expect(offsets).toEqual([null, '1'])
    // Tout est affiché : plus de bouton
    expect(wrapper.findAll('button').some((button) => button.text() === 'Voir plus')).toBe(false)
  })

  it('ne propose pas « Voir plus » quand tout est affiché', async () => {
    stubApi({
      ...session,
      'GET /api/v1/recipes/other-people': () => json(others),
    })
    const context = await signedIn('/recettes/autres')
    const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ramen'))

    expect(wrapper.text()).not.toContain('Voir plus')
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

  const open = async (
    mineIds: string[],
    handlers: Parameters<typeof stubApi>[0] = {},
    beforeMount: () => void = () => {},
  ) => {
    const fetchMock = stubApi({
      ...session,
      'GET /api/v1/recipes/r1': () => json(recipe),
      'GET /api/v1/recipe-types/plat/recipes': () =>
        json({ member: mineIds.map((id) => ({ id, name: 'x' })), totalItems: mineIds.length }),
      ...handlers,
    })
    const context = await signedIn('/recettes/r1')
    beforeMount()
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

  it("n'affiche aucune image d'ingrédient, même quand le back en fournit", async () => {
    const { wrapper } = await open([])

    expect(wrapper.findAll('li img')).toHaveLength(0)
  })

  const buttonNames = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.findAll('main button, main a[href*="modifier"]').map((node) => node.text())
  const copyButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.find('button[aria-label="Copier Gratin de courgettes dans mes recettes"]')
  const planButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.find('button[aria-label="Ajouter Gratin de courgettes à la liste de courses"]')
  const copyRoute = {
    'POST /api/v1/recipes/r1/copy': () =>
      new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/copie-1' } }),
  }

  it('à soi : ajouter à la liste, modifier et supprimer, jamais « Copier »', async () => {
    const { wrapper } = await open(['r1'])
    await vi.waitFor(() => expect(planButton(wrapper).exists()).toBe(true))

    expect(buttonNames(wrapper)).toEqual(['Ajouter', 'Modifier', 'Supprimer'])
    expect(copyButton(wrapper).exists()).toBe(false)
    expect(wrapper.find('main > a').attributes('href')).toBe('/recettes')
  })

  it("d'un autre : « Copier » seulement, ni ajout à la liste, ni modifier, ni supprimer", async () => {
    const { wrapper } = await open([])
    await vi.waitFor(() => expect(copyButton(wrapper).exists()).toBe(true))

    expect(buttonNames(wrapper)).toEqual(['Copier'])
    expect(planButton(wrapper).exists()).toBe(false)
    // Le lien de retour ramène à « Recettes des autres »
    expect(wrapper.find('main > a').attributes('href')).toBe('/recettes/autres')
    expect(wrapper.find('main > a').text()).toBe('Recettes des autres')
  })

  it("d'un autre : copier reste sur la fiche, le dit, et grise « Copiée »", async () => {
    const { wrapper, context, fetchMock } = await open([], copyRoute)
    await vi.waitFor(() => expect(copyButton(wrapper).exists()).toBe(true))

    const push = vi.spyOn(context.router, 'push')
    await copyButton(wrapper).trigger('click')
    await vi.waitFor(() =>
      expect(
        wrapper
          .find('button[aria-label="Copiée : Gratin de courgettes est dans tes recettes"]')
          .exists(),
      ).toBe(true),
    )

    expect(calls(fetchMock).filter((call) => call === 'POST /api/v1/recipes/r1/copy')).toHaveLength(
      1,
    )
    expect(push).not.toHaveBeenCalled()
    expect(context.router.currentRoute.value.name).toBe('recipe')
    expect(context.router.currentRoute.value.params.id).toBe('r1')
    expect(useNotificationsStore().items.map((item) => [item.kind, item.text])).toEqual([
      ['success', '« Gratin de courgettes » est dans tes recettes.'],
    ])
    const done = wrapper.find('button[aria-label^="Copiée"]')
    expect(done.text()).toBe('Copiée')
    expect(done.attributes('disabled')).toBeDefined()
    expect(copyButton(wrapper).exists()).toBe(false)
    expect(planButton(wrapper).exists()).toBe(false)
  })

  it("d'un autre : un refus du back laisse « Copier » et ne dit pas que c'est copié", async () => {
    const { wrapper } = await open([], {
      'POST /api/v1/recipes/r1/copy': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    await vi.waitFor(() => expect(copyButton(wrapper).exists()).toBe(true))

    await copyButton(wrapper).trigger('click')
    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.kind)).toEqual(['error']),
    )

    expect(copyButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('button[aria-label^="Copiée"]').exists()).toBe(false)
    expect(useCopiedRecipesStore().has('r1')).toBe(false)
  })

  it("d'un autre : « Copiée » dès l'ouverture quand la liste vient de la copier", async () => {
    const { wrapper } = await open([], {}, () => useCopiedRecipesStore().add('r1'))

    await vi.waitFor(() => expect(wrapper.find('button[aria-label^="Copiée"]').exists()).toBe(true))

    expect(copyButton(wrapper).exists()).toBe(false)
  })

  it('propriété inconnue (ses recettes pas encore lues) : aucune action, puis le bon jeu', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { wrapper } = await open(['r1'], {
      'GET /api/v1/recipe-types/plat/recipes': async () => {
        await gate

        return json({ member: [{ id: 'r1', name: 'x' }], totalItems: 1 })
      },
    })

    // La recette est affichée, la liste des siennes ne l'est pas encore : rien à cliquer, et la place est réservée
    expect(wrapper.find('h1').text()).toBe('Gratin de courgettes')
    expect(buttonNames(wrapper)).toEqual([])
    expect(wrapper.find('main > div.min-h-11').exists()).toBe(true)
    expect(wrapper.find('main > a').attributes('href')).toBe('/recettes')

    release()
    await vi.waitFor(() =>
      expect(buttonNames(wrapper)).toEqual(['Ajouter', 'Modifier', 'Supprimer']),
    )
  })

  it('propriété inconnue (ses recettes en erreur) : aucune action, ni « Copier » ni « Ajouter »', async () => {
    const { wrapper, fetchMock } = await open([], {
      'GET /api/v1/recipe-types/plat/recipes': () =>
        json({ error: { message: 'x' } }, { status: 500 }),
    })
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('GET /api/v1/recipe-types/plat/recipes'),
    )
    await flushPromises()

    expect(buttonNames(wrapper)).toEqual([])
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

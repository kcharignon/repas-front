import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipesView from '@/features/recipes/RecipesView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// Les recettes favorites (REC-004, ADR 0034 du back) : le type « Favoris » en tête de la liste des types, qui n'existe que s'il y a au moins
// un favori, et l'étoile de la fiche, qui n'est proposée que sur ses propres recettes.

const types = {
  member: [
    { slug: 'entree', name: 'Entrée', image: 'images/entree.png', order: 1 },
    { slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 2 },
  ],
  totalItems: 2,
}
const gratin = { id: 'r1', name: 'Gratin de courgettes', secret: false }
const carbonara = { id: 'r2', name: 'Pâtes carbonara', secret: false }
const salade = { id: 'e1', name: 'Salade', secret: true }

const recipe = (favorite: boolean) => ({
  id: 'r1',
  name: 'Gratin de courgettes',
  serving: 4,
  typeSlug: 'plat',
  typeName: 'Plat',
  version: 2,
  secret: false,
  favorite,
  rows: [],
})

const backend = (favorites: unknown[] = []) => ({
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/recipe-types/plat/recipes': () =>
    json({ member: [gratin, carbonara], totalItems: 2 }),
  'GET /api/v1/recipe-types/entree/recipes': () => json({ member: [salade], totalItems: 1 }),
  'GET /api/v1/recipes/favorites': () => json({ member: favorites, totalItems: favorites.length }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
})

async function signedIn(path: string) {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)

  return context
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('le type « Favoris » de la liste des recettes', () => {
  const open = async (handlers: Parameters<typeof stubApi>[0] = {}, path = '/recettes') => {
    const fetchMock = stubApi({ ...backend(), ...handlers })
    const context = await signedIn(path)
    const wrapper = mount(RecipesView, { global: { plugins: context.plugins } })

    return { wrapper, context, fetchMock }
  }
  const tiles = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.findAll('[role="group"] button').map((tile) => tile.text())
  const selected = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.findAll('[role="group"] button[aria-pressed="true"]').map((tile) => tile.text())
  const withFavorites = {
    'GET /api/v1/recipes/favorites': () => json({ member: [gratin, salade], totalItems: 2 }),
  }

  it('est invisible sans aucun favori : les types restent ceux du back', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Salade'))

    expect(tiles(wrapper)).toEqual(['Entrée', 'Plat'])
    expect(selected(wrapper)).toEqual(['Entrée'])
  })

  it('apparaît en première position, avec son étoile, dès qu’il y a un favori, et liste les favoris', async () => {
    const { wrapper } = await open(withFavorites)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    expect(tiles(wrapper)).toEqual(['Favoris', 'Entrée', 'Plat'])
    expect(selected(wrapper)).toEqual(['Favoris'])
    // L'étoile est servie par le back comme les images des autres types
    expect(wrapper.find('[role="group"] button img').attributes('src')).toBe(
      '/images/recipe/type/star.png',
    )
    // Les favoris de tous les types, et seulement eux ; la pastille « Secrète » reste sur celle qui l'est
    expect(wrapper.findAll('ul > li a').map((link) => link.text())).toEqual([
      'Gratin de courgettes',
      'Salade',
    ])
    expect(wrapper.findAll('[data-secret-badge]')).toHaveLength(1)
  })

  it('laisse la recette favorite aussi dans son type', async () => {
    const { wrapper } = await open(withFavorites)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper.findAll('[role="group"] button')[2]!.trigger('click')
    await vi.waitFor(() => expect(selected(wrapper)).toEqual(['Plat']))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Pâtes carbonara'))

    expect(wrapper.findAll('ul > li a').map((link) => link.text())).toEqual([
      'Gratin de courgettes',
      'Pâtes carbonara',
    ])
  })

  it('garde le choix dans l’adresse et le retrouve au rechargement', async () => {
    const { wrapper, context } = await open(withFavorites)
    await vi.waitFor(() => expect(selected(wrapper)).toEqual(['Favoris']))

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click')
    await flushPromises()
    expect(context.router.currentRoute.value.query.type).toBe('entree')

    await wrapper.findAll('[role="group"] button')[0]!.trigger('click')
    await flushPromises()
    expect(context.router.currentRoute.value.query.type).toBe('__favoris__')
    expect(selected(wrapper)).toEqual(['Favoris'])
  })

  it('ouvre les favoris quand l’adresse les demande', async () => {
    const { wrapper } = await open(withFavorites, '/recettes?type=__favoris__')
    await vi.waitFor(() => expect(selected(wrapper)).toEqual(['Favoris']))
  })

  it('filtre les favoris par nom', async () => {
    const { wrapper } = await open(withFavorites)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper.find('input[type="search"]').setValue('sala')

    expect(wrapper.findAll('ul > li a').map((link) => link.text())).toEqual(['Salade'])
  })

  it('retombe sur le premier vrai type quand l’adresse demande des favoris qui n’existent pas', async () => {
    const { wrapper } = await open({}, '/recettes?type=__favoris__')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Salade'))

    expect(tiles(wrapper)).toEqual(['Entrée', 'Plat'])
    expect(selected(wrapper)).toEqual(['Entrée'])
  })

  it('ne casse jamais la page : un back sans la route, ou en panne, se lit comme « aucun favori »', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipes/favorites': () => json({ error: { message: 'boom' } }, { status: 500 }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Salade'))

    expect(tiles(wrapper)).toEqual(['Entrée', 'Plat'])
    expect(wrapper.text()).not.toContain('Impossible')
  })

  it('dit que la liste est vide quand le filtre ne trouve aucun favori', async () => {
    const { wrapper } = await open(withFavorites)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Gratin de courgettes'))

    await wrapper.find('input[type="search"]').setValue('zzz')

    expect(wrapper.text()).toContain('Aucune recette ne correspond.')
  })
})

describe('l’étoile de la fiche', () => {
  const open = async (
    options: { mine?: boolean; favorite?: boolean } = {},
    handlers: Parameters<typeof stubApi>[0] = {},
  ) => {
    const { mine = true, favorite = false } = options
    const fetchMock = stubApi({
      ...backend(),
      'GET /api/v1/recipes/r1': () => json(recipe(favorite)),
      'GET /api/v1/recipe-types/plat/recipes': () =>
        json({ member: mine ? [gratin] : [carbonara], totalItems: 1 }),
      ...handlers,
    })
    const context = await signedIn('/recettes/r1')
    const wrapper = mount(RecipeDetailView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

    return { wrapper, fetchMock }
  }
  const star = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
    wrapper.find('[data-favorite-button]')
  const puts = (fetchMock: ReturnType<typeof stubApi>) =>
    fetchMock.mock.calls
      .map(([call]) => call as Request)
      .filter((request) => request.method === 'PUT')

  // Le faux back se souvient du choix : la relecture qui suit l'écriture rend ce que l'écriture a posé
  const remembering = (initial = false) => {
    let favorite = initial

    return {
      'GET /api/v1/recipes/r1': () => json(recipe(favorite)),
      'PUT /api/v1/recipes/r1/favorite': async (request: Request) => {
        favorite = ((await request.clone().json()) as { favorite: boolean }).favorite

        return new Response(null, { status: 204 })
      },
    }
  }

  it('met la recette en favoris d’un clic et le dit tout de suite', async () => {
    const { wrapper, fetchMock } = await open({}, remembering())
    await vi.waitFor(() => expect(star(wrapper).exists()).toBe(true))
    expect(star(wrapper).attributes('aria-pressed')).toBe('false')
    expect(star(wrapper).attributes('aria-label')).toBe('Mettre Gratin de courgettes en favoris')

    await star(wrapper).trigger('click')

    await vi.waitFor(() => expect(puts(fetchMock)).toHaveLength(1))
    expect(new URL(puts(fetchMock)[0]!.url).pathname).toBe('/api/v1/recipes/r1/favorite')
    expect(await puts(fetchMock)[0]!.json()).toEqual({ favorite: true })
    expect(star(wrapper).attributes('aria-pressed')).toBe('true')
    expect(star(wrapper).attributes('aria-label')).toBe('Retirer Gratin de courgettes des favoris')
  })

  it('relit la fiche après le choix (sa version a changé) et la garde mise en favoris', async () => {
    const { wrapper, fetchMock } = await open({}, remembering())
    await vi.waitFor(() => expect(star(wrapper).exists()).toBe(true))
    const reads = () =>
      fetchMock.mock.calls.filter(
        ([call]) => new URL((call as Request).url).pathname === '/api/v1/recipes/r1',
      ).length
    const before = reads()

    await star(wrapper).trigger('click')
    await vi.waitFor(() => expect(reads()).toBeGreaterThan(before))
    await flushPromises()

    expect(star(wrapper).attributes('aria-pressed')).toBe('true')
  })

  it('retire la recette des favoris quand elle y est', async () => {
    const { wrapper, fetchMock } = await open({ favorite: true }, remembering(true))
    await vi.waitFor(() => expect(star(wrapper).attributes('aria-pressed')).toBe('true'))

    await star(wrapper).trigger('click')

    await vi.waitFor(() => expect(puts(fetchMock)).toHaveLength(1))
    expect(await puts(fetchMock)[0]!.json()).toEqual({ favorite: false })
  })

  it('revient en arrière quand le back refuse', async () => {
    const { wrapper } = await open(
      {},
      {
        'PUT /api/v1/recipes/r1/favorite': () =>
          json({ error: { message: 'RECIPE_FAVORITE_FORBIDDEN' } }, { status: 403 }),
      },
    )
    await vi.waitFor(() => expect(star(wrapper).exists()).toBe(true))

    await star(wrapper).trigger('click')

    await vi.waitFor(() => expect(useNotificationsStore().items.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(star(wrapper).attributes('aria-pressed')).toBe('false'))
  })

  it('n’est pas proposée sur la recette d’un autre', async () => {
    const { wrapper } = await open({ mine: false })
    await vi.waitFor(() =>
      expect(
        wrapper.find('button[aria-label="Copier Gratin de courgettes dans mes recettes"]').exists(),
      ).toBe(true),
    )

    expect(star(wrapper).exists()).toBe(false)
  })

  it('n’est pas proposée tant qu’on ne sait pas à qui est la recette', async () => {
    const gate = new Promise<void>(() => {})
    const { wrapper } = await open(
      {},
      {
        'GET /api/v1/recipe-types/plat/recipes': async () => {
          await gate

          return json({ member: [gratin], totalItems: 1 })
        },
      },
    )

    expect(star(wrapper).exists()).toBe(false)
  })

  it('traite un back plus ancien (sans « favorite ») comme « pas en favoris »', async () => {
    const { wrapper } = await open(
      {},
      {
        'GET /api/v1/recipes/r1': () => {
          const { favorite: _ignored, ...old } = recipe(false)

          return json(old)
        },
      },
    )
    await vi.waitFor(() => expect(star(wrapper).exists()).toBe(true))

    expect(star(wrapper).attributes('aria-pressed')).toBe('false')
  })
})

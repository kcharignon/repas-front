import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import { useSessionStore } from '@/session/session'

const types = {
  member: [
    { slug: 'entree', name: 'Entrée', image: 'images/entree.png', order: 1 },
    { slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 2 },
  ],
  totalItems: 2,
}
const ingredients = {
  member: [
    { slug: 'courgette', name: 'courgette' },
    { slug: 'lait', name: 'lait' },
  ],
  totalItems: 2,
}
const units = (names: [string, string][]) => ({
  member: names.map(([slug, name]) => ({ slug, name })),
  totalItems: names.length,
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
      ingredientImage: '',
      quantity: 600,
      unitSlug: 'gramme',
      unitSymbol: 'g',
    },
    {
      ingredientSlug: 'lait',
      ingredientName: 'lait',
      ingredientImage: '',
      quantity: 500,
      unitSlug: 'millilitre',
      unitSymbol: 'ml',
    },
  ],
}

const backend = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/ingredients': () => json(ingredients),
  'GET /api/v1/ingredients/courgette/units': () =>
    json(
      units([
        ['gramme', 'Gramme'],
        ['kilo', 'Kilo'],
      ]),
    ),
  'GET /api/v1/ingredients/lait/units': () =>
    json(
      units([
        ['millilitre', 'Millilitre'],
        ['litre', 'Litre'],
      ]),
    ),
}

async function open(path: string, handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({ ...backend, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(RecipeEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

// Le champ du nom : la seule saisie sans attribut `type` (les autres sont des nombres, des listes ou la recherche d'ingrédient)
const nameInput = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.findAll('input').find((input) => input.attributes('type') === undefined) ??
  wrapper.find('input')

const submit = async (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('RecipeEditorView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  describe('modification', () => {
    const edit = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
      const opened = await open('/recettes/r1/modifier', {
        'GET /api/v1/recipes/r1': () => json(recipe),
        ...handlers,
      })
      await vi.waitFor(() =>
        expect((nameInput(opened.wrapper).element as HTMLInputElement).value).toBe(
          'Gratin de courgettes',
        ),
      )

      return opened
    }

    it('remplit le formulaire avec la recette', async () => {
      const { wrapper } = await edit()

      expect(wrapper.find('h1').text()).toBe('Modifier la recette')
      expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('4')
      expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('plat')
      await vi.waitFor(() =>
        expect(
          wrapper
            .findAll('li input[type="number"]')
            .map((input) => (input.element as HTMLInputElement).value),
        ).toEqual(['600', '500']),
      )
    })

    it('enregistre avec la version lue (If-Match) puis ouvre la recette', async () => {
      const { wrapper, context, fetchMock } = await edit({
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })

      await nameInput(wrapper).setValue('  Gratin revisité  ')
      await submit(wrapper)
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))

      const put = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((request) => request.method === 'PUT')
      expect(put?.headers.get('If-Match')).toBe('"2"')
      expect(await put?.json()).toEqual({
        name: 'Gratin revisité',
        serving: 4,
        typeSlug: 'plat',
        rows: [
          { ingredientSlug: 'courgette', unitSlug: 'gramme', quantity: 600 },
          { ingredientSlug: 'lait', unitSlug: 'millilitre', quantity: 500 },
        ],
      })
    })

    it('met la première lettre du nom en majuscule dans le champ et dans la requête', async () => {
      const { wrapper, fetchMock } = await edit({
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })

      await nameInput(wrapper).setValue('gratin de courgettes au chèvre')
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe(
        'Gratin de courgettes au chèvre',
      )
      await submit(wrapper)
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([call]) => (call as Request).method === 'PUT')).toBe(
          true,
        ),
      )

      const put = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((request) => request.method === 'PUT')
      expect(await put?.json()).toMatchObject({ name: 'Gratin de courgettes au chèvre' })
    })

    it("envoie la majuscule même pour un nom lu en minuscules qu'on n'a pas retapé", async () => {
      const { wrapper, fetchMock } = await open('/recettes/r1/modifier', {
        'GET /api/v1/recipes/r1': () => json({ ...recipe, name: 'œufs cocotte' }),
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })
      await vi.waitFor(() =>
        expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('œufs cocotte'),
      )

      await submit(wrapper)
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([call]) => (call as Request).method === 'PUT')).toBe(
          true,
        ),
      )

      const put = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((request) => request.method === 'PUT')
      expect(await put?.json()).toMatchObject({ name: 'Œufs cocotte' })
    })

    it('retire une ligne et en ajoute une vide', async () => {
      const { wrapper } = await edit()
      await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

      await wrapper.find('button[aria-label="Retirer l\'ingrédient 1"]').trigger('click')
      expect(wrapper.findAll('li')).toHaveLength(1)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Ajouter un ingrédient')
        ?.trigger('click')

      expect(wrapper.findAll('li')).toHaveLength(2)
    })

    it('affiche le message du back quand il refuse (422) et reste sur le formulaire', async () => {
      const { wrapper, context } = await edit({
        'PUT /api/v1/recipes/r1': () =>
          json(
            { error: { message: 'Ingredient lait cannot be converted to the purchase unit.' } },
            { status: 422 },
          ),
      })

      await submit(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Ingredient lait cannot be converted to the purchase unit.',
      )
      expect(context.router.currentRoute.value.name).toBe('recipe-edit')
    })

    it('dit que la recette a changé ailleurs (412)', async () => {
      const { wrapper } = await edit({
        'PUT /api/v1/recipes/r1': () => json({ error: { message: 'outdated' } }, { status: 412 }),
      })

      await submit(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toContain('Modifié ailleurs entre-temps')
    })

    it("dit qu'une recette inconnue n'existe plus", async () => {
      const { wrapper } = await open('/recettes/zzz/modifier', {
        'GET /api/v1/recipes/zzz': () => json({ error: { message: 'x' } }, { status: 404 }),
      })

      await vi.waitFor(() =>
        expect(wrapper.find('[role="alert"]').text()).toBe("Cet élément n'existe plus."),
      )
    })
  })

  describe('création', () => {
    it('refuse un formulaire incomplet en disant quoi corriger, sans appeler le back', async () => {
      const { wrapper, fetchMock } = await open('/recettes/nouvelle')
      await vi.waitFor(() => expect(wrapper.find('select').exists()).toBe(true))

      await submit(wrapper)

      expect(wrapper.text()).toContain('Donne un nom à la recette.')
      expect(wrapper.text()).toContain('Choisis un ingrédient.')
      expect(wrapper.text()).toContain('Entre une quantité supérieure à zéro.')
      expect(wrapper.text()).toContain('Choisis une unité.')
      expect(calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/recipes'))).toEqual([])
    })

    it('demande au moins une ligne', async () => {
      const { wrapper } = await open('/recettes/nouvelle')
      await vi.waitFor(() => expect(wrapper.find('select').exists()).toBe(true))
      await wrapper.find('button[aria-label="Retirer l\'ingrédient 1"]').trigger('click')

      await submit(wrapper)

      expect(wrapper.text()).toContain('Ajoute au moins un ingrédient.')
    })

    it('propose le premier type par défaut', async () => {
      const { wrapper } = await open('/recettes/nouvelle')

      await vi.waitFor(() =>
        expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('entree'),
      )
    })

    it('met le nom tapé en majuscule dès la première lettre', async () => {
      const { wrapper } = await open('/recettes/nouvelle')
      await vi.waitFor(() => expect(wrapper.find('select').exists()).toBe(true))

      await nameInput(wrapper).setValue('pâtes carbonara')

      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('Pâtes carbonara')
    })
  })
})

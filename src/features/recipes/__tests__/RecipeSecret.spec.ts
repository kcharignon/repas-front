import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import RecipesView from '@/features/recipes/RecipesView.vue'
import { useSessionStore } from '@/session/session'

// La recette secrète (REC-002, ADR 0033 du back) : l'interrupteur du formulaire, la pastille « Secrète », et un back plus ancien
// qui ne connaît pas encore `secret`.

const types = {
  member: [{ slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 1 }],
  totalItems: 1,
}
const row = {
  ingredientSlug: 'lait',
  ingredientName: 'lait',
  ingredientImage: '',
  quantity: 500,
  unitSlug: 'millilitre',
  unitSymbol: 'ml',
}
const recipe = {
  id: 'r1',
  name: 'Tarte de mamie',
  serving: 4,
  typeSlug: 'plat',
  typeName: 'Plat',
  version: 2,
  secret: false,
  rows: [row],
}

const backend = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/ingredients': () =>
    json({ member: [{ slug: 'lait', name: 'lait' }], totalItems: 1 }),
  'GET /api/v1/ingredients/lait/units': () =>
    json({ member: [{ slug: 'millilitre', name: 'Millilitre' }], totalItems: 1 }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

async function signedIn(path: string) {
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)

  return context
}

const sentRequests = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls
    .map(([call]) => call as Request)
    .filter(
      (request) =>
        request.method === method && new URL(request.url).pathname.startsWith('/api/v1/'),
    )

describe('recette secrète', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  describe('interrupteur du formulaire', () => {
    const openEditor = async (path: string, handlers: Parameters<typeof stubApi>[0] = {}) => {
      const fetchMock = stubApi({ ...backend, ...handlers })
      const context = await signedIn(path)
      const wrapper = mount(RecipeEditorView, {
        attachTo: document.body,
        global: { plugins: context.plugins },
      })

      return { wrapper, context, fetchMock }
    }
    const switchOf = (wrapper: Awaited<ReturnType<typeof openEditor>>['wrapper']) =>
      wrapper.find('input[role="switch"]')
    const loaded = async (wrapper: Awaited<ReturnType<typeof openEditor>>['wrapper']) =>
      vi.waitFor(() => expect(wrapper.find('li input[type="number"]').exists()).toBe(true))

    it('est éteint par défaut à la création, avec son libellé, son aide et un cadenas décoratif', async () => {
      const { wrapper } = await openEditor('/recettes/nouvelle')
      await vi.waitFor(() => expect(wrapper.find('select').exists()).toBe(true))

      const toggle = switchOf(wrapper)
      expect(toggle.exists()).toBe(true)
      expect(toggle.attributes('type')).toBe('checkbox')
      expect((toggle.element as HTMLInputElement).checked).toBe(false)
      expect(wrapper.find(`label[for="${toggle.attributes('id')}"]`).text()).toBe('Recette secrète')
      expect(wrapper.text()).toContain(
        'Toi seul la vois. Les autres ne la trouvent pas dans « Recettes des autres ».',
      )
      expect(toggle.attributes('aria-describedby')).toBeTruthy()
      expect(wrapper.find('svg[aria-hidden="true"]').exists()).toBe(true)
    })

    it("n'envoie pas la clé à la création quand il reste éteint, et l'envoie allumé", async () => {
      const post = {
        'POST /api/v1/recipes': () =>
          new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/n1' } }),
      }
      const fill = async (wrapper: Awaited<ReturnType<typeof openEditor>>['wrapper']) => {
        await wrapper.find('input:not([type])').setValue('Tarte de mamie')
        const form = (wrapper.vm as unknown as { form: { rows: Record<string, unknown>[] } }).form
        form.rows[0] = {
          ...form.rows[0],
          ingredientSlug: 'lait',
          unitSlug: 'millilitre',
          quantity: 500,
        }
        await flushPromises()
      }

      const off = await openEditor('/recettes/nouvelle', post)
      await vi.waitFor(() => expect(off.wrapper.find('select').exists()).toBe(true))
      await fill(off.wrapper)
      await off.wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(off.context.router.currentRoute.value.name).toBe('recipe'))
      expect(await sentRequests(off.fetchMock, 'POST')[0]?.json()).not.toHaveProperty('secret')
      off.wrapper.unmount()

      const on = await openEditor('/recettes/nouvelle', post)
      await vi.waitFor(() => expect(on.wrapper.find('select').exists()).toBe(true))
      await fill(on.wrapper)
      await switchOf(on.wrapper).setValue(true)
      await on.wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(on.context.router.currentRoute.value.name).toBe('recipe'))
      expect(await sentRequests(on.fetchMock, 'POST')[0]?.json()).toMatchObject({ secret: true })
    })

    it('reflète la recette à la modification et envoie son état', async () => {
      const { wrapper, context, fetchMock } = await openEditor('/recettes/r1/modifier', {
        'GET /api/v1/recipes/r1': () => json({ ...recipe, secret: true }),
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })
      await loaded(wrapper)

      expect((switchOf(wrapper).element as HTMLInputElement).checked).toBe(true)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))
      expect(await sentRequests(fetchMock, 'PUT')[0]?.json()).toMatchObject({ secret: true })
    })

    it('permet de rendre une recette secrète de nouveau visible', async () => {
      const { wrapper, context, fetchMock } = await openEditor('/recettes/r1/modifier', {
        'GET /api/v1/recipes/r1': () => json({ ...recipe, secret: true }),
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })
      await loaded(wrapper)

      await switchOf(wrapper).setValue(false)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))
      expect(await sentRequests(fetchMock, 'PUT')[0]?.json()).toMatchObject({ secret: false })
    })

    it("à la modification, sans la clé `secret` (back plus ancien) : pas d'interrupteur et rien d'envoyé", async () => {
      const { secret, ...old } = recipe
      void secret
      const { wrapper, context, fetchMock } = await openEditor('/recettes/r1/modifier', {
        'GET /api/v1/recipes/r1': () => json(old),
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      })
      await loaded(wrapper)

      expect(switchOf(wrapper).exists()).toBe(false)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))
      expect(await sentRequests(fetchMock, 'PUT')[0]?.json()).not.toHaveProperty('secret')
    })
  })

  describe('pastille « Secrète »', () => {
    it('est sur les seules recettes secrètes de « Mes recettes »', async () => {
      stubApi({
        ...backend,
        'GET /api/v1/recipe-types/plat/recipes': () =>
          json({
            member: [
              { id: 'a', name: 'Tarte de mamie', secret: true },
              { id: 'b', name: 'Gratin', secret: false },
              { id: 'c', name: 'Soupe' },
            ],
            totalItems: 3,
          }),
      })
      const context = await signedIn('/recettes')
      const wrapper = mount(RecipesView, { global: { plugins: context.plugins } })
      await vi.waitFor(() => expect(wrapper.text()).toContain('Tarte de mamie'))

      const badges = wrapper.findAll('[data-secret-badge]')
      expect(badges).toHaveLength(1)
      expect(badges[0]?.text()).toBe('Secrète')
      expect(
        wrapper
          .findAll('li')
          .find((item) => item.text().includes('Tarte de mamie'))
          ?.find('[data-secret-badge]')
          .exists(),
      ).toBe(true)
    })

    const openDetail = async (secret: boolean | undefined) => {
      const { secret: _drop, ...without } = recipe
      void _drop
      stubApi({
        ...backend,
        'GET /api/v1/recipes/r1': () =>
          json(secret === undefined ? without : { ...recipe, secret }),
        'GET /api/v1/recipe-types/plat/recipes': () =>
          json({
            member: [{ id: 'r1', name: 'Tarte de mamie', secret: secret === true }],
            totalItems: 1,
          }),
      })
      const context = await signedIn('/recettes/r1')
      const wrapper = mount(RecipeDetailView, { global: { plugins: context.plugins } })
      await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

      return wrapper
    }

    it('est près du titre de la lecture, seulement si la recette est secrète', async () => {
      expect((await openDetail(true)).find('[data-secret-badge]').text()).toBe('Secrète')
      expect((await openDetail(false)).find('[data-secret-badge]').exists()).toBe(false)
      expect((await openDetail(undefined)).find('[data-secret-badge]').exists()).toBe(false)
    })

    it("la recette secrète d'un autre répond 404 : l'écran dit qu'elle n'existe plus, sans erreur bruyante", async () => {
      stubApi({
        ...backend,
        'GET /api/v1/recipes/zzz': () => json({ error: { message: 'x' } }, { status: 404 }),
      })
      const context = await signedIn('/recettes/zzz')
      const wrapper = mount(RecipeDetailView, { global: { plugins: context.plugins } })

      await vi.waitFor(() =>
        expect(wrapper.find('[role="alert"]').text()).toBe("Cet élément n'existe plus."),
      )
      expect(wrapper.find('[data-secret-badge]').exists()).toBe(false)
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useSessionStore } from '@/session/session'

// Le champ « Liste de courses » de l'écran d'un produit (ADR 0036, LST-007) : où va le produit quand on l'ajoute.
const departments = {
  member: [
    { slug: 'viandes', name: 'Viandes', image: '', icon: null, listTypeId: 't1' },
    { slug: 'charcuterie', name: 'Charcuterie', image: '', icon: null, listTypeId: null },
  ],
  totalItems: 2,
}
const units = { member: [{ slug: 'piece', name: 'pièce', symbol: '' }], totalItems: 1 }
const types = {
  member: [
    { id: 't1', name: 'Boucherie', departmentSlugs: ['viandes'], ingredientCount: 0 },
    { id: 't2', name: 'Marché', departmentSlugs: [], ingredientCount: 0 },
  ],
  totalItems: 2,
}
const detail = (listDestination: unknown) => ({
  slug: 'merguez',
  name: 'Merguez',
  image: '',
  departmentSlug: 'charcuterie',
  departmentName: 'Charcuterie',
  cookingUnitSlug: 'piece',
  cookingUnitName: 'pièce',
  purchaseUnitSlug: 'piece',
  purchaseUnitName: 'pièce',
  purchaseUnitSymbol: '',
  hasSameUnit: true,
  coefficient: 1,
  creatorId: 'u1',
  canEdit: true,
  listDestination,
})
const none = { mode: 'DEFAULT', typeId: null, typeName: null }

async function edit(
  destination: unknown,
  listTypes: unknown = types,
  handlers: Parameters<typeof stubApi>[0] = {},
) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/units': () => json(units),
    'GET /api/v1/shopping-list-types': () => json(listTypes),
    'GET /api/v1/ingredients/merguez': () => json(detail(destination)),
    'GET /api/v1/ingredients/merguez/conversions': () =>
      json({ member: [], common: [], totalItems: 0, convertible: true }),
    'GET /api/v1/ingredients/duplicates': () => json({ member: [], totalItems: 0 }),
    'GET /api/v1/ingredients/to-fix': () => json({ member: [], totalItems: 0 }),
    'GET /api/v1/departments/charcuterie/ingredients': () => json({ member: [], totalItems: 0 }),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/ingredients/merguez/modifier')
  const wrapper = mount(IngredientEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('form input').exists()).toBe(true))

  return { wrapper, context, fetchMock }
}

const radios = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
  wrapper.findAll('input[name="ingredient-list"]')
const checked = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
  radios(wrapper).findIndex((radio) => (radio.element as HTMLInputElement).checked)

describe('IngredientEditorView : liste de courses du produit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('n’existe pas pour un compte sans type de liste', async () => {
    const { wrapper } = await edit(none, { member: [], totalItems: 0 })
    await flushPromises()

    expect(wrapper.find('[data-testid="list-field"]').exists()).toBe(false)
  })

  it('propose Comme son rayon (avec la liste où il irait), la principale et un choix par type', async () => {
    const { wrapper } = await edit(none)
    await vi.waitFor(() => expect(radios(wrapper)).toHaveLength(4))

    const labels = wrapper
      .findAll('[data-testid="list-field"] label')
      .map((label) => label.text().replace(/\s+/g, ' '))
    // Charcuterie n'a pas de type : « Comme son rayon » mène à la liste principale
    expect(labels).toEqual([
      'Comme son rayon Liste principale',
      'Liste principale',
      'Boucherie',
      'Marché',
    ])
    expect(checked(wrapper)).toBe(0)
    expect(wrapper.find('legend').text()).toBe('Liste de courses')
    expect(wrapper.find('[data-testid="list-field"] p').text()).toBe(
      'Ce produit ira dans la liste principale, comme son rayon.',
    )
  })

  it('« Comme son rayon » nomme le type du rayon choisi dans le formulaire', async () => {
    const { wrapper } = await edit(none)
    await vi.waitFor(() => expect(radios(wrapper)).toHaveLength(4))

    await wrapper.find('select').setValue('viandes')

    expect(wrapper.find('[data-testid="list-field"] label').text()).toContain('Boucherie')
    expect(wrapper.find('[data-testid="list-field"] p').text()).toBe(
      'Ce produit ira dans Boucherie, comme son rayon.',
    )
  })

  it('coche le choix déjà fait sur le produit et adapte l’aide', async () => {
    const { wrapper } = await edit({ mode: 'TYPE', typeId: 't1', typeName: 'Boucherie' })
    await vi.waitFor(() => expect(checked(wrapper)).toBe(2))

    expect(wrapper.find('[data-testid="list-field"] p').text()).toBe(
      'Ce produit ira dans Boucherie, quel que soit son rayon.',
    )
  })

  it('enregistre le produit puis la liste, seulement si elle a changé', async () => {
    const { wrapper, context, fetchMock } = await edit(none, types, {
      'PUT /api/v1/ingredients/merguez': () => new Response(null, { status: 204 }),
      'PUT /api/v1/ingredients/merguez/list-destination': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(radios(wrapper)).toHaveLength(4))

    await radios(wrapper)[2]!.setValue(true)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    const writes = calls(fetchMock).filter((call) => call.startsWith('PUT'))
    // Le produit d'abord, puis sa destination
    expect(writes).toEqual([
      'PUT /api/v1/ingredients/merguez',
      'PUT /api/v1/ingredients/merguez/list-destination',
    ])
    const index = fetchMock.mock.calls.findIndex(([call]) =>
      new URL((call as Request).url).pathname.endsWith('/list-destination'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({ destination: 't1' })
  })

  it('n’écrit pas la liste quand elle n’a pas changé', async () => {
    const { wrapper, context, fetchMock } = await edit(
      { mode: 'MAIN', typeId: null, typeName: null },
      types,
      { 'PUT /api/v1/ingredients/merguez': () => new Response(null, { status: 204 }) },
    )
    await vi.waitFor(() => expect(checked(wrapper)).toBe(1))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    expect(calls(fetchMock).filter((call) => call.startsWith('PUT'))).toEqual([
      'PUT /api/v1/ingredients/merguez',
    ])
  })

  it('dit l’échec de la liste sans quitter l’écran, le produit étant déjà enregistré', async () => {
    const { wrapper, context } = await edit(none, types, {
      'PUT /api/v1/ingredients/merguez': () => new Response(null, { status: 204 }),
      'PUT /api/v1/ingredients/merguez/list-destination': () =>
        json({ error: { message: 'LIST_TYPE_NOT_FOUND' } }, { status: 404 }),
    })
    await vi.waitFor(() => expect(radios(wrapper)).toHaveLength(4))

    await radios(wrapper)[3]!.setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(context.router.currentRoute.value.name).not.toBe('department')
  })
})

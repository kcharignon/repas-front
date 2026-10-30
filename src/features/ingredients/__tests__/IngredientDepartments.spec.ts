import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import DepartmentView from '@/features/ingredients/DepartmentView.vue'
import DepartmentsView from '@/features/ingredients/DepartmentsView.vue'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useSessionStore } from '@/session/session'

// ING-017 : le repère du rayon dans les listes d'ingrédients, le « même nom dans deux rayons » à la création et à la modification.
const departments = {
  member: [
    { slug: 'surgele', name: 'Surgelés', image: 'images/surgele.png', icon: 'snowflake' },
    { slug: 'conserve', name: 'Conserves', image: 'images/conserve.png', icon: 'can' },
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png', icon: null },
  ],
  totalItems: 3,
}
const units = {
  member: [
    { slug: 'gramme', name: 'Gramme', symbol: 'g' },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg' },
  ],
  totalItems: 2,
}
const option = (slug: string, name: string, departmentSlug: string, departmentName: string) => ({
  slug,
  name,
  departmentSlug,
  departmentName,
})
const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/departments': () => json(departments),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/ingredients/duplicates': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/ingredients/to-fix': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: 'list-1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

async function open(path: string, handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)

  return { fetchMock, context }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('DepartmentView : le repère du rayon', () => {
  const show = async (slug: string, icon: string | null) => {
    const { context } = await open(`/rayons/${slug}`, {
      [`GET /api/v1/departments/${slug}/ingredients`]: () =>
        json({
          member: [
            { slug: 'pois', name: 'Petits pois', purchaseUnitSymbol: 'g', canEdit: true },
            { slug: 'mais', name: 'Maïs', purchaseUnitSymbol: 'g', canEdit: true },
          ],
          totalItems: 2,
          department: { slug, icon },
        }),
    })
    const wrapper = mount(DepartmentView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
    await flushPromises()

    return wrapper
  }

  it('pose l’icône du rayon devant chaque ingrédient, caché des lecteurs d’écran', async () => {
    const wrapper = await show('surgele', 'snowflake')

    const markers = wrapper.findAll('li [data-department-marker="snowflake"]')
    expect(markers).toHaveLength(2)
    expect(markers[0]?.attributes('aria-hidden')).toBe('true')
    // Hors du nom cliquable et du stepper
    expect(wrapper.find('li a [data-department-marker]').exists()).toBe(false)
    expect(wrapper.find('li button [data-department-marker]').exists()).toBe(false)
  })

  it('n’affiche rien pour un rayon sans icône', async () => {
    const wrapper = await show('legumes', null)

    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
    expect(wrapper.find('li [aria-hidden="true"].size-6').exists()).toBe(false)
  })
})

describe('DepartmentsView : la recherche et le repère du rayon', () => {
  it('pose le repère devant le nom ; le rayon se lisait déjà dessous', async () => {
    const hit = (slug: string, name: string, departmentSlug: string, departmentName: string) => ({
      slug,
      name,
      purchaseUnitSymbol: 'g',
      canEdit: true,
      departmentSlug,
      departmentName,
      departmentImage: `images/${departmentSlug}.png`,
    })
    const { context } = await open('/rayons', {
      'GET /api/v1/ingredients/search': () =>
        json({
          member: [
            hit('pois-surgeles', 'Petits pois', 'surgele', 'Surgelés'),
            hit('pois-frais', 'Petits pois', 'legumes', 'Fruits et légumes'),
          ],
          totalItems: 2,
        }),
    })
    const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.find('input[type="search"]').exists()).toBe(true))
    await wrapper.find('input[type="search"]').setValue('petits pois')
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    const [first, second] = wrapper.findAll('li')
    expect(first?.find('[data-department-marker="snowflake"]').exists()).toBe(true)
    expect(first?.text()).toContain('Surgelés')
    expect(second?.find('[data-department-marker]').exists()).toBe(false)
    expect(second?.text()).toContain('Fruits et légumes')
  })
})

describe('IngredientEditorView : le même nom dans deux rayons', () => {
  const edit = async (path: string, handlers: Parameters<typeof stubApi>[0] = {}) => {
    const { context, fetchMock } = await open(path, {
      'GET /api/v1/ingredients': () =>
        json({
          member: [option('pois-surgeles', 'Petits pois', 'surgele', 'Surgelés')],
          totalItems: 1,
        }),
      ...handlers,
    })
    const wrapper = mount(IngredientEditorView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() =>
      expect((wrapper.findAll('select')[1]?.element as HTMLSelectElement | undefined)?.value).toBe(
        'gramme',
      ),
    )
    await flushPromises()

    return { wrapper, fetchMock, context }
  }
  const nameInput = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
    wrapper.findAll('input').find((input) => input.attributes('type') === undefined) ??
    wrapper.find('input')
  const info = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
    wrapper.find('[data-testid="name-elsewhere"]')

  it('dit, sans bloquer, que le nom existe dans un autre rayon', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')

    await nameInput(wrapper).setValue('petits pois')

    expect(info(wrapper).text()).toBe(
      'Tu as déjà « Petits pois » dans Surgelés. Celui-ci sera dans Fruits et légumes.',
    )
    expect(info(wrapper).attributes('role')).toBe('status')
    // Rien n'est bloqué : le bouton d'enregistrement reste actif
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('suit le rayon choisi : plus d’information quand c’est le même rayon (le back refusera)', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await nameInput(wrapper).setValue('Petits pois')
    expect(info(wrapper).exists()).toBe(true)

    await wrapper.findAll('select')[0]?.setValue('surgele')

    expect(info(wrapper).exists()).toBe(false)
  })

  it('ne dit rien pour un nom que personne n’a', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await nameInput(wrapper).setValue('Cardamome')

    expect(info(wrapper).exists()).toBe(false)
  })

  it('un back plus ancien (la liste ne dit pas le rayon) ne dit rien', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes', {
      'GET /api/v1/ingredients': () =>
        json({ member: [{ slug: 'pois', name: 'Petits pois' }], totalItems: 1 }),
    })

    await nameInput(wrapper).setValue('Petits pois')

    expect(info(wrapper).exists()).toBe(false)
  })

  it('refuse le même nom dans le même rayon (409 INGREDIENT_NAME_ALREADY_USED) avec le nom et le rayon', async () => {
    const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=surgele', {
      'POST /api/v1/ingredients': () =>
        json({ error: { message: 'INGREDIENT_NAME_ALREADY_USED' } }, { status: 409 }),
    })
    await nameInput(wrapper).setValue('petits pois')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/ingredients')
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Tu as déjà « Petits pois » dans Surgelés. Choisis-le plutôt que d’en créer un autre.',
    )
    expect(wrapper.text()).not.toContain('autre modification')
  })

  it('le même refus à la modification (changement de nom ou de rayon) dit la même chose', async () => {
    const { wrapper } = await edit('/ingredients/pois-frais/modifier', {
      'GET /api/v1/ingredients/pois-frais': () =>
        json({
          slug: 'pois-frais',
          name: 'Pois frais',
          image: '',
          departmentSlug: 'legumes',
          departmentName: 'Fruits et légumes',
          cookingUnitSlug: 'gramme',
          cookingUnitName: 'Gramme',
          purchaseUnitSlug: 'gramme',
          purchaseUnitName: 'Gramme',
          purchaseUnitSymbol: 'g',
          hasSameUnit: true,
          coefficient: 1,
          creatorId: 'u1',
          canEdit: true,
        }),
      'GET /api/v1/ingredients/pois-frais/conversions': () =>
        json({ member: [], common: [], totalItems: 0, convertible: true }),
      'PUT /api/v1/ingredients/pois-frais': () =>
        json({ error: { message: 'INGREDIENT_NAME_ALREADY_USED' } }, { status: 409 }),
    })
    await vi.waitFor(() =>
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('Pois frais'),
    )
    await nameInput(wrapper).setValue('Petits pois')
    await wrapper.findAll('select')[0]?.setValue('surgele')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Tu as déjà « Petits pois » dans Surgelés. Choisis-le plutôt que d’en créer un autre.',
    )
    // L'information de création n'existe pas à la modification
    expect(info(wrapper).exists()).toBe(false)
  })

  it('un 409 d’un autre code garde le message de conflit habituel', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes', {
      'POST /api/v1/ingredients': () => json({ error: { message: 'autre' } }, { status: 409 }),
    })
    await nameInput(wrapper).setValue('Cardamome')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).not.toContain('Tu as déjà')
  })
})

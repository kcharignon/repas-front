import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import { useSessionStore } from '@/session/session'

// Le repère du rayon devant chaque ingrédient d'une recette, et le rayon sous le nom quand le nom existe dans deux rayons (ING-017).
const departments = {
  member: [
    { slug: 'surgele', name: 'Surgelés', image: 'images/surgele.png', icon: 'snowflake' },
    { slug: 'conserve', name: 'Conserves', image: 'images/conserve.png', icon: 'can' },
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png', icon: null },
  ],
  totalItems: 3,
}

const row = (slug: string, name: string, departmentSlug?: string, departmentName?: string) => ({
  ingredientSlug: slug,
  ingredientName: name,
  ingredientImage: '',
  quantity: 400,
  unitSlug: 'gramme',
  unitSymbol: 'g',
  unitName: 'gramme',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
  convertible: true,
  ...(departmentSlug === undefined ? {} : { departmentSlug, departmentName }),
})

async function open(rows: unknown[], handlers: Parameters<typeof stubApi>[0] = {}) {
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/shopping-lists/active/summary': () =>
      json({ shoppingListId: 'list-1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
    'GET /api/v1/recipes/r1': () =>
      json({
        id: 'r1',
        name: 'Soupe',
        serving: 4,
        typeSlug: 'plat',
        typeName: 'Plat',
        version: 1,
        rows,
      }),
    'GET /api/v1/recipe-types/plat/recipes': () => json({ member: [], totalItems: 0 }),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/recettes/r1')
  const wrapper = mount(RecipeDetailView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))
  await flushPromises()

  return wrapper
}

const markers = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('li')
    .map(
      (line) =>
        line.element
          .querySelector('[data-department-marker]')
          ?.getAttribute('data-department-marker') ?? null,
    )

describe('RecipeDetailView : le rayon des ingrédients', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('pose le repère du rayon devant le nom, et le rayon dessous seulement pour un nom qui existe dans deux rayons', async () => {
    const wrapper = await open([
      row('pois-surgeles', 'Petits pois', 'surgele', 'Surgelés'),
      row('pois-frais', 'Petits pois', 'legumes', 'Fruits et légumes'),
      row('mais', 'Maïs', 'conserve', 'Conserves'),
      row('oignon', 'Oignon', 'legumes', 'Fruits et légumes'),
    ])

    const lines = wrapper.findAll('li')
    expect(markers(wrapper)).toEqual(['snowflake', null, 'can', null])
    // Le rayon sous le nom : les deux « Petits pois » seulement
    expect(lines[0]?.text()).toContain('Surgelés')
    expect(lines[1]?.text()).toContain('Fruits et légumes')
    expect(lines[2]?.text()).not.toContain('Conserves')
    expect(lines[3]?.text()).not.toContain('Fruits et légumes')
    // Le repère est décoratif : un lecteur d'écran ne lit que le nom (et le rayon quand il distingue)
    expect(lines[2]?.find('[data-department-marker]').attributes('aria-hidden')).toBe('true')
  })

  it('une ligne sans icône garde la place du repère quand une autre en a un', async () => {
    const wrapper = await open([
      row('mais', 'Maïs', 'conserve', 'Conserves'),
      row('oignon', 'Oignon', 'legumes', 'Fruits et légumes'),
    ])

    const line = wrapper.findAll('li')[1]
    expect(line?.find('[data-department-marker]').exists()).toBe(false)
    expect(line?.find('[aria-hidden="true"].size-6').exists()).toBe(true)
  })

  it('n’affiche aucun repère, aucune place vide ni aucun rayon quand aucun rayon n’a d’icône', async () => {
    const wrapper = await open([row('oignon', 'Oignon', 'legumes', 'Fruits et légumes')])

    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
    expect(wrapper.find('li [aria-hidden="true"].size-6').exists()).toBe(false)
    expect(wrapper.find('li').text()).not.toContain('Fruits et légumes')
  })

  it('un back plus ancien (ni icône ni rayon dans les lignes) ne casse rien : pas de repère', async () => {
    const wrapper = await open([row('pois-1', 'Petits pois'), row('pois-2', 'Petits pois')], {
      'GET /api/v1/departments': () =>
        json({
          member: [{ slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png' }],
          totalItems: 1,
        }),
    })

    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Fruits et légumes')
  })

  it('ignore une icône que ce front ne connaît pas, sans erreur', async () => {
    const wrapper = await open([row('pain', 'Pain', 'boulangerie', 'Boulangerie')], {
      'GET /api/v1/departments': () =>
        json({
          member: [
            { slug: 'boulangerie', name: 'Boulangerie', image: 'images/b.png', icon: 'baguette' },
          ],
          totalItems: 1,
        }),
    })

    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
    expect(wrapper.find('li [aria-hidden="true"].size-6').exists()).toBe(false)
  })

  it('ne casse pas quand la liste des rayons ne se charge pas : la recette reste lisible, sans repère', async () => {
    const wrapper = await open([row('mais', 'Maïs', 'conserve', 'Conserves')], {
      'GET /api/v1/departments': () => json({ error: { message: 'boom' } }, { status: 500 }),
    })

    expect(wrapper.find('li').text()).toContain('Maïs')
    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
  })
})

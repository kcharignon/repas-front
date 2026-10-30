import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import { useSessionStore } from '@/session/session'

// Dans le formulaire d'une recette, l'ingrédient choisi montre son repère de rayon sous le champ (jamais dedans),
// et son rayon quand son nom existe dans deux rayons (ING-017).
const departments = {
  member: [
    { slug: 'surgele', name: 'Surgelés', image: 'images/surgele.png', icon: 'snowflake' },
    { slug: 'conserve', name: 'Conserves', image: 'images/conserve.png', icon: 'can' },
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png', icon: null },
  ],
  totalItems: 3,
}
const ingredient = (
  slug: string,
  name: string,
  departmentSlug?: string,
  departmentName?: string,
) => ({
  slug,
  name,
  ...(departmentSlug === undefined ? {} : { departmentSlug, departmentName }),
})
const rowOf = (slug: string, name: string) => ({
  ingredientSlug: slug,
  ingredientName: name,
  ingredientImage: '',
  quantity: 400,
  unitSlug: 'gramme',
  unitSymbol: 'g',
})

async function edit(ingredients: unknown[], rows: unknown[], depts: unknown = departments) {
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(depts),
    'GET /api/v1/recipe-types': () =>
      json({
        member: [{ slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 1 }],
        totalItems: 1,
      }),
    'GET /api/v1/ingredients': () => json({ member: ingredients, totalItems: ingredients.length }),
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
    ...Object.fromEntries(
      (rows as { ingredientSlug: string }[]).map((r) => [
        `GET /api/v1/ingredients/${r.ingredientSlug}/units`,
        () => json({ member: [{ slug: 'gramme', name: 'Gramme' }], totalItems: 1 }),
      ]),
    ),
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/recettes/r1/modifier')
  const wrapper = mount(RecipeEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(rows.length))
  await flushPromises()

  return wrapper
}

const caption = (wrapper: ReturnType<typeof mount>, index: number) =>
  wrapper.findAll('li')[index]?.find('[data-testid="chosen-department"]')

describe('RecipeEditorView : le rayon de l’ingrédient choisi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('montre le repère sous le champ, et le rayon seulement quand le nom existe dans deux rayons', async () => {
    const wrapper = await edit(
      [
        ingredient('pois-surgeles', 'Petits pois', 'surgele', 'Surgelés'),
        ingredient('pois-frais', 'Petits pois', 'legumes', 'Fruits et légumes'),
        ingredient('mais', 'Maïs', 'conserve', 'Conserves'),
        ingredient('oignon', 'Oignon', 'legumes', 'Fruits et légumes'),
      ],
      [
        rowOf('pois-surgeles', 'Petits pois'),
        rowOf('pois-frais', 'Petits pois'),
        rowOf('mais', 'Maïs'),
        rowOf('oignon', 'Oignon'),
      ],
    )

    expect(caption(wrapper, 0)?.find('[data-department-marker="snowflake"]').exists()).toBe(true)
    expect(caption(wrapper, 0)?.text()).toBe('Surgelés')
    // Doublon sans icône : le rayon seul distingue
    expect(caption(wrapper, 1)?.find('[data-department-marker]').exists()).toBe(false)
    expect(caption(wrapper, 1)?.text()).toBe('Fruits et légumes')
    // Une icône, pas de doublon : le repère seul
    expect(caption(wrapper, 2)?.find('[data-department-marker="can"]').exists()).toBe(true)
    expect(caption(wrapper, 2)?.text()).toBe('')
    // Ni icône ni doublon : rien
    expect(caption(wrapper, 3)?.exists()).toBe(false)
    // Jamais dans le champ lui-même
    expect(
      wrapper.findAll('li')[0]?.find('input').element.closest('[data-department-marker]'),
    ).toBeNull()
  })

  it('ne montre rien avec un back plus ancien (ni rayon ni icône)', async () => {
    const wrapper = await edit(
      [ingredient('mais', 'Maïs'), ingredient('mais-bis', 'Maïs')],
      [rowOf('mais', 'Maïs')],
      { member: [{ slug: 'conserve', name: 'Conserves', image: 'images/c.png' }], totalItems: 1 },
    )

    expect(caption(wrapper, 0)?.exists()).toBe(false)
    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import DepartmentView from '@/features/ingredients/DepartmentView.vue'
import { useSessionStore } from '@/session/session'

// Un produit qui va dans la liste d'un type (ADR 0036) : sa quantité se lit dans cette liste, pas seulement dans la principale.
describe('DepartmentView avec des listes de types', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('ajoute à la quantité de la liste principale celle des listes de types', async () => {
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/departments': () =>
        json({
          member: [{ slug: 'viandes', name: 'Viandes', image: '', icon: null, listTypeId: 't1' }],
          totalItems: 1,
        }),
      'GET /api/v1/departments/viandes/ingredients': () =>
        json({
          member: [{ slug: 'merguez', name: 'Merguez', purchaseUnitSymbol: '', canEdit: true }],
          totalItems: 1,
        }),
      'GET /api/v1/shopping-lists/active/summary': () =>
        json({ shoppingListId: 'list-main', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
      'GET /api/v1/shopping-lists/open': () =>
        json({
          member: [
            {
              id: 'list-main',
              name: 'x',
              typeId: null,
              rowCount: 0,
              uncheckedCount: 0,
              version: 1,
            },
            {
              id: 'list-b',
              name: 'Boucherie',
              typeId: 't1',
              rowCount: 1,
              uncheckedCount: 1,
              version: 1,
            },
          ],
          totalItems: 2,
        }),
      'GET /api/v1/shopping-lists/list-b': () =>
        json({
          id: 'list-b',
          displayName: 'Boucherie',
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
          recipeTypes: [],
        }),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    await context.router.push('/rayons/viandes')
    const wrapper = mount(DepartmentView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })

    await vi.waitFor(() =>
      expect(wrapper.get('[aria-live="polite"]').text().replace(/\s/g, ' ')).toContain('3'),
    )
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import PlanButton from '@/features/recipes/PlanButton.vue'
import { useSessionStore } from '@/session/session'

const summary = (planned: string[]) => ({
  shoppingListId: 'list-1',
  quantityByIngredientSlug: {},
  plannedRecipeIds: planned,
})

describe('PlanButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  const open = async (
    variant: 'icon' | 'label' | undefined,
    planned: string[] = [],
    handlers: Parameters<typeof stubApi>[0] = {},
  ) => {
    const fetchMock = stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/shopping-lists/active/summary': () => json(summary(planned)),
      ...handlers,
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    const wrapper = mount(PlanButton, {
      props: { recipeId: 'r1', name: 'Gratin de courgettes', variant },
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('button').attributes('disabled')).toBeUndefined())

    return { wrapper, fetchMock }
  }

  it('variante icône : rond de 44 px, aucun texte, le nom complet reste accessible', async () => {
    const { wrapper } = await open('icon')
    const button = wrapper.find('button')

    expect(button.text()).toBe('')
    expect(button.classes()).toEqual(expect.arrayContaining(['size-11', 'rounded-full']))
    expect(button.attributes('aria-label')).toBe(
      'Ajouter Gratin de courgettes à la liste de courses',
    )
    expect(button.attributes('title')).toBe(button.attributes('aria-label'))
    expect(button.attributes('aria-pressed')).toBe('false')
  })

  it('variante icône planifiée : « Retirer », enfoncé, fond doux', async () => {
    const { wrapper } = await open('icon', ['r1'])
    const button = wrapper.find('button')

    expect(button.text()).toBe('')
    expect(button.attributes('aria-label')).toBe(
      'Retirer Gratin de courgettes de la liste de courses',
    )
    expect(button.attributes('title')).toBe(button.attributes('aria-label'))
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('bg-soft')
  })

  it('variante pastille (par défaut) : texte court, même nom accessible complet', async () => {
    const { wrapper } = await open(undefined)
    const button = wrapper.find('button')

    expect(button.text()).toBe('Ajouter')
    expect(button.classes()).toContain('rounded-full')
    expect(button.classes()).toContain('min-h-11')
    expect(button.attributes('aria-label')).toBe(
      'Ajouter Gratin de courgettes à la liste de courses',
    )
    expect(button.attributes('title')).toBeUndefined()
  })

  it('variante pastille planifiée : « Dans la liste »', async () => {
    const { wrapper } = await open('label', ['r1'])

    expect(wrapper.find('button').text()).toBe('Dans la liste')
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true')
    // Le texte visible fait partie du nom accessible (WCAG 2.5.3)
    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Dans la liste, retirer Gratin de courgettes',
    )
  })

  it.each(['icon', 'label'] as const)('%s : un clic planifie la recette', async (variant) => {
    const { wrapper, fetchMock } = await open(variant, [], {
      'PUT /api/v1/shopping-lists/active/recipes/r1': () => new Response(null, { status: 204 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('PUT /api/v1/shopping-lists/active/recipes/r1')
  })

  it.each(['icon', 'label'] as const)(
    '%s : un clic retire une recette planifiée',
    async (variant) => {
      const { wrapper, fetchMock } = await open(variant, ['r1'], {
        'DELETE /api/v1/shopping-lists/active/recipes/r1': () =>
          new Response(null, { status: 204 }),
      })

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(calls(fetchMock)).toContain('DELETE /api/v1/shopping-lists/active/recipes/r1')
    },
  )
})

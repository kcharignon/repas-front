import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import ShoppingListView from '@/features/shopping-lists/ShoppingListView.vue'
import { useSessionStore } from '@/session/session'

// Le repère du rayon devant chaque ligne de la liste, et le rayon sous le nom quand le nom existe dans deux rayons (ING-017).
const departments = {
  member: [
    { slug: 'surgele', name: 'Surgelés', image: 'images/surgele.png', icon: 'snowflake' },
    { slug: 'conserve', name: 'Conserves', image: 'images/conserve.png', icon: 'can' },
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png', icon: null },
  ],
  totalItems: 3,
}

const row = (id: string, name: string, departmentSlug?: string, departmentName?: string) => ({
  id,
  ingredientName: name,
  quantity: 2,
  unitSymbol: 'kg',
  checked: false,
  ...(departmentSlug === undefined ? {} : { departmentSlug, departmentName }),
})

const listWith = (groups: { slug: string; name: string; rows: unknown[] }[]) => ({
  id: 'list-1',
  name: null,
  displayName: 'Liste du 14 octobre 2026',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status: 'ACTIVE',
  version: 3,
  isActive: true,
  isPaused: false,
  isCompleted: false,
  rowCount: 0,
  recipeCount: 0,
  departments: groups.map((group) => ({ ...group, image: `images/${group.slug}.png` })),
  recipeTypes: [],
})

async function open(list: unknown, handlers: Parameters<typeof stubApi>[0] = {}) {
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/shopping-lists/active/summary': () =>
      json({ shoppingListId: 'list-1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
    'GET /api/v1/shopping-lists/list-1': () => json(list),
    ...handlers,
  })
  const context = appContext()
  await useSessionStore().restore()
  const wrapper = mount(ShoppingListView, { global: { plugins: context.plugins } })
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Chargement'))
  await flushPromises()

  return wrapper
}

const lineOf = (wrapper: ReturnType<typeof mount>, name: string, department?: string) =>
  wrapper
    .findAll('li')
    .filter((item) => item.text().includes(name))
    .find(
      (item) =>
        department === undefined ||
        item.element.closest('section')?.textContent.includes(department),
    )

describe('ShoppingListView : le rayon des lignes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pose le repère devant le nom ; le rayon dessous seulement pour un nom qui existe dans deux rayons', async () => {
    const wrapper = await open(
      listWith([
        {
          slug: 'surgele',
          name: 'Surgelés',
          rows: [row('r1', 'Petits pois', 'surgele', 'Surgelés')],
        },
        {
          slug: 'legumes',
          name: 'Fruits et légumes',
          rows: [
            row('r2', 'Petits pois', 'legumes', 'Fruits et légumes'),
            row('r3', 'Oignon', 'legumes', 'Fruits et légumes'),
          ],
        },
        { slug: 'conserve', name: 'Conserves', rows: [row('r4', 'Maïs', 'conserve', 'Conserves')] },
      ]),
    )

    const surgele = lineOf(wrapper, 'Petits pois', 'Surgelés')
    const frais = lineOf(wrapper, 'Petits pois', 'Fruits et légumes')
    const oignon = lineOf(wrapper, 'Oignon')
    const mais = lineOf(wrapper, 'Maïs')
    expect(surgele?.find('[data-department-marker="snowflake"]').exists()).toBe(true)
    expect(mais?.find('[data-department-marker="can"]').exists()).toBe(true)
    expect(frais?.find('[data-department-marker]').exists()).toBe(false)
    expect(oignon?.find('[data-department-marker]').exists()).toBe(false)
    // Le rayon sous le nom : les deux « Petits pois », pas les autres
    expect(surgele?.find('.text-muted.text-sm').text()).toBe('Surgelés')
    expect(frais?.find('.text-muted.text-sm').text()).toBe('Fruits et légumes')
    expect(oignon?.text()).not.toContain('Fruits et légumes')
    expect(mais?.text()).not.toContain('Conserves')
    // Les repères sont décoratifs
    expect(surgele?.find('[data-department-marker]').attributes('aria-hidden')).toBe('true')
  })

  it('un back plus ancien (ni icône ni rayon dans les lignes) ne casse rien : pas de repère', async () => {
    const wrapper = await open(
      listWith([
        {
          slug: 'legumes',
          name: 'Fruits et légumes',
          rows: [row('r1', 'Courgettes'), row('r2', 'Courgettes')],
        },
      ]),
      {
        'GET /api/v1/departments': () =>
          json({
            member: [{ slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png' }],
            totalItems: 1,
          }),
      },
    )

    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(2)
    expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
    expect(wrapper.find('li [aria-hidden="true"].size-6').exists()).toBe(false)
  })

  it('la case à cocher n’est jamais un repère : le repère est dans le libellé, caché des lecteurs d’écran', async () => {
    const wrapper = await open(
      listWith([
        {
          slug: 'surgele',
          name: 'Surgelés',
          rows: [row('r1', 'Petits pois', 'surgele', 'Surgelés')],
        },
      ]),
    )

    const box = wrapper.find('[role="checkbox"]')
    expect(box.find('[data-department-marker]').exists()).toBe(false)
    expect(box.element.closest('label')?.querySelector('[data-department-marker]')).not.toBeNull()
  })
})

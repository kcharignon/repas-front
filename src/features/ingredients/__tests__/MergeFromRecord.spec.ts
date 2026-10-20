import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useSessionStore } from '@/session/session'
import { candidate, preview } from './mergeFixtures'

const departments = {
  member: [{ slug: 'legumes', name: 'Fruits et légumes', image: '' }],
  totalItems: 1,
}
const units = { member: [{ slug: 'kilo', name: 'Kilo', symbol: 'kg' }], totalItems: 1 }
const detail = (overrides: Record<string, unknown> = {}) => ({
  slug: 'tomates',
  name: 'Tomates',
  image: '',
  departmentSlug: 'legumes',
  departmentName: 'Fruits et légumes',
  cookingUnitSlug: 'kilo',
  cookingUnitName: 'Kilo',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'Kilo',
  purchaseUnitSymbol: 'kg',
  hasSameUnit: true,
  coefficient: null,
  creatorId: 'u1',
  canEdit: true,
  recipeCount: 7,
  listCount: 2,
  ...overrides,
})

const candidates = {
  member: [
    candidate('tomate', 'Tomate', { veryClose: true }),
    candidate('tomate-cerise', 'Tomate cerise', { recipeCount: 2, listCount: 0 }),
    candidate('tomate-surgelee', 'Tomate', {
      sameDepartment: false,
      departmentName: 'Surgelé',
      departmentSlug: 'surgele',
      recipeCount: 1,
      listCount: 0,
    }),
  ],
  totalItems: 3,
}

async function edit(path: string, handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/units': () => json(units),
    'GET /api/v1/ingredients/tomates': () => json(detail()),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(IngredientEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

const dialog = () => document.body.querySelector('[role="dialog"]')
const inDialog = (label: string) =>
  [...(dialog()?.querySelectorAll('button, a') ?? [])].find((element) =>
    element.textContent?.includes(label),
  ) as HTMLElement | undefined

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe("la fusion depuis la fiche d'un ingrédient", () => {
  it('montre « Utilisé dans » et le bouton pour un ingrédient à soi', async () => {
    const { wrapper } = await edit('/ingredients/tomates/modifier')

    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="ingredient-usage"]').text()).toBe(
        'Utilisé dans 7 recettes · 2 listes',
      ),
    )
    const action = wrapper.findAll('button').find((button) => button.text().includes('Fusionner'))
    expect(action?.text()).toBe('Fusionner avec un autre ingrédient')
  })

  it('dit « Utilisé nulle part » et ne dit jamais un compteur à zéro', async () => {
    const { wrapper } = await edit('/ingredients/tomates/modifier', {
      'GET /api/v1/ingredients/tomates': () => json(detail({ recipeCount: 0, listCount: 3 })),
    })

    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="ingredient-usage"]').text()).toBe('Utilisé dans 3 listes'),
    )
  })

  it.each([
    ['un ingrédient commun', { creatorId: null }],
    ['l’ingrédient de quelqu’un d’autre', { creatorId: 'u2' }],
  ])('ne propose rien pour %s', async (_name, overrides) => {
    const { wrapper } = await edit('/ingredients/tomates/modifier', {
      'GET /api/v1/ingredients/tomates': () => json(detail(overrides)),
    })
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    await flushPromises()

    expect(wrapper.text()).not.toContain('Fusionner')
    expect(wrapper.find('[data-testid="ingredient-usage"]').exists()).toBe(false)
  })

  it('ne propose rien pour un nouvel ingrédient', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))

    expect(wrapper.text()).not.toContain('Fusionner')
  })

  describe('la feuille de choix', () => {
    const picking = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
      const context = await edit('/ingredients/tomates/modifier', {
        'GET /api/v1/ingredients/tomates/merge-candidates': () => json(candidates),
        ...handlers,
      })
      await vi.waitFor(() =>
        expect(context.wrapper.find('[data-testid="ingredient-usage"]').exists()).toBe(true),
      )
      await context.wrapper
        .findAll('button')
        .find((button) => button.text().includes('Fusionner'))
        ?.trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())

      return context
    }
    const candidateCalls = (fetchMock: ReturnType<typeof stubApi>) =>
      fetchMock.mock.calls
        .map(([input]) => new URL((input as Request).url))
        .filter((url) => url.pathname.endsWith('/merge-candidates'))
        .map((url) => url.searchParams.get('q'))

    it('s’ouvre sur le début du nom, avec le même rayon d’abord puis les autres', async () => {
      const { fetchMock } = await picking()
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Autres rayons'))

      expect(dialog()?.textContent).toContain('Fusionner « Tomates » avec…')
      expect(dialog()?.textContent).toContain(
        '« Tomates » disparaît : ses recettes et ses listes passent sur l’ingrédient choisi.',
      )
      expect(candidateCalls(fetchMock)).toEqual(['tomates'])
      expect([...(dialog()?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual([
        'Dans le même rayon · Fruit & légume',
        'Autres rayons',
      ])
      const rows = [...(dialog()?.querySelectorAll('li button') ?? [])].map((row) =>
        [...row.querySelectorAll('span')]
          .filter((span) => span.children.length === 0)
          .map((span) => span.textContent)
          .join('|'),
      )
      expect(rows).toEqual([
        'Tomate|12 recettes · 3 listes · kilo|Très proche',
        'Tomate cerise|2 recettes · kilo',
        'Tomate|Surgelé · 1 recette',
      ])
    })

    it('cherche après une pause dans la frappe, avec le texte tapé', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { fetchMock } = await picking()
        await vi.advanceTimersByTimeAsync(10)
        const input = dialog()?.querySelector('input[type="search"]') as HTMLInputElement
        input.value = 'cer'
        input.dispatchEvent(new Event('input'))
        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()

        expect(candidateCalls(fetchMock)).toEqual(['tomates', 'cer'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('dit une phrase courte quand rien ne ressemble', async () => {
      await picking({
        'GET /api/v1/ingredients/tomates/merge-candidates': () =>
          json({ member: [], totalItems: 0 }),
      })

      await vi.waitFor(() =>
        expect(dialog()?.textContent).toContain('Aucun ingrédient ne ressemble à « tomates ».'),
      )
    })

    it('dit l’échec de la recherche', async () => {
      await picking({
        'GET /api/v1/ingredients/tomates/merge-candidates': () =>
          json({ error: { message: 'x' } }, { status: 500 }),
      })

      await vi.waitFor(() =>
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
          'La recherche n’a pas abouti. Rien n’a changé.',
        ),
      )
    })

    it('mène choix, confirmation, fusion puis le rayon de l’ingrédient gardé', async () => {
      const { context, fetchMock } = await picking({
        'GET /api/v1/ingredients/tomates/merge-preview': () =>
          json(preview({ keep: { ...preview().keep, slug: 'tomate', name: 'Tomate' } })),
        'POST /api/v1/ingredients/tomates/merge': () => new Response(null, { status: 204 }),
      })
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Autres rayons'))

      inDialog('Tomate cerise')?.click()
      await vi.waitFor(() =>
        expect(dialog()?.textContent).toContain('Fusionner « Tomates » dans « Tomate cerise » ?'),
      )
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Tes quantités'))
      inDialog('Fusionner')?.click()
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

      const index = calls(fetchMock).indexOf('POST /api/v1/ingredients/tomates/merge')
      expect(await bodyOf(fetchMock, index)).toEqual({ into: 'tomate-cerise' })
      // Jamais vers l'ancienne adresse de l'absorbé : le rayon de l'ingrédient gardé
      expect(context.router.currentRoute.value.params.slug).toBe('fruit-et-legume')
    })
  })
})

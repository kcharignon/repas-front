import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import { useSessionStore } from '@/session/session'

// Une recette dont la farine ne se convertit pas dans l'unité du magasin : la ligne le dit, l'auteur règle sans quitter la page.
const units = {
  member: [
    {
      slug: 'cuillere-a-soupe',
      name: 'cuillère à soupe',
      symbol: 'cuillère à soupe',
      dimension: null,
    },
    { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
    { slug: 'pot', name: 'pot', symbol: 'pot', dimension: 'PACKAGE', baseFactor: 1 },
  ],
  totalItems: 4,
}

const row = (overrides: Record<string, unknown> = {}) => ({
  ingredientSlug: 'veau',
  ingredientName: 'veau',
  ingredientImage: '',
  quantity: 800,
  unitSlug: 'gramme',
  unitSymbol: 'g',
  unitName: 'gramme',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
  convertible: true,
  ...overrides,
})

const farine = row({
  ingredientSlug: 'farine',
  ingredientName: 'farine',
  quantity: 3,
  unitSlug: 'cuillere-a-soupe',
  unitSymbol: 'cuillère à soupe',
  unitName: 'cuillère à soupe',
  convertible: false,
})
const creme = row({
  ingredientSlug: 'creme',
  ingredientName: 'crème fraîche',
  quantity: 20,
  unitSlug: 'gramme',
  purchaseUnitSlug: 'pot',
  purchaseUnitName: 'pot',
  convertible: false,
})

const recipeWith = (rows: unknown[]) => ({
  id: 'r1',
  name: 'Blanquette de veau',
  serving: 4,
  typeSlug: 'plat',
  typeName: 'Plat',
  version: 2,
  rows,
})

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: 'list-1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

async function open(rows: unknown[], mine = true, handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/recipes/r1': () => json(recipeWith(rows)),
    'GET /api/v1/recipe-types/plat/recipes': () =>
      json({ member: mine ? [{ id: 'r1', name: 'x' }] : [], totalItems: mine ? 1 : 0 }),
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
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  // « mine » arrive après la recette : on attend le bouton « Modifier » (à soi) ou la fin des lectures
  await vi.waitFor(() => {
    if (mine && !wrapper.text().includes('Modifier'))
      throw new Error('recette pas encore reconnue comme la sienne')
  })
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const buttonLabelled = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)
const sheet = () => document.body.querySelector('[role="dialog"]')
const typed = (selector: string, value: string) => {
  const input = sheet()?.querySelector<HTMLInputElement>(selector)
  if (input === null || input === undefined) throw new Error(`champ absent : ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('RecipeDetailView : ingrédients à régler', () => {
  it('dit sur la ligne quel ingrédient ne se convertit pas, et en quelle unité', async () => {
    const { wrapper } = await open([row(), farine, creme])

    const lines = wrapper.findAll('li')
    expect(lines[0]?.text()).not.toContain('Je ne sais pas')
    expect(lines[1]?.text()).toContain('Je ne sais pas convertir en kilo')
    expect(lines[2]?.text()).toContain('Je ne sais pas convertir en pot')
    expect(lines[1]?.find('button').text()).toBe('Régler')
    expect(lines[1]?.find('button').attributes('aria-label')).toBe('Régler la conversion de farine')
  })

  it('compte les lignes à régler dans une pastille près du titre', async () => {
    const { wrapper } = await open([row(), farine, creme])

    expect(buttonLabelled(wrapper, '2 à régler')).toBeDefined()
  })

  it('grise « Ajouter » et dit pourquoi tant qu’il reste une ligne à régler', async () => {
    const { wrapper } = await open([row(), farine])

    const plan = wrapper.find('[aria-pressed]')
    expect(plan.attributes('disabled')).toBeDefined()
    const hint = wrapper.find(`#${plan.attributes('aria-describedby')}`)
    expect(hint.text()).toBe('Règle d’abord les ingrédients signalés.')
  })

  it('ne signale rien quand tout se convertit', async () => {
    const { wrapper } = await open([row(), row({ ingredientSlug: 'beurre' })])

    expect(wrapper.text()).not.toContain('à régler')
    expect(wrapper.text()).not.toContain('Régler')
    expect(wrapper.find('[aria-pressed]').attributes('disabled')).toBeUndefined()
  })

  it('ne signale rien et ne bloque rien sur la recette d’un autre', async () => {
    const { wrapper, fetchMock } = await open([row(), farine], false)

    expect(wrapper.text()).not.toContain('Je ne sais pas')
    expect(wrapper.text()).not.toContain('à régler')
    expect(wrapper.find('[aria-pressed]').attributes('disabled')).toBeUndefined()
    expect(calls(fetchMock)).not.toContain('GET /api/v1/units')
  })

  it('ne signale rien quand le back ne dit pas encore « convertible »', async () => {
    const { wrapper } = await open([
      { ...row(), convertible: undefined },
      { ...farine, convertible: undefined },
    ])

    expect(wrapper.text()).not.toContain('Je ne sais pas')
  })

  it('ne lit les unités que quand il y a quelque chose à régler', async () => {
    const calm = await open([row()])
    expect(calls(calm.fetchMock)).not.toContain('GET /api/v1/units')
    calm.wrapper.unmount()

    const busy = await open([row(), farine])
    expect(calls(busy.fetchMock)).toContain('GET /api/v1/units')
  })

  it('ouvre « Nouvelle conversion » prête à recevoir un seul nombre : 1 unité de la ligne = ? petite unité du magasin', async () => {
    const { wrapper } = await open([row(), farine])

    await buttonLabelled(wrapper, 'Régler')?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    expect(sheet()?.textContent).toContain('Nouvelle conversion')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité de départ"]')?.value,
    ).toBe('cuillere-a-soupe')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité d\'arrivée"]')?.value,
    ).toBe('gramme')
    expect(
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Quantité de départ"]')?.value,
    ).toBe('1')
    expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Écris les deux nombres : la conversion se lit ici.',
    )
  })

  it('écrit la conversion de l’ingrédient, relit la recette et fait disparaître l’avertissement', async () => {
    let written = false
    const { wrapper, fetchMock } = await open([row(), farine], true, {
      'GET /api/v1/recipes/r1': () =>
        json(recipeWith([row(), written ? { ...farine, convertible: true } : farine])),
      'POST /api/v1/ingredients/farine/conversions': () => {
        written = true

        return new Response(null, {
          status: 201,
          headers: { Location: '/api/v1/ingredients/farine/conversions/c1' },
        })
      },
    })
    await buttonLabelled(wrapper, 'Régler')?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()

    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Je ne sais pas'))
    const index = fetchMock.mock.calls.findIndex(
      ([input]) =>
        (input as Request).method === 'POST' && (input as Request).url.includes('/conversions'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({
      startUnitSlug: 'cuillere-a-soupe',
      endUnitSlug: 'gramme',
      coefficient: 10,
    })
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(wrapper.text()).not.toContain('à régler')
    expect(wrapper.find('[aria-pressed]').attributes('disabled')).toBeUndefined()
  })

  it('rend le focus à la ligne réglée', async () => {
    let written = false
    const { wrapper } = await open([row(), farine], true, {
      'GET /api/v1/recipes/r1': () =>
        json(recipeWith([row(), written ? { ...farine, convertible: true } : farine])),
      'POST /api/v1/ingredients/farine/conversions': () => {
        written = true

        return new Response(null, { status: 201 })
      },
    })
    await buttonLabelled(wrapper, 'Régler')?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()
    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Je ne sais pas'))
    await vi.waitFor(() =>
      expect((document.activeElement as HTMLElement | null)?.dataset.row).toBe('farine'),
    )
  })

  it('dit en une phrase pourquoi le back refuse, sans fermer la feuille', async () => {
    const { wrapper } = await open([row(), farine], true, {
      'POST /api/v1/ingredients/farine/conversions': () =>
        json({ error: { message: 'CONVERSION_ALREADY_EXISTS' } }, { status: 409 }),
    })
    await buttonLabelled(wrapper, 'Régler')?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()

    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() =>
      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
        'Cette conversion existe déjà : modifie-la.',
      ),
    )
    expect(sheet()).not.toBeNull()
  })

  it('n’écrit rien tant que le nombre manque', async () => {
    const { wrapper, fetchMock } = await open([row(), farine])
    await buttonLabelled(wrapper, 'Régler')?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(calls(fetchMock).some((call) => call.startsWith('POST /api/v1/ingredients'))).toBe(false)
    expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Entre un nombre supérieur à zéro.',
    )
  })
})

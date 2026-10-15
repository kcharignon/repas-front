import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import DepartmentView from '@/features/ingredients/DepartmentView.vue'
import DepartmentsView from '@/features/ingredients/DepartmentsView.vue'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

const departments = {
  member: [
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png' },
    { slug: 'boucherie', name: 'Boucherie', image: 'https://cdn.example.com/viande.png' },
  ],
  totalItems: 2,
}
const ingredients = {
  member: [
    { slug: 'courgette', name: 'courgette', purchaseUnitSymbol: 'kg', canEdit: false },
    { slug: 'ma-sauce', name: 'ma sauce', purchaseUnitSymbol: 'g', canEdit: true },
  ],
  totalItems: 2,
}
const units = {
  member: [
    { slug: 'gramme', name: 'Gramme', symbol: 'g' },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg' },
  ],
  totalItems: 2,
}
const summary = (quantities: Record<string, number> = {}, listId: string | null = 'list-1') => ({
  shoppingListId: listId,
  quantityByIngredientSlug: quantities,
  plannedRecipeIds: [],
})

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/departments': () => json(departments),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/departments/legumes/ingredients': () => json(ingredients),
  'GET /api/v1/shopping-lists/active/summary': () => json(summary({ courgette: 2 })),
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

describe('DepartmentsView', () => {
  it('liste les rayons avec leur image et un lien vers chacun', async () => {
    const { context } = await open('/rayons')
    const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })

    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
      '/rayons/legumes',
      '/rayons/boucherie',
    ])
    expect(wrapper.findAll('img').map((image) => image.attributes('src'))).toEqual([
      '/images/legumes.png',
      'https://cdn.example.com/viande.png',
    ])
  })

  it('signale un back injoignable', async () => {
    const { context } = await open('/rayons', {
      'GET /api/v1/departments': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  })
})

describe('DepartmentView', () => {
  const show = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
    const { context, fetchMock } = await open('/rayons/legumes', handlers)
    const wrapper = mount(DepartmentView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    return { wrapper, fetchMock }
  }

  it('montre les ingrédients du rayon avec leur quantité dans la liste en cours', async () => {
    const { wrapper } = await show()

    expect(wrapper.find('h1').text()).toBe('Fruits et légumes')
    const quantities = wrapper
      .findAll('[aria-live="polite"]')
      .map((quantity) => quantity.text().replace(/\s/g, ' '))
    expect(quantities).toEqual(['2 kg', '0 g'])
  })

  it("ne propose de modifier qu'un ingrédient à soi", async () => {
    const { wrapper } = await show()

    expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
      '/ingredients/ma-sauce/modifier',
    ])
    expect(wrapper.find('a[href^="/ingredients/nouveau"]').attributes('href')).toBe(
      '/ingredients/nouveau?rayon=legumes',
    )
  })

  it('ajoute un et retire un', async () => {
    const { wrapper, fetchMock } = await show({
      'POST /api/v1/shopping-lists/active/ingredients/courgette/increase': () =>
        new Response(null, { status: 204 }),
      'POST /api/v1/shopping-lists/active/ingredients/courgette/decrease': () =>
        new Response(null, { status: 204 }),
    })

    await wrapper.find('button[aria-label="Un de plus : courgette"]').trigger('click')
    await flushPromises()
    await wrapper.find('button[aria-label="Un de moins : courgette"]').trigger('click')
    await flushPromises()

    expect(
      calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/shopping-lists')),
    ).toEqual([
      'POST /api/v1/shopping-lists/active/ingredients/courgette/increase',
      'POST /api/v1/shopping-lists/active/ingredients/courgette/decrease',
    ])
  })

  it('ne descend pas sous zéro', async () => {
    const { wrapper } = await show()

    expect(
      wrapper.find('button[aria-label="Un de moins : ma sauce"]').attributes('disabled'),
    ).toBeDefined()
  })

  it("crée la liste d'abord quand il n'y en a pas", async () => {
    const { wrapper, fetchMock } = await show({
      'GET /api/v1/shopping-lists/active/summary': () => json(summary({}, null)),
      'PUT /api/v1/shopping-lists/active': () => new Response(null, { status: 204 }),
      'POST /api/v1/shopping-lists/active/ingredients/ma-sauce/increase': () =>
        new Response(null, { status: 204 }),
    })

    await wrapper.find('button[aria-label="Un de plus : ma sauce"]').trigger('click')
    await flushPromises()

    expect(
      calls(fetchMock).filter(
        (call) => call.includes('/shopping-lists/active') && !call.startsWith('GET'),
      ),
    ).toEqual([
      'PUT /api/v1/shopping-lists/active',
      'POST /api/v1/shopping-lists/active/ingredients/ma-sauce/increase',
    ])
  })
})

describe('IngredientEditorView', () => {
  const edit = async (path: string, handlers: Parameters<typeof stubApi>[0] = {}) => {
    const { context, fetchMock } = await open(path, handlers)
    const wrapper = mount(IngredientEditorView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })

    return { wrapper, context, fetchMock }
  }

  const detail = {
    slug: 'ma-sauce',
    name: 'ma sauce',
    image: '',
    departmentSlug: 'legumes',
    departmentName: 'Fruits et légumes',
    cookingUnitSlug: 'gramme',
    cookingUnitName: 'Gramme',
    purchaseUnitSlug: 'kilo',
    purchaseUnitName: 'Kilo',
    purchaseUnitSymbol: 'kg',
    hasSameUnit: false,
    coefficient: 1000,
    creatorId: 'u1',
    canEdit: true,
  }

  const nameInput = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
    wrapper.findAll('input').find((input) => input.attributes('type') === undefined) ??
    wrapper.find('input')

  // Rayons et unités chargés : les listes ont leurs options et les valeurs par défaut sont posées
  const ready = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
    vi.waitFor(() =>
      expect((wrapper.findAll('select')[1]?.element as HTMLSelectElement | undefined)?.value).toBe(
        'gramme',
      ),
    )

  it('une création propose le rayon demandé et la première unité', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=boucherie')

    await ready(wrapper)
    const values = wrapper
      .findAll('select')
      .map((select) => (select.element as HTMLSelectElement).value)

    expect(values).toEqual(['boucherie', 'gramme', 'gramme'])
    expect(wrapper.text()).not.toContain('Une unité d’achat vaut combien')
  })

  it('ne demande le coefficient que lorsque les deux unités diffèrent', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await ready(wrapper)

    await wrapper.findAll('select')[2]?.setValue('kilo')

    expect(wrapper.text()).toContain('Une unité d’achat vaut combien')
  })

  it('refuse un nom vide sans appeler le back', async () => {
    const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes')
    await ready(wrapper)

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain("Donnez un nom à l'ingrédient.")
    expect(calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/ingredients'))).toEqual(
      [],
    )
  })

  it('crée puis revient au rayon', async () => {
    const { wrapper, context, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', {
      'POST /api/v1/ingredients': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/praline' } }),
    })
    await ready(wrapper)

    await nameInput(wrapper).setValue('  Praliné ')
    await wrapper.findAll('select')[2]?.setValue('kilo')
    await wrapper.find('input[type="number"]').setValue('1000')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    const post = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'POST' && request.url.endsWith('/ingredients'))
    expect(await post?.json()).toEqual({
      name: 'Praliné',
      departmentSlug: 'legumes',
      defaultCookingUnitSlug: 'gramme',
      defaultPurchaseUnitSlug: 'kilo',
      coefficient: 1000,
    })
  })

  it('affiche le message du back quand il refuse (422)', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes', {
      'POST /api/v1/ingredients': () =>
        json({ error: { message: 'coefficient: obligatoire' } }, { status: 422 }),
    })
    await ready(wrapper)
    await nameInput(wrapper).setValue('Praliné')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('coefficient: obligatoire')
  })

  it("préremplit une modification et l'enregistre", async () => {
    const { wrapper, context, fetchMock } = await edit('/ingredients/ma-sauce/modifier', {
      'GET /api/v1/ingredients/ma-sauce': () => json(detail),
      'PUT /api/v1/ingredients/ma-sauce': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() =>
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('ma sauce'),
    )

    expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('1000')
    await nameInput(wrapper).setValue('ma sauce maison')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    expect(calls(fetchMock)).toContain('PUT /api/v1/ingredients/ma-sauce')
  })

  it('supprime après confirmation', async () => {
    const { wrapper, context, fetchMock } = await edit('/ingredients/ma-sauce/modifier', {
      'GET /api/v1/ingredients/ma-sauce': () => json(detail),
      'DELETE /api/v1/ingredients/ma-sauce': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() =>
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('ma sauce'),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Supprimer')
      ?.trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain("Supprimer l'ingrédient ?"))
    const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent.trim() === 'Supprimer',
    ) as HTMLButtonElement
    confirm.click()
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    expect(calls(fetchMock)).toContain('DELETE /api/v1/ingredients/ma-sauce')
  })

  it('dit pourquoi un ingrédient utilisé ne peut pas être supprimé (409)', async () => {
    const { wrapper } = await edit('/ingredients/ma-sauce/modifier', {
      'GET /api/v1/ingredients/ma-sauce': () => json(detail),
      'DELETE /api/v1/ingredients/ma-sauce': () =>
        json({ error: { message: 'in use' } }, { status: 409 }),
    })
    await vi.waitFor(() =>
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('ma sauce'),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Supprimer')
      ?.trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain("Supprimer l'ingrédient ?"))
    ;(
      [...document.body.querySelectorAll('[role="dialog"] button')].find(
        (button) => button.textContent.trim() === 'Supprimer',
      ) as HTMLButtonElement
    ).click()

    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        'Impossible : cet ingrédient est utilisé dans une recette ou une liste de courses.',
      ]),
    )
  })

  it("dit qu'un ingrédient inconnu n'existe plus", async () => {
    const { wrapper } = await edit('/ingredients/zzz/modifier', {
      'GET /api/v1/ingredients/zzz': () => json({ error: { message: 'x' } }, { status: 404 }),
    })

    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toBe("Cet élément n'existe plus."),
    )
  })
})

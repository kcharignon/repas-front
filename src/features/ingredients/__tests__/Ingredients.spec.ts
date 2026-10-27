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
const found = {
  member: [
    {
      slug: 'tomate',
      name: 'tomate',
      purchaseUnitSymbol: 'kg',
      canEdit: false,
      departmentSlug: 'legumes',
      departmentName: 'Fruits et légumes',
      departmentImage: 'images/legumes.png',
    },
    {
      slug: 'sauce-tomate',
      name: 'sauce tomate',
      purchaseUnitSymbol: 'g',
      canEdit: true,
      departmentSlug: 'epicerie',
      departmentName: 'Épicerie',
      departmentImage: 'https://cdn.example.com/epicerie.png',
    },
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
  'GET /api/v1/ingredients/duplicates': () => json({ member: [], totalItems: 0 }),
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

describe('DepartmentsView : recherche', () => {
  const search = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
    const { context, fetchMock } = await open('/rayons', {
      'GET /api/v1/ingredients/search': () => json(found),
      ...handlers,
    })
    const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    return { wrapper, fetchMock }
  }
  const type = async (wrapper: Awaited<ReturnType<typeof search>>['wrapper'], text: string) => {
    await wrapper.find('input[type="search"]').setValue(text)
  }
  const searchRequests = (fetchMock: ReturnType<typeof stubApi>) =>
    fetchMock.mock.calls
      .map(([input]) => new URL((input as Request).url))
      .filter((url) => url.pathname === '/api/v1/ingredients/search')
      .map((url) => url.searchParams.get('q'))

  it("montre les ingrédients trouvés dans l'ordre du back, avec l'icône et le nom de leur rayon", async () => {
    const { wrapper } = await search()

    await type(wrapper, 'tomtae')
    await vi.waitFor(() => expect(wrapper.text()).toContain('sauce tomate'))

    expect(wrapper.findAll('li .font-medium').map((name) => name.text())).toEqual([
      'tomate',
      'sauce tomate',
    ])
    expect(wrapper.findAll('li img').map((image) => image.attributes('src'))).toEqual([
      '/images/legumes.png',
      'https://cdn.example.com/epicerie.png',
    ])
    expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
      '/rayons/legumes',
      '/rayons/epicerie',
    ])
    expect(wrapper.find('a[aria-label="Aller au rayon Épicerie"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Fruits et légumes')
    // Les rayons laissent la place aux résultats
    expect(wrapper.find('a[href="/rayons/boucherie"]').exists()).toBe(false)
  })

  it('attend une pause dans la frappe et deux lettres avant de chercher', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, fetchMock } = await search()

      await type(wrapper, 't')
      await type(wrapper, 'to')
      await type(wrapper, 'tom')
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()

      expect(searchRequests(fetchMock)).toEqual(['tom'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne cherche pas avec une seule lettre et garde les rayons', async () => {
    const { wrapper, fetchMock } = await search()

    await type(wrapper, ' t ')
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(searchRequests(fetchMock)).toEqual([])
    expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
      '/rayons/legumes',
      '/rayons/boucherie',
    ])
  })

  it('rend les rayons quand on efface la recherche', async () => {
    const { wrapper } = await search()
    await type(wrapper, 'tomate')
    await vi.waitFor(() => expect(wrapper.text()).toContain('sauce tomate'))

    await type(wrapper, '')

    expect(wrapper.find('a[href="/rayons/boucherie"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('sauce tomate')
  })

  it('ajoute un ingrédient trouvé à la liste, comme depuis son rayon', async () => {
    const { wrapper, fetchMock } = await search({
      'POST /api/v1/shopping-lists/active/ingredients/tomate/increase': () =>
        new Response(null, { status: 204 }),
    })
    await type(wrapper, 'tomate')
    await vi.waitFor(() => expect(wrapper.text()).toContain('sauce tomate'))

    await wrapper.find('button[aria-label="Un de plus : tomate"]').trigger('click')
    await flushPromises()

    expect(
      calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/shopping-lists')),
    ).toEqual(['POST /api/v1/shopping-lists/active/ingredients/tomate/increase'])
  })

  it('montre la quantité déjà dans la liste', async () => {
    const { wrapper } = await search({
      'GET /api/v1/shopping-lists/active/summary': () => json(summary({ 'sauce-tomate': 3 })),
    })
    await type(wrapper, 'tomate')
    await vi.waitFor(() => expect(wrapper.text()).toContain('sauce tomate'))

    await vi.waitFor(() =>
      expect(
        wrapper
          .findAll('[aria-live="polite"]')
          .map((quantity) => quantity.text().replace(/\s/g, ' ')),
      ).toEqual(['0 kg', '3 g']),
    )
  })

  it("dit qu'aucun ingrédient ne ressemble à la recherche", async () => {
    const { wrapper } = await search({
      'GET /api/v1/ingredients/search': () => json({ member: [], totalItems: 0 }),
    })

    await type(wrapper, 'zzzz')

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Aucun ingrédient ne ressemble à « zzzz ».'),
    )
  })

  it('signale un back injoignable', async () => {
    const { wrapper } = await search({
      'GET /api/v1/ingredients/search': () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    await type(wrapper, 'tomate')

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

  // ING-015 : le back ne renvoie `isBase` vrai qu'au propriétaire du catalogue ; l'écran n'a rien à deviner
  it('marque de « de base » les seuls ingrédients dont isBase est vrai', async () => {
    const { wrapper } = await show({
      'GET /api/v1/departments/legumes/ingredients': () =>
        json({
          member: [
            { ...ingredients.member[0], isBase: false },
            { ...ingredients.member[1], isBase: true },
          ],
          totalItems: 2,
        }),
    })

    const rows = wrapper.findAll('li')
    expect(rows[0]?.text()).not.toContain('de base')
    expect(rows[1]?.text()).toContain('de base')
    expect(rows[1]?.find('.font-medium').text()).toBe('ma sauce')
  })

  it("ne montre aucune pastille quand le back n'envoie pas isBase (ancien back)", async () => {
    const { wrapper } = await show()

    expect(wrapper.text()).not.toContain('de base')
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
    expect(wrapper.text()).not.toContain('Combien ça fait ?')
  })

  it('ne demande la conversion que lorsque les deux unités diffèrent', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await ready(wrapper)

    await wrapper.findAll('select')[2]?.setValue('kilo')

    expect(wrapper.text()).toContain('Combien ça fait ?')
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('La conversion')
  })

  it('refuse un nom vide sans appeler le back', async () => {
    const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes')
    await ready(wrapper)

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain("Donne un nom à l'ingrédient.")
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
    // « 1 gramme = 0,001 kilo » : le back garde « 1 kilo = 1000 grammes »
    await wrapper.find('input[aria-label="Quantité d\'arrivée"]').setValue('0,001')
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('Praliné : 1 Gramme = 0,001 Kilo')
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

    // « 1 kilo = 1000 grammes » s'écrit « 1 gramme = 0,001 kilo » ; sans y toucher, le coefficient d'origine repart tel quel
    expect(
      (wrapper.find('input[aria-label="Quantité d\'arrivée"]').element as HTMLInputElement).value,
    ).toBe('0,001')
    await nameInput(wrapper).setValue('ma sauce maison')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    expect(calls(fetchMock)).toContain('PUT /api/v1/ingredients/ma-sauce')
    const put = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PUT')
    expect(await put?.json()).toMatchObject({ coefficient: 1000 })
  })

  describe("l'équation de conversion", () => {
    const measured = {
      member: [
        {
          slug: 'cuillere',
          name: 'cuillère à soupe',
          symbol: '',
          dimension: null,
          baseFactor: null,
        },
        { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
        { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
        { slug: 'pot', name: 'pot', symbol: '', dimension: 'PACKAGE', baseFactor: 1 },
      ],
      totalItems: 4,
    }
    const withUnits = {
      'GET /api/v1/units': () => json(measured),
      'POST /api/v1/ingredients': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/farine' } }),
    }
    const postBody = async (fetchMock: Awaited<ReturnType<typeof edit>>['fetchMock']) =>
      fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((request) => request.method === 'POST' && request.url.endsWith('/ingredients'))
        ?.json()
    const pick = async (
      wrapper: Awaited<ReturnType<typeof edit>>['wrapper'],
      cooking: string,
      purchase: string,
    ) => {
      await vi.waitFor(() =>
        expect(wrapper.findAll('select')[1]?.findAll('option').length).toBeGreaterThan(1),
      )
      await wrapper.findAll('select')[1]?.setValue(cooking)
      await wrapper.findAll('select')[2]?.setValue(purchase)
    }
    const rightInput = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
      wrapper.find('input[aria-label="Quantité d\'arrivée"]')

    it('propose la petite unité du poids à droite : « 1 cuillère à soupe = ? gramme » plutôt que kilo', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')

      const end = wrapper.find('select[aria-label="Unité d\'arrivée"]')
      expect((end.element as HTMLSelectElement).value).toBe('gramme')
      expect(end.findAll('option').map((option) => option.attributes('value'))).toEqual([
        'gramme',
        'kilo',
      ])
      expect(wrapper.find('select[aria-label="Unité de départ"]').exists()).toBe(false)

      await nameInput(wrapper).setValue('Farine')
      await rightInput(wrapper).setValue('10')
      expect(wrapper.find('[aria-live="polite"]').text()).toBe(
        'Farine : 1 cuillère à soupe = 10 grammes, et 1 gramme = 0,1 cuillère à soupe.',
      )
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      // 1 cuillère = 10 g = 0,01 kilo, donc 1 kilo = 100 cuillères
      expect(await postBody(fetchMock)).toMatchObject({
        defaultCookingUnitSlug: 'cuillere',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 100,
      })
    })

    it('accepte « 8 cuillères = 1 kilo » en changeant le nombre de gauche', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')
      await nameInput(wrapper).setValue('Farine')

      await wrapper.find('select[aria-label="Unité d\'arrivée"]').setValue('kilo')
      await wrapper.find('input[aria-label="Quantité de départ"]').setValue('8')
      await rightInput(wrapper).setValue('1')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect((await postBody(fetchMock))?.coefficient).toBe(8)
    })

    it("n'offre qu'une unité à droite pour un conditionnement, sans petite unité", async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'gramme', 'pot')
      await nameInput(wrapper).setValue('Yaourt')

      expect(wrapper.find('select[aria-label="Unité d\'arrivée"]').exists()).toBe(false)
      await wrapper.find('input[aria-label="Quantité de départ"]').setValue('125')
      await rightInput(wrapper).setValue('1')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      // 125 g = 1 pot, donc 1 pot = 125 g
      expect((await postBody(fetchMock))?.coefficient).toBe(125)
    })

    it('laisse le nombre de droite vide : pas de coefficient (le back connaît déjà la conversion)', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'gramme', 'kilo')
      await nameInput(wrapper).setValue('Farine')

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await postBody(fetchMock)).toMatchObject({ coefficient: null })
    })

    it('refuse un nombre nul à droite sans appeler le back et le dit', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')
      await nameInput(wrapper).setValue('Farine')
      await rightInput(wrapper).setValue('0')

      expect(wrapper.find('[aria-live="polite"]').text()).toBe('Entre un nombre supérieur à zéro.')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(
        calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/ingredients')),
      ).toEqual([])
    })

    it("repart d'une équation vide quand on change l'unité d'achat", async () => {
      const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')
      await rightInput(wrapper).setValue('10')

      await wrapper.findAll('select')[2]?.setValue('pot')

      expect((rightInput(wrapper).element as HTMLInputElement).value).toBe('')
    })
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

  describe('ingrédient de base (ING-015)', () => {
    const baseSwitch = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
      wrapper.find('button[role="switch"]')
    const loaded = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper']) =>
      vi.waitFor(() =>
        expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('ma sauce'),
      )
    const putBody = async (fetchMock: ReturnType<typeof stubApi>) => {
      const request = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((call) => call.method === 'PUT' && call.url.endsWith('/ingredients/ma-sauce'))

      return (await request?.json()) as Record<string, unknown>
    }
    const owner = { ...detail, isBase: false, canSetBase: true }
    const handlers = (reply: object = owner) => ({
      'GET /api/v1/ingredients/ma-sauce': () => json(reply),
      'PUT /api/v1/ingredients/ma-sauce': () => new Response(null, { status: 204 }),
    })

    it("montre l'interrupteur, éteint, au propriétaire du catalogue", async () => {
      const { wrapper } = await edit('/ingredients/ma-sauce/modifier', handlers())
      await loaded(wrapper)

      const toggle = baseSwitch(wrapper)
      expect(toggle.exists()).toBe(true)
      expect(toggle.attributes('aria-checked')).toBe('false')
      expect(wrapper.text()).toContain('Ingrédient de base')
      expect(wrapper.text()).toContain('Copié dans les nouveaux comptes.')
    })

    it("reflète un ingrédient déjà de base et n'envoie pas isBase tant qu'on n'y touche pas", async () => {
      const { wrapper, fetchMock } = await edit(
        '/ingredients/ma-sauce/modifier',
        handlers({ ...owner, isBase: true }),
      )
      await loaded(wrapper)
      expect(baseSwitch(wrapper).attributes('aria-checked')).toBe('true')

      await nameInput(wrapper).setValue('ma sauce maison')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await putBody(fetchMock)).not.toHaveProperty('isBase')
    })

    it("envoie isBase quand on l'a changé, avec le reste du formulaire", async () => {
      const { wrapper, context, fetchMock } = await edit(
        '/ingredients/ma-sauce/modifier',
        handlers(),
      )
      await loaded(wrapper)

      await baseSwitch(wrapper).trigger('click')
      expect(baseSwitch(wrapper).attributes('aria-checked')).toBe('true')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

      expect(await putBody(fetchMock)).toEqual({
        name: 'ma sauce',
        departmentSlug: 'legumes',
        defaultCookingUnitSlug: 'gramme',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 1000,
        isBase: true,
      })
    })

    it('envoie false quand on retire le marqueur', async () => {
      const { wrapper, context, fetchMock } = await edit(
        '/ingredients/ma-sauce/modifier',
        handlers({ ...owner, isBase: true }),
      )
      await loaded(wrapper)

      await baseSwitch(wrapper).trigger('click')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

      expect((await putBody(fetchMock)).isBase).toBe(false)
    })

    it("n'envoie rien quand on bascule puis qu'on revient à la valeur de départ", async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/ma-sauce/modifier', handlers())
      await loaded(wrapper)

      await baseSwitch(wrapper).trigger('click')
      await baseSwitch(wrapper).trigger('click')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await putBody(fetchMock)).not.toHaveProperty('isBase')
    })

    it("n'a ni interrupteur ni isBase quand canSetBase est faux, même si isBase est vrai", async () => {
      const { wrapper, fetchMock } = await edit(
        '/ingredients/ma-sauce/modifier',
        handlers({ ...detail, isBase: true, canSetBase: false }),
      )
      await loaded(wrapper)

      expect(baseSwitch(wrapper).exists()).toBe(false)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await putBody(fetchMock)).not.toHaveProperty('isBase')
    })

    it("tolère un ancien back : sans isBase ni canSetBase, ni interrupteur ni isBase dans l'envoi", async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/ma-sauce/modifier', handlers(detail))
      await loaded(wrapper)

      expect(baseSwitch(wrapper).exists()).toBe(false)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await putBody(fetchMock)).toEqual({
        name: 'ma sauce',
        departmentSlug: 'legumes',
        defaultCookingUnitSlug: 'gramme',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 1000,
      })
    })

    it("n'en propose pas à la création", async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', {
        'POST /api/v1/ingredients': () =>
          new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/praline' } }),
      })
      await ready(wrapper)

      expect(baseSwitch(wrapper).exists()).toBe(false)
      await nameInput(wrapper).setValue('Praliné')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const post = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((request) => request.method === 'POST' && request.url.endsWith('/ingredients'))
      expect(await post?.json()).not.toHaveProperty('isBase')
    })

    it('dit en deux phrases que le réglage est refusé (403) sans casser le formulaire', async () => {
      const { wrapper } = await edit('/ingredients/ma-sauce/modifier', {
        ...handlers(),
        'PUT /api/v1/ingredients/ma-sauce': () =>
          json({ error: { message: 'INGREDIENT_BASE_FORBIDDEN' } }, { status: 403 }),
      })
      await loaded(wrapper)

      await baseSwitch(wrapper).trigger('click')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const alert = wrapper.find('[role="alert"]')
      expect(alert.text()).toBe('Ce réglage n’est pas pour ton compte. Rien n’a changé.')
      expect(alert.text()).not.toContain('INGREDIENT_BASE_FORBIDDEN')
      expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('ma sauce')
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })
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

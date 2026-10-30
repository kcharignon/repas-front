import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterView } from 'vue-router'

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
  'GET /api/v1/ingredients/to-fix': () => json({ member: [], totalItems: 0 }),
  // La section « Conversions de … » de la fiche d'un ingrédient à soi
  'GET /api/v1/ingredients/ma-sauce/conversions': () =>
    json({
      member: [
        {
          id: 'c-kilo',
          startUnitSlug: 'kilo',
          startUnitName: 'Kilo',
          endUnitSlug: 'gramme',
          endUnitName: 'Gramme',
          coefficient: 1000,
        },
      ],
      common: [],
      totalItems: 1,
      convertible: true,
      cookingUnitSlug: 'gramme',
      purchaseUnitSlug: 'kilo',
    }),
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
      '/ingredients/sauce-tomate/modifier',
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
    expect(wrapper.text()).not.toContain('combien de')
  })

  it('ne demande la conversion que lorsque les deux unités diffèrent', async () => {
    const { wrapper } = await edit('/ingredients/nouveau?rayon=legumes')
    await ready(wrapper)

    await wrapper.findAll('select')[2]?.setValue('kilo')

    // La question facile à répondre : combien d'unités de recette dans UNE unité d'achat
    expect(wrapper.text()).toContain('Dans 1 Kilo, combien de Grammes ?')
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
    // « 1 kilo = 1000 grammes » : le nombre de droite EST le coefficient du back
    await wrapper.find('input[aria-label="Quantité d\'arrivée"]').setValue('1000')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Praliné : 1 Kilo = 1000 Grammes.')
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

  it('met en majuscule le nom tapé et envoie la majuscule', async () => {
    const { wrapper, context, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', {
      'POST /api/v1/ingredients': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/oeufs' } }),
    })
    await ready(wrapper)

    await nameInput(wrapper).setValue('œufs de caille')
    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('Œufs de caille')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    const post = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'POST' && request.url.endsWith('/ingredients'))
    expect(await post?.json()).toMatchObject({ name: 'Œufs de caille' })
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

    // « 1 kilo = 1000 grammes » se rouvre tel quel, dans le sens « 1 unité d'achat = N unités de recette »
    await vi.waitFor(() =>
      expect(
        (wrapper.find('input[aria-label="Quantité d\'arrivée"]').element as HTMLInputElement).value,
      ).toBe('1000'),
    )
    expect(
      (wrapper.find('input[aria-label="Quantité de départ"]').element as HTMLInputElement).value,
    ).toBe('1')
    await nameInput(wrapper).setValue('ma sauce maison')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))

    expect(calls(fetchMock)).toContain('PUT /api/v1/ingredients/ma-sauce')
    const put = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PUT')
    // Équation intacte : rien n'est réécrit (le back connaît déjà la conversion)
    expect(await put?.json()).toMatchObject({ name: 'Ma sauce maison', coefficient: null })
  })

  describe("l'équation de conversion", () => {
    const measured = {
      member: [
        { slug: 'cuillere', name: 'cuillère à soupe', symbol: '' },
        { slug: 'gramme', name: 'gramme', symbol: 'g' },
        { slug: 'kilo', name: 'kilo', symbol: 'kg' },
        { slug: 'pot', name: 'pot', symbol: '' },
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

    it('écrit « 1 [unité d’achat] = ? [unité des recettes] » avec les deux unités du formulaire, sans les faire choisir', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')

      // Les deux unités sont celles d’au-dessus, écrites ; l’unité d’achat à gauche, avec 1, le nombre à dire à droite
      expect(wrapper.find('select[aria-label="Unité de départ"]').exists()).toBe(false)
      expect(wrapper.find('select[aria-label="Unité d\'arrivée"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Dans 1 kilo, combien de cuillères à soupe ?')
      expect(
        (wrapper.find('input[aria-label="Quantité de départ"]').element as HTMLInputElement).value,
      ).toBe('1')
      expect((rightInput(wrapper).element as HTMLInputElement).value).toBe('')

      await nameInput(wrapper).setValue('Farine')
      await rightInput(wrapper).setValue('100')
      // Une seule phrase, jamais la réciproque (« 1 cuillère à soupe = 0,01 kilo »)
      expect(wrapper.find('[aria-live="polite"]').text()).toBe(
        'Farine : 1 kilo = 100 cuillères à soupe.',
      )
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await postBody(fetchMock)).toMatchObject({
        defaultCookingUnitSlug: 'cuillere',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 100,
      })
    })

    it('accepte « 2 kilos = 200 cuillères » en changeant le nombre de gauche : le coefficient est droite ÷ gauche', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'cuillere', 'kilo')
      await nameInput(wrapper).setValue('Farine')

      await wrapper.find('input[aria-label="Quantité de départ"]').setValue('2')
      await rightInput(wrapper).setValue('200')
      expect(wrapper.text()).toContain('Dans 2 kilos, combien de cuillères à soupe ?')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect((await postBody(fetchMock))?.coefficient).toBe(100)
    })

    it('« 1 pot = 125 grammes » : le coefficient du back est 125', async () => {
      const { wrapper, fetchMock } = await edit('/ingredients/nouveau?rayon=legumes', withUnits)
      await pick(wrapper, 'gramme', 'pot')
      await nameInput(wrapper).setValue('Yaourt')

      await rightInput(wrapper).setValue('125')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

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

  describe("rouvre l'équation dans le sens « 1 unité d'achat = N unités de recette »", () => {
    const wine = {
      ...detail,
      slug: 'vin',
      name: 'vin',
      cookingUnitSlug: 'centilitre',
      cookingUnitName: 'centilitre',
      purchaseUnitSlug: 'bouteille',
      purchaseUnitName: 'bouteille',
      purchaseUnitSymbol: '',
    }
    const wineUnits = {
      member: [
        { slug: 'bouteille', name: 'bouteille', symbol: '' },
        { slug: 'centilitre', name: 'centilitre', symbol: 'cl' },
      ],
      totalItems: 2,
    }
    const stored = (start: string, end: string, coefficient: number) => ({
      id: 'c1',
      startUnitSlug: start,
      startUnitName: start,
      endUnitSlug: end,
      endUnitName: end,
      coefficient,
    })
    const list = (member: object[], convertible = true) => ({
      member,
      common: [],
      totalItems: member.length,
      convertible,
      cookingUnitSlug: 'centilitre',
      purchaseUnitSlug: 'bouteille',
    })
    const editWine = (conversions: object, ficheCoefficient: number | null) =>
      edit('/ingredients/vin/modifier', {
        'GET /api/v1/units': () => json(wineUnits),
        'GET /api/v1/ingredients/vin': () => json({ ...wine, coefficient: ficheCoefficient }),
        'GET /api/v1/ingredients/vin/conversions': () => json(conversions),
        'PUT /api/v1/ingredients/vin': () => new Response(null, { status: 204 }),
      })
    const field = (wrapper: Awaited<ReturnType<typeof edit>>['wrapper'], label: string) =>
      wrapper.find(`input[aria-label="${label}"]`).element as HTMLInputElement
    const putBody = async (fetchMock: ReturnType<typeof stubApi>) => {
      const request = fetchMock.mock.calls
        .map(([call]) => call as Request)
        .find((call) => call.method === 'PUT' && call.url.endsWith('/ingredients/vin'))

      return (await request?.json()) as Record<string, unknown>
    }

    it('« 1 bouteille = 30 centilitres » enregistrée dans ce sens se relit « 1 bouteille = 30 centilitres »', async () => {
      const { wrapper, fetchMock } = await editWine(
        list([stored('bouteille', 'centilitre', 30)]),
        30,
      )

      await vi.waitFor(() => expect(field(wrapper, "Quantité d'arrivée").value).toBe('30'))
      expect(field(wrapper, 'Quantité de départ').value).toBe('1')
      expect(wrapper.text()).toContain('Dans 1 bouteille, combien de centilitres ?')
      expect(wrapper.find('[aria-live="polite"]').text()).toBe(
        'Vin : 1 bouteille = 30 centilitres.',
      )

      // Rien touché : rien n'est réécrit
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(await putBody(fetchMock)).toMatchObject({ coefficient: null })
    })

    it("la même conversion enregistrée dans l'AUTRE sens (« 1 centilitre = 0,0333 bouteille ») se relit aussi « 1 bouteille = 30 centilitres »", async () => {
      // Le back ne rend `coefficient` que pour « achat vers recettes » : ici il est nul, la liste porte la conversion
      const { wrapper, fetchMock } = await editWine(
        list([stored('centilitre', 'bouteille', 1 / 30)]),
        null,
      )

      await vi.waitFor(() => expect(field(wrapper, "Quantité d'arrivée").value).toBe('30'))
      expect(field(wrapper, 'Quantité de départ').value).toBe('1')
      expect(wrapper.find('[aria-live="polite"]').text()).toBe(
        'Vin : 1 bouteille = 30 centilitres.',
      )
      expect(wrapper.text()).not.toContain('0,0333')

      // Rien touché : la conversion enregistrée dans l'autre sens ne bouge pas, aucun doublon écrit
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(await putBody(fetchMock)).toMatchObject({ coefficient: null })
    })

    it('envoie le nombre de droite, tel quel, quand on le change', async () => {
      const { wrapper, fetchMock } = await editWine(
        list([stored('centilitre', 'bouteille', 1 / 30)]),
        null,
      )
      await vi.waitFor(() => expect(field(wrapper, "Quantité d'arrivée").value).toBe('30'))

      await wrapper.find('input[aria-label="Quantité d\'arrivée"]').setValue('75')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(await putBody(fetchMock)).toMatchObject({ coefficient: 75 })
    })

    it('sans conversion directe mais avec les unités déjà reliées : pas de valeur inventée, « elles se convertissent déjà »', async () => {
      const { wrapper, fetchMock } = await editWine(list([]), null)

      await vi.waitFor(() =>
        expect(wrapper.find('[aria-live="polite"]').text()).toBe(
          'Elles se convertissent déjà ; tu peux préciser.',
        ),
      )
      expect(field(wrapper, "Quantité d'arrivée").value).toBe('')

      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(await putBody(fetchMock)).toMatchObject({ coefficient: null })
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
        name: 'Ma sauce',
        departmentSlug: 'legumes',
        defaultCookingUnitSlug: 'gramme',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: null,
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
        name: 'Ma sauce',
        departmentSlug: 'legumes',
        defaultCookingUnitSlug: 'gramme',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: null,
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

    // Le parcours entier avec le vrai routeur : rayon, fiche, enregistrement, retour au rayon. Seul ce test voit que le rayon est RELU
    // après l'enregistrement (sinon la pastille n'apparaît qu'au rechargement de la page).
    it('du rayon à la fiche et retour : la pastille « de base » suit l’enregistrement, dans les deux sens', async () => {
      let isBase = false
      const { context, fetchMock } = await open('/rayons/legumes', {
        'GET /api/v1/departments/legumes/ingredients': () =>
          json({ member: [{ ...ingredients.member[1], isBase }], totalItems: 1 }),
        'GET /api/v1/ingredients/ma-sauce': () => json({ ...owner, isBase }),
        'PUT /api/v1/ingredients/ma-sauce': async (request) => {
          const sent = (await request.json()) as { isBase?: boolean }
          isBase = sent.isBase ?? isBase

          return new Response(null, { status: 204 })
        },
      })
      const wrapper = mount(
        { components: { RouterView }, template: '<RouterView />' },
        { attachTo: document.body, global: { plugins: context.plugins } },
      )
      const pill = () => wrapper.findAll('li').filter((item) => item.text().includes('de base'))
      const toggle = () => wrapper.find('button[role="switch"]')
      await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))
      expect(pill()).toHaveLength(0)

      await context.router.push('/ingredients/ma-sauce/modifier')
      await vi.waitFor(() => expect(toggle().attributes('aria-checked')).toBe('false'))
      await toggle().trigger('click')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))
      await vi.waitFor(() => expect(pill()).toHaveLength(1))

      await context.router.push('/ingredients/ma-sauce/modifier')
      await vi.waitFor(() => expect(toggle().attributes('aria-checked')).toBe('true'))
      await toggle().trigger('click')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('department'))
      await vi.waitFor(() => expect(pill()).toHaveLength(0))
      expect(
        calls(fetchMock).filter((call) => call === 'PUT /api/v1/ingredients/ma-sauce'),
      ).toHaveLength(2)
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

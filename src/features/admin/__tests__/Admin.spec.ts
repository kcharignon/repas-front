import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import ConversionsAdminView from '@/features/admin/ConversionsAdminView.vue'
import DepartmentsAdminView from '@/features/admin/DepartmentsAdminView.vue'
import RecipeTypesAdminView from '@/features/admin/RecipeTypesAdminView.vue'
import UnitsAdminView from '@/features/admin/UnitsAdminView.vue'
import UsersAdminView from '@/features/admin/UsersAdminView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { routes } from '@/router'
import { sessionGuard } from '@/session/guard'
import { useSessionStore } from '@/session/session'
import AccountView from '@/views/AccountView.vue'

const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }
const units = {
  member: [
    { slug: 'gramme', name: 'Gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
    { slug: 'unite', name: 'Unité', symbol: '', dimension: null, baseFactor: null },
  ],
  totalItems: 3,
}
const departments = {
  member: [{ slug: 'legumes', name: 'Légumes', image: 'images/legumes.png' }],
  totalItems: 1,
}
const types = {
  member: [{ slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 2 }],
  totalItems: 1,
}
const ingredients = { member: [{ slug: 'beurre', name: 'beurre' }], totalItems: 1 }
const conversions = {
  member: [
    {
      id: 'c1',
      ingredientSlug: 'beurre',
      ingredientName: 'beurre',
      creatorEmail: null,
      startUnitSlug: 'kilo',
      startUnitName: 'Kilo',
      endUnitSlug: 'gramme',
      endUnitName: 'Gramme',
      coefficient: 1000,
    },
    {
      id: 'c2',
      ingredientSlug: null,
      ingredientName: null,
      creatorEmail: null,
      startUnitSlug: 'kilo',
      startUnitName: 'Kilo',
      endUnitSlug: 'gramme',
      endUnitName: 'Gramme',
      coefficient: 1000,
    },
  ],
  totalItems: 2,
}
// « Maintenant » des tests de la vue des utilisateurs : mardi 20 octobre 2026, 14 h (heure locale, comme les dates relatives)
const NOW = new Date(2026, 9, 20, 14, 0)
const at = (year: number, month: number, day: number, hour: number, minute: number) =>
  new Date(year, month, day, hour, minute).toISOString()
const account = (fields: Record<string, unknown>) => ({
  defaultServing: 2,
  recipeCount: 0,
  ingredientCount: 0,
  shoppingListCount: 0,
  createdAt: at(2026, 8, 1, 10, 0),
  isDisabled: false,
  status: 'ACTIVE',
  isAdmin: false,
  appVersion: null,
  appOutdated: false,
  lastLoginAt: null,
  ...fields,
})
const users = {
  member: [
    account({
      id: 'u1',
      email: 'admin@repas.fr',
      recipeCount: 12,
      ingredientCount: 9,
      shoppingListCount: 3,
      createdAt: at(2026, 9, 1, 10, 0),
      isAdmin: true,
      appVersion: '0.1.8',
      appOutdated: true,
      lastLoginAt: at(2026, 9, 20, 12, 0),
    }),
    account({
      id: 'u2',
      email: 'gone@repas.fr',
      isDisabled: true,
      status: 'DISABLED',
      lastLoginAt: at(2026, 8, 2, 9, 0),
    }),
    account({ id: 'u3', email: 'attente@repas.fr', status: 'PENDING', ingredientCount: 1 }),
    account({
      id: 'u4',
      email: 'hier@repas.fr',
      shoppingListCount: 1,
      lastLoginAt: at(2026, 9, 19, 9, 0),
    }),
  ],
  totalItems: 4,
}

const base = (user = admin) => ({
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(user),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/departments': () => json(departments),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/ingredients': () => json(ingredients),
  'GET /api/v1/conversions': () => json(conversions),
  'GET /api/v1/users': () => json(users),
})

async function open(
  view: Parameters<typeof mount>[0],
  handlers: Parameters<typeof stubApi>[0] = {},
) {
  const fetchMock = stubApi({ ...base(), ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/admin')
  const wrapper = mount(view, { attachTo: document.body, global: { plugins: context.plugins } })

  return { wrapper, context, fetchMock }
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent.trim() === label || candidate.getAttribute('aria-label') === label,
  )
const field = (label: string) => {
  const target = [...document.body.querySelectorAll('label')].find(
    (candidate) => candidate.textContent.trim() === label,
  )

  return document.body.querySelector(`#${target?.getAttribute('for') ?? 'absent'}`) as
    HTMLInputElement | HTMLSelectElement
}
// Les champs de l'équation d'une conversion n'ont pas d'étiquette visible : ils se trouvent par leur nom accessible
const named = (label: string) =>
  document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement
const type = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'))
}
const submitDialog = async () => {
  document.body
    .querySelector('[role="dialog"] form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}
const body = async (fetchMock: ReturnType<typeof stubApi>, method: string, suffix: string) =>
  fetchMock.mock.calls
    .map(([call]) => call as Request)
    .find((request) => request.method === method && request.url.endsWith(suffix))
    ?.json()

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('garde administrateur', () => {
  const guarded = async (user: typeof me) => {
    stubApi({ ...base(user) })
    localStorage.setItem('repas.session', '1')
    appContext()
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(sessionGuard)
    await router.push('/admin/unites')

    return router.currentRoute.value.name
  }

  it('laisse un administrateur entrer', async () => {
    expect(await guarded(admin)).toBe('admin-units')
  })

  it('renvoie un utilisateur ordinaire à la liste de courses', async () => {
    expect(await guarded(me)).toBe('shopping-list')
  })

  it("le compte ne propose l'administration qu'à un administrateur", async () => {
    const asAdmin = await open(AccountView)
    expect(asAdmin.wrapper.find('a[href="/admin"]').exists()).toBe(true)
    asAdmin.wrapper.unmount()

    stubApi({ ...base(me) })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    await context.router.push('/moi')
    const asUser = mount(AccountView, { global: { plugins: context.plugins } })
    expect(asUser.find('a[href="/admin"]').exists()).toBe(false)
  })
})

describe('unités', () => {
  const unitsView = (handlers: Parameters<typeof stubApi>[0] = {}) =>
    open(UnitsAdminView, {
      'POST /api/v1/units': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/units/litre' } }),
      'PUT /api/v1/units/gramme': () => new Response(null, { status: 204 }),
      'PUT /api/v1/units/unite': () => new Response(null, { status: 204 }),
      ...handlers,
    })
  const openForm = async (
    wrapper: Awaited<ReturnType<typeof unitsView>>['wrapper'],
    label: string,
  ) => {
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    button(label)?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
  }

  it('liste les unités avec ce qu’elles mesurent, rien pour une unité sans dimension', async () => {
    const { wrapper } = await unitsView()
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))

    const lines = wrapper.findAll('li').map((item) => item.text().replace(/\s+/g, ' '))

    expect(lines[0]).toContain('Gramme')
    expect(lines[0]).toContain('Poids, × 1')
    expect(lines[1]).toContain('Poids, × 1000')
    expect(lines[2]).toBe('Unité—Modifier')
  })

  it('crée une unité sans dimension : les deux champs partent à null', async () => {
    const { wrapper, fetchMock } = await unitsView()
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    expect(wrapper.findAll('li')[2]?.text()).toContain('—')

    button('Nouvelle unité')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    type(field('Nom'), '  Pincée ')
    type(field('Symbole'), 'pin')
    await submitDialog()

    expect(await body(fetchMock, 'POST', '/units')).toEqual({
      name: 'Pincée',
      symbol: 'pin',
      dimension: null,
      baseFactor: null,
    })
  })

  it('crée une unité avec sa dimension et son facteur, et explique à quoi ils servent', async () => {
    const { fetchMock } = await unitsView()
    await vi.waitFor(() => expect(button('Nouvelle unité')).toBeDefined())

    button('Nouvelle unité')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Sert à calculer combien de produits acheter.',
    )
    expect(
      [...field('Ce que l’unité mesure').querySelectorAll('option')].map((o) =>
        o.textContent.trim(),
      ),
    ).toEqual([
      'Aucune (cuillère, tranche…)',
      'Poids',
      'Volume',
      'Nombre de pièces',
      'Conditionnement',
    ])
    type(field('Nom'), 'Litre')
    type(field('Symbole'), 'l')
    type(field('Ce que l’unité mesure'), 'VOLUME')
    type(field('Facteur de base'), '1000')
    await submitDialog()

    expect(await body(fetchMock, 'POST', '/units')).toEqual({
      name: 'Litre',
      symbol: 'l',
      dimension: 'VOLUME',
      baseFactor: 1000,
    })
  })

  it('modifie une unité en reprenant ses valeurs, puis change sa dimension et son facteur', async () => {
    const { wrapper, fetchMock } = await unitsView()
    await openForm(wrapper, 'Modifier Gramme')
    expect(field('Nom').value).toBe('Gramme')
    expect(field('Ce que l’unité mesure').value).toBe('WEIGHT')
    expect(field('Facteur de base').value).toBe('1')

    type(field('Symbole'), 'gr')
    await submitDialog()
    expect(await body(fetchMock, 'PUT', '/units/gramme')).toEqual({
      name: 'Gramme',
      symbol: 'gr',
      dimension: 'WEIGHT',
      baseFactor: 1,
    })

    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).toBeNull())
    button('Modifier Gramme')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    type(field('Ce que l’unité mesure'), 'PACKAGE')
    type(field('Facteur de base'), '0.5')
    await submitDialog()
    const puts = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .filter((request) => request.method === 'PUT' && request.url.endsWith('/units/gramme'))
    expect(await puts[1]?.json()).toMatchObject({ dimension: 'PACKAGE', baseFactor: 0.5 })
  })

  it('efface la dimension et le facteur d’une unité quand on choisit « Aucune » et vide le facteur', async () => {
    const { wrapper, fetchMock } = await unitsView()
    await openForm(wrapper, 'Modifier Gramme')

    type(field('Ce que l’unité mesure'), '')
    type(field('Facteur de base'), '')
    await submitDialog()

    expect(await body(fetchMock, 'PUT', '/units/gramme')).toEqual({
      name: 'Gramme',
      symbol: 'g',
      dimension: null,
      baseFactor: null,
    })
  })

  it('refuse un facteur nul ou négatif sans appeler le back', async () => {
    const { wrapper, fetchMock } = await unitsView()
    await openForm(wrapper, 'Modifier Gramme')

    type(field('Facteur de base'), '0')
    await submitDialog()
    expect(document.body.textContent).toContain('Entre un nombre supérieur à zéro, ou laisse vide.')
    type(field('Facteur de base'), '-2')
    await submitDialog()

    expect(document.body.textContent).toContain('Entre un nombre supérieur à zéro, ou laisse vide.')
    expect(calls(fetchMock).filter((call) => call.startsWith('PUT /api/v1/units'))).toEqual([])
  })

  it.each([
    ['une dimension sans facteur', 'WEIGHT', '', 'UNIT_MEASURE_INCOMPLETE'],
    ['un facteur sans dimension', '', '1000', 'UNIT_MEASURE_INCOMPLETE'],
  ])(
    'envoie %s et affiche le refus du back en français',
    async (_label, dimension, factor, code) => {
      const { wrapper, fetchMock } = await unitsView({
        'PUT /api/v1/units/unite': () => json({ error: { message: code } }, { status: 422 }),
      })
      await openForm(wrapper, 'Modifier Unité')
      type(field('Ce que l’unité mesure'), dimension)
      type(field('Facteur de base'), factor)

      await submitDialog()

      expect(await body(fetchMock, 'PUT', '/units/unite')).toMatchObject({
        dimension: dimension === '' ? null : dimension,
        baseFactor: factor === '' ? null : Number(factor),
      })
      expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
        'La dimension et le facteur de base vont ensemble : renseigne les deux, ou laisse-les vides.',
      )
    },
  )

  it('traduit le refus d’un facteur invalide (UNIT_BASE_FACTOR_INVALID)', async () => {
    const { wrapper } = await unitsView({
      'PUT /api/v1/units/gramme': () =>
        json({ error: { message: 'UNIT_BASE_FACTOR_INVALID' } }, { status: 422 }),
    })
    await openForm(wrapper, 'Modifier Gramme')

    await submitDialog()

    expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
      'Le facteur de base doit être un nombre supérieur à zéro.',
    )
  })

  it('exige un nom et affiche le refus du back', async () => {
    const { wrapper, fetchMock } = await unitsView({
      'POST /api/v1/units': () =>
        json({ error: { message: 'name: déjà utilisé' } }, { status: 422 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    button('Nouvelle unité')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())

    await submitDialog()
    expect(document.body.textContent).toContain('Donne un nom.')
    expect(calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/units'))).toEqual([])

    type(field('Nom'), 'Gramme')
    await submitDialog()
    expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
      'name: déjà utilisé',
    )
  })
})

describe('rayons', () => {
  it('crée un rayon avec son image et modifie un rayon', async () => {
    const { wrapper, fetchMock } = await open(DepartmentsAdminView, {
      'POST /api/v1/departments': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/departments/frais' } }),
      'PUT /api/v1/departments/legumes': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(1))

    button('Nouveau rayon')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    await submitDialog()
    expect(document.body.textContent).toContain('Indique une image.')
    type(field('Nom'), 'Frais')
    type(field('Image'), 'images/frais.png')
    await submitDialog()
    expect(await body(fetchMock, 'POST', '/departments')).toEqual({
      name: 'Frais',
      image: 'images/frais.png',
    })

    button('Modifier Légumes')?.click()
    await vi.waitFor(() => expect(field('Nom').value).toBe('Légumes'))
    type(field('Nom'), 'Fruits et légumes')
    await submitDialog()
    expect(await body(fetchMock, 'PUT', '/departments/legumes')).toEqual({
      name: 'Fruits et légumes',
      image: 'images/legumes.png',
    })
  })
})

describe('types de recette', () => {
  it("crée un type avec son ordre d'affichage et modifie un type", async () => {
    const { wrapper, fetchMock } = await open(RecipeTypesAdminView, {
      'POST /api/v1/recipe-types': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/recipe-types/boisson' } }),
      'PUT /api/v1/recipe-types/plat': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(1))
    expect(wrapper.text()).toContain('Ordre 2')

    button('Nouveau type de recette')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    await submitDialog()
    expect(document.body.textContent).toContain('Indique un ordre.')
    type(field('Nom'), 'Boisson')
    type(field('Image'), 'images/boisson.png')
    type(field("Ordre d'affichage"), '5')
    await submitDialog()
    expect(await body(fetchMock, 'POST', '/recipe-types')).toEqual({
      name: 'Boisson',
      image: 'images/boisson.png',
      order: 5,
    })

    button('Modifier Plat')?.click()
    await vi.waitFor(() => expect(field("Ordre d'affichage").value).toBe('2'))
    await submitDialog()
    expect(await body(fetchMock, 'PUT', '/recipe-types/plat')).toEqual({
      name: 'Plat',
      image: 'images/plat.png',
      order: 2,
    })
  })
})

describe('conversions', () => {
  it('liste les conversions avec leur ingrédient ou « Tous les ingrédients »', async () => {
    const { wrapper } = await open(ConversionsAdminView)
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    const lines = wrapper.findAll('li').map((item) => item.text())

    expect(lines[0]).toContain('1 Kilo = 1000 Gramme')
    expect(lines[0]).toContain('beurre')
    expect(lines[1]).toContain('Tous les ingrédients')
  })

  it('crée une conversion commune à tous les ingrédients (ingrédient null)', async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView, {
      'POST /api/v1/conversions': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/conversions/c3' } }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    button('Nouvelle conversion')?.click()
    await vi.waitFor(() => expect(named("Unité d'arrivée")).not.toBeNull())
    type(named("Quantité d'arrivée"), '1000')
    await submitDialog()

    expect(await body(fetchMock, 'POST', '/conversions')).toEqual({
      startUnitSlug: 'gramme',
      endUnitSlug: 'kilo',
      coefficient: 1000,
      ingredientSlug: null,
    })
  })

  it("écrit l'équation et la lit en direct : 8 grammes = 1 kilo vaut 0,125 kilo par gramme", async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView, {
      'POST /api/v1/conversions': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/conversions/c3' } }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    button('Nouvelle conversion')?.click()
    await vi.waitFor(() => expect(named("Unité d'arrivée")).not.toBeNull())
    type(named('Quantité de départ'), '8')
    await flushPromises()
    type(named("Quantité d'arrivée"), '1')
    await flushPromises()

    expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toBe(
      '1 Gramme = 0,125 Kilo, et 1 Kilo = 8 Grammes.',
    )
    await submitDialog()

    expect(await body(fetchMock, 'POST', '/conversions')).toMatchObject({ coefficient: 0.125 })
  })

  it('refuse un nombre vide ou nul sans appeler le back', async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView)
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
    button('Nouvelle conversion')?.click()
    await vi.waitFor(() => expect(named("Unité d'arrivée")).not.toBeNull())

    await submitDialog()
    expect(document.body.textContent).toContain('Entre un nombre supérieur à zéro.')

    type(named("Quantité d'arrivée"), '0')
    await submitDialog()

    expect(document.body.textContent).toContain('Entre un nombre supérieur à zéro.')
    expect(calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/conversions'))).toEqual(
      [],
    )
  })

  it('refuse deux unités identiques', async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView)
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
    button('Nouvelle conversion')?.click()
    await vi.waitFor(() => expect(named("Unité d'arrivée")).not.toBeNull())
    type(named("Unité d'arrivée"), 'gramme')
    await flushPromises()
    expect(document.body.textContent).toContain('Choisis deux unités différentes.')

    await submitDialog()

    expect(document.body.textContent).toContain('Choisis deux unités différentes.')
    expect(calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/conversions'))).toEqual(
      [],
    )
  })

  it("préremplit une modification avec son ingrédient et l'enregistre", async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView, {
      'PUT /api/v1/conversions/c1': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    button('Modifier Kilo → Gramme')?.click()
    await vi.waitFor(() => expect(named("Quantité d'arrivée").value).toBe('1000'))
    expect(named('Quantité de départ').value).toBe('1')
    type(named("Quantité d'arrivée"), '1100')
    await submitDialog()

    expect(await body(fetchMock, 'PUT', '/conversions/c1')).toEqual({
      startUnitSlug: 'kilo',
      endUnitSlug: 'gramme',
      coefficient: 1100,
      ingredientSlug: 'beurre',
    })
  })
})

describe('utilisateurs', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const rows = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('li')
  /** Le texte d'une carte tel qu'on le lit : espaces fusionnés. */
  const textOf = (row: { text: () => string }) => row.text().replace(/\s+/g, ' ')
  const rowOf = (wrapper: ReturnType<typeof mount>, email: string) =>
    rows(wrapper).find((item) => item.text().includes(email))!
  const notifications = () => useNotificationsStore().items.map((item) => item.text)
  const ready = async (handlers: Parameters<typeof stubApi>[0] = {}) => {
    const opened = await open(UsersAdminView, handlers)
    await vi.waitFor(() => expect(rows(opened.wrapper)).toHaveLength(4))

    return opened
  }
  const menuItems = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const menuItem = (label: string) =>
    menuItems().find((candidate) => candidate.textContent.trim().startsWith(label))!
  const openMenu = async (row: ReturnType<typeof rowOf>) => {
    ;(row.find('button[aria-haspopup="menu"]').element as HTMLElement).click()
    await vi.waitFor(() => expect(menuItems().length).toBeGreaterThan(0))
    // Le menu écoute les clics extérieurs au tour suivant
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const visibleButtons = (row: ReturnType<typeof rowOf>) =>
    row.findAll('button').filter((candidate) => candidate.attributes('aria-haspopup') !== 'menu')

  it('résume les comptes et ceux qui attendent', async () => {
    const { wrapper } = await ready()

    expect(wrapper.find('main p').text()).toBe('4 comptes · 1 en attente')
  })

  it('dit qu’un compte activé ici peut être sans mot de passe, tant qu’un compte attend', async () => {
    const { wrapper } = await ready()

    expect(wrapper.text()).toContain(
      'Un compte activé ici peut être sans mot de passe. La personne en choisit un avec « Mot de passe oublié ? ».',
    )
  })

  it('n’ajoute pas cette phrase quand aucun compte n’attend', async () => {
    const withoutPending = {
      member: users.member.filter((user) => user.status !== 'PENDING'),
      totalItems: 3,
    }
    const { wrapper } = await open(UsersAdminView, {
      'GET /api/v1/users': () => json(withoutPending),
    })
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3))

    expect(wrapper.text()).not.toContain('sans mot de passe')
  })

  it('trie les comptes en attente d’abord, puis les plus récemment vus, ceux jamais vus à la fin', async () => {
    const { wrapper } = await ready()

    expect(rows(wrapper).map((item) => item.find('p').text())).toEqual([
      'attente@repas.fr',
      'admin@repas.fr',
      'hier@repas.fr',
      'gone@repas.fr',
    ])
  })

  it('montre pour chaque compte son rôle, son statut en pastille, son activité et son inscription', async () => {
    const { wrapper } = await ready()

    const admin = textOf(rowOf(wrapper, 'admin@repas.fr'))
    expect(admin).toContain('Administrateur')
    expect(admin).toContain('Actif')
    for (const part of ['12 recettes', '9 ingrédients', '3 listes']) expect(admin).toContain(part)
    expect(admin).toContain('Inscrit le 1 octobre 2026')
    expect(rowOf(wrapper, 'attente@repas.fr').text()).toContain('En attente')
    expect(textOf(rowOf(wrapper, 'attente@repas.fr'))).toContain('aucune recette')
    expect(textOf(rowOf(wrapper, 'attente@repas.fr'))).toContain('1 ingrédient')
    expect(rowOf(wrapper, 'gone@repas.fr').text()).toContain('Désactivé')
    expect(rowOf(wrapper, 'attente@repas.fr').text()).not.toContain('Administrateur')
  })

  it('dit quand chacun s’est connecté pour la dernière fois, date exacte lisible', async () => {
    const { wrapper } = await ready()

    const admin = rowOf(wrapper, 'admin@repas.fr')
    expect(textOf(admin)).toContain('Dernière connexion : il y a 2 h')
    const time = admin.find('time')
    expect(time.text()).toBe('il y a 2 h')
    expect(time.attributes('title')).toBe('20 octobre 2026 à 12:00')
    expect(admin.find('.sr-only').text()).toBe('(20 octobre 2026 à 12:00)')
    expect(textOf(rowOf(wrapper, 'hier@repas.fr'))).toContain('Dernière connexion : hier')
    expect(rowOf(wrapper, 'gone@repas.fr').text()).toContain('2 septembre 2026')
    expect(rowOf(wrapper, 'attente@repas.fr').text()).toContain('Pas encore vu')
    expect(rowOf(wrapper, 'attente@repas.fr').find('time').exists()).toBe(false)
  })

  it('montre la version de l’application de chacun, « inconnue » sinon, et qui est à mettre à jour (DRV-637)', async () => {
    const { wrapper } = await ready()

    expect(textOf(rowOf(wrapper, 'admin@repas.fr'))).toContain('Application 0.1.8')
    expect(rowOf(wrapper, 'admin@repas.fr').text()).toContain('À mettre à jour')
    expect(textOf(rowOf(wrapper, 'gone@repas.fr'))).toContain('Application inconnue')
    expect(rowOf(wrapper, 'gone@repas.fr').text()).not.toContain('À mettre à jour')
  })

  it('filtre par statut avec des puces qui disent leur état et leur nombre', async () => {
    const { wrapper } = await ready()
    const chips = () => wrapper.findAll('[role="group"] button')

    expect(chips().map((chip) => chip.text())).toEqual([
      'Tous',
      'En attente (1)',
      'Actifs (2)',
      'Désactivés (1)',
    ])
    expect(chips().map((chip) => chip.attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])

    await chips()[2]!.trigger('click')

    expect(rows(wrapper).map((item) => item.find('p').text())).toEqual([
      'admin@repas.fr',
      'hier@repas.fr',
    ])
    expect(chips()[2]!.attributes('aria-pressed')).toBe('true')
    expect(chips()[0]!.attributes('aria-pressed')).toBe('false')

    // Cliquer sur la puce déjà choisie ne la défait pas
    await chips()[2]!.trigger('click')
    expect(chips()[2]!.attributes('aria-pressed')).toBe('true')

    await chips()[1]!.trigger('click')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('dit quand aucun compte ne correspond au filtre', async () => {
    const onlyActive = {
      member: users.member.filter((user) => user.status === 'ACTIVE'),
      totalItems: 2,
    }
    const { wrapper } = await open(UsersAdminView, { 'GET /api/v1/users': () => json(onlyActive) })
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(2))

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click')

    expect(rows(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('Aucun compte dans cette catégorie.')
  })

  it('compte en attente : « Activer » visible, le reste dans le menu', async () => {
    const { wrapper } = await ready()
    const row = rowOf(wrapper, 'attente@repas.fr')

    expect(visibleButtons(row).map((candidate) => candidate.text())).toEqual(['Activer'])
    expect(row.find('button[aria-haspopup="menu"]').attributes('aria-label')).toBe(
      'Plus d’actions pour attente@repas.fr',
    )

    await openMenu(row)

    expect(menuItems().map((candidate) => candidate.textContent.trim())).toEqual([
      'Désactiver',
      'Supprimer',
    ])
  })

  it('compte actif : rien de visible, le menu propose attente, désactivation et suppression', async () => {
    const { wrapper } = await ready()
    const row = rowOf(wrapper, 'hier@repas.fr')

    expect(visibleButtons(row)).toHaveLength(0)

    await openMenu(row)

    expect(menuItems().map((candidate) => candidate.textContent.trim())).toEqual([
      'Mettre en attente',
      'Désactiver',
      'Supprimer',
    ])
    expect(menuItem('Supprimer').classList).toContain('text-danger')
  })

  it('compte désactivé : « Réactiver » visible, le menu propose attente et suppression', async () => {
    const { wrapper } = await ready()
    const row = rowOf(wrapper, 'gone@repas.fr')

    expect(visibleButtons(row).map((candidate) => candidate.text())).toEqual(['Réactiver'])

    await openMenu(row)

    expect(menuItems().map((candidate) => candidate.textContent.trim())).toEqual([
      'Mettre en attente',
      'Supprimer',
    ])
  })

  it('n’a jamais trois boutons de statut côte à côte', async () => {
    const { wrapper } = await ready()

    for (const row of rows(wrapper)) expect(visibleButtons(row).length).toBeLessThanOrEqual(1)
  })

  it('active le compte en attente, relit la liste et le dit', async () => {
    const { wrapper, fetchMock } = await ready({
      'PUT /api/v1/users/u3/status': () => new Response(null, { status: 204 }),
    })

    await visibleButtons(rowOf(wrapper, 'attente@repas.fr'))[0]!.trigger('click')
    await flushPromises()

    const index = calls(fetchMock).indexOf('PUT /api/v1/users/u3/status')
    expect(index).toBeGreaterThan(-1)
    expect(await bodyOf(fetchMock, index)).toEqual({ status: 'ACTIVE' })
    expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/users')).toHaveLength(2)
    expect(notifications()).toContain('Statut de attente@repas.fr modifié.')
  })

  it('réactive un compte désactivé', async () => {
    const { wrapper, fetchMock } = await ready({
      'PUT /api/v1/users/u2/status': () => new Response(null, { status: 204 }),
    })

    await visibleButtons(rowOf(wrapper, 'gone@repas.fr'))[0]!.trigger('click')
    await flushPromises()

    const index = calls(fetchMock).indexOf('PUT /api/v1/users/u2/status')
    expect(await bodyOf(fetchMock, index)).toEqual({ status: 'ACTIVE' })
  })

  it('désactive un compte actif par le menu, et le remet en attente', async () => {
    const { wrapper, fetchMock } = await ready({
      'PUT /api/v1/users/u4/status': () => new Response(null, { status: 204 }),
    })

    await openMenu(rowOf(wrapper, 'hier@repas.fr'))
    menuItem('Désactiver').click()
    await vi.waitFor(() => expect(calls(fetchMock)).toContain('PUT /api/v1/users/u4/status'))
    expect(
      await bodyOf(fetchMock, calls(fetchMock).indexOf('PUT /api/v1/users/u4/status')),
    ).toEqual({
      status: 'DISABLED',
    })

    await flushPromises()
    await openMenu(rowOf(wrapper, 'hier@repas.fr'))
    menuItem('Mettre en attente').click()
    await vi.waitFor(() =>
      expect(calls(fetchMock).filter((call) => call.startsWith('PUT'))).toHaveLength(2),
    )
    expect(
      await bodyOf(fetchMock, calls(fetchMock).lastIndexOf('PUT /api/v1/users/u4/status')),
    ).toEqual({
      status: 'PENDING',
    })
  })

  it('explique le refus du compte protégé', async () => {
    const { wrapper } = await ready({
      'PUT /api/v1/users/u2/status': () =>
        json({ error: { message: 'PROTECTED_ACCOUNT' } }, { status: 422 }),
    })

    await visibleButtons(rowOf(wrapper, 'gone@repas.fr'))[0]!.trigger('click')
    await flushPromises()

    expect(notifications()).toContain(
      'Ce compte est protégé : il reste actif et ne se supprime pas.',
    )
    expect(rowOf(wrapper, 'gone@repas.fr').text()).toContain('Désactivé')
  })

  it('ne propose pas de supprimer son propre compte, et dit pourquoi', async () => {
    const { wrapper } = await ready()

    await openMenu(rowOf(wrapper, 'admin@repas.fr'))
    expect(menuItem('Supprimer').getAttribute('aria-disabled')).toBe('true')
    expect(menuItem('Supprimer').textContent).toContain('C’est ton compte')
    document.body.innerHTML = ''

    const other = await ready()
    await openMenu(rowOf(other.wrapper, 'gone@repas.fr'))
    expect(menuItem('Supprimer').getAttribute('aria-disabled')).toBeNull()
  })

  const confirmDialog = (label: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (candidate) => candidate.textContent.trim() === label,
    )

  it('demande confirmation avant de supprimer, puis relit la liste', async () => {
    const { wrapper, fetchMock } = await ready({
      'DELETE /api/v1/users/u2': () => new Response(null, { status: 204 }),
    })

    await openMenu(rowOf(wrapper, 'gone@repas.fr'))
    menuItem('Supprimer').click()
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())

    // Rien n'est supprimé tant qu'on n'a pas confirmé, et le texte dit ce qui disparaît
    expect(calls(fetchMock).filter((call) => call.startsWith('DELETE'))).toEqual([])
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('gone@repas.fr')
    expect(dialog.textContent).toContain('irréversible')

    confirmDialog('Supprimer')?.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain('DELETE /api/v1/users/u2')
    expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/users')).toHaveLength(2)
    expect(notifications()).toContain('gone@repas.fr supprimé.')
  })

  it('annuler la confirmation ne supprime rien', async () => {
    const { wrapper, fetchMock } = await ready()

    await openMenu(rowOf(wrapper, 'gone@repas.fr'))
    menuItem('Supprimer').click()
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())
    confirmDialog('Annuler')?.click()
    await flushPromises()

    expect(calls(fetchMock).filter((call) => call.startsWith('DELETE'))).toEqual([])
  })

  it('explique le refus de supprimer le compte protégé', async () => {
    const { wrapper } = await ready({
      'DELETE /api/v1/users/u2': () =>
        json({ error: { message: 'PROTECTED_ACCOUNT' } }, { status: 422 }),
    })

    await openMenu(rowOf(wrapper, 'gone@repas.fr'))
    menuItem('Supprimer').click()
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())
    confirmDialog('Supprimer')?.click()
    await flushPromises()

    expect(notifications()).toContain(
      'Ce compte est protégé : il reste actif et ne se supprime pas.',
    )
  })

  it('signale un back injoignable', async () => {
    const { wrapper } = await open(UsersAdminView, {
      'GET /api/v1/users': () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  })
})

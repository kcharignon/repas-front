import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import ConversionsAdminView from '@/features/admin/ConversionsAdminView.vue'
import DepartmentsAdminView from '@/features/admin/DepartmentsAdminView.vue'
import RecipeTypesAdminView from '@/features/admin/RecipeTypesAdminView.vue'
import UnitsAdminView from '@/features/admin/UnitsAdminView.vue'
import UsersAdminView from '@/features/admin/UsersAdminView.vue'
import { routes } from '@/router'
import { sessionGuard } from '@/session/guard'
import { useSessionStore } from '@/session/session'
import AccountView from '@/views/AccountView.vue'

const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }
const units = {
  member: [
    { slug: 'gramme', name: 'Gramme', symbol: 'g' },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg' },
    { slug: 'unite', name: 'Unité', symbol: '' },
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
const users = {
  member: [
    {
      id: 'u1',
      email: 'admin@repas.fr',
      defaultServing: 4,
      recipeCount: 2,
      ingredientCount: 0,
      shoppingListCount: 1,
      createdAt: '2026-10-01T10:00:00+02:00',
      isDisabled: false,
      isAdmin: true,
    },
    {
      id: 'u2',
      email: 'gone@repas.fr',
      defaultServing: 2,
      recipeCount: 0,
      ingredientCount: 0,
      shoppingListCount: 0,
      createdAt: '2026-09-01T10:00:00+02:00',
      isDisabled: true,
      isAdmin: false,
    },
  ],
  totalItems: 2,
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
  it('liste les unités, crée puis modifie', async () => {
    const { wrapper, fetchMock } = await open(UnitsAdminView, {
      'POST /api/v1/units': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/units/litre' } }),
      'PUT /api/v1/units/gramme': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    expect(wrapper.findAll('li')[2]?.text()).toContain('—')

    button('Nouvelle unité')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())
    type(field('Nom'), '  Litre ')
    type(field('Symbole'), 'l')
    await submitDialog()
    expect(await body(fetchMock, 'POST', '/units')).toEqual({ name: 'Litre', symbol: 'l' })

    button('Modifier Gramme')?.click()
    await vi.waitFor(() => expect(field('Nom').value).toBe('Gramme'))
    type(field('Symbole'), 'gr')
    await submitDialog()
    expect(await body(fetchMock, 'PUT', '/units/gramme')).toEqual({ name: 'Gramme', symbol: 'gr' })
  })

  it('exige un nom et affiche le refus du back', async () => {
    const { wrapper, fetchMock } = await open(UnitsAdminView, {
      'POST /api/v1/units': () =>
        json({ error: { message: 'name: déjà utilisé' } }, { status: 422 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    button('Nouvelle unité')?.click()
    await vi.waitFor(() => expect(field('Nom')).not.toBeNull())

    await submitDialog()
    expect(document.body.textContent).toContain('Donnez un nom.')
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
    expect(document.body.textContent).toContain('Indiquez une image.')
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
    expect(document.body.textContent).toContain('Indiquez un ordre.')
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
    await vi.waitFor(() => expect(field("Unité d'arrivée")).not.toBeNull())
    type(field('Coefficient'), '1000')
    await submitDialog()

    expect(await body(fetchMock, 'POST', '/conversions')).toEqual({
      startUnitSlug: 'gramme',
      endUnitSlug: 'kilo',
      coefficient: 1000,
      ingredientSlug: null,
    })
  })

  it('refuse deux unités identiques et un coefficient nul', async () => {
    const { wrapper, fetchMock } = await open(ConversionsAdminView)
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
    button('Nouvelle conversion')?.click()
    await vi.waitFor(() => expect(field("Unité d'arrivée")).not.toBeNull())
    type(field("Unité d'arrivée"), 'gramme')

    await submitDialog()

    expect(document.body.textContent).toContain('Choisissez deux unités différentes.')
    expect(document.body.textContent).toContain('Entrez un nombre supérieur à zéro.')
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
    await vi.waitFor(() => expect(field('Coefficient').value).toBe('1000'))
    type(field('Coefficient'), '1100')
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
  it('liste les utilisateurs avec leur rôle, leur état et leurs chiffres', async () => {
    const { wrapper } = await open(UsersAdminView)
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))

    const [first, second] = wrapper.findAll('li').map((item) => item.text())

    expect(first).toContain('admin@repas.fr')
    expect(first).toContain('Administrateur')
    expect(first).toContain('2 recettes, 0 ingrédients, 1 listes')
    expect(first).toContain('inscrit le 1 octobre 2026')
    expect(second).toContain('Désactivé')
  })

  it('signale un back injoignable', async () => {
    const { wrapper } = await open(UsersAdminView, {
      'GET /api/v1/users': () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  })
})

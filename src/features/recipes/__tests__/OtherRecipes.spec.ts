import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import { groupByType } from '@/features/recipes/otherRecipeGroups'
import { useSessionStore } from '@/session/session'

const entree = { typeName: 'entrée', typeSlug: 'entree' }
const plat = { typeName: 'plat', typeSlug: 'plat' }
const dessert = { typeName: 'dessert', typeSlug: 'dessert' }

// Sans recherche, le back range par catégorie puis par nom
const byCategory = {
  member: [
    { id: 'a1', name: 'Velouté', ...entree },
    { id: 'p1', name: 'Pâtes carbonara', ...plat },
    { id: 'p2', name: 'Ramen', ...plat },
    { id: 'd1', name: 'Tarte aux pommes', ...dessert },
  ],
  totalItems: 4,
}
// Avec « tarte », par pertinence, catégories mélangées
const found = {
  member: [
    { id: 'd1', name: 'Tarte aux pommes', ...dessert },
    { id: 'p3', name: 'Tarte flambée', ...plat },
  ],
  totalItems: 2,
}

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

async function open(handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({
    ...session,
    'GET /api/v1/recipes/other-people': (request) =>
      json(new URL(request.url).searchParams.has('q') ? found : byCategory),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/recettes/autres')
  const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })

  return { wrapper, fetchMock, context }
}

const requests = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === '/api/v1/recipes/other-people')
    .map((url) => url.search)

const field = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.find('input[type="search"]')

describe('groupByType', () => {
  it('ouvre une section à chaque changement de catégorie, sans rien trier', () => {
    const groups = groupByType(byCategory.member)

    expect(groups.map((group) => [group.typeSlug, group.recipes.map((r) => r.id)])).toEqual([
      ['entree', ['a1']],
      ['plat', ['p1', 'p2']],
      ['dessert', ['d1']],
    ])
    expect(groupByType([])).toEqual([])
  })
})

describe('OtherRecipesView : par catégorie', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('range les recettes en sections titrées par leur catégorie, dans l’ordre reçu', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))

    expect(wrapper.findAll('h2').map((title) => title.text())).toEqual([
      'Entrée',
      'Plat',
      'Dessert',
    ])
    const plats = wrapper.findAll('section')[1]!
    expect(plats.findAll('li a').map((link) => link.text())).toEqual(['Pâtes carbonara', 'Ramen'])
    // La catégorie est le titre de la section : elle n'est pas répétée sur chaque ligne
    expect(plats.text()).not.toContain('plat')
    expect(plats.attributes('aria-labelledby')).toBe(plats.find('h2').attributes('id'))
  })

  it('propose le champ de recherche, avec son étiquette', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))

    expect(field(wrapper).exists()).toBe(true)
    expect(wrapper.text()).toContain('Rechercher une recette des autres')
    expect(wrapper.find('button[aria-label="Effacer la recherche"]').exists()).toBe(false)
  })

  it('ne propose pas de recherche quand il n’y a rien à copier', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people': () => json({ member: [], totalItems: 0 }),
    })
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Rien de nouveau à copier pour le moment.'),
    )

    expect(field(wrapper).exists()).toBe(false)
  })

  it('continue la liste par catégorie page après page (offset, même section)', async () => {
    const search: string[] = []
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people': (request) => {
        const url = new URL(request.url)
        search.push(url.search)

        return json(
          url.searchParams.has('offset')
            ? { member: [{ id: 'p2', name: 'Ramen', ...plat }], totalItems: 2 }
            : { member: [{ id: 'p1', name: 'Pâtes carbonara', ...plat }], totalItems: 2 },
        )
      },
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Pâtes carbonara'))

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Voir plus')
      ?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ramen'))

    expect(search).toEqual(['', '?offset=1'])
    // La catégorie reste une seule section
    expect(wrapper.findAll('section')).toHaveLength(1)
    expect(wrapper.findAll('section li')).toHaveLength(2)
  })
})

describe('OtherRecipesView : recherche', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('attend une pause dans la frappe puis montre une liste simple, la catégorie sur chaque ligne', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(wrapper.findAll('section')).toHaveLength(3)

    await field(wrapper).setValue('t')
    await field(wrapper).setValue('ta')
    await field(wrapper).setValue('tart')
    // Pas encore : la frappe n’a pas fait de pause
    expect(requests(fetchMock)).toEqual([''])
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(requests(fetchMock)).toEqual(['', '?q=tart'])
    // Pas de sections : une seule liste, dans l’ordre de pertinence reçu
    expect(wrapper.findAll('section')).toHaveLength(0)
    expect(wrapper.findAll('h2')).toHaveLength(0)
    const rows = wrapper.findAll('ul[aria-label="Résultats de la recherche"] > li')
    expect(rows.map((row) => row.find('a span').text())).toEqual([
      'Tarte aux pommes',
      'Tarte flambée',
    ])
    expect(rows.map((row) => row.findAll('a span')[1]!.text())).toEqual(['Dessert', 'Plat'])
    expect(wrapper.find('.sr-only[role="status"]').text()).toBe('2 recettes')
  })

  it('ne cherche pas avec un texte vide, d’espaces ou d’une seule lettre', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('   ')
    await vi.advanceTimersByTimeAsync(400)
    await field(wrapper).setValue(' t ')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(requests(fetchMock)).toEqual([''])
    expect(wrapper.findAll('section')).toHaveLength(3)
  })

  it('efface la recherche par le bouton : retour tout de suite aux sections, focus dans le champ', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(wrapper.findAll('section')).toHaveLength(0)

    await wrapper.find('button[aria-label="Effacer la recherche"]').trigger('click')
    await flushPromises()

    expect((field(wrapper).element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('section')).toHaveLength(3)
    expect(wrapper.find('button[aria-label="Effacer la recherche"]').exists()).toBe(false)
    // La liste par catégories était déjà lue : aucune requête de plus
    expect(requests(fetchMock)).toEqual(['', '?q=tarte'])
  })

  it('dit qu’aucune recette ne ressemble, avec l’illustration de recherche vide, et garde le champ', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people': (request) =>
        json(
          new URL(request.url).searchParams.has('q') ? { member: [], totalItems: 0 } : byCategory,
        ),
    })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('zzz')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.text()).toContain('Aucune recette ne ressemble à « zzz ».')
    expect(wrapper.text()).not.toContain('Rien de nouveau à copier')
    expect(field(wrapper).exists()).toBe(true)
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('pagine la recherche : « Voir plus » garde le même texte cherché', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/recipes/other-people': (request) => {
        const url = new URL(request.url)
        if (!url.searchParams.has('q')) return json(byCategory)

        return json(
          url.searchParams.has('offset')
            ? { member: [{ id: 'p3', name: 'Tarte flambée', ...plat }], totalItems: 2 }
            : { member: [{ id: 'd1', name: 'Tarte aux pommes', ...dessert }], totalItems: 2 },
        )
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Voir plus')
      ?.trigger('click')
    await flushPromises()

    expect(requests(fetchMock)).toEqual(['', '?q=tarte', '?q=tarte&offset=1'])
    expect(wrapper.findAll('ul[aria-label="Résultats de la recherche"] > li')).toHaveLength(2)
  })

  it('dit que la recherche a échoué sans rien afficher d’une autre recherche', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people': (request) =>
        new URL(request.url).searchParams.has('q')
          ? json({ error: { message: 'x' } }, { status: 500 })
          : json(byCategory),
    })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})

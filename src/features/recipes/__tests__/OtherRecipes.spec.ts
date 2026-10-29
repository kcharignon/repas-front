import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, eventually, json, me, stubApi } from '@/__tests__/helpers'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import { groupByType, keepCopied } from '@/features/recipes/otherRecipeGroups'
import { useNotificationsStore } from '@/notifications/store'
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

  const noMatch = {
    'GET /api/v1/recipes/other-people': (request: Request) =>
      json(new URL(request.url).searchParams.has('q') ? { member: [], totalItems: 0 } : byCategory),
  }

  it('hors saison, sans résultat : la phrase seule, sans illustration', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open(noMatch)
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('zzz')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.text()).toContain('Aucune recette ne ressemble à « zzz ».')
    // La loupe du champ est aussi un svg décoratif : on cherche l'illustration de la saison, qui est dans un conteneur caché
    expect(wrapper.find('main span[aria-hidden="true"] svg').exists()).toBe(false)
  })

  it('en saison, sans résultat : l’illustration de recherche vide de la saison est au-dessus de la phrase', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    const { wrapper } = await open(noMatch)
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('zzz')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    await eventually(() =>
      expect(wrapper.find('main span[aria-hidden="true"] svg').exists()).toBe(true),
    )

    // L'illustration est décorative (cachée des lecteurs d'écran) et précède la phrase, qui reste le seul texte
    const art = wrapper.find('main span[aria-hidden="true"] svg').element.parentElement!
    expect(art.getAttribute('aria-hidden')).toBe('true')
    const phrase = wrapper.find('p[role="status"]')
    expect(phrase.text()).toBe('Aucune recette ne ressemble à « zzz ».')
    expect(
      art.compareDocumentPosition(phrase.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(field(wrapper).exists()).toBe(true)
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

describe('keepCopied', () => {
  const recipe = (id: string) => ({ id, name: id, ...plat })
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(recipe) as [
    ReturnType<typeof recipe>,
    ReturnType<typeof recipe>,
    ReturnType<typeof recipe>,
    ReturnType<typeof recipe>,
  ]

  it('remet une recette copiée à sa place quand le back ne la rend plus', () => {
    expect(keepCopied([a, c, d], [{ recipe: b, index: 1 }]).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(
      keepCopied(
        [a, d],
        [
          { recipe: c, index: 2 },
          { recipe: b, index: 1 },
        ],
      ).map((r) => r.id),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('n’ajoute pas deux fois une recette que le back rend encore, ni au-delà de la fin', () => {
    expect(keepCopied([a, b], [{ recipe: b, index: 1 }]).map((r) => r.id)).toEqual(['a', 'b'])
    expect(keepCopied([a], [{ recipe: d, index: 9 }]).map((r) => r.id)).toEqual(['a', 'd'])
    expect(keepCopied([], [])).toEqual([])
  })
})

describe('OtherRecipesView : copier', () => {
  afterEach(() => vi.unstubAllGlobals())

  const copyButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper'], name: string) =>
    wrapper.find(`button[aria-label="Copier ${name} dans mes recettes"]`)
  const doneButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper'], name: string) =>
    wrapper.find(`button[aria-label="Copiée : ${name} est dans tes recettes"]`)

  // Comme le vrai back : une recette copiée n'est plus rendue à la relecture
  function backThatForgetsCopies() {
    let copied = false

    return {
      'GET /api/v1/recipes/other-people': (request: Request) =>
        json(
          new URL(request.url).searchParams.has('q')
            ? found
            : copied
              ? { member: byCategory.member.filter((r) => r.id !== 'p1'), totalItems: 3 }
              : byCategory,
        ),
      'POST /api/v1/recipes/p1/copy': () => {
        copied = true

        return new Response(null, {
          status: 201,
          headers: { Location: '/api/v1/recipes/copie-1' },
        })
      },
    }
  }

  it('copie sans quitter la liste : un message, et le bouton de cette recette dit « Copiée »', async () => {
    const { wrapper, context, fetchMock } = await open(backThatForgetsCopies())
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))
    const push = vi.spyOn(context.router, 'push')

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true))
    await flushPromises()

    // On reste sur la liste, la copie ne s'ouvre pas (la route d'une fiche se charge à la demande : on regarde aussi qu'aucune navigation n'est lancée)
    expect(push).not.toHaveBeenCalled()
    expect(context.router.currentRoute.value.name).toBe('recipes-others')
    expect(calls(fetchMock).filter((call) => call === 'POST /api/v1/recipes/p1/copy')).toHaveLength(
      1,
    )
    expect(useNotificationsStore().items.map((item) => [item.kind, item.text])).toEqual([
      ['success', '« Pâtes carbonara » est dans tes recettes.'],
    ])
    const done = doneButton(wrapper, 'Pâtes carbonara')
    expect(done.text()).toBe('Copiée')
    expect(done.attributes('disabled')).toBeDefined()
    // Les autres recettes restent à copier
    expect(copyButton(wrapper, 'Ramen').attributes('disabled')).toBeUndefined()
  })

  it('garde la recette copiée à sa place après la relecture, où le back ne la rend plus', async () => {
    const { wrapper, fetchMock } = await open(backThatForgetsCopies())
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(requests(fetchMock)).toHaveLength(2))
    await flushPromises()

    const plats = wrapper.findAll('section')[1]!
    expect(plats.findAll('li a').map((link) => link.text())).toEqual(['Pâtes carbonara', 'Ramen'])
    expect(plats.find('button[aria-label^="Copiée"]').exists()).toBe(true)
  })

  it('un refus du back garde « Copier » et dit l’erreur, sans « Copiée »', async () => {
    const { wrapper, context } = await open({
      'POST /api/v1/recipes/p1/copy': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.kind)).toEqual(['error']),
    )
    await flushPromises()

    expect(context.router.currentRoute.value.name).toBe('recipes-others')
    expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(false)
    expect(copyButton(wrapper, 'Pâtes carbonara').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('section li')).toHaveLength(4)
  })

  it('une autre recherche repart d’une liste neuve : la recette copiée n’y est pas ajoutée', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open(backThatForgetsCopies())
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true)

    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Pâtes carbonara')
    expect(wrapper.findAll('ul[aria-label="Résultats de la recherche"] > li')).toHaveLength(2)
    vi.useRealTimers()
  })

  it('rouvrir l’écran repart de zéro : plus rien n’est « Copiée », même si le back rend encore la recette', async () => {
    const first = await open({
      'POST /api/v1/recipes/p1/copy': () => new Response(null, { status: 201 }),
    })
    await vi.waitFor(() => expect(first.wrapper.findAll('section')).toHaveLength(3))
    await copyButton(first.wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(first.wrapper, 'Pâtes carbonara').exists()).toBe(true))
    first.wrapper.unmount()

    // Même session, l'écran se rouvre : la copie de tout à l'heure n'y est plus marquée
    const wrapper = mount(OtherRecipesView, { global: { plugins: first.context.plugins } })
    await vi.waitFor(() => expect(wrapper.findAll('section')).toHaveLength(3))

    expect(wrapper.find('button[aria-label^="Copiée"]').exists()).toBe(false)
    expect(copyButton(wrapper, 'Pâtes carbonara').exists()).toBe(true)
  })
})

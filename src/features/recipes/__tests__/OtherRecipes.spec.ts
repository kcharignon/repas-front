import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, eventually, json, me, stubApi } from '@/__tests__/helpers'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import { keepCopied } from '@/features/recipes/otherRecipeGroups'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

const entree = { typeName: 'entrée', typeSlug: 'entree' }
const plat = { typeName: 'plat', typeSlug: 'plat' }
const dessert = { typeName: 'dessert', typeSlug: 'dessert' }

// Ce que le back a à proposer, rangé par catégorie puis par nom (l'ordre du produit : entrée, plat, dessert)
const recipes = [
  { id: 'a1', name: 'Velouté', ...entree },
  { id: 'p1', name: 'Pâtes carbonara', ...plat },
  { id: 'p2', name: 'Ramen', ...plat },
  { id: 'p3', name: 'Tarte flambée', ...plat },
  { id: 'd1', name: 'Tarte aux pommes', ...dessert },
]

// Les images viennent des types de recette (déjà lus par « Mes recettes »), jointes par `typeSlug`
const recipeTypes = {
  member: [
    { slug: 'entree', name: 'entrée', image: 'images/recipe/type/entree.png', order: 1 },
    { slug: 'plat', name: 'plat', image: 'images/recipe/type/plat.png', order: 2 },
    { slug: 'dessert', name: 'dessert', image: 'images/recipe/type/dessert.png', order: 3 },
  ],
  totalItems: 3,
}

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

/**
 * Un faux back qui répond comme le vrai : les catégories avec leur compte (seulement les non vides), la liste filtrée par `typeSlug`
 * et par `q` (par nom), par pages. Une recette copiée n'est plus rendue à la relecture.
 */
function fakeBack(copied: string[] = [], all = recipes) {
  const visible = () => all.filter((recipe) => !copied.includes(recipe.id))

  return {
    'GET /api/v1/recipe-types': () => json(recipeTypes),
    'GET /api/v1/recipes/other-people/types': () => {
      const counts = new Map<string, { typeSlug: string; typeName: string; count: number }>()
      for (const recipe of visible()) {
        const known = counts.get(recipe.typeSlug)
        counts.set(recipe.typeSlug, {
          typeSlug: recipe.typeSlug,
          typeName: recipe.typeName,
          count: (known?.count ?? 0) + 1,
        })
      }
      const member = [...counts.values()]

      return json({ member, totalItems: member.length })
    },
    'GET /api/v1/recipes/other-people': (request: Request) => {
      const params = new URL(request.url).searchParams
      const q = params.get('q')
      const slug = params.get('typeSlug')
      const offset = Number(params.get('offset') ?? 0)
      const limit = Number(params.get('limit') ?? 200)
      const matching = visible()
        .filter((recipe) => slug === null || recipe.typeSlug === slug)
        .filter((recipe) => q === null || recipe.name.toLowerCase().includes(q.toLowerCase()))

      return json({ member: matching.slice(offset, offset + limit), totalItems: matching.length })
    },
  }
}

async function open(handlers: Parameters<typeof stubApi>[0] = {}, path = '/recettes/autres') {
  const fetchMock = stubApi({ ...session, ...fakeBack(), ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(OtherRecipesView, {
    global: { plugins: context.plugins },
    attachTo: document.body,
  })

  return { wrapper, fetchMock, context }
}

type Opened = Awaited<ReturnType<typeof open>>

const listRequests = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === '/api/v1/recipes/other-people')
    .map((url) => url.search)

const field = (wrapper: Opened['wrapper']) => wrapper.find('input[type="search"]')
const tiles = (wrapper: Opened['wrapper']) =>
  wrapper.findAll('ul[aria-label="Types de recette"] li')
const tile = (wrapper: Opened['wrapper'], slug: string) =>
  wrapper.find(`a[href="/recettes/autres?categorie=${slug}"]`)
const cards = (wrapper: Opened['wrapper']) =>
  wrapper.findAll('ul:not([aria-label="Types de recette"]) > li')
const cardNames = (wrapper: Opened['wrapper']) =>
  cards(wrapper).map((card) => card.find('a span').text())

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('OtherRecipesView : les tuiles', () => {
  it('montre une tuile par catégorie, dans l’ordre reçu, avec son nom, son compte et son image', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(tiles(wrapper).map((item) => item.find('a > span > span').text())).toEqual([
      'Entrée',
      'Plat',
      'Dessert',
    ])
    // Le compte, au singulier comme au pluriel (« 1 recette », « 3 recettes »)
    expect(tiles(wrapper).map((item) => item.find('a > span > span:last-child').text())).toEqual([
      '1 recette',
      '3 recettes',
      '1 recette',
    ])
    // L'image du type, jointe par son identifiant
    expect(tiles(wrapper).map((item) => item.find('img').attributes('src'))).toEqual([
      expect.stringContaining('images/recipe/type/entree.png'),
      expect.stringContaining('images/recipe/type/plat.png'),
      expect.stringContaining('images/recipe/type/dessert.png'),
    ])
    expect(tiles(wrapper).map((item) => item.find('a').attributes('href'))).toEqual([
      '/recettes/autres?categorie=entree',
      '/recettes/autres?categorie=plat',
      '/recettes/autres?categorie=dessert',
    ])
  })

  it('reprend la tuile des rayons à l’identique (même forme, même grille)', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    const classes = tile(wrapper, 'plat').classes()
    for (const expected of [
      'min-h-32',
      'rounded-2xl',
      'border',
      'border-line',
      'bg-surface',
      'p-4',
    ])
      expect(classes).toContain(expected)
    expect(tile(wrapper, 'plat').find('img').classes()).toContain('size-12')
    expect(wrapper.find('ul[aria-label="Types de recette"]').classes()).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-2', 'gap-3', 'sm:grid-cols-3', 'md:grid-cols-4']),
    )
  })

  it('porte le titre, la phrase, le lien « Recettes » et le champ de recherche globale', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(wrapper.find('h1').text()).toBe('Recettes des autres')
    expect(wrapper.text()).toContain(
      'Copie une recette dans les tiennes pour la planifier et la modifier.',
    )
    expect(wrapper.find('main > a').attributes('href')).toBe('/recettes')
    expect(wrapper.find('main > a').text()).toBe('Recettes')
    expect(wrapper.text()).toContain('Rechercher une recette des autres')
    expect(wrapper.text()).not.toContain('Rechercher dans cette catégorie')
  })

  it('est le même écran pour l’administrateur', async () => {
    const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }
    const { wrapper } = await open({ 'GET /api/v1/me': () => json(admin) })
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(tiles(wrapper).map((item) => item.find('a').text())).toEqual([
      expect.stringContaining('Entrée'),
      expect.stringContaining('Plat'),
      expect.stringContaining('Dessert'),
    ])
    expect(field(wrapper).exists()).toBe(true)
  })

  it('ne lit aucune liste de recettes tant qu’on est sur les tuiles', async () => {
    const { wrapper, fetchMock } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(listRequests(fetchMock)).toEqual([])
    expect(calls(fetchMock).filter((call) => call.endsWith('/other-people/types'))).toHaveLength(1)
  })

  it('garde sa tuile à une catégorie seule', async () => {
    const { wrapper } = await open(
      fakeBack(
        [],
        recipes.filter((recipe) => recipe.typeSlug === 'plat'),
      ),
    )
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(1))

    expect(tile(wrapper, 'plat').text()).toContain('Plat')
    expect(cards(wrapper)).toHaveLength(0)
  })

  it('garde ses tuiles, sans image, quand les types de recette ne se lisent pas', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipe-types': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(wrapper.findAll('[data-testid="image-fallback"]')).toHaveLength(3)
  })

  it('dit qu’il n’y a rien à copier : ni tuile, ni champ, ni liste demandée', async () => {
    const { wrapper, fetchMock } = await open(fakeBack([], []))
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Rien de nouveau à copier pour le moment.'),
    )

    expect(tiles(wrapper)).toHaveLength(0)
    expect(field(wrapper).exists()).toBe(false)
    expect(listRequests(fetchMock)).toEqual([])
  })

  it('dit l’erreur d’une lecture des catégories qui échoue', async () => {
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people/types': () =>
        json({ error: { message: 'x' } }, { status: 500 }),
    })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(tiles(wrapper)).toHaveLength(0)
    expect(field(wrapper).exists()).toBe(false)
  })
})

describe('OtherRecipesView : une catégorie ouverte', () => {
  it('s’ouvre par sa tuile (une entrée d’historique de plus) et ne demande que ses recettes', async () => {
    const { wrapper, context, fetchMock } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))
    const push = vi.spyOn(context.router, 'push')

    await tile(wrapper, 'plat').trigger('click')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'recipes-others', query: { categorie: 'plat' } }),
    )
    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres?categorie=plat')
    expect(listRequests(fetchMock)).toEqual(['?typeSlug=plat&limit=30'])
    expect(wrapper.find('h1').text()).toBe('Plat')
    expect(wrapper.find('header p').text()).toBe('3 recettes')
    expect(cardNames(wrapper)).toEqual(['Pâtes carbonara', 'Ramen', 'Tarte flambée'])
    // On arrive en haut de la page
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    // La catégorie est le titre : elle n'est pas répétée sur chaque ligne
    expect(cards(wrapper)[0]!.text()).not.toContain('Plat')
    expect(tiles(wrapper)).toHaveLength(0)
  })

  it('se rouvre par son adresse, avec un lien de retour de 44 px et un champ qui dit sa portée', async () => {
    const { wrapper } = await open({}, '/recettes/autres?categorie=dessert')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(1))

    expect(wrapper.find('h1').text()).toBe('Dessert')
    expect(wrapper.find('header p').text()).toBe('1 recette')
    const back = wrapper.find('main > a')
    expect(back.text()).toBe('Recettes des autres')
    expect(back.attributes('href')).toBe('/recettes/autres')
    expect(back.classes()).toEqual(
      expect.arrayContaining(['inline-flex', 'min-h-11', 'items-center']),
    )
    expect(wrapper.text()).toContain('Rechercher dans cette catégorie')
    expect(wrapper.text()).not.toContain('Rechercher une recette des autres')
  })

  it('affiche les tuiles pour une catégorie inconnue, sans erreur', async () => {
    const { wrapper, fetchMock } = await open({}, '/recettes/autres?categorie=nimportequoi')
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe('Recettes des autres')
    expect(listRequests(fetchMock)).toEqual([])
  })

  it('affiche les tuiles pour une catégorie sans recette à copier', async () => {
    const { wrapper } = await open(
      fakeBack(
        [],
        recipes.filter((recipe) => recipe.typeSlug !== 'dessert'),
      ),
      '/recettes/autres?categorie=dessert',
    )
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(2))

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('continue la catégorie page après page (limit 30, offset), dans la même liste', async () => {
    const many = Array.from({ length: 35 }, (_, index) => ({
      id: `p${index}`,
      name: `Plat ${String(index).padStart(2, '0')}`,
      ...plat,
    }))
    const { wrapper, fetchMock } = await open(fakeBack([], many), '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(30))
    const more = () => wrapper.findAll('button').find((button) => button.text() === 'Voir plus')

    await more()?.trigger('click')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(35))

    expect(listRequests(fetchMock)).toEqual([
      '?typeSlug=plat&limit=30',
      '?typeSlug=plat&limit=30&offset=30',
    ])
    expect(more()).toBeUndefined()
  })

  it('« Recettes des autres » fait comme le retour d’historique quand on vient des tuiles', async () => {
    const { wrapper, context } = await open({}, '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    const back = vi.spyOn(context.router, 'back').mockImplementation(() => {})
    const replace = vi.spyOn(context.router, 'replace')
    // Comme dans un navigateur : l'entrée précédente de l'historique est la page des tuiles
    ;(context.router.options.history.state as { back: string | null }).back = '/recettes/autres'

    await wrapper.find('main > a').trigger('click')

    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('« Recettes des autres » remplace l’adresse quand la catégorie a été ouverte directement', async () => {
    const { wrapper, context } = await open({}, '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    const back = vi.spyOn(context.router, 'back')
    ;(context.router.options.history.state as { back: string | null }).back = '/recettes'

    await wrapper.find('main > a').trigger('click')
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(back).not.toHaveBeenCalled()
    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres')
  })

  it('un clic avec une touche enfoncée garde le comportement du navigateur (nouvel onglet)', async () => {
    const { wrapper, context } = await open({}, '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    const back = vi.spyOn(context.router, 'back')
    const replace = vi.spyOn(context.router, 'replace')
    // jsdom ne navigue pas : le clic non retenu par l'écran est seulement empêché ici
    document.addEventListener('click', (event) => event.preventDefault(), { once: true })

    await wrapper.find('main > a').trigger('click', { ctrlKey: true })

    expect(back).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('le retour du téléphone (changer d’adresse) ramène aux tuiles sans remonter la page', async () => {
    const { wrapper, context } = await open()
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))
    await tile(wrapper, 'plat').trigger('click')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    context.router.go(-1)
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres')
    expect(wrapper.find('h1').text()).toBe('Recettes des autres')
    // Seule l'ouverture de la catégorie a remonté la page : le navigateur retrouve la place des tuiles
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('d’une catégorie à l’autre, le champ repart vide', async () => {
    const { wrapper, context } = await open({}, '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    await field(wrapper).setValue('ram')
    expect((field(wrapper).element as HTMLInputElement).value).toBe('ram')

    await context.router.push('/recettes/autres?categorie=dessert')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Dessert'))

    expect((field(wrapper).element as HTMLInputElement).value).toBe('')
  })

  it('en revenant aux tuiles, le texte cherché dans la catégorie ne part pas chercher partout', async () => {
    vi.useFakeTimers()
    const { wrapper, context, fetchMock } = await open({}, '/recettes/autres?categorie=plat')
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    await field(wrapper).setValue('ramen')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    await context.router.push('/recettes/autres')
    // Un nouveau texte tapé tout de suite ne reprend pas l'ancien, resté en attente de la pause
    await field(wrapper).setValue('t')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(listRequests(fetchMock)).toEqual([
      '?typeSlug=plat&limit=30',
      '?q=ramen&typeSlug=plat&limit=30',
    ])
    expect(tiles(wrapper)).toHaveLength(3)
  })
})

describe('OtherRecipesView : recherche', () => {
  it('sur les tuiles, attend une pause dans la frappe puis cherche partout, la catégorie sur chaque ligne', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(tiles(wrapper)).toHaveLength(3)

    await field(wrapper).setValue('t')
    await field(wrapper).setValue('ta')
    await field(wrapper).setValue('tart')
    // Pas encore : la frappe n’a pas fait de pause
    expect(listRequests(fetchMock)).toEqual([])
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    // Toutes catégories confondues : pas de `typeSlug`
    expect(listRequests(fetchMock)).toEqual(['?q=tart&limit=30'])
    expect(tiles(wrapper)).toHaveLength(0)
    const rows = wrapper.findAll('ul[aria-label="Résultats de la recherche"] > li')
    expect(rows.map((row) => row.find('a span').text())).toEqual([
      'Tarte flambée',
      'Tarte aux pommes',
    ])
    expect(rows.map((row) => row.findAll('a span')[1]!.text())).toEqual(['Plat', 'Dessert'])
    expect(wrapper.find('.sr-only[role="status"]').text()).toBe('2 recettes')
    // Le titre ne change pas : on est toujours sur l'accueil
    expect(wrapper.find('h1').text()).toBe('Recettes des autres')
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

    expect(listRequests(fetchMock)).toEqual([])
    expect(tiles(wrapper)).toHaveLength(3)
  })

  it('efface la recherche par le bouton : retour tout de suite aux tuiles, focus dans le champ, aucune entrée d’historique', async () => {
    vi.useFakeTimers()
    const { wrapper, context } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    const push = vi.spyOn(context.router, 'push')
    const replace = vi.spyOn(context.router, 'replace')
    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(tiles(wrapper)).toHaveLength(0)

    await wrapper.find('button[aria-label="Effacer la recherche"]').trigger('click')
    await flushPromises()

    expect((field(wrapper).element as HTMLInputElement).value).toBe('')
    expect(tiles(wrapper)).toHaveLength(3)
    expect(wrapper.find('button[aria-label="Effacer la recherche"]').exists()).toBe(false)
    expect(document.activeElement).toBe(field(wrapper).element)
    // La recherche n'est pas dans l'adresse : ni entrée d'historique, ni changement d'adresse
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres')
  })

  it('dans une catégorie, ne cherche que dans cette catégorie, puis effacer revient à sa liste', async () => {
    vi.useFakeTimers()
    const { wrapper, fetchMock } = await open({}, '/recettes/autres?categorie=plat')
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(cardNames(wrapper)).toEqual(['Pâtes carbonara', 'Ramen', 'Tarte flambée'])

    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(listRequests(fetchMock)).toEqual([
      '?typeSlug=plat&limit=30',
      '?q=tarte&typeSlug=plat&limit=30',
    ])
    // La « Tarte aux pommes » du dessert n'y est pas ; le titre et le compte de la catégorie restent
    expect(cardNames(wrapper)).toEqual(['Tarte flambée'])
    expect(wrapper.find('h1').text()).toBe('Plat')
    expect(wrapper.find('header p').text()).toBe('3 recettes')

    await wrapper.find('button[aria-label="Effacer la recherche"]').trigger('click')
    await flushPromises()

    expect(cardNames(wrapper)).toEqual(['Pâtes carbonara', 'Ramen', 'Tarte flambée'])
    // La liste de la catégorie était déjà lue : aucune requête de plus
    expect(listRequests(fetchMock)).toHaveLength(2)
  })

  it('dit qu’aucune recette ne ressemble, et garde le champ', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('zzz')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.text()).toContain('Aucune recette ne ressemble à « zzz ».')
    expect(wrapper.text()).not.toContain('Rien de nouveau à copier')
    expect(field(wrapper).exists()).toBe(true)
    expect(tiles(wrapper)).toHaveLength(0)
  })

  it('hors saison, sans résultat : la phrase seule, sans illustration', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open()
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
    const { wrapper } = await open()
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
    const many = Array.from({ length: 35 }, (_, index) => ({
      id: `p${index}`,
      name: `Tarte ${String(index).padStart(2, '0')}`,
      ...plat,
    }))
    const { wrapper, fetchMock } = await open(fakeBack([], many))
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

    expect(listRequests(fetchMock)).toEqual(['?q=tarte&limit=30', '?q=tarte&limit=30&offset=30'])
    expect(wrapper.findAll('ul[aria-label="Résultats de la recherche"] > li')).toHaveLength(35)
  })

  it('dit que la recherche a échoué, et garde le champ', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open({
      'GET /api/v1/recipes/other-people': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    await field(wrapper).setValue('tarte')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(field(wrapper).exists()).toBe(true)
    expect(cards(wrapper)).toHaveLength(0)
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
  const copyButton = (wrapper: Opened['wrapper'], name: string) =>
    wrapper.find(`button[aria-label="Copier ${name} dans mes recettes"]`)
  const doneButton = (wrapper: Opened['wrapper'], name: string) =>
    wrapper.find(`button[aria-label="Copiée : ${name} est dans tes recettes"]`)

  // Comme le vrai back : une recette copiée n'est plus rendue à la relecture, ni comptée dans les tuiles
  function backThatForgetsCopies(all = recipes) {
    const copied: string[] = []

    return {
      ...fakeBack(copied, all),
      'POST /api/v1/recipes/p1/copy': () => {
        copied.push('p1')

        return new Response(null, {
          status: 201,
          headers: { Location: '/api/v1/recipes/copie-1' },
        })
      },
    }
  }

  it('copie sans quitter la catégorie : un message, et le bouton de cette recette dit « Copiée »', async () => {
    const { wrapper, context, fetchMock } = await open(
      backThatForgetsCopies(),
      '/recettes/autres?categorie=plat',
    )
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    const push = vi.spyOn(context.router, 'push')

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true))
    await flushPromises()

    // On reste sur la catégorie, la copie ne s'ouvre pas
    expect(push).not.toHaveBeenCalled()
    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres?categorie=plat')
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
    const { wrapper, fetchMock } = await open(
      backThatForgetsCopies(),
      '/recettes/autres?categorie=plat',
    )
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(listRequests(fetchMock)).toHaveLength(2))
    await flushPromises()

    expect(cardNames(wrapper)).toEqual(['Pâtes carbonara', 'Ramen', 'Tarte flambée'])
    expect(cards(wrapper)[0]!.find('button[aria-label^="Copiée"]').exists()).toBe(true)
    // Le compte du début de la visite ne bouge pas sous les doigts
    expect(wrapper.find('header p').text()).toBe('3 recettes')
  })

  it('copier la dernière recette d’une catégorie la laisse ouverte, avec « Copiée »', async () => {
    const only = recipes.filter((recipe) => recipe.id === 'p1' || recipe.typeSlug !== 'plat')
    const { wrapper } = await open(backThatForgetsCopies(only), '/recettes/autres?categorie=plat')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(1))

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true))
    await flushPromises()

    // La catégorie n'a plus de recette à copier (le back ne la compte plus) mais elle reste ouverte jusqu'à la sortie
    expect(wrapper.find('h1').text()).toBe('Plat')
    expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true)
  })

  it('les comptes des tuiles se rafraîchissent au retour : la catégorie copiée en compte une de moins', async () => {
    const { wrapper, context } = await open(
      backThatForgetsCopies(),
      '/recettes/autres?categorie=plat',
    )
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(true))
    await flushPromises()

    await context.router.push('/recettes/autres')
    await vi.waitFor(() => expect(tiles(wrapper)).toHaveLength(3))

    await vi.waitFor(() => expect(tile(wrapper, 'plat').text()).toContain('2 recettes'))
  })

  it('un refus du back garde « Copier » et dit l’erreur, sans « Copiée »', async () => {
    const { wrapper, context } = await open(
      { 'POST /api/v1/recipes/p1/copy': () => json({ error: { message: 'x' } }, { status: 500 }) },
      '/recettes/autres?categorie=plat',
    )
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    await copyButton(wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() =>
      expect(useNotificationsStore().items.map((item) => item.kind)).toEqual(['error']),
    )
    await flushPromises()

    expect(context.router.currentRoute.value.fullPath).toBe('/recettes/autres?categorie=plat')
    expect(doneButton(wrapper, 'Pâtes carbonara').exists()).toBe(false)
    expect(copyButton(wrapper, 'Pâtes carbonara').attributes('disabled')).toBeUndefined()
    expect(cards(wrapper)).toHaveLength(3)
  })

  it('une autre recherche repart d’une liste neuve : la recette copiée n’y est pas ajoutée', async () => {
    vi.useFakeTimers()
    const { wrapper } = await open(backThatForgetsCopies(), '/recettes/autres?categorie=plat')
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
    expect(cardNames(wrapper)).toEqual(['Tarte flambée'])
  })

  it('rouvrir l’écran repart de zéro : plus rien n’est « Copiée », même si le back rend encore la recette', async () => {
    const first = await open(
      { 'POST /api/v1/recipes/p1/copy': () => new Response(null, { status: 201 }) },
      '/recettes/autres?categorie=plat',
    )
    await vi.waitFor(() => expect(cards(first.wrapper)).toHaveLength(3))
    await copyButton(first.wrapper, 'Pâtes carbonara').trigger('click')
    await vi.waitFor(() => expect(doneButton(first.wrapper, 'Pâtes carbonara').exists()).toBe(true))
    first.wrapper.unmount()

    // Même session, l'écran se rouvre : la copie de tout à l'heure n'y est plus marquée
    const wrapper = mount(OtherRecipesView, { global: { plugins: first.context.plugins } })
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    expect(wrapper.find('button[aria-label^="Copiée"]').exists()).toBe(false)
    expect(copyButton(wrapper, 'Pâtes carbonara').exists()).toBe(true)
  })
})

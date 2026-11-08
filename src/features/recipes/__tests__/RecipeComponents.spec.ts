import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import { useCopyRecipeAction } from '@/features/recipes/useCopyRecipeAction'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// Les recettes utilisées dans une autre recette (COMP-006, ADR 0040 du back) : l'éditeur, la fiche et le refus de supprimer.
// La copie (le message) est dans OtherRecipes.spec.ts, les textes dans voice-and-glossary.spec.ts.

const types = {
  member: [
    { slug: 'plat', name: 'Plat', image: '', order: 1 },
    { slug: 'dessert', name: 'Dessert', image: '', order: 2 },
  ],
  totalItems: 2,
}
const row = (overrides: Record<string, unknown> = {}) => ({
  ingredientSlug: 'farine',
  ingredientName: 'Farine',
  ingredientImage: '',
  quantity: 250,
  unitSlug: 'gramme',
  unitSymbol: 'g',
  unitName: 'gramme',
  purchaseUnitSlug: 'gramme',
  purchaseUnitName: 'gramme',
  convertible: true,
  ...overrides,
})
const usedRecipe = (overrides: Record<string, unknown> = {}) => ({
  recipeId: 'pate',
  name: 'Pâte sablée',
  serving: 6,
  multiplier: 1,
  secret: false,
  convertible: true,
  rows: [
    row(),
    row({ ingredientSlug: 'beurre', ingredientName: 'Beurre', quantity: 125 }),
    row({ ingredientSlug: 'sel', ingredientName: 'Sel', quantity: 1, unitSymbol: 'pincée' }),
  ],
  ...overrides,
})
const tarte = (overrides: Record<string, unknown> = {}) => ({
  id: 'tarte',
  name: 'Tarte au citron',
  serving: 8,
  typeSlug: 'dessert',
  typeName: 'Dessert',
  version: 4,
  secret: false,
  favorite: false,
  canEdit: true,
  ownerless: false,
  rows: [row({ ingredientSlug: 'citron', ingredientName: 'Citron', quantity: 4, unitSymbol: '' })],
  components: [usedRecipe()],
  ...overrides,
})
const usable = (list: [string, string, boolean?][]) => ({
  member: list.map(([id, name, secret]) => ({
    id,
    name,
    serving: 4,
    typeSlug: 'plat',
    typeName: 'Plat',
    secret: secret === true,
  })),
  totalItems: list.length,
  canHaveComponents: true,
})
const usages = (list: [string, string][]) => ({
  member: list.map(([id, name]) => ({ id, name, secret: false })),
  totalItems: list.length,
})

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/ingredients': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/units': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
  'GET /api/v1/recipe-types/dessert/recipes': () =>
    json({ member: [{ id: 'tarte', name: 'Tarte au citron' }], totalItems: 1 }),
  'GET /api/v1/recipe-types/plat/recipes': () => json({ member: [], totalItems: 0 }),
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const sheet = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const sheetButton = (text: string) =>
  Array.from(sheet()?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(text),
  )

async function mountView(
  component: typeof RecipeDetailView | typeof RecipeEditorView,
  path: string,
  handlers: Parameters<typeof stubApi>[0],
) {
  const fetchMock = stubApi({ ...session, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(component, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

/** Les requêtes d'écriture reçues, avec leur corps. */
async function writes(fetchMock: ReturnType<typeof stubApi>, method: string) {
  const sent = fetchMock.mock.calls
    .map(([call]) => call as Request)
    .filter((r) => r.method === method && r.url.includes('/api/v1/'))

  return Promise.all(
    sent.map(async (request) => ({ url: new URL(request.url), body: await request.json() })),
  )
}

describe("l'éditeur : les recettes utilisées", () => {
  const create = (handlers: Parameters<typeof stubApi>[0] = {}) =>
    mountView(RecipeEditorView, '/recettes/nouvelle/ecrire', {
      'GET /api/v1/recipes/usable': () =>
        json(
          usable([
            ['pate', 'Pâte sablée'],
            ['sauce', 'Sauce de salade'],
          ]),
        ),
      'POST /api/v1/recipes': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/neuve' } }),
      ...handlers,
    })
  const fillName = async (wrapper: ReturnType<typeof mount>) => {
    await wrapper.find('input:not([type])').setValue('Tarte')
  }
  const save = async (wrapper: ReturnType<typeof mount>) => {
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }
  const pickFirst = async (wrapper: ReturnType<typeof mount>, label = 'Pâte sablée') => {
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ajouter une de mes recettes')
      ?.trigger('click')
    await vi.waitFor(() => expect(sheet()?.textContent).toContain(label))
    ;(
      Array.from(sheet()?.querySelectorAll('[data-usable]') ?? []).find((b) =>
        b.textContent?.includes(label),
      ) as HTMLElement
    ).click()
    await flushPromises()
  }

  it('sans recette utilisée : une phrase et un bouton, rien n’est lu ni envoyé de plus', async () => {
    const { wrapper, fetchMock } = await create()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))

    expect(wrapper.text()).toContain(
      'Ta pâte, ta sauce : ajoute une de tes recettes, elle compte dans celle-ci.',
    )
    expect(wrapper.text()).toContain('Ajouter une de mes recettes')
    expect(calls(fetchMock)).not.toContain('GET /api/v1/recipes/usable')

    // Une recette comme avant : la clé « components » ne part pas
    await fillName(wrapper)
    await wrapper.find('button[aria-label="Retirer l\'ingrédient 1"]').trigger('click')
    await save(wrapper)
    expect(wrapper.text()).toContain('Ajoute au moins un ingrédient ou une recette.')
    expect(await writes(fetchMock, 'POST')).toEqual([])
  })

  it('choisit une recette dans la feuille : elle entre à 1 fois, la ligne vide du départ s’en va, l’ordre est envoyé', async () => {
    const { wrapper, fetchMock } = await create()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
    await fillName(wrapper)

    await pickFirst(wrapper)

    // La feuille est fermée, la recette est là avec son nombre de fois et son aide en une ligne
    expect(sheet()).toBeNull()
    expect(wrapper.text()).toContain('1 fois = la recette comme elle est écrite.')
    expect(wrapper.text()).toContain('Pour 4 personnes')
    expect(
      (
        wrapper.find('input[aria-label="Nombre de fois pour Pâte sablée"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('1')
    expect(wrapper.findAll('input[aria-label^="Quantité"]')).toHaveLength(0)

    await pickFirst(wrapper, 'Sauce de salade')
    await save(wrapper)

    const [post] = await writes(fetchMock, 'POST')
    expect(post?.body).toMatchObject({
      rows: [],
      components: [
        { recipeId: 'pate', multiplier: 1 },
        { recipeId: 'sauce', multiplier: 1 },
      ],
    })
  })

  it('ne propose pas la recette déjà choisie et passe la recette écrite et son secret au back', async () => {
    const { wrapper, fetchMock } = await create()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
    await pickFirst(wrapper)

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ajouter une de mes recettes')
      ?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    await vi.waitFor(() => expect(sheet()?.textContent).toContain('Sauce de salade'))

    expect(sheet()?.textContent).not.toContain('Pâte sablée')
    const asked = fetchMock.mock.calls.map(([call]) => new URL((call as Request).url))
    expect(asked.find((url) => url.pathname === '/api/v1/recipes/usable')?.search).toBe('')
  })

  it('une recette secrète demande aussi les recettes secrètes', async () => {
    const { wrapper, fetchMock } = await create()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
    await wrapper.find('input[role="switch"]').setValue(true)

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ajouter une de mes recettes')
      ?.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls
          .map(([call]) => new URL((call as Request).url))
          .find((url) => url.pathname === '/api/v1/recipes/usable')?.search,
      ).toBe('?secret=true'),
    )
  })

  it('dit « rien à choisir » quand l’utilisateur n’a pas d’autre recette', async () => {
    const { wrapper } = await create({ 'GET /api/v1/recipes/usable': () => json(usable([])) })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ajouter une de mes recettes')
      ?.trigger('click')

    await vi.waitFor(() =>
      expect(sheet()?.textContent).toContain('Tu n’as pas d’autre recette à utiliser.'),
    )
    expect(sheet()?.textContent).toContain('Écris d’abord une autre recette, elle sera ici.')
    sheetButton('Fermer')?.click()
    await flushPromises()
    expect(sheet()).toBeNull()
  })

  it('règle le nombre de fois par pas de 0,5 ou en le tapant (virgule comprise) et le dit en mots', async () => {
    const { wrapper, fetchMock } = await create()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
    await fillName(wrapper)
    await pickFirst(wrapper)
    const input = () => wrapper.find('input[aria-label="Nombre de fois pour Pâte sablée"]')
    const more = () => wrapper.find('button[aria-label="Plus de fois pour Pâte sablée"]')
    const less = () => wrapper.find('button[aria-label="Moins de fois pour Pâte sablée"]')

    await more().trigger('click')
    expect((input().element as HTMLInputElement).value).toBe('1,5')
    await more().trigger('click')
    expect((input().element as HTMLInputElement).value).toBe('2')
    expect(wrapper.text()).toContain('Tu prends 2 fois les quantités de Pâte sablée.')

    await less().trigger('click')
    await less().trigger('click')
    expect((input().element as HTMLInputElement).value).toBe('1')
    await less().trigger('click')
    expect((input().element as HTMLInputElement).value).toBe('0,5')
    expect(wrapper.text()).toContain('Tu prends la moitié des quantités de Pâte sablée.')
    expect(less().attributes('disabled')).toBeDefined()

    await input().setValue('2,25')
    await save(wrapper)
    expect((await writes(fetchMock, 'POST'))[0]?.body).toMatchObject({
      components: [{ recipeId: 'pate', multiplier: 2.25 }],
    })
  })

  it.each(['0', '101', 'abc', '', '-1'])(
    'refuse « %s » fois sous la ligne, sans rien envoyer',
    async (typed) => {
      const { wrapper, fetchMock } = await create()
      await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
      await fillName(wrapper)
      await pickFirst(wrapper)

      await wrapper.find('input[aria-label="Nombre de fois pour Pâte sablée"]').setValue(typed)
      await save(wrapper)

      expect(wrapper.text()).toContain('Mets un nombre entre 0,01 et 100.')
      expect(await writes(fetchMock, 'POST')).toEqual([])
    },
  )

  it('remplace le bouton par une phrase à la dixième recette', async () => {
    const ten = Array.from({ length: 10 }, (_, i): [string, string] => [`r${i}`, `Recette ${i}`])
    const { wrapper } = await create({ 'GET /api/v1/recipes/usable': () => json(usable(ten)) })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))

    for (let i = 0; i < 10; i++) await pickFirst(wrapper, `Recette ${i}`).catch(() => undefined)
    // Sans bouton de plus : la phrase tient sa place
    await vi.waitFor(() => expect(wrapper.findAll('[data-component]')).toHaveLength(10))
    expect(wrapper.text()).toContain('Tu as déjà dix recettes utilisées ici.')
    expect(wrapper.text()).toContain('Retires-en une.')
    expect(
      wrapper.findAll('button').some((button) => button.text() === 'Ajouter une de mes recettes'),
    ).toBe(false)
  })

  it('retirer la dernière recette utilisée d’une recette qui en avait envoie [] (et non rien)', async () => {
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () => json(tarte()),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
      'PUT /api/v1/recipes/tarte': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Pâte sablée'))

    await wrapper.find('button[aria-label="Retirer Pâte sablée"]').trigger('click')
    await save(wrapper)

    expect((await writes(fetchMock, 'PUT'))[0]?.body).toMatchObject({ components: [] })
  })

  it('envoie les recettes utilisées lues, telles quelles, quand on ne touche pas à la section', async () => {
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () =>
        json(tarte({ components: [usedRecipe({ multiplier: 0.5 })] })),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
      'PUT /api/v1/recipes/tarte': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Tu prends la moitié des quantités de Pâte sablée.'),
    )

    await save(wrapper)

    expect((await writes(fetchMock, 'PUT'))[0]?.body).toMatchObject({
      components: [{ recipeId: 'pate', multiplier: 0.5 }],
    })
  })

  it('une recette sans recette utilisée, qu’on ne touche pas, n’envoie pas la clé (inchangé côté back)', async () => {
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () => json(tarte({ components: [] })),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
      'PUT /api/v1/recipes/tarte': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ajouter une de mes recettes'))

    await save(wrapper)

    const [put] = await writes(fetchMock, 'PUT')
    expect(put?.body).not.toHaveProperty('components')
  })

  it('un back qui ne rend pas la clé « components » : aucune recette utilisée, rien n’est envoyé', async () => {
    const old: Record<string, unknown> = tarte()
    delete old.components
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () => json(old),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
      'PUT /api/v1/recipes/tarte': () => new Response(null, { status: 204 }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ajouter une de mes recettes'))

    await save(wrapper)

    expect((await writes(fetchMock, 'PUT'))[0]?.body).not.toHaveProperty('components')
  })

  it('une recette qui sert déjà ailleurs ne peut pas en utiliser : une phrase remplace la section', async () => {
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/pate/modifier', {
      'GET /api/v1/recipes/pate': () =>
        json(tarte({ id: 'pate', name: 'Pâte sablée', components: [] })),
      'GET /api/v1/recipes/pate/used-in': () => json(usages([['tarte', 'Tarte au citron']])),
      'PUT /api/v1/recipes/pate': () => new Response(null, { status: 204 }),
    })

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(
        'Cette recette sert dans Tarte au citron. Elle ne peut pas en utiliser d’autres.',
      ),
    )
    expect(wrapper.text()).not.toContain('Ajouter une de mes recettes')
    await save(wrapper)
    expect((await writes(fetchMock, 'PUT'))[0]?.body).not.toHaveProperty('components')
  })

  it('ne montre pas la section pour la version commune d’une recette Marmiton (sans propriétaire)', async () => {
    const { wrapper, fetchMock } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () => json(tarte({ ownerless: true, components: [] })),
      'GET /api/v1/me': () => json({ ...me, isAdmin: true, roles: ['ROLE_ADMIN'] }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Tu modifies la version commune.'))

    expect(wrapper.text()).not.toContain('Recettes utilisées')
    expect(calls(fetchMock)).not.toContain('GET /api/v1/recipes/tarte/used-in')
  })

  it('dit la ligne d’une recette utilisée qui ne se convertit pas, avec « Ouvrir »', async () => {
    const { wrapper } = await mountView(RecipeEditorView, '/recettes/tarte/modifier', {
      'GET /api/v1/recipes/tarte': () =>
        json(
          tarte({
            components: [usedRecipe({ convertible: false, rows: [row({ convertible: false })] })],
          }),
        ),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
    })

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Il manque une conversion pour farine dans Pâte sablée.'),
    )
    const open = wrapper.findAll('a').find((link) => link.text() === 'Ouvrir Pâte sablée')
    expect(open?.attributes('href')).toBe('/recettes/pate')
    expect(open?.attributes('target')).toBe('_blank')
  })

  describe('les refus du back, en mots', () => {
    const alerts = (wrapper: ReturnType<typeof mount>) =>
      wrapper
        .findAll('[role="alert"]')
        .map((el) => el.text())
        .join(' | ')
    const refused = async (status: number, message: string, expected: string) => {
      const wrapper = await failing(status, message)
      expect(wrapper.text()).not.toContain(message)

      return Object.assign(wrapper, { said: alerts(wrapper).includes(expected) })
    }
    const failing = async (status: number, message: string) => {
      const { wrapper } = await create({
        'POST /api/v1/recipes': () => json({ error: { message } }, { status }),
      })
      await vi.waitFor(() => expect(wrapper.text()).toContain('Recettes utilisées'))
      await fillName(wrapper)
      await pickFirst(wrapper)
      await save(wrapper)

      return wrapper
    }

    it.each([
      [
        422,
        'RECIPE_COMPONENT_CHAIN',
        'Une recette utilisée ne peut pas en utiliser d’autres. Rien n’est perdu. Choisis une recette simple.',
      ],
      [
        422,
        'RECIPE_COMPONENT_LIMIT_REACHED',
        'Tu as déjà dix recettes utilisées ici. Retires-en une.',
      ],
      [422, 'RECIPE_COMPONENT_MULTIPLIER_INVALID', 'Mets un nombre entre 0,01 et 100.'],
      [422, 'RECIPE_EMPTY', 'Ajoute au moins un ingrédient ou une recette.'],
      [
        422,
        'RECIPE_COMPONENT_DUPLICATE',
        'Cette recette est déjà utilisée ici. Change plutôt le nombre de fois.',
      ],
      [422, 'RECIPE_COMPONENT_SELF', 'Une erreur est survenue. Réessaie.'],
      [422, 'RECIPE_COMPONENT_OWNERLESS', 'Une erreur est survenue. Réessaie.'],
    ])('%i %s', async (status, message, expected) => {
      expect((await refused(status, message, expected)).said).toBe(true)
    })

    it('une recette utilisée introuvable (404) se distingue de la recette elle-même', async () => {
      expect(
        (
          await refused(
            404,
            'Recipe id pate not found',
            'Une recette utilisée n’existe plus. Rien n’est perdu. Retire-la, puis enregistre à nouveau.',
          )
        ).said,
      ).toBe(true)
    })

    it('un autre 404 garde son texte habituel', async () => {
      const wrapper = await refused(404, 'Recipe id neuve not found', "Cet élément n'existe plus.")

      expect(wrapper.said).toBe(true)
    })

    it('visible de tous avec une recette secrète : « Rendre cette recette secrète » la règle', async () => {
      const wrapper = await refused(
        409,
        'RECIPE_COMPONENT_SECRET',
        'Une recette visible de tous ne peut pas utiliser une recette secrète. Rien n’est perdu. Rends celle-ci secrète, ou retire la recette secrète.',
      )
      expect(wrapper.said).toBe(true)
      const button = wrapper
        .findAll('button')
        .find((b) => b.text() === 'Rendre cette recette secrète')

      await button?.trigger('click')

      expect((wrapper.find('input[role="switch"]').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.text()).not.toContain('Rendre cette recette secrète')
    })
  })

  it('rendre secrète une recette qu’une recette visible utilise : l’interrupteur revient et « Voir lesquelles » les nomme', async () => {
    const { wrapper } = await mountView(RecipeEditorView, '/recettes/pate/modifier', {
      'GET /api/v1/recipes/pate': () =>
        json(tarte({ id: 'pate', name: 'Pâte sablée', components: [] })),
      'GET /api/v1/recipes/pate/used-in': () => json(usages([])),
      'GET /api/v1/recipes/usable': () => json(usable([])),
      'PUT /api/v1/recipes/pate': () =>
        json({ error: { message: 'RECIPE_SECRET_USED_BY_PUBLIC' } }, { status: 409 }),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ajouter une de mes recettes'))
    await wrapper.find('input[role="switch"]').setValue(true)

    await save(wrapper)

    expect(wrapper.text()).toContain(
      'Cette recette sert dans une recette visible de tous. Elle reste visible. Rends d’abord secrète la recette qui l’utilise.',
    )
    expect((wrapper.find('input[role="switch"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voir lesquelles')
      ?.trigger('click')
    expect(sheet()?.textContent).toContain('Cette recette sert dans')
  })
})

describe('la fiche : « Avec » et « sert dans »', () => {
  const open = (
    recipe: unknown,
    handlers: Parameters<typeof stubApi>[0] = {},
    path = '/recettes/tarte',
  ) =>
    mountView(RecipeDetailView, path, {
      'GET /api/v1/recipes/tarte': () => json(recipe),
      'GET /api/v1/recipes/tarte/used-in': () => json(usages([])),
      'GET /api/v1/departments': () => json({ member: [], totalItems: 0 }),
      ...handlers,
    })
  const ready = async (wrapper: ReturnType<typeof mount>) => {
    await vi.waitFor(() => expect(wrapper.text()).toContain('Modifier'))
    await flushPromises()
  }

  it('montre une carte par recette utilisée, ouverte d’office jusqu’à deux, les quantités mises à l’échelle', async () => {
    const { wrapper } = await open(
      tarte({
        components: [
          usedRecipe({ multiplier: 2 }),
          usedRecipe({
            recipeId: 'creme',
            name: 'Crème au citron',
            multiplier: 0.5,
            rows: [
              row({
                ingredientSlug: 'lait',
                ingredientName: 'Lait',
                quantity: 300,
                unitSymbol: 'ml',
              }),
            ],
          }),
        ],
      }),
    )
    await ready(wrapper)

    expect(wrapper.find('h2#with-title').text()).toBe('Avec')
    const cards = wrapper.findAll('[data-with]')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('Pâte sablée')
    expect(cards[0]?.text()).toContain('2 fois · 3 ingrédients')
    expect(cards[0]?.text()).toContain('500 g')
    expect(cards[0]?.text()).toContain('250 g')
    expect(cards[1]?.text()).toContain('0,5 fois · 1 ingrédient')
    expect(cards[1]?.text()).toContain('150 ml')
    expect(cards[0]?.find('a').attributes('href')).toBe('/recettes/pate')
    // Les lignes propres ne sont pas mélangées à celles des recettes utilisées
    expect(wrapper.findAll('ul')[0]?.text()).toContain('Citron')
    expect(wrapper.findAll('ul')[0]?.text()).not.toContain('Farine')
  })

  it('replie les cartes au-delà de deux recettes et les déplie d’un geste', async () => {
    const three = ['a', 'b', 'c'].map((id) => usedRecipe({ recipeId: id, name: `Recette ${id}` }))
    const { wrapper } = await open(tarte({ components: three }))
    await ready(wrapper)
    const toggle = () => wrapper.find('button[aria-label="Voir les ingrédients de Recette a"]')

    expect(toggle().attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#with-title ~ div ul, [data-with] ul').isVisible()).toBe(false)

    await toggle().trigger('click')

    const hide = wrapper.find('button[aria-label="Cacher les ingrédients de Recette a"]')
    expect(hide.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-with]')[0]?.find('ul').isVisible()).toBe(true)
  })

  it('sans recette utilisée : aucune section « Avec », aucune note', async () => {
    const { wrapper } = await open(tarte({ components: [] }))
    await ready(wrapper)

    expect(wrapper.text()).not.toContain('Avec')
    expect(wrapper.find('[data-used-in-note]').exists()).toBe(false)
    expect(wrapper.findAll('section')).toHaveLength(1)
  })

  it('une recette faite seulement de recettes utilisées n’a pas de section « Ingrédients » vide', async () => {
    const { wrapper } = await open(tarte({ rows: [] }))
    await ready(wrapper)

    expect(wrapper.text()).not.toContain('Ingrédients')
    expect(wrapper.text()).toContain('Avec')
  })

  it('un ingrédient d’une recette utilisée qui ne se convertit pas bloque « Ajouter à la liste » et se compte', async () => {
    const { wrapper } = await open(
      tarte({
        components: [
          usedRecipe({
            convertible: false,
            rows: [
              row({ convertible: false }),
              row({ ingredientSlug: 'sel', ingredientName: 'Sel' }),
            ],
          }),
        ],
      }),
    )
    await ready(wrapper)

    const plan = wrapper.find('button[aria-label="Ajouter Tarte au citron à la liste de courses"]')
    expect(plan.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Règle d’abord les ingrédients signalés.')
    expect(wrapper.findAll('button').some((b) => b.text() === '1 à régler')).toBe(true)
    expect(wrapper.text()).toContain('Il manque une conversion pour farine dans Pâte sablée.')
    const link = wrapper.find('[data-fix]')
    expect(link.text()).toBe('Ouvrir Pâte sablée')
    expect(link.attributes('href')).toBe('/recettes/pate')
  })

  it('une recette utilisée qui se convertit ne bloque rien', async () => {
    const { wrapper } = await open(tarte())
    await ready(wrapper)

    const plan = wrapper.find('button[aria-label="Ajouter Tarte au citron à la liste de courses"]')
    expect(plan.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('à régler')
  })

  it('montre « Cette recette sert dans … » et « Voir lesquelles » pour l’auteur', async () => {
    const { wrapper } = await open(tarte({ id: 'tarte', components: [] }), {
      'GET /api/v1/recipes/tarte/used-in': () =>
        json(
          usages([
            ['q', 'Quiche lorraine'],
            ['t', 'Tarte au citron'],
            ['x', 'Tourte'],
          ]),
        ),
    })
    await ready(wrapper)

    await vi.waitFor(() =>
      expect(wrapper.find('[data-used-in-note]').text()).toContain(
        'Cette recette sert dans Quiche lorraine, Tarte au citron et 1 autre. Les listes déjà faites ne changent pas.',
      ),
    )
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voir lesquelles')
      ?.trigger('click')

    const links = Array.from(sheet()?.querySelectorAll('a[data-used-in]') ?? [])
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Quiche lorraine',
      'Tarte au citron',
      'Tourte',
    ])
    expect(sheet()?.textContent).toContain('Cette recette sert dans')
  })

  it('ne lit jamais « sert dans » pour la recette d’un autre', async () => {
    const { wrapper, fetchMock } = await open(tarte({ canEdit: false }))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Copier'))
    await flushPromises()

    expect(calls(fetchMock)).not.toContain('GET /api/v1/recipes/tarte/used-in')
    // Mais on voit « Avec » avant de copier, sans aucun réglage à faire
    expect(wrapper.text()).toContain('Avec')
    expect(wrapper.text()).not.toContain('à régler')
  })

  it('la suppression refusée (409) ouvre la feuille avec les recettes qui l’utilisent', async () => {
    const { wrapper } = await open(tarte({ components: [] }), {
      'GET /api/v1/recipes/tarte/used-in': () =>
        json(
          usages([
            ['q', 'Quiche lorraine'],
            ['t', 'Tourte'],
          ]),
        ),
      'DELETE /api/v1/recipes/tarte': () =>
        json({ error: { message: 'RECIPE_USED_AS_COMPONENT' } }, { status: 409 }),
    })
    await ready(wrapper)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Supprimer')
      ?.trigger('click')
    const confirm = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Supprimer' && b.closest('[role="dialog"]'),
    )
    ;(confirm as HTMLElement).click()

    await vi.waitFor(() => expect(sheet()?.textContent).toContain('Suppression impossible'))
    expect(sheet()?.textContent).toContain(
      'Cette recette sert dans d’autres recettes. Rien n’a été supprimé. Retire-la d’abord de chacune.',
    )
    expect(sheet()?.textContent).toContain('Quiche lorraine')
    expect(sheet()?.textContent).not.toContain('RECIPE_USED_AS_COMPONENT')
    // Un seul message : pas de bandeau en plus
    expect(document.body.textContent).not.toContain('Une autre modification est en cours')
    sheetButton('Fermer')?.click()
    await flushPromises()
    expect(sheet()).toBeNull()
  })
})

describe('copier une recette qui en utilise d’autres', () => {
  const copyRoute = {
    'POST /api/v1/recipes/tarte/copy': () =>
      new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/copie' } }),
  }
  const names = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      usedRecipe({ recipeId: `c${i}`, name: `Recette ${i + 1}` }),
    )
  const copyFromSheet = async (
    recipe: unknown,
    handlers: Parameters<typeof stubApi>[0] = copyRoute,
  ) => {
    const opened = await mountView(RecipeDetailView, '/recettes/tarte', {
      'GET /api/v1/recipes/tarte': () => json(recipe),
      'GET /api/v1/departments': () => json({ member: [], totalItems: 0 }),
      ...handlers,
    })
    const button = () =>
      opened.wrapper.find('button[aria-label="Copier Tarte au citron dans mes recettes"]')
    await vi.waitFor(() => expect(button().exists()).toBe(true))
    await button().trigger('click')
    await flushPromises()

    return opened
  }
  const toasts = () => useNotificationsStore().items.map((item) => [item.kind, item.text])

  it.each([
    [0, '« Tarte au citron » est dans tes recettes.'],
    [1, 'Tarte au citron et Recette 1 sont dans tes recettes.'],
    [2, 'Tarte au citron, Recette 1 et Recette 2 sont dans tes recettes.'],
    [3, 'Tarte au citron et 3 autres recettes sont dans tes recettes.'],
  ])(
    'avec %i recette(s) utilisée(s), le message dit tout ce qui est copié',
    async (count, text) => {
      await copyFromSheet(tarte({ canEdit: false, components: names(count) }))

      expect(toasts()).toEqual([['success', text]])
    },
  )

  it('depuis une liste, relit la copie pour dire ce qui est copié, sans bloquer le bouton « Copiée »', async () => {
    const fetchMock = stubApi({
      ...session,
      ...copyRoute,
      'POST /api/v1/recipes/tarte/copy': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/copie' } }),
      'GET /api/v1/recipes/copie': () => json(tarte({ id: 'copie', components: names(2) })),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    let action!: ReturnType<typeof useCopyRecipeAction>
    mount(
      defineComponent({
        setup() {
          action = useCopyRecipeAction()

          return () => h('div')
        },
      }),
      { global: { plugins: context.plugins } },
    )

    action.copy({ id: 'tarte', name: 'Tarte au citron' })
    await vi.waitFor(() => expect(toasts()).toHaveLength(1))

    expect(action.isCopied('tarte')).toBe(true)
    expect(toasts()).toEqual([
      ['success', 'Tarte au citron, Recette 1 et Recette 2 sont dans tes recettes.'],
    ])
    expect(calls(fetchMock)).toContain('GET /api/v1/recipes/copie')
  })

  it('si la lecture de la copie échoue, le message d’avant, sans les noms', async () => {
    stubApi({
      ...session,
      ...copyRoute,
      'GET /api/v1/recipes/copie': () => json({ error: { message: 'x' } }, { status: 500 }),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    let action!: ReturnType<typeof useCopyRecipeAction>
    mount(
      defineComponent({
        setup() {
          action = useCopyRecipeAction()

          return () => h('div')
        },
      }),
      { global: { plugins: context.plugins } },
    )

    action.copy({ id: 'tarte', name: 'Tarte au citron' })

    await vi.waitFor(async () =>
      expect(toasts()).toEqual([['success', '« Tarte au citron » est dans tes recettes.']]),
    )
  })

  it('au-delà du plafond de recettes : un message sur la fiche à la place du toast, rien n’est marqué copié', async () => {
    const { wrapper } = await copyFromSheet(tarte({ canEdit: false, components: names(2) }), {
      'POST /api/v1/recipes/tarte/copy': () =>
        json({ error: { message: 'RECIPE_LIMIT_REACHED' } }, { status: 422 }),
    })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Cette copie dépasserait ta limite de 2 000 recettes. Rien n’a été copié. Supprime des recettes dont tu n’as plus besoin.',
    )
    expect(toasts()).toEqual([])
    expect(wrapper.find('button[aria-label^="Copiée"]').exists()).toBe(false)
  })
})

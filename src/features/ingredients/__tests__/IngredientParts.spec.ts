import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// Découper un ingrédient en parties (SUB-007) : la section « Ses parties » de la fiche d'un ingrédient entier, la feuille « Ajouter une
// partie », le nombre d'une partie, la fiche d'une partie. Le back (SUB-001) est un faux : chaque test dit ce qu'il répond.
const units = {
  member: [
    { slug: 'unite', name: 'unité', symbol: '', dimension: null },
    { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  ],
  totalItems: 2,
}
const departments = {
  member: [
    { slug: 'cremerie', name: 'Crémerie', image: '' },
    { slug: 'epicerie', name: 'Épicerie', image: '' },
  ],
  totalItems: 2,
}

const egg = (overrides: Record<string, unknown> = {}) => ({
  slug: 'oeuf',
  name: 'Œuf',
  image: '',
  departmentSlug: 'cremerie',
  departmentName: 'Crémerie',
  cookingUnitSlug: 'unite',
  cookingUnitName: 'unité',
  purchaseUnitSlug: 'unite',
  purchaseUnitName: 'unité',
  purchaseUnitSymbol: '',
  hasSameUnit: true,
  coefficient: null,
  creatorId: 'u1',
  canEdit: true,
  isBase: false,
  canSetBase: false,
  parts: [],
  partOf: null,
  ...overrides,
})
const yolk = { slug: 'jaune', name: "Jaune d'œuf", ratio: 1, unitName: 'unité' }
const white = { slug: 'blanc', name: "Blanc d'œuf", ratio: 2, unitName: 'unité' }

const option = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
  slug,
  name,
  departmentSlug: 'cremerie',
  departmentName: 'Crémerie',
  ...extra,
})
// Ce que l'utilisateur possède : l'œuf lui-même, deux parties libres, un entier qui a déjà des parties, une partie rangée ailleurs
const options = {
  member: [
    option('oeuf', 'Œuf'),
    option('jaune', "Jaune d'œuf"),
    option('beurre', 'Beurre'),
    option('farine', 'Farine', { departmentSlug: 'epicerie', departmentName: 'Épicerie' }),
    option('citron', 'Citron'),
    option('zeste', 'Zeste de citron', { partOfSlug: 'citron', partOfName: 'Citron' }),
  ],
  totalItems: 6,
}

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/departments': () => json(departments),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/ingredients': () => json(options),
  'GET /api/v1/ingredients/oeuf': () => json(egg()),
  'GET /api/v1/ingredients/oeuf/conversions': () =>
    json({
      member: [],
      common: [],
      totalItems: 0,
      convertible: true,
      cookingUnitSlug: 'unite',
      purchaseUnitSlug: 'unite',
    }),
  'GET /api/v1/ingredients/jaune': () => json(egg({ slug: 'jaune', name: "Jaune d'œuf" })),
}

async function open(
  handlers: Parameters<typeof stubApi>[0] = {},
  path = '/ingredients/oeuf/modifier',
) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(IngredientEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => {
    if (wrapper.find('form').exists() === false) throw new Error('fiche pas prête')
  })
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const section = () => document.body.querySelector('section[aria-label="Ses parties"]')
const sheet = () => document.body.querySelector('[role="dialog"]')
const buttonIn = (root: Element | null | undefined, label: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent?.trim() === label || button.getAttribute('aria-label') === label,
  )
const addButton = () => buttonIn(section(), 'Ajouter une partie')
const typed = (selector: string, value: string) => {
  const input = sheet()?.querySelector<HTMLInputElement>(selector)
  if (input === null || input === undefined) throw new Error(`champ absent : ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
}
const choose = async (value: string) => {
  const radio = sheet()?.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)
  if (radio === null || radio === undefined) throw new Error(`choix absent : ${value}`)
  radio.click()
  await flushPromises()
}
const submit = async () => {
  sheet()
    ?.querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}
const openSheet = async () => {
  addButton()?.dispatchEvent(new Event('click'))
  await vi.waitFor(() => expect(sheet()).not.toBeNull())
  await flushPromises()
}
const choices = () =>
  [...(sheet()?.querySelectorAll('label:has(input[type="radio"])') ?? [])].map((label) =>
    label.textContent?.trim(),
  )
const cards = () =>
  [...(section()?.querySelectorAll('li') ?? [])].map((item) =>
    [...item.querySelectorAll('button:first-of-type span:not(.sr-only)')]
      .map((span) => span.textContent?.trim())
      .join(' '),
  )
const partButton = (slug: string) =>
  section()?.querySelector<HTMLButtonElement>(`[data-part="${slug}"] button`)
const writes = (fetchMock: ReturnType<typeof stubApi>, key: string) =>
  fetchMock.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => `${request.method} ${new URL(request.url).pathname}` === key)
const bodies = (requests: Request[]) =>
  Promise.all(requests.map((request) => request.clone().json()))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Ses parties : la fiche d’un ingrédient entier', () => {
  it('sans partie, dit à quoi elles servent et propose d’en ajouter une', async () => {
    await open()

    expect(section()?.textContent).toContain(
      'Ajoute les parties de « Œuf » : elles comptent dans ton total. Par exemple, un œuf se découpe en jaune et en blanc.',
    )
    expect(cards()).toEqual([])
    expect(addButton()).toBeDefined()
  })

  it('une carte par partie, avec « 1 œuf = 1 jaune d’œuf » et le nombre accordé', async () => {
    await open({ 'GET /api/v1/ingredients/oeuf': () => json(egg({ parts: [yolk, white] })) })

    expect(cards()).toEqual([
      "Jaune d'œuf 1 œuf = 1 jaune d'œuf",
      "Blanc d'œuf 1 œuf = 2 blancs d'œuf",
    ])
    expect(section()?.textContent).not.toContain('Un œuf, c’est un jaune')
  })

  it('lit une fiche sans la clé « parts » (un back plus ancien) comme une fiche sans partie', async () => {
    const { parts: _parts, partOf: _partOf, ...old } = egg()
    void _parts
    void _partOf
    await open({ 'GET /api/v1/ingredients/oeuf': () => json(old) })

    expect(cards()).toEqual([])
    expect(addButton()).toBeDefined()
  })

  it('n’apparaît pas sur la fiche d’un ingrédient qui n’est pas à soi', async () => {
    await open({
      'GET /api/v1/ingredients/oeuf': () => json(egg({ creatorId: 'autre', canEdit: false })),
    })

    expect(section()).toBeNull()
  })

  it('n’apparaît pas à la création d’un ingrédient', async () => {
    const { fetchMock } = await open({}, '/ingredients/nouveau')

    expect(section()).toBeNull()
    expect(fetchMock.mock.calls.some(([input]) => (input as Request).url.endsWith('/oeuf'))).toBe(
      false,
    )
  })

  it('au plafond de dix parties, ne propose plus d’en ajouter et le dit', async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({
      slug: `p${index}`,
      name: `Partie ${index}`,
      ratio: 1,
      unitName: 'unité',
    }))
    await open({ 'GET /api/v1/ingredients/oeuf': () => json(egg({ parts: ten })) })

    expect(addButton()).toBeUndefined()
    expect(section()?.textContent).toContain('Tu as déjà dix parties pour cet ingrédient.')
  })
})

describe('Ajouter une partie', () => {
  it('propose les ingrédients à soi, sauf l’entier lui-même, les entiers qui ont des parties et les parties déjà rangées', async () => {
    await open()
    await openSheet()

    // Le rayon de l'œuf (Crémerie) d'abord, puis les autres ; « Nouvelle partie » à la fin
    expect(choices()).toEqual(["Jaune d'œuf", 'Beurre', 'Farine', 'Nouvelle partie'])
  })

  it('cherche parmi eux, sans tenir compte des accents ni de la casse', async () => {
    await open()
    await openSheet()

    typed('input[type="search"]', 'JAUNE')
    await flushPromises()
    expect(choices()).toEqual(["Jaune d'œuf", 'Nouvelle partie'])

    typed('input[type="search"]', 'zzz')
    await flushPromises()
    expect(choices()).toEqual(['Nouvelle partie'])
    expect(sheet()?.textContent).toContain('Aucun ingrédient ne ressemble à « zzz ».')
  })

  it('relie un ingrédient à soi : un seul PUT sur la partie, avec le parent de la fiche et le nombre', async () => {
    const { fetchMock } = await open({
      'PUT /api/v1/ingredients/jaune/parent': () => new Response(null, { status: 204 }),
    })
    await openSheet()
    await choose('jaune')

    expect(sheet()?.querySelector('label[for]')?.textContent).toBeDefined()
    expect(sheet()?.textContent).toContain('Combien dans 1 œuf ?')
    expect(sheet()?.textContent).toContain("jaune d'œuf")

    await submit()

    const puts = writes(fetchMock, 'PUT /api/v1/ingredients/jaune/parent')
    expect(await bodies(puts)).toEqual([{ parent: 'oeuf', ratio: 1 }])
    expect(writes(fetchMock, 'POST /api/v1/ingredients')).toHaveLength(0)
    expect(sheet()).toBeNull()
  })

  it('lit le nombre à la française et accorde la partie avec lui', async () => {
    const { fetchMock } = await open({
      'PUT /api/v1/ingredients/jaune/parent': () => new Response(null, { status: 204 }),
    })
    await openSheet()
    await choose('jaune')

    typed('input[inputmode="decimal"]', '2')
    await flushPromises()
    expect(sheet()?.textContent).toContain("jaunes d'œuf")

    typed('input[inputmode="decimal"]', '1,5')
    await submit()

    expect(await bodies(writes(fetchMock, 'PUT /api/v1/ingredients/jaune/parent'))).toEqual([
      { parent: 'oeuf', ratio: 1.5 },
    ])
  })

  it('refuse un nombre nul, négatif ou illisible sans rien envoyer', async () => {
    const { fetchMock } = await open()
    await openSheet()
    await choose('jaune')

    for (const bad of ['0', '-2', 'deux', '']) {
      typed('input[inputmode="decimal"]', bad)
      await submit()
      expect([bad, sheet()?.textContent?.includes('Mets un nombre plus grand que zéro.')]).toEqual([
        bad,
        true,
      ])
    }
    expect(writes(fetchMock, 'PUT /api/v1/ingredients/jaune/parent')).toHaveLength(0)
  })

  it('demande de choisir quand rien n’est choisi', async () => {
    const { fetchMock } = await open()
    await openSheet()

    await submit()

    expect(sheet()?.textContent).toContain('Choisis un ingrédient, ou crée une nouvelle partie.')
    expect(fetchMock.mock.calls.some(([input]) => (input as Request).method === 'PUT')).toBe(false)
  })

  it('« Nouvelle partie » crée l’ingrédient avec le rayon et les unités de l’entier, puis le relie', async () => {
    const { fetchMock } = await open({
      'POST /api/v1/ingredients': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/blanc-2' } }),
      'PUT /api/v1/ingredients/blanc-2/parent': () => new Response(null, { status: 204 }),
    })
    await openSheet()
    typed('input[type="search"]', 'blanc d’œuf')
    await choose('__nouvelle-partie__')

    // Le nom cherché est repris, en majuscule
    expect(sheet()?.querySelector<HTMLInputElement>('input[autocapitalize]')?.value).toBe(
      'Blanc d’œuf',
    )
    await submit()

    expect(await bodies(writes(fetchMock, 'POST /api/v1/ingredients'))).toEqual([
      {
        name: 'Blanc d’œuf',
        departmentSlug: 'cremerie',
        defaultCookingUnitSlug: 'unite',
        defaultPurchaseUnitSlug: 'unite',
        coefficient: null,
      },
    ])
    expect(await bodies(writes(fetchMock, 'PUT /api/v1/ingredients/blanc-2/parent'))).toEqual([
      { parent: 'oeuf', ratio: 1 },
    ])
    expect(sheet()).toBeNull()
  })

  it('demande un nom pour une nouvelle partie', async () => {
    const { fetchMock } = await open()
    await openSheet()
    await choose('__nouvelle-partie__')

    await submit()

    expect(sheet()?.textContent).toContain('Donne un nom à la partie.')
    expect(writes(fetchMock, 'POST /api/v1/ingredients')).toHaveLength(0)
  })

  it('dit le nom déjà pris dans ce rayon, sans relier', async () => {
    const { fetchMock } = await open({
      'POST /api/v1/ingredients': () =>
        json({ error: { message: 'INGREDIENT_NAME_ALREADY_USED' } }, { status: 409 }),
    })
    await openSheet()
    await choose('__nouvelle-partie__')
    typed('input[autocapitalize]', 'Beurre')
    await submit()

    expect(sheet()?.textContent).toContain('Tu as déjà « Beurre » dans Crémerie.')
    expect(fetchMock.mock.calls.some(([input]) => (input as Request).method === 'PUT')).toBe(false)
  })

  it('quand le rattachement échoue après la création, le dit, puis relie sans recréer la partie', async () => {
    let attempts = 0
    const { fetchMock } = await open({
      'POST /api/v1/ingredients': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/ingredients/blanc-2' } }),
      'PUT /api/v1/ingredients/blanc-2/parent': () =>
        ++attempts === 1
          ? json({ error: { message: 'x' } }, { status: 500 })
          : new Response(null, { status: 204 }),
    })
    await openSheet()
    await choose('__nouvelle-partie__')
    typed('input[autocapitalize]', 'Blanc d’œuf')
    await submit()

    expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
      '« Blanc d’œuf » est créé, mais ce n’est pas encore une partie.',
    )
    // La partie créée est maintenant un choix comme un autre, déjà choisi
    expect(choices()).toContain('Blanc d’œuf')

    await submit()

    expect(writes(fetchMock, 'POST /api/v1/ingredients')).toHaveLength(1)
    expect(writes(fetchMock, 'PUT /api/v1/ingredients/blanc-2/parent')).toHaveLength(2)
    expect(sheet()).toBeNull()
  })

  it.each([
    [
      409,
      'INGREDIENT_PART_IN_LIST',
      'Cet ingrédient est dans une liste en cours. Termine la liste, puis recommence.',
    ],
    [422, 'INGREDIENT_PART_CHAIN', 'Une partie n’a pas de parties. Choisis un ingrédient entier.'],
    [422, 'INGREDIENT_PART_OF_ITSELF', 'Un ingrédient ne peut pas être sa propre partie.'],
    [422, 'INGREDIENT_PART_LIMIT_REACHED', 'Tu as déjà dix parties pour cet ingrédient.'],
    [422, 'ratio: INGREDIENT_PART_RATIO_INVALID', 'Mets un nombre plus grand que zéro.'],
  ])('dit en une phrase le refus %i %s, jamais le code', async (status, code, sentence) => {
    await open({
      'PUT /api/v1/ingredients/jaune/parent': () => json({ error: { message: code } }, { status }),
    })
    await openSheet()
    await choose('jaune')
    await submit()

    const alert = sheet()?.querySelector('[role="alert"]')?.textContent ?? ''
    expect(alert).toBe(sentence)
    expect(alert).not.toContain('INGREDIENT_')
    // La feuille reste ouverte : rien n'est perdu
    expect(sheet()).not.toBeNull()
  })

  it('relit la fiche et la liste des ingrédients après le rattachement', async () => {
    let linked = false
    const { context } = await open({
      'GET /api/v1/ingredients/oeuf': () => json(egg({ parts: linked ? [yolk] : [] })),
      'PUT /api/v1/ingredients/jaune/parent': () => {
        linked = true

        return new Response(null, { status: 204 })
      },
    })
    const invalidate = vi.spyOn(context.queryClient, 'invalidateQueries')
    await openSheet()
    await choose('jaune')
    await submit()
    await vi.waitFor(() => expect(cards()).toEqual(["Jaune d'œuf 1 œuf = 1 jaune d'œuf"]))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ingredients'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recipes'] })
  })
})

describe('Changer ou détacher une partie', () => {
  const withParts = { 'GET /api/v1/ingredients/oeuf': () => json(egg({ parts: [yolk, white] })) }

  it('toucher la carte change le nombre : le même PUT, sur le parent de la fiche', async () => {
    const { fetchMock } = await open({
      ...withParts,
      'PUT /api/v1/ingredients/blanc/parent': () => new Response(null, { status: 204 }),
    })

    partButton('blanc')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet()?.textContent).toContain("Blanc d'œuf")
    expect(sheet()?.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.value).toBe('2')

    typed('input[inputmode="decimal"]', '3')
    await submit()

    expect(await bodies(writes(fetchMock, 'PUT /api/v1/ingredients/blanc/parent'))).toEqual([
      { parent: 'oeuf', ratio: 3 },
    ])
    expect(sheet()).toBeNull()
  })

  it('le même nombre n’écrit rien', async () => {
    const { fetchMock } = await open(withParts)

    partButton('blanc')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    await submit()

    expect(fetchMock.mock.calls.some(([input]) => (input as Request).method === 'PUT')).toBe(false)
    expect(sheet()).toBeNull()
  })

  it('la croix détache la partie (DELETE), le dit, et rend le focus au bouton d’ajout', async () => {
    let detached = false
    const { fetchMock } = await open({
      'GET /api/v1/ingredients/oeuf': () =>
        json(egg({ parts: detached ? [white] : [yolk, white] })),
      'DELETE /api/v1/ingredients/jaune/parent': () => {
        detached = true

        return new Response(null, { status: 204 })
      },
    })

    buttonIn(section(), "Ne plus faire de « Jaune d'œuf » une partie")?.dispatchEvent(
      new Event('click'),
    )
    await flushPromises()
    await vi.waitFor(() => expect(cards()).toEqual(["Blanc d'œuf 1 œuf = 2 blancs d'œuf"]))

    expect(writes(fetchMock, 'DELETE /api/v1/ingredients/jaune/parent')).toHaveLength(1)
    expect(useNotificationsStore().items.map((item) => item.text)).toContain(
      "« Jaune d'œuf » n’est plus une partie.",
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(addButton()))
  })

  it('dit pourquoi un détachement échoue, sans le code', async () => {
    await open({
      ...withParts,
      'DELETE /api/v1/ingredients/jaune/parent': () =>
        json({ error: { message: 'x' } }, { status: 403 }),
    })

    buttonIn(section(), "Ne plus faire de « Jaune d'œuf » une partie")?.dispatchEvent(
      new Event('click'),
    )
    await flushPromises()

    expect(section()?.querySelector('[role="alert"]')?.textContent).toBe(
      "Tu n'as pas le droit de faire cela.",
    )
    expect(cards()).toHaveLength(2)
  })
})

describe('La fiche d’une partie', () => {
  const part = (overrides: Record<string, unknown> = {}) =>
    egg({
      slug: 'jaune',
      name: "Jaune d'œuf",
      partOf: { slug: 'oeuf', name: 'Œuf', ratio: 1 },
      ...overrides,
    })
  const openPart = (handlers: Parameters<typeof stubApi>[0] = {}) =>
    open(
      { 'GET /api/v1/ingredients/jaune': () => json(part()), ...handlers },
      '/ingredients/jaune/modifier',
    )

  it('dit de quoi elle fait partie (avec un lien vers l’entier) et pourquoi elle ne s’achète pas seule', async () => {
    const { wrapper } = await openPart()

    const banner = wrapper.find('[data-testid="part-of"]')
    expect(banner.text()).toContain('Partie de : Œuf')
    expect(banner.text()).toContain('Ça ne s’achète pas tout seul : ça compte dans tes œufs.')
    expect(banner.find('a').attributes('href')).toBe('/ingredients/oeuf/modifier')
  })

  it('ne propose pas de découper une partie : pas de section « Ses parties »', async () => {
    await openPart()

    expect(section()).toBeNull()
  })

  it('ne propose pas de choisir la liste du produit : une partie suit son parent', async () => {
    const { wrapper } = await openPart({
      'GET /api/v1/list-types': () =>
        json({
          member: [{ id: 't1', name: 'Boucherie', departmentCount: 0, ingredientCount: 0 }],
          totalItems: 1,
        }),
    })

    expect(wrapper.text()).not.toContain('Liste de courses')
  })

  it('« Ne plus en faire une partie » recolle (DELETE), le dit et redonne la section des parties', async () => {
    let detached = false
    const { wrapper, fetchMock } = await openPart({
      'GET /api/v1/ingredients/jaune': () => json(part(detached ? { partOf: null } : {})),
      'DELETE /api/v1/ingredients/jaune/parent': () => {
        detached = true

        return new Response(null, { status: 204 })
      },
    })

    const button = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === 'Ne plus en faire une partie')
    await button?.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[data-testid="part-of"]').exists()).toBe(false))

    expect(writes(fetchMock, 'DELETE /api/v1/ingredients/jaune/parent')).toHaveLength(1)
    expect(useNotificationsStore().items.map((item) => item.text)).toContain(
      "« Jaune d'œuf » n’est plus une partie.",
    )
    await vi.waitFor(() => expect(section()).not.toBeNull())
  })
})

describe('Un ingrédient ordinaire', () => {
  it('ne montre aucun bandeau « Partie de »', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('[data-testid="part-of"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Partie de')
  })
})

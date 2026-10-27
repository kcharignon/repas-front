import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import IngredientEditorView from '@/features/ingredients/IngredientEditorView.vue'
import { useSessionStore } from '@/session/session'

// La section « Conversions de la farine » de la fiche d'un ingrédient à soi : lister, ajouter, modifier, retirer ses conversions.
const units = {
  member: [
    {
      slug: 'cuillere-a-soupe',
      name: 'cuillère à soupe',
      symbol: 'cuillère à soupe',
      dimension: null,
    },
    { slug: 'tasse', name: 'tasse', symbol: 'tasse', dimension: null },
    { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  ],
  totalItems: 4,
}
const withBottle = {
  member: [
    ...units.member,
    { slug: 'bouteille', name: 'bouteille', symbol: 'bouteille' },
    { slug: 'centilitre', name: 'centilitre', symbol: 'cl' },
  ],
  totalItems: 6,
}
const detail = (overrides: Record<string, unknown> = {}) => ({
  slug: 'farine',
  name: 'farine',
  image: '',
  departmentSlug: 'epicerie',
  departmentName: 'Épicerie',
  cookingUnitSlug: 'cuillere-a-soupe',
  cookingUnitName: 'cuillère à soupe',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
  purchaseUnitSymbol: 'kg',
  hasSameUnit: false,
  coefficient: 100,
  creatorId: 'u1',
  canEdit: true,
  ...overrides,
})
const conversion = (id: string, start: string, end: string, coefficient: number) => ({
  id,
  startUnitSlug: start,
  startUnitName: start === 'cuillere-a-soupe' ? 'cuillère à soupe' : start,
  endUnitSlug: end,
  endUnitName: end,
  coefficient,
})
const spoon = conversion('c1', 'cuillere-a-soupe', 'gramme', 10)
const cup = conversion('c2', 'tasse', 'gramme', 125)
const kiloInGrams = conversion('u1', 'kilo', 'gramme', 1000)

const list = (overrides: Record<string, unknown> = {}) => ({
  member: [spoon, cup],
  common: [kiloInGrams],
  totalItems: 2,
  convertible: true,
  cookingUnitSlug: 'cuillere-a-soupe',
  purchaseUnitSlug: 'kilo',
  ...overrides,
})

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/departments': () =>
    json({ member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }], totalItems: 1 }),
  'GET /api/v1/units': () => json(units),
  'GET /api/v1/ingredients/farine': () => json(detail()),
  'GET /api/v1/ingredients/farine/conversions': () => json(list()),
}

async function open(handlers: Parameters<typeof stubApi>[0] = {}, withSection = true) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/ingredients/farine/modifier')
  const wrapper = mount(IngredientEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  // Avec la section : on attend qu'elle ait fini de se charger ; sans (un ingrédient qu'on ne peut pas modifier) : que la fiche soit là
  await vi.waitFor(() => {
    const text = wrapper.text()
    const ready = withSection
      ? text.includes('Conversions de farine') && !text.includes('Chargement')
      : wrapper.find('form').exists()
    if (!ready) throw new Error('fiche pas prête')
  })
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const section = () => document.body.querySelector('section[aria-label="Conversions de farine"]')
const sheet = () => document.body.querySelector('[role="dialog"]')
const buttonIn = (root: Element | null | undefined, label: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent?.trim() === label || button.getAttribute('aria-label') === label,
  )
const typed = (selector: string, value: string) => {
  const input = sheet()?.querySelector<HTMLInputElement>(selector)
  if (input === null || input === undefined) throw new Error(`champ absent : ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
}
const chosen = (selector: string, value: string) => {
  const select = sheet()?.querySelector<HTMLSelectElement>(selector)
  if (select === null || select === undefined) throw new Error(`liste absente : ${selector}`)
  select.value = value
  select.dispatchEvent(new Event('change'))
}
const submit = async () => {
  sheet()
    ?.querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}
const lines = () =>
  [...(section()?.querySelectorAll('li') ?? [])].map((item) =>
    item.textContent?.replace(/\s+/g, ' ').trim(),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Conversions de l’ingrédient', () => {
  it('liste ses conversions propres en phrases, avec le symbole des unités qui en ont un', async () => {
    await open()

    expect(lines()).toEqual([
      '1 cuillère à soupe = 10 g',
      '1 tasse = 125 g',
      'Pour tout le monde : 1 kg = 1 000 g',
    ])
  })

  it('dit que la recette peut se convertir en unité d’achat', async () => {
    await open()

    expect(section()?.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      'La recette peut se convertir en kilo.',
    )
  })

  it('dit quelle conversion manque quand la recette ne peut pas se convertir', async () => {
    await open({
      'GET /api/v1/ingredients/farine/conversions': () =>
        json(list({ member: [], totalItems: 0, convertible: false })),
    })

    expect(section()?.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      'Il manque une conversion entre cuillère à soupe et kilo.',
    )
    expect(section()?.textContent).toContain('Aucune conversion à toi pour l’instant.')
  })

  it('replie les conversions de tout le monde au-delà de trois', async () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
      conversion(id, 'kilo', 'gramme', 1000 + index),
    )
    await open({
      'GET /api/v1/ingredients/farine/conversions': () => json(list({ common: many })),
    })
    expect(lines().filter((line) => line?.startsWith('Pour tout le monde'))).toHaveLength(3)

    buttonIn(section(), 'Voir tout')?.dispatchEvent(new Event('click'))
    await flushPromises()

    expect(lines().filter((line) => line?.startsWith('Pour tout le monde'))).toHaveLength(5)
    expect(buttonIn(section(), 'Voir moins')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('n’apparaît pas pour un ingrédient qu’on ne peut pas modifier', async () => {
    const { fetchMock } = await open(
      { 'GET /api/v1/ingredients/farine': () => json(detail({ canEdit: false })) },
      false,
    )

    expect(section()).toBeNull()
    expect(calls(fetchMock)).not.toContain('GET /api/v1/ingredients/farine/conversions')
  })

  it('ajoute une conversion : « 1 [unité d’achat] = ? [unité des recettes] », le nombre à dire, un seul POST', async () => {
    let created = false
    const { fetchMock } = await open({
      'GET /api/v1/ingredients/farine/conversions': () =>
        json(
          created
            ? list({ member: [spoon, cup, conversion('c3', 'kilo', 'cuillere-a-soupe', 100)] })
            : list(),
        ),
      'POST /api/v1/ingredients/farine/conversions': () => {
        created = true

        return new Response(null, { status: 201 })
      },
    })

    buttonIn(section(), 'Ajouter une conversion')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet()?.textContent).toContain('Nouvelle conversion')
    // L'unité d'achat à gauche avec 1, l'unité des recettes à droite : reste le nombre
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité de départ"]')?.value,
    ).toBe('kilo')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité d\'arrivée"]')?.value,
    ).toBe('cuillere-a-soupe')
    expect(
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Quantité de départ"]')?.value,
    ).toBe('1')
    expect(sheet()?.textContent).toContain('Dans 1 kilo, combien de cuillères à soupe ?')
    // Le focus est au nombre à dire
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe("Quantité d'arrivée"),
    )

    typed('input[aria-label="Quantité d\'arrivée"]', '100')
    await flushPromises()
    expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Farine : 1 kilo = 100 cuillères à soupe.',
    )
    await submit()

    const index = fetchMock.mock.calls.findIndex(
      ([input]) =>
        (input as Request).method === 'POST' && (input as Request).url.includes('/conversions'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({
      startUnitSlug: 'kilo',
      endUnitSlug: 'cuillere-a-soupe',
      coefficient: 100,
    })
    await vi.waitFor(() => expect(sheet()).toBeNull())
    await vi.waitFor(() => expect(lines()).toContain('1 kg = 100 cuillères à soupe'))
  })

  it('refuse deux unités identiques avant d’écrire', async () => {
    const { fetchMock } = await open()
    buttonIn(section(), 'Ajouter une conversion')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    chosen('select[aria-label="Unité d\'arrivée"]', 'kilo')
    await flushPromises()
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()

    await submit()

    expect(
      calls(fetchMock).some((call) => call.startsWith('POST /api/v1/ingredients/farine')),
    ).toBe(false)
    expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Choisis deux unités différentes.',
    )
  })

  it('demande de choisir l’unité d’arrivée quand l’ingrédient a la même unité d’achat et de recette', async () => {
    const { fetchMock } = await open({
      'GET /api/v1/ingredients/farine/conversions': () =>
        json(list({ cookingUnitSlug: 'kilo', purchaseUnitSlug: 'kilo' })),
    })
    buttonIn(section(), 'Ajouter une conversion')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité d\'arrivée"]')?.value,
    ).toBe('')
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()

    await submit()

    expect(
      calls(fetchMock).some((call) => call.startsWith('POST /api/v1/ingredients/farine')),
    ).toBe(false)
    expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Choisis les deux unités.',
    )
  })

  it('modifie une conversion : l’équation reprend ses valeurs, un seul PUT', async () => {
    const { fetchMock } = await open({
      'PUT /api/v1/ingredients/farine/conversions/c2': () => new Response(null, { status: 204 }),
    })

    buttonIn(section(), 'Modifier : 1 tasse = 125 g')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet()?.textContent).toContain('Modifier la conversion')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité de départ"]')?.value,
    ).toBe('tasse')
    expect(
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Quantité d\'arrivée"]')?.value,
    ).toBe('125')

    typed('input[aria-label="Quantité d\'arrivée"]', '130')
    await flushPromises()
    await submit()

    const index = fetchMock.mock.calls.findIndex(
      ([input]) =>
        (input as Request).method === 'PUT' && (input as Request).url.includes('/conversions/c2'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({
      startUnitSlug: 'tasse',
      endUnitSlug: 'gramme',
      coefficient: 130,
    })
    await vi.waitFor(() => expect(sheet()).toBeNull())
  })

  it('n’écrit rien quand on rouvre une conversion et qu’on enregistre sans y toucher', async () => {
    const { fetchMock } = await open()

    buttonIn(section(), 'Modifier : 1 tasse = 125 g')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    await submit()

    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(calls(fetchMock).some((call) => call.startsWith('PUT '))).toBe(false)
  })

  describe('une conversion enregistrée à l’envers se lit et se rouvre « 1 unité d’achat = N unités de recette »', () => {
    // « 1 centilitre = 0,0333 bouteille » est enregistrée ; l’ingrédient s’achète à la bouteille et se compte en centilitres
    const wine = list({
      member: [conversion('c9', 'centilitre', 'bouteille', 1 / 30)],
      common: [],
      totalItems: 1,
      cookingUnitSlug: 'centilitre',
      purchaseUnitSlug: 'bouteille',
    })
    const withWine = {
      'GET /api/v1/units': () => json(withBottle),
      'GET /api/v1/ingredients/farine/conversions': () => json(wine),
    }

    it('la ligne dit « 1 bouteille = 30 cl », jamais « 1 cl = 0,0333 bouteille »', async () => {
      await open(withWine)

      expect(lines()).toEqual(['1 bouteille = 30 cl'])
      expect(section()?.textContent).not.toContain('0,0333')
    })

    it('la feuille de modification se rouvre « 1 bouteille = 30 centilitres », sans rien écrire si on n’y touche pas', async () => {
      const { fetchMock } = await open(withWine)

      buttonIn(section(), 'Modifier : 1 bouteille = 30 cl')?.dispatchEvent(new Event('click'))
      await vi.waitFor(() => expect(sheet()).not.toBeNull())
      expect(
        sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité de départ"]')?.value,
      ).toBe('bouteille')
      expect(
        sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité d\'arrivée"]')?.value,
      ).toBe('centilitre')
      expect(
        sheet()?.querySelector<HTMLInputElement>('input[aria-label="Quantité d\'arrivée"]')?.value,
      ).toBe('30')
      expect(sheet()?.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'Farine : 1 bouteille = 30 centilitres.',
      )

      await submit()

      await vi.waitFor(() => expect(sheet()).toBeNull())
      expect(calls(fetchMock).some((call) => call.startsWith('PUT '))).toBe(false)
    })

    it('enregistre dans le sens où on l’a lue quand on change le nombre', async () => {
      const { fetchMock } = await open({
        ...withWine,
        'PUT /api/v1/ingredients/farine/conversions/c9': () => new Response(null, { status: 204 }),
      })

      buttonIn(section(), 'Modifier : 1 bouteille = 30 cl')?.dispatchEvent(new Event('click'))
      await vi.waitFor(() => expect(sheet()).not.toBeNull())
      typed('input[aria-label="Quantité d\'arrivée"]', '33')
      await flushPromises()
      await submit()

      const index = fetchMock.mock.calls.findIndex(
        ([input]) =>
          (input as Request).method === 'PUT' && (input as Request).url.includes('/conversions/c9'),
      )
      expect(await bodyOf(fetchMock, index)).toEqual({
        startUnitSlug: 'bouteille',
        endUnitSlug: 'centilitre',
        coefficient: 33,
      })
    })

    it('met l’unité d’achat à gauche d’une conversion universelle enregistrée à l’envers', async () => {
      await open({
        'GET /api/v1/ingredients/farine/conversions': () =>
          json(list({ common: [conversion('u2', 'gramme', 'kilo', 0.001)] })),
      })

      expect(lines()).toContain('Pour tout le monde : 1 kg = 1 000 g')
    })
  })

  it('retire une conversion après confirmation, et rend le focus à « Ajouter une conversion »', async () => {
    let removed = false
    const { fetchMock } = await open({
      'GET /api/v1/ingredients/farine/conversions': () =>
        json(list(removed ? { member: [spoon], totalItems: 1 } : {})),
      'DELETE /api/v1/ingredients/farine/conversions/c2': () => {
        removed = true

        return new Response(null, { status: 204 })
      },
    })

    buttonIn(section(), 'Supprimer : 1 tasse = 125 g')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() =>
      expect(document.body.querySelector('[role="alertdialog"], [role="dialog"]')).not.toBeNull(),
    )
    const dialog = document.body.querySelector('[role="alertdialog"], [role="dialog"]')
    expect(dialog?.textContent).toContain('Supprimer cette conversion ?')
    expect(dialog?.textContent).toContain('« 1 tasse = 125 g » sera supprimée.')

    buttonIn(dialog, 'Supprimer')?.dispatchEvent(new Event('click'))

    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('DELETE /api/v1/ingredients/farine/conversions/c2'),
    )
    await vi.waitFor(() => expect(lines()).not.toContain('1 tasse = 125 g'))
    await vi.waitFor(() =>
      expect(document.activeElement?.textContent?.trim()).toBe('Ajouter une conversion'),
    )
  })

  it('dit sous la liste pourquoi on ne peut pas retirer celle qui relie la recette au magasin', async () => {
    await open({
      'DELETE /api/v1/ingredients/farine/conversions/c1': () =>
        json({ error: { message: 'CONVERSION_REQUIRED_BY_INGREDIENT' } }, { status: 422 }),
    })

    buttonIn(section(), 'Supprimer : 1 cuillère à soupe = 10 g')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() =>
      expect(document.body.querySelector('[role="alertdialog"], [role="dialog"]')).not.toBeNull(),
    )
    buttonIn(
      document.body.querySelector('[role="alertdialog"], [role="dialog"]'),
      'Supprimer',
    )?.dispatchEvent(new Event('click'))

    await vi.waitFor(() =>
      expect(section()?.querySelector('[role="alert"]')?.textContent).toBe(
        'Cette conversion relie l’unité de ta recette à celle du magasin : change d’abord l’unité.',
      ),
    )
    expect(lines()).toContain('1 cuillère à soupe = 10 g')
  })

  it('dit « elle existe déjà » dans la feuille sur un 409', async () => {
    await open({
      'POST /api/v1/ingredients/farine/conversions': () =>
        json({ error: { message: 'CONVERSION_ALREADY_EXISTS' } }, { status: 409 }),
    })
    buttonIn(section(), 'Ajouter une conversion')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    chosen('select[aria-label="Unité d\'arrivée"]', 'gramme')
    await flushPromises()
    typed('input[aria-label="Quantité d\'arrivée"]', '10')
    await flushPromises()

    await submit()

    await vi.waitFor(() =>
      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
        'Cette conversion existe déjà : modifie-la.',
      ),
    )
    expect(sheet()).not.toBeNull()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import DepartmentsView from '@/features/ingredients/DepartmentsView.vue'
import IngredientsToFixView from '@/features/ingredients/IngredientsToFixView.vue'
import { useSessionStore } from '@/session/session'

// L'écran « Ingrédients à régler » (back #301) et la ligne ambre qui y mène, en tête des Rayons.
const units = {
  member: [
    { slug: 'unite', name: 'unité', symbol: '', dimension: 'COUNT', baseFactor: 1 },
    { slug: 'paquet', name: 'paquet', symbol: 'paquet', dimension: 'PACKAGE', baseFactor: 1 },
    {
      slug: 'cuillere-a-soupe',
      name: 'cuillère à soupe',
      symbol: 'cuillère à soupe',
      dimension: null,
    },
    { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  ],
  totalItems: 4,
}

const item = (slug: string, name: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  name,
  departmentName: 'Épicerie',
  cookingUnitSlug: 'unite',
  cookingUnitName: 'unité',
  purchaseUnitSlug: 'paquet',
  purchaseUnitName: 'paquet',
  ...overrides,
})
const biscotte = item('biscotte', 'biscotte')
const farine = item('farine', 'farine', {
  cookingUnitSlug: 'cuillere-a-soupe',
  cookingUnitName: 'cuillère à soupe',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
})

const toFix =
  (member: unknown[], totalItems = member.length) =>
  () =>
    json({ member, totalItems })

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/units': () => json(units),
}

async function open(handlers: Parameters<typeof stubApi>[0]) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/ingredients/a-regler')
  const wrapper = mount(IngredientsToFixView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Chargement'))
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const cards = () => [...document.body.querySelectorAll('[data-testid="to-fix-card"]')]
const sheet = () => document.body.querySelector('[role="dialog"]')
const fixButton = (name: string) =>
  document.body.querySelector<HTMLButtonElement>(
    `button[aria-label="Régler la conversion de ${name}"]`,
  )
const typed = (selector: string, value: string) => {
  const input = sheet()?.querySelector<HTMLInputElement>(selector)
  if (input === null || input === undefined) throw new Error(`champ absent : ${selector}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Ingrédients à régler : l’écran', () => {
  it('liste les ingrédients, leur rayon et les deux unités, avec leur nombre', async () => {
    const { wrapper } = await open({
      'GET /api/v1/ingredients/to-fix': toFix([biscotte, farine]),
    })

    expect(wrapper.find('h1').text()).toBe('Ingrédients à régler')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('2 ingrédients à régler')
    expect(cards().map((card) => card.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('biscotte'),
      expect.stringContaining('farine'),
    ])
    expect(cards()[0]?.textContent).toContain('Épicerie')
    expect(cards()[0]?.textContent).toContain('Recettes : unité · Magasin : paquet')
    expect(cards()[1]?.textContent).toContain('Recettes : cuillère à soupe · Magasin : kilo')
    // Le nom mène à la fiche, où l'on règle aussi
    expect(wrapper.find('a[href="/ingredients/biscotte/modifier"]').exists()).toBe(true)
  })

  it('accorde le compte au singulier', async () => {
    const { wrapper } = await open({ 'GET /api/v1/ingredients/to-fix': toFix([biscotte]) })

    expect(wrapper.find('[aria-live="polite"]').text()).toBe('1 ingrédient à régler')
  })

  it('dit « Tout est réglé. » sans ingrédient à régler, avec un retour aux rayons', async () => {
    const { wrapper } = await open({ 'GET /api/v1/ingredients/to-fix': toFix([]) })

    expect(wrapper.text()).toContain('Tout est réglé.')
    // Plus rien à expliquer : la phrase d'aide disparaît avec la liste
    expect(wrapper.text()).not.toContain('n’ont pas de conversion')
    expect(cards()).toHaveLength(0)
    expect(wrapper.find('a[href="/rayons"]').exists()).toBe(true)
  })

  it('dit combien il en reste au-delà des 200 que le back donne', async () => {
    const many = Array.from({ length: 200 }, (_, index) => item(`i${index}`, `ingrédient ${index}`))
    const { wrapper } = await open({ 'GET /api/v1/ingredients/to-fix': toFix(many, 230) })

    expect(cards()).toHaveLength(200)
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('230 ingrédients à régler')
    expect(wrapper.text()).toContain('et 30 autres')
  })

  it('signale une lecture qui échoue, et la relance', async () => {
    let attempts = 0
    const { wrapper } = await open({
      'GET /api/v1/ingredients/to-fix': () =>
        ++attempts === 1
          ? json({ error: { message: 'x' } }, { status: 500 })
          : json({ member: [biscotte], totalItems: 1 }),
    })

    expect(wrapper.find('[role="alert"]').text()).toContain('ne se sont pas affichés')
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Réessayer')
    await retry?.trigger('click')
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
  })

  it('« Régler » ouvre la feuille « 1 [unité d’achat] = ? [unité des recettes] », focus sur le nombre à dire', async () => {
    await open({ 'GET /api/v1/ingredients/to-fix': toFix([farine]) })

    fixButton('farine')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    expect(sheet()?.textContent).toContain('Dans 1 kilo, combien de cuillères à soupe ?')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité de départ"]')?.value,
    ).toBe('kilo')
    expect(
      sheet()?.querySelector<HTMLSelectElement>('select[aria-label="Unité d\'arrivée"]')?.value,
    ).toBe('cuillere-a-soupe')
    expect(
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Quantité de départ"]')?.value,
    ).toBe('1')
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe("Quantité d'arrivée"),
    )
  })

  it('enregistre la conversion de cet ingrédient, relit la liste et la carte disparaît', async () => {
    let fixed = false
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/ingredients/to-fix': () =>
        fixed
          ? json({ member: [biscotte], totalItems: 1 })
          : json({ member: [farine, biscotte], totalItems: 2 }),
      'POST /api/v1/ingredients/farine/conversions': () => {
        fixed = true

        return new Response(null, { status: 201 })
      },
    })
    expect(cards()).toHaveLength(2)

    fixButton('farine')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    typed('input[aria-label="Quantité d\'arrivée"]', '100')
    await flushPromises()
    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    const index = fetchMock.mock.calls.findIndex(
      ([input]) =>
        (input as Request).method === 'POST' && (input as Request).url.includes('/conversions'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({
      startUnitSlug: 'kilo',
      endUnitSlug: 'cuillere-a-soupe',
      coefficient: 100,
    })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.textContent).toContain('biscotte')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('1 ingrédient à régler')
    // Le focus revient au titre, d'où l'on repart : la carte qu'il tenait a disparu
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.find('h1').element))
    expect(calls(fetchMock).filter((call) => call.endsWith('/to-fix')).length).toBeGreaterThan(1)
  })

  it('dit « Tout est réglé. » quand la dernière carte disparaît', async () => {
    let fixed = false
    const { wrapper } = await open({
      'GET /api/v1/ingredients/to-fix': () =>
        fixed ? json({ member: [], totalItems: 0 }) : json({ member: [biscotte], totalItems: 1 }),
      'POST /api/v1/ingredients/biscotte/conversions': () => {
        fixed = true

        return new Response(null, { status: 201 })
      },
    })

    fixButton('biscotte')?.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    typed('input[aria-label="Quantité d\'arrivée"]', '12')
    await flushPromises()
    sheet()
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Tout est réglé.'))
  })
})

describe('Ingrédients à régler : la ligne des Rayons', () => {
  const departments = {
    member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }],
    totalItems: 1,
  }

  async function openDepartments(handler: () => Response) {
    const fetchMock = stubApi({
      ...base,
      'GET /api/v1/departments': () => json(departments),
      'GET /api/v1/ingredients/duplicates': () => json({ member: [], totalItems: 0 }),
      'GET /api/v1/ingredients/to-fix': handler,
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    await context.router.push('/rayons')
    const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })
    await vi.waitFor(() => expect(wrapper.find('a[href="/rayons/epicerie"]').exists()).toBe(true))
    await flushPromises()

    return { wrapper, fetchMock }
  }

  const line = (wrapper: Awaited<ReturnType<typeof openDepartments>>['wrapper']) =>
    wrapper.find('a[href="/ingredients/a-regler"]')

  it.each([
    [20, '20 ingrédients à régler'],
    [1, '1 ingrédient à régler'],
  ])('dit %i ingrédient(s) à régler et mène à l’écran', async (count, label) => {
    const { wrapper } = await openDepartments(() => json({ member: [biscotte], totalItems: count }))

    await vi.waitFor(() => expect(line(wrapper).exists()).toBe(true))
    expect(line(wrapper).text()).toBe(label)
  })

  it('est en tête, avant la grille des rayons', async () => {
    const { wrapper } = await openDepartments(() => json({ member: [biscotte], totalItems: 1 }))

    await vi.waitFor(() => expect(line(wrapper).exists()).toBe(true))
    const html = wrapper.html()
    expect(html.indexOf('/ingredients/a-regler')).toBeLessThan(html.indexOf('/rayons/epicerie'))
  })

  it('n’existe pas sans ingrédient à régler, avec une seule lecture', async () => {
    const { wrapper, fetchMock } = await openDepartments(() => json({ member: [], totalItems: 0 }))

    await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/ingredients/to-fix'))
    expect(line(wrapper).exists()).toBe(false)
    expect(calls(fetchMock).filter((call) => call.endsWith('/to-fix'))).toHaveLength(1)
  })

  it('n’existe pas si la lecture échoue, et ne casse pas les rayons', async () => {
    const { wrapper } = await openDepartments(() =>
      json({ error: { message: 'x' } }, { status: 500 }),
    )

    await flushPromises()
    expect(line(wrapper).exists()).toBe(false)
    expect(wrapper.find('a[href="/rayons/epicerie"]').exists()).toBe(true)
  })
})

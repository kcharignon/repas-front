// Trier la liste des produits proposés (DRV-743), côté écran : quatre vrais boutons, le bouton actif enfoncé avec la flèche de son sens, la phrase qui dit l'ordre,
// la liste rangée sans requête, le tri gardé quand les résultats changent. L'écran est monté dans jsdom ; aucun réseau.
import { LECLERC } from './retailer-fixtures'
import { afterEach, describe, expect, it } from 'vitest'

import {
  renderPicker,
  type AisleRow,
  type Picker,
  type PickerHooks,
  type PickerItem,
} from '../src/ui'
import type { SortState } from '../src/ui/sort'

afterEach(() => {
  document.body.innerHTML = ''
})

const item = (
  id: string,
  name: string,
  price: number | null,
  perMeasure: PickerItem['perMeasure'] = null,
  extra: Partial<PickerItem> = {},
): PickerItem => ({
  id,
  name,
  label2: null,
  details: [],
  promo: null,
  explain: '',
  state: 'ok',
  photo: null,
  price,
  perMeasure,
  ...extra,
})

/** Dans l'ordre du site : ni l'ordre du prix, ni celui du prix au kilo, ni l'alphabétique. */
const BUTTERS: PickerItem[] = [
  item('1', 'Beurre doux', 230, { cents: 920, unit: 'kg' }),
  item('2', 'Beurre demi-sel', 350, { cents: 700, unit: 'kg' }),
  item('3', 'Beurre extra fin', 180, { cents: 1200, unit: 'kg' }),
  item('4', 'Beurre sans prix', null),
]

interface Mounted {
  zone: HTMLElement
  picker: Picker
  chosen: string[]
  sorts: SortState[]
}

function mount(
  items: PickerItem[],
  sort?: SortState,
  extra: Partial<PickerHooks> = {},
  aisles?: AisleRow,
): Mounted {
  const zone = document.body.appendChild(document.createElement('div'))
  const chosen: string[] = []
  const sorts: SortState[] = []
  const picker = renderPicker(
    zone,
    {
      retailer: LECLERC,
      need: null,
      replaces: null,
      gone: [],
      checked: new Set(),
      query: 'beurre',
      items,
      notice: null,
      ...(sort && { sort }),
      ...(aisles && { aisles }),
    },
    {
      choose: (id) => void chosen.push(id),
      search: () => undefined,
      never: () => undefined,
      sort: (state) => void sorts.push(state),
      ...extra,
    },
  )
  return { zone, picker, chosen, sorts }
}

const names = (zone: HTMLElement) =>
  [...zone.querySelectorAll('li.candidate .name')].map((node) => node.textContent)
const sortButtons = (zone: HTMLElement) => [
  ...zone.querySelectorAll<HTMLButtonElement>('.sorting button'),
]
const buttonOf = (zone: HTMLElement, text: string): HTMLButtonElement => {
  const found = sortButtons(zone).find((button) => button.textContent?.startsWith(text))
  if (!found) throw new Error(`Pas de bouton « ${text} »`)
  return found
}
const help = (zone: HTMLElement) => zone.querySelector('.sorting .hint')?.textContent

describe('le bloc « Trier »', () => {
  it('quatre vrais boutons, du plus au moins proche du site, « Pertinence » enfoncé au départ', () => {
    const { zone } = mount(BUTTERS)

    const buttons = sortButtons(zone)
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Pertinence',
      'Prix',
      'Prix au kilo',
      'A → Z',
    ])
    expect(buttons.every((button) => button.tagName === 'BUTTON' && button.type === 'button')).toBe(
      true,
    )
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
    expect(zone.querySelector('.sorting')?.getAttribute('role')).toBe('group')
    expect(zone.querySelector('.sorting')?.getAttribute('aria-label')).toBe('Trier')
    expect(help(zone)).toBe('Dans l’ordre du site.')
    expect(names(zone)).toEqual([
      'Beurre doux',
      'Beurre demi-sel',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
  })

  it('le bloc est sous « Il te faut » et avant la recherche et les résultats', () => {
    const { zone } = mount(BUTTERS)
    const order = [...zone.querySelector('.picker')!.children].map(
      (node) => node.className || node.tagName,
    )

    expect(order.indexOf('sorting')).toBeGreaterThan(-1)
    expect(order.indexOf('sorting')).toBeLessThan(order.indexOf('search'))
  })

  it('« Prix » : du moins cher au plus cher, flèche ↑, une phrase ; le retoucher inverse (↓)', () => {
    const { zone, sorts } = mount(BUTTERS)

    buttonOf(zone, 'Prix').click()
    expect(names(zone)).toEqual([
      'Beurre extra fin',
      'Beurre doux',
      'Beurre demi-sel',
      'Beurre sans prix',
    ])
    expect(buttonOf(zone, 'Prix ↑').getAttribute('aria-pressed')).toBe('true')
    expect(buttonOf(zone, 'Prix ↑').getAttribute('aria-label')).toBe('Prix ↑, croissant')
    expect(buttonOf(zone, 'Pertinence').getAttribute('aria-pressed')).toBe('false')
    expect(help(zone)).toBe('Du moins cher au plus cher. Touche encore pour inverser.')

    buttonOf(zone, 'Prix').click()
    // sans prix : en dernier, même dans l'ordre décroissant
    expect(names(zone)).toEqual([
      'Beurre demi-sel',
      'Beurre doux',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
    expect(buttonOf(zone, 'Prix ↓').getAttribute('aria-label')).toBe('Prix ↓, décroissant')
    expect(help(zone)).toBe('Du plus cher au moins cher. Touche encore pour inverser.')
    expect(sorts).toEqual([
      { key: 'price', direction: 'asc' },
      { key: 'price', direction: 'desc' },
    ])
  })

  it('« Prix au kilo » : le prix à l’unité de mesure, celui que la fiche montre', () => {
    const { zone } = mount(BUTTERS)

    buttonOf(zone, 'Prix au kilo').click()

    expect(names(zone)).toEqual([
      'Beurre demi-sel',
      'Beurre doux',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
    expect(help(zone)).toBe('Du moins cher au plus cher au kilo. Touche encore pour inverser.')
  })

  it('« A → Z » : l’ordre alphabétique, de A à Z puis de Z à A', () => {
    const { zone } = mount(BUTTERS)

    buttonOf(zone, 'A → Z').click()
    expect(names(zone)).toEqual([
      'Beurre demi-sel',
      'Beurre doux',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
    expect(buttonOf(zone, 'A → Z ↑').getAttribute('aria-label')).toBe('A → Z ↑, de A à Z')
    expect(help(zone)).toBe('De A à Z. Touche encore pour inverser.')

    buttonOf(zone, 'A → Z').click()
    expect(names(zone)).toEqual([
      'Beurre sans prix',
      'Beurre extra fin',
      'Beurre doux',
      'Beurre demi-sel',
    ])
    expect(help(zone)).toBe('De Z à A. Touche encore pour inverser.')
  })

  it('« Pertinence » rend l’ordre du site ; la retoucher ne change rien', () => {
    const { zone, sorts } = mount(BUTTERS)
    buttonOf(zone, 'Prix').click()

    buttonOf(zone, 'Pertinence').click()
    buttonOf(zone, 'Pertinence').click()

    expect(names(zone)).toEqual([
      'Beurre doux',
      'Beurre demi-sel',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
    expect(buttonOf(zone, 'Pertinence').textContent).toBe('Pertinence')
    expect(sorts.map((state) => state.key)).toEqual(['price', 'relevance'])
  })

  it('les boutons ne sont pas refaits : le focus reste sur celui qui a été touché', () => {
    const { zone } = mount(BUTTERS)
    const before = sortButtons(zone)

    buttonOf(zone, 'Prix').click()
    buttonOf(zone, 'Prix').click()

    expect(sortButtons(zone)).toEqual(before)
  })

  it('le tri ne change que l’ordre : les mêmes fiches, et choisir la première fiche triée choisit CE produit', () => {
    const { zone, chosen } = mount(BUTTERS)

    buttonOf(zone, 'Prix').click()
    zone.querySelector<HTMLButtonElement>('li.candidate button.primary')?.click()

    expect([...names(zone)].sort()).toEqual(BUTTERS.map(({ name }) => name).sort())
    expect(chosen).toEqual(['3'])
  })

  it('un produit refusé ou en rupture est trié comme les autres, sans changer d’état', () => {
    const { zone } = mount([
      item('1', 'Beurre cher', 500),
      item('2', 'Beurre refusé', 100, null, { state: 'refused' }),
      item('3', 'Beurre absent', 200, null, { state: 'out' }),
    ])

    buttonOf(zone, 'Prix').click()

    expect(names(zone)).toEqual(['Beurre refusé', 'Beurre absent', 'Beurre cher'])
    expect(zone.querySelectorAll('li.candidate.off')).toHaveLength(1)
    expect(zone.querySelector('li.candidate.off .name')?.textContent).toBe('Beurre refusé')
  })

  it('le tri porte aussi sur une nouvelle recherche, sans que la personne le retouche', () => {
    const { zone, picker } = mount(BUTTERS)
    buttonOf(zone, 'Prix').click()

    picker.results(
      'crème',
      [
        item('7', 'Crème épaisse', 300),
        item('8', 'Crème légère', 150),
        item('9', 'Crème entière', 220),
      ],
      null,
    )

    expect(names(zone)).toEqual(['Crème légère', 'Crème entière', 'Crème épaisse'])
    expect(buttonOf(zone, 'Prix ↑').getAttribute('aria-pressed')).toBe('true')
  })

  it('le tri d’un article précédent est appliqué dès l’ouverture de l’écran suivant', () => {
    const { zone } = mount(BUTTERS, { key: 'price', direction: 'desc' })

    expect(names(zone)).toEqual([
      'Beurre demi-sel',
      'Beurre doux',
      'Beurre extra fin',
      'Beurre sans prix',
    ])
    expect(buttonOf(zone, 'Prix ↓').getAttribute('aria-pressed')).toBe('true')
    expect(help(zone)).toBe('Du plus cher au moins cher. Touche encore pour inverser.')
  })

  it('un seul produit, ou aucun : rien à trier, le bloc n’est pas montré', () => {
    expect(
      mount([item('1', 'Beurre', 100)]).zone.querySelector<HTMLElement>('.sorting')?.hidden,
    ).toBe(true)
    document.body.innerHTML = ''
    expect(mount([]).zone.querySelector<HTMLElement>('.sorting')?.hidden).toBe(true)
  })

  it('le bloc se montre quand une recherche rend assez de produits', () => {
    const { zone, picker } = mount([])

    picker.results('beurre', BUTTERS, null)

    expect(zone.querySelector<HTMLElement>('.sorting')?.hidden).toBe(false)
  })

  it('« Prix au kilo » dit le litre quand la liste se mesure au litre (on ne compare pas des kilos et des litres)', () => {
    const { zone } = mount([
      item('1', 'Lait entier', 130, { cents: 130, unit: 'l' }),
      item('2', 'Lait demi-écrémé', 120, { cents: 120, unit: 'l' }),
      item('3', 'Lait en poudre', 400, { cents: 800, unit: 'kg' }),
    ])

    buttonOf(zone, 'Prix au litre').click()

    expect(names(zone)).toEqual(['Lait demi-écrémé', 'Lait entier', 'Lait en poudre'])
    expect(help(zone)).toBe('Du moins cher au plus cher au litre. Touche encore pour inverser.')
  })

  it('pendant une requête les boutons sont inactifs, puis reviennent', () => {
    const { zone, picker } = mount(BUTTERS)

    picker.busy('Recherche en cours…')
    expect(sortButtons(zone).every((button) => button.disabled)).toBe(true)
    picker.busy(null)
    expect(sortButtons(zone).every((button) => !button.disabled)).toBe(true)
  })

  it('le tri s’applique aussi à la liste filtrée par rayon', () => {
    const { zone } = mount(
      [
        item('1', 'Beurre A', 300, null, { aisle: 1 }),
        item('2', 'Beurre B', 100, null, { aisle: 1 }),
        item('3', 'Beurre C', 50, null, { aisle: 2 }),
      ],
      { key: 'price', direction: 'asc' },
      {},
      {
        chips: [
          { id: 1, label: 'Crèmerie', count: 2 },
          { id: 2, label: 'Frais', count: 1 },
        ],
        selected: null,
      },
    )

    expect(names(zone)).toEqual(['Beurre C', 'Beurre B', 'Beurre A'])
    const chip = [...zone.querySelectorAll<HTMLButtonElement>('.aisles button')].find((button) =>
      button.textContent?.startsWith('Crèmerie'),
    )
    chip?.click()

    expect(names(zone)).toEqual(['Beurre B', 'Beurre A'])
  })
})

// @vitest-environment node
// Trier la liste des produits proposés (DRV-743) : l'ordre d'affichage, rien d'autre. Chaque tri, le sens, les valeurs manquantes en dernier, le tri stable,
// et jamais des kilos comparés à des litres.
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SORT,
  referenceUnit,
  sortItems,
  touch,
  type Sortable,
  type SortState,
} from '../src/ui/sort'

type Item = Sortable & { id: string }

const item = (
  id: string,
  name: string,
  price: number | null,
  perMeasure: Item['perMeasure'] = null,
): Item => ({ id, name, price, perMeasure })

/** Un rayon de beurres : l'ordre du site n'est ni celui du prix ni celui du prix au kilo ni l'alphabétique. */
const BUTTERS: Item[] = [
  item('a', 'Beurre doux', 230, { cents: 920, unit: 'kg' }),
  item('b', 'beurre demi-sel', 350, { cents: 700, unit: 'kg' }),
  item('c', 'Beurre extra fin', 180, { cents: 1200, unit: 'kg' }),
  item('d', 'Éclat de beurre', 260, { cents: 1040, unit: 'kg' }),
]
const sorted = (items: Item[], key: SortState['key'], direction: SortState['direction'] = 'asc') =>
  sortItems(items, { key, direction }).map(({ id }) => id)

describe('sortItems', () => {
  it('pertinence : l’ordre du site, sans toucher à la liste reçue', () => {
    const copy = [...BUTTERS]

    expect(sorted(BUTTERS, 'relevance')).toEqual(['a', 'b', 'c', 'd'])
    expect(sorted(BUTTERS, 'relevance', 'desc')).toEqual(['a', 'b', 'c', 'd'])
    expect(BUTTERS).toEqual(copy)
  })

  it('prix : du moins cher au plus cher, puis l’inverse', () => {
    expect(sorted(BUTTERS, 'price')).toEqual(['c', 'a', 'd', 'b'])
    expect(sorted(BUTTERS, 'price', 'desc')).toEqual(['b', 'd', 'a', 'c'])
  })

  it('prix au kilo : le prix à l’unité de mesure, pas le prix du produit', () => {
    expect(sorted(BUTTERS, 'unitPrice')).toEqual(['b', 'a', 'd', 'c'])
    expect(sorted(BUTTERS, 'unitPrice', 'desc')).toEqual(['c', 'd', 'a', 'b'])
  })

  it('A → Z : en français, sans tenir compte de la casse ni des accents', () => {
    // « beurre demi-sel » (minuscule) avant « Beurre doux » ; « Éclat » (accent) est classé à la lettre E, après « Beurre extra fin »
    expect(sorted(BUTTERS, 'name')).toEqual(['b', 'a', 'c', 'd'])
    expect(sorted(BUTTERS, 'name', 'desc')).toEqual(['d', 'c', 'a', 'b'])
  })

  it('un produit sans la valeur du tri passe en dernier, dans les deux sens, dans l’ordre du site', () => {
    const items = [
      item('a', 'Beurre A', null),
      item('b', 'Beurre B', 300, { cents: 1000, unit: 'kg' }),
      item('c', 'Beurre C', 0),
      item('d', 'Beurre D', 100, null),
      item('e', 'Beurre E', Number.NaN),
    ]

    expect(sorted(items, 'price')).toEqual(['d', 'b', 'a', 'c', 'e'])
    expect(sorted(items, 'price', 'desc')).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(sorted(items, 'unitPrice')).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(sorted(items, 'unitPrice', 'desc')).toEqual(['b', 'a', 'c', 'd', 'e'])
  })

  it('le tri est stable : deux produits égaux gardent l’ordre du site, dans les deux sens', () => {
    const items = [
      item('a', 'Beurre', 200),
      item('b', 'Beurre', 100),
      item('c', 'BEURRE', 200),
      item('d', 'Beurre', 100),
    ]

    expect(sorted(items, 'price')).toEqual(['b', 'd', 'a', 'c'])
    expect(sorted(items, 'price', 'desc')).toEqual(['a', 'c', 'b', 'd'])
    expect(sorted(items, 'name')).toEqual(['a', 'b', 'c', 'd'])
    expect(sorted(items, 'name', 'desc')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ne compare jamais des kilos avec des litres : l’unité la plus fréquente fait foi, les autres passent en dernier', () => {
    const items = [
      item('a', 'Jus', 165, { cents: 165, unit: 'l' }),
      item('b', 'Pommes Gala', 249, { cents: 249, unit: 'kg' }),
      item('c', 'Compote', 155, { cents: 388, unit: 'kg' }),
      item('d', 'Pommes Golden', 239, { cents: 239, unit: 'kg' }),
      item('e', 'Cidre', 300, { cents: 100, unit: 'l' }),
      item('f', 'Pommes pièce', 100, { cents: 50, unit: 'piece' }),
    ]

    expect(referenceUnit(items)).toBe('kg')
    // le litre à 1,00 € ne passe pas devant le kilo à 2,39 € : il est dans la queue, avec la pièce, dans l’ordre du site
    expect(sorted(items, 'unitPrice')).toEqual(['d', 'b', 'c', 'a', 'e', 'f'])
    expect(sorted(items, 'unitPrice', 'desc')).toEqual(['c', 'b', 'd', 'a', 'e', 'f'])
  })

  it('une liste mesurée au litre se trie au litre', () => {
    const items = [
      item('a', 'Huile olive', 690, { cents: 920, unit: 'l' }),
      item('b', 'Huile tournesol', 260, { cents: 260, unit: 'l' }),
      item('c', 'Vinaigre', 100, { cents: 400, unit: 'kg' }),
    ]

    expect(referenceUnit(items)).toBe('l')
    expect(sorted(items, 'unitPrice')).toEqual(['b', 'a', 'c'])
  })

  it('à égalité de fréquence, le kilo passe avant le litre, avant la pièce ; sans prix à l’unité : le kilo', () => {
    expect(
      referenceUnit([
        item('a', 'A', 1, { cents: 1, unit: 'piece' }),
        item('b', 'B', 1, { cents: 1, unit: 'l' }),
        item('c', 'C', 1, { cents: 1, unit: 'kg' }),
      ]),
    ).toBe('kg')
    expect(
      referenceUnit([
        item('a', 'A', 1, { cents: 1, unit: 'piece' }),
        item('b', 'B', 1, { cents: 1, unit: 'l' }),
      ]),
    ).toBe('l')
    expect(referenceUnit([item('a', 'A', 1)])).toBe('kg')
    expect(referenceUnit([])).toBe('kg')
  })

  it('une liste vide, ou d’un seul produit, se trie sans erreur', () => {
    expect(sortItems([], { key: 'price', direction: 'desc' })).toEqual([])
    expect(sorted([BUTTERS[0]!], 'name')).toEqual(['a'])
  })
})

describe('touch', () => {
  it('un autre tri commence croissant ; le toucher encore inverse le sens, puis le rétablit', () => {
    const price = touch(DEFAULT_SORT, 'price')
    const reversed = touch(price, 'price')

    expect(price).toEqual({ key: 'price', direction: 'asc' })
    expect(reversed).toEqual({ key: 'price', direction: 'desc' })
    expect(touch(reversed, 'price')).toEqual({ key: 'price', direction: 'asc' })
  })

  it('passer à un autre tri repart du sens croissant', () => {
    expect(touch({ key: 'price', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    })
  })

  it('« Pertinence » revient à l’ordre du site, et le toucher encore ne change rien', () => {
    const back = touch({ key: 'name', direction: 'desc' }, 'relevance')

    expect(back).toEqual(DEFAULT_SORT)
    expect(touch(back, 'relevance')).toEqual(DEFAULT_SORT)
  })
})

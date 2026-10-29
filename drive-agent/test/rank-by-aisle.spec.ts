// @vitest-environment node
// Le classement des produits d'une recherche selon les rayons conseillés (DRV-642) : une fonction pure, stable, qui ne perd jamais un produit.
import { describe, expect, it } from 'vitest'

import { catalogId, rankByAisle } from '../src/leclerc'
import { candidate } from './flow-helpers'

/** Des produits de test dont `aisle` est le rayon, dans l'ordre du site (`ids`). */
const shelf = (...aisles: (number | null)[]) =>
  aisles.map((aisle, index) => ({ ...candidate(String(100 + index)), aisle }))
const ids = (list: { id: string }[]) => list.map((item) => item.id)

describe('rankByAisle', () => {
  it('sans rayon conseillé, garde l’ordre du site', () => {
    const list = shelf(7, 41, 7, null, 41)

    expect(ids(rankByAisle(list, undefined))).toEqual(ids(list))
    expect(ids(rankByAisle(list, []))).toEqual(ids(list))
  })

  it('place d’abord les produits du rayon conseillé, l’ordre du site gardé dedans et dans le reste', () => {
    // Given : 100 (rayon 7), 101 (41), 102 (7), 103 (aucun), 104 (41)
    const list = shelf(7, 41, 7, null, 41)

    // When
    const ranked = rankByAisle(list, [41])

    // Then
    expect(ids(ranked)).toEqual(['101', '104', '100', '102', '103'])
  })

  it('range par groupes dans l’ordre des rayons conseillés (le plus choisi d’abord)', () => {
    const list = shelf(7, 12, 41, 12, 60, 41, 7)

    expect(ids(rankByAisle(list, [41, 12, 60]))).toEqual([
      '102',
      '105',
      '101',
      '103',
      '104',
      '100',
      '106',
    ])
    expect(ids(rankByAisle(list, [60, 41]))).toEqual([
      '104',
      '102',
      '105',
      '100',
      '101',
      '103',
      '106',
    ])
  })

  it('ne cache et ne perd aucun produit, ne modifie pas la liste reçue', () => {
    const list = shelf(7, 12, 41, null, 12)
    const before = ids(list)

    const ranked = rankByAisle(list, [12, 999])

    expect([...ids(ranked)].sort()).toEqual([...before].sort())
    expect(ranked).toHaveLength(list.length)
    expect(ids(list)).toEqual(before)
  })

  it('un rayon conseillé que personne n’a ne change rien', () => {
    const list = shelf(7, 12, 41)

    expect(ids(rankByAisle(list, [999]))).toEqual(ids(list))
  })

  it('ignore une valeur invalide ou en double sans casser les autres', () => {
    const list = shelf(7, 41, 12)

    expect(ids(rankByAisle(list, [0, -1, 1.5, Number.NaN, 12, 12]))).toEqual(['102', '100', '101'])
    expect(ids(rankByAisle(list, [Number.NaN, 0]))).toEqual(ids(list))
  })

  it('un produit sans rayon lu reste avec les autres, jamais dans un groupe', () => {
    const list = shelf(null, 41, null)

    expect(ids(rankByAisle(list, [41]))).toEqual(['101', '100', '102'])
  })
})

describe('catalogId', () => {
  it.each([
    [1, 1],
    [41, 41],
    [2_147_483_647, 2_147_483_647],
  ])('garde %s', (value, expected) => {
    expect(catalogId(value)).toBe(expected)
  })

  it.each([
    [0],
    [-1],
    [1.5],
    [2_147_483_648],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [null],
    [undefined],
  ])('écarte %s', (value) => {
    expect(catalogId(value)).toBeNull()
  })
})

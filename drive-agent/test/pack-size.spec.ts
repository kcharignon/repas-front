// @vitest-environment node
// La contenance d'un produit dans l'unité de la liste (DRV-652) : les bornes et l'arrondi sont ceux du back (`PackSize`, `PackCalculator`). Une contenance hors
// bornes fait refuser TOUT le lot de choix : ces règles sont éprouvées à la table.
import { describe, expect, it } from 'vitest'

import {
  isPackValue,
  ofUnits,
  packsFromSize,
  parsePackValue,
  pluralOf,
  toPackSize,
  UNIT_SLUG,
} from '../protocol'

describe('isPackValue : de 0,001 à 9 999, trois décimales au plus', () => {
  it.each([0.001, 0.5, 1, 12.5, 12.345, 20, 340, 9998.999, 9999])('accepte %s', (value) => {
    expect(isPackValue(value)).toBe(true)
  })

  it.each([
    0,
    0.0009,
    0.0001,
    -1,
    -20,
    9999.001,
    10_000,
    1e9,
    12.3456,
    1.0005,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '20',
    null,
    undefined,
    {},
  ])('refuse %j', (value) => {
    expect(isPackValue(value)).toBe(false)
  })
})

describe('parsePackValue : ce que la personne tape, virgule française comprise', () => {
  it.each([
    ['20', 20],
    [' 20 ', 20],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0,001', 0.001],
    ['0.001', 0.001],
    ['9999', 9999],
    ['0,5', 0.5],
    ['1,250', 1.25],
    ['007', 7],
  ])('« %s » donne %s', (text, expected) => {
    expect(parsePackValue(text)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    ['0'],
    ['0,000'],
    ['0,0004'],
    ['10000'],
    ['9999,5'],
    ['12,3456'],
    ['-3'],
    ['+3'],
    ['1e3'],
    ['1 000'],
    ['20 tranches'],
    ['vingt'],
    ['1,2,3'],
    [',5'],
    ['5,'],
    ['١٢'],
    ['20\n21'],
  ])('« %s » : refusé', (text) => {
    expect(parsePackValue(text)).toBeNull()
  })
})

describe('toPackSize : une contenance complète, ou rien', () => {
  it('rend la contenance telle quelle', () => {
    expect(toPackSize({ value: 20, unitSlug: 'tranche' })).toEqual({
      value: 20,
      unitSlug: 'tranche',
    })
    expect(toPackSize({ unitSlug: 'cuillere-a-soupe', value: 0.5 })).toEqual({
      value: 0.5,
      unitSlug: 'cuillere-a-soupe',
    })
  })

  it.each([
    [{ value: 20 }],
    [{ unitSlug: 'tranche' }],
    [{ value: 20, unitSlug: 'tranche', label: 'x' }],
    [{ value: 0, unitSlug: 'tranche' }],
    [{ value: 20, unitSlug: 'Tranche' }],
    [{ value: 20, unitSlug: 'tranche ' }],
    [{ value: 20, unitSlug: '' }],
    [{ value: 20, unitSlug: 'x'.repeat(256) }],
    [{ value: '20', unitSlug: 'tranche' }],
    [[20, 'tranche']],
    [null],
    [undefined],
    ['20 tranches'],
    [20],
  ])('refuse %j', (value) => {
    expect(toPackSize(value)).toBeNull()
  })

  it('accepte un slug de 255 caractères, le plus long du back', () => {
    expect(UNIT_SLUG.test('a'.repeat(255))).toBe(true)
    expect(UNIT_SLUG.test('a'.repeat(256))).toBe(false)
  })
})

describe('packsFromSize : ceil(quantité ÷ contenance), tolérance 1e-9, de 1 à 99', () => {
  it.each([
    [15, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [25, 20, 2],
    [40, 20, 2],
    [41, 20, 3],
    [1, 20, 1],
    [0.5, 20, 1],
    [0.3, 0.1, 3],
    [0.3, 0.1 + 1e-12, 3],
    [3, 0.001, 99],
    [2000, 20, 99],
    [1980, 20, 99],
    [1981, 20, 99],
    [14, 14, 1],
    [14.0000000001, 14, 1],
  ])('%s pour %s par produit : %s', (quantity, size, expected) => {
    expect(packsFromSize(quantity, size)).toBe(expected)
  })

  it.each([
    [0, 20],
    [-1, 20],
    [15, 0],
    [15, -2],
    [Number.NaN, 20],
    [15, Number.NaN],
    [Number.POSITIVE_INFINITY, 20],
    [15, Number.POSITIVE_INFINITY],
  ])('%s pour %s : pas de calcul', (quantity, size) => {
    expect(packsFromSize(quantity, size)).toBeNull()
  })
})

describe('ofUnits : « de » devant un nom d’unité, élidé devant une voyelle et un « h » muet', () => {
  it.each([
    ['tranches', 'de tranches'],
    ['sachets', 'de sachets'],
    ['grammes', 'de grammes'],
    ['pièces', 'de pièces'],
    ['cuillères à soupe', 'de cuillères à soupe'],
    ['boîtes', 'de boîtes'],
    ['kilos', 'de kilos'],
    ['unités', 'd’unités'],
    ['œufs', 'd’œufs'],
    ['Œufs', 'd’Œufs'],
    ['oeufs', 'd’oeufs'],
    ['oignons', 'd’oignons'],
    ['assiettes', 'd’assiettes'],
    ['épis', 'd’épis'],
    ['écorces', 'd’écorces'],
    ['îlots', 'd’îlots'],
    ['ampoules', 'd’ampoules'],
    ['yaourts', 'd’yaourts'],
    ['heures', 'd’heures'],
    ['herbes', 'd’herbes'],
    ['huîtres', 'd’huîtres'],
    ['hôtes', 'd’hôtes'],
    ['hachis', 'de hachis'],
    ['haricots', 'de haricots'],
    ['hamburgers', 'de hamburgers'],
    ['homards', 'de homards'],
    ['hâtes', 'de hâtes'],
    ['  unités  ', 'd’unités'],
  ])('« %s » : « %s »', (units, expected) => {
    expect(ofUnits(units)).toBe(expected)
  })

  it('la question ne dit jamais « de » devant une voyelle', () => {
    for (const unit of [
      'unité',
      'œuf',
      'oignon',
      'assiette',
      'épi',
      'yaourt',
      'heure',
      'ampoule',
    ]) {
      expect(ofUnits(pluralOf(unit))).toMatch(/^d’/)
    }
  })
})

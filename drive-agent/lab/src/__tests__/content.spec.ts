import { describe, expect, it } from 'vitest'

import {
  compareContents,
  contentFromLabel,
  contentFromPrices,
  formatContent,
  measureReference,
} from '../content'

describe('contentFromLabel', () => {
  it.each([
    ['1 kg', { value: 1000, unit: 'g' }],
    ['500 g', { value: 500, unit: 'g' }],
    ['750g', { value: 750, unit: 'g' }],
    ['1,5 L', { value: 1500, unit: 'ml' }],
    ['75 cl', { value: 750, unit: 'ml' }],
    ['25 CL', { value: 250, unit: 'ml' }],
    ['6 x 1 L', { value: 6000, unit: 'ml' }],
    ['6x33cl', { value: 1980, unit: 'ml' }],
    ['4 × 125 g', { value: 500, unit: 'g' }],
    ['500 g x 3', { value: 1500, unit: 'g' }],
    ['Farine de blé T55 1 kg', { value: 1000, unit: 'g' }],
    ['250 grammes', { value: 250, unit: 'g' }],
    ['Œufs x12', { value: 12, unit: 'u' }],
    ['lot de 6', { value: 6, unit: 'u' }],
    ['10 sachets', { value: 10, unit: 'u' }],
    ['12 pièces', { value: 12, unit: 'u' }],
  ])('lit « %s »', (label, expected) => {
    expect(contentFromLabel(label)).toEqual(expected)
  })

  it.each([[null], [undefined], [''], ['Farine de blé'], ['Réf. T55']])(
    'ne trouve rien dans %j',
    (label) => {
      expect(contentFromLabel(label)).toBeNull()
    },
  )

  it('ne prend pas un nombre collé à un mot pour un contenu', () => {
    expect(contentFromLabel('Pâtes tagliatelle t55g')).toBeNull()
  })
})

describe('measureReference', () => {
  it.each([
    ['1,29 € / kg', { value: 1000, unit: 'g' }],
    ['2,00 € le kg', { value: 1000, unit: 'g' }],
    ['Le kilo : 2,58 €', { value: 1000, unit: 'g' }],
    ['0,86 € / L', { value: 1000, unit: 'ml' }],
    ['3,10 € le litre', { value: 1000, unit: 'ml' }],
    ['0,99 € les 100 g', { value: 100, unit: 'g' }],
    ['0,45 € / 100 ml', { value: 100, unit: 'ml' }],
    ['0,20 € la pièce', { value: 1, unit: 'u' }],
    ['0,20 € / unité', { value: 1, unit: 'u' }],
    ['2,58 € kg', { value: 1000, unit: 'g' }],
  ])('lit « %s »', (text, expected) => {
    expect(measureReference(text)).toEqual(expected)
  })

  it.each([[null], [''], ['2,58 €'], ['prix variable']])('ne trouve rien dans %j', (text) => {
    expect(measureReference(text)).toBeNull()
  })
})

describe('contentFromPrices', () => {
  it('divise le prix unitaire par le prix au kilo', () => {
    expect(contentFromPrices(1.29, 2.58, '2,58 € / kg')).toEqual({ value: 500, unit: 'g' })
  })

  it('travaille en volume', () => {
    expect(contentFromPrices(6.6, 1.1, '1,10 € / L')).toEqual({ value: 6000, unit: 'ml' })
  })

  it('tient compte d’une référence de 100 g', () => {
    expect(contentFromPrices(1.5, 0.6, '0,60 € les 100 g')).toEqual({ value: 250, unit: 'g' })
  })

  it.each([
    [null, 2, '2 € / kg'],
    [1, null, '2 € / kg'],
    [0, 2, '2 € / kg'],
    [1, 0, '2 € / kg'],
    [1, 2, 'sans unité'],
    [1, 2, null],
  ])('renonce quand une donnée manque (%j, %j, %j)', (unit, measure, text) => {
    expect(contentFromPrices(unit, measure, text)).toBeNull()
  })
})

describe('compareContents', () => {
  const kilo = { value: 1000, unit: 'g' } as const

  it('dit accord quand les deux valeurs sont proches (5 %)', () => {
    expect(compareContents(kilo, { value: 1030, unit: 'g' })).toBe('accord')
  })

  it('dit écart quand elles diffèrent', () => {
    expect(compareContents(kilo, { value: 500, unit: 'g' })).toBe('écart')
  })

  it('dit écart quand les unités diffèrent', () => {
    expect(compareContents(kilo, { value: 1000, unit: 'ml' })).toBe('écart')
  })

  it('dit une seule méthode ou aucune', () => {
    expect(compareContents(kilo, null)).toBe('une seule méthode')
    expect(compareContents(null, kilo)).toBe('une seule méthode')
    expect(compareContents(null, null)).toBe('aucune')
  })
})

describe('formatContent', () => {
  it('écrit la valeur avec une virgule et son unité', () => {
    expect(formatContent({ value: 1.5, unit: 'g' })).toBe('1,5 g')
    expect(formatContent({ value: 12, unit: 'u' })).toBe('12 pièce(s)')
    expect(formatContent(null)).toBe('—')
  })
})

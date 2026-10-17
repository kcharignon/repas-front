// @vitest-environment node
// Le contenu net d'un produit (DRV-303) : libellé, prix, champs structurés. Libellés INVENTÉS ; `null` plutôt qu'une valeur fausse.
import { describe, expect, it } from 'vitest'

import {
  contentFromLabel,
  contentFromPrices,
  contentFromStructured,
  measureReference,
  parseContent,
  type Content,
} from '../src/leclerc/content'

const g = (value: number): Content => ({ value, unit: 'g' })
const ml = (value: number): Content => ({ value, unit: 'ml' })
const piece = (value: number): Content => ({ value, unit: 'piece' })

/** Les libellés de seconde ligne qu'on sait lire : [libellé, contenu attendu]. */
const READABLE: [string, Content][] = [
  ['1 kg', g(1000)],
  ['500 g', g(500)],
  ['750g', g(750)],
  ['1,5 kg', g(1500)],
  ['250 grammes', g(250)],
  ['2 Kg', g(2000)],
  ['125 gr', g(125)],
  ['1 L', ml(1000)],
  ['1,5 L', ml(1500)],
  ['75 cl', ml(750)],
  ['25 CL', ml(250)],
  ['33cl', ml(330)],
  ['50 ml', ml(50)],
  ['2 litres', ml(2000)],
  ['6 x 1 L', ml(6000)],
  ['6x33cl', ml(1980)],
  ['6 x 1,5 L', ml(9000)],
  ['4 × 125 g', g(500)],
  ['12 x 50 cl', ml(6000)],
  ['2 x 500 g', g(1000)],
  ['Lot de 2 x 500 g', g(1000)],
  ['500 g x 3', g(1500)],
  ['33 cl x 6', ml(1980)],
  ['Farine de blé T55 1 kg', g(1000)],
  ['Lait demi-écrémé 1 L', ml(1000)],
  ['Beurre doux 250 g', g(250)],
  ['Sucre en poudre 750g', g(750)],
  ['Œufs x12', piece(12)],
  ['Oeufs x 6', piece(6)],
  ['lot de 6', piece(6)],
  ['Lot de 4', piece(4)],
  ['10 sachets', piece(10)],
  ['12 pièces', piece(12)],
  ['6 rouleaux', piece(6)],
  ['Boîte de 24', piece(24)],
  ['Pack de 8', piece(8)],
  ['20 capsules', piece(20)],
  ['4 pots', piece(4)],
  ['Tablette de chocolat 100 g', g(100)],
  ['Eau minérale 1,5 L', ml(1500)],
]

/** Les libellés qu'on refuse de lire : rien, ou ambigu (jamais une valeur devinée). */
const UNREADABLE: string[] = [
  '',
  'Farine de blé',
  'Réf. T55',
  'Pâtes tagliatelle t55g',
  '3 yaourts 125 g',
  '4 tranches 160 g',
  'Poulet fermier environ 1,2 kg',
  'Pommes ~1 kg',
  'Fruits en vrac',
  'Selon arrivage',
  'À partir de 500 g',
  '1 kg ou 500 g',
  'Lessive 40 lavages',
  'Œufs x12 calibre M 53 g',
]

describe('contentFromLabel', () => {
  it('a au moins 40 libellés de test, dont des ambigus', () => {
    expect(READABLE.length + UNREADABLE.length).toBeGreaterThanOrEqual(40)
    expect(UNREADABLE.length).toBeGreaterThanOrEqual(10)
  })

  it.each(READABLE)('lit « %s »', (label, expected) => {
    expect(contentFromLabel(label)).toEqual(expected)
  })

  it.each(UNREADABLE)('ne devine rien dans « %s »', (label) => {
    expect(contentFromLabel(label)).toBeNull()
  })

  it.each([[null], [undefined]])('ne lit pas %j', (label) => {
    expect(contentFromLabel(label)).toBeNull()
  })

  it('lit au moins 90 % des libellés lisibles et se trompe sur aucun', () => {
    const wrong = READABLE.filter(([label, expected]) => {
      const content = contentFromLabel(label)
      return content !== null && JSON.stringify(content) !== JSON.stringify(expected)
    })
    const read = READABLE.filter(([label]) => contentFromLabel(label) !== null)

    expect(wrong).toEqual([])
    expect(read.length / READABLE.length).toBeGreaterThanOrEqual(0.9)
  })
})

describe('measureReference', () => {
  it.each([
    ['1,29 € / kg', g(1000)],
    ['2,00 € le kg', g(1000)],
    ['Le kilo : 2,58 €', g(1000)],
    ['0,86 € / L', ml(1000)],
    ['3,10 € le litre', ml(1000)],
    ['0,99 € les 100 g', g(100)],
    ['0,45 € / 100 ml', ml(100)],
    ['0,20 € la pièce', piece(1)],
    ['0,20 € / unité', piece(1)],
    ['2,58 € kg', g(1000)],
  ])('lit « %s »', (text, expected) => {
    expect(measureReference(text)).toEqual(expected)
  })

  it.each([[null], [''], ['2,58 €'], ['prix variable']])('ne trouve rien dans %j', (text) => {
    expect(measureReference(text)).toBeNull()
  })
})

describe('contentFromPrices', () => {
  it.each([
    [1.29, 2.58, '2,58 € / kg', g(500)],
    [6.6, 1.1, '1,10 € / L', ml(6000)],
    [1.5, 0.6, '0,60 € les 100 g', g(250)],
    [1.29, 4.31, '4,31 € / kg', g(300)],
    [2.49, 4.98, '4,98 € / kg', g(500)],
  ])(
    'divise le prix unitaire %j par le prix par mesure %j (« %s »)',
    (unit, measure, text, expected) => {
      expect(contentFromPrices(unit, measure, text)).toEqual(expected)
    },
  )

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

  it('renonce quand l’arrondi des prix au centime rend la division trop incertaine', () => {
    // 0,09 € arrondi au centime peut valoir de 0,085 à 0,095 : plus de 5 % d'erreur.
    expect(contentFromPrices(0.09, 0.9, '0,90 € / kg')).toBeNull()
  })
})

describe('contentFromStructured', () => {
  it('lit le total dans son unité', () => {
    expect(
      contentFromStructured({
        unitMeasure: 'KG',
        unitContent: 1,
        totalContent: 6,
        totalUnit: 'kg',
      }),
    ).toEqual(g(6000))
  })

  it('retient l’unitaire à défaut de total, et prête à chacun l’unité de l’autre', () => {
    expect(
      contentFromStructured({
        unitMeasure: 'L',
        unitContent: 0.5,
        totalContent: null,
        totalUnit: null,
      }),
    ).toEqual(ml(500))
    expect(
      contentFromStructured({ unitMeasure: null, unitContent: 2, totalContent: 4, totalUnit: 'g' }),
    ).toEqual(g(4))
  })

  it('compte des pièces', () => {
    expect(
      contentFromStructured({ unitMeasure: 'U', unitContent: 1, totalContent: 12, totalUnit: 'U' }),
    ).toEqual(piece(12))
  })

  it.each([
    [{ unitMeasure: 'FOO', unitContent: 1, totalContent: 2, totalUnit: 'BAR' }],
    [{ unitMeasure: null, unitContent: 1, totalContent: 2, totalUnit: null }],
    [{ unitMeasure: 'KG', unitContent: 0, totalContent: 0, totalUnit: 'kg' }],
    [undefined],
  ])('ne devine pas une unité inconnue, absente ou une quantité nulle (%j)', (fields) => {
    expect(contentFromStructured(fields)).toBeNull()
  })
})

describe('parseContent', () => {
  const kilo = { price: 1.29, text: '1,29 € / kg' }

  it('préfère les champs structurés du site', () => {
    const structured = { unitMeasure: 'KG', unitContent: 1, totalContent: 1, totalUnit: 'kg' }

    expect(parseContent('500 g', 1.29, kilo, structured)).toEqual({
      content: g(1000),
      source: 'structured',
    })
  })

  it('prend le libellé quand les prix le confirment', () => {
    expect(parseContent('1 kg', 1.29, kilo)).toEqual({ content: g(1000), source: 'label' })
  })

  it('ne donne rien quand le libellé contredit les prix', () => {
    expect(parseContent('500 g', 1.29, kilo)).toBeNull()
  })

  it('prend le libellé seul, ou les prix seuls', () => {
    expect(parseContent('1 kg', null, { price: null, text: null })).toEqual({
      content: g(1000),
      source: 'label',
    })
    expect(parseContent(null, 1.99, { price: 3.98, text: '3,98 € / kg' })).toEqual({
      content: g(500),
      source: 'prices',
    })
  })

  it('ne donne rien sans source', () => {
    expect(parseContent(null, null, { price: null, text: null })).toBeNull()
    expect(parseContent('Farine', 1, { price: null, text: null })).toBeNull()
  })
})

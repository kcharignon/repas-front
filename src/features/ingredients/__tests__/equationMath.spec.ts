import { describe, expect, it } from 'vitest'

import {
  baseUnitOf,
  coefficientOf,
  equationProblem,
  formatNumber,
  inUnit,
  inputNumber,
  parseNumber,
  quantityLabel,
  sameMeasureUnits,
  unitLabel,
  type EquationUnit,
} from '../equationMath'

const gramme: EquationUnit = { slug: 'gramme', name: 'gramme', dimension: 'WEIGHT', baseFactor: 1 }
const kilo: EquationUnit = { slug: 'kilo', name: 'kilo', dimension: 'WEIGHT', baseFactor: 1000 }
const litre: EquationUnit = { slug: 'litre', name: 'litre', dimension: 'VOLUME', baseFactor: 1000 }
const millilitre: EquationUnit = {
  slug: 'millilitre',
  name: 'millilitre',
  dimension: 'VOLUME',
  baseFactor: 1,
}
const paquet: EquationUnit = { slug: 'paquet', name: 'paquet', dimension: 'PACKAGE', baseFactor: 1 }
const boite: EquationUnit = { slug: 'boite', name: 'boîte', dimension: 'PACKAGE', baseFactor: 1 }
const cuillere: EquationUnit = {
  slug: 'cuillere-a-soupe',
  name: 'cuillère à soupe',
  dimension: null,
  baseFactor: null,
}
const all = [gramme, kilo, litre, millilitre, paquet, boite, cuillere]

describe('unitLabel', () => {
  it('laisse le nom au singulier sous 2 (y compris 1,5, 0 et le négatif)', () => {
    expect(unitLabel('tasse', 1)).toBe('tasse')
    expect(unitLabel('tasse', 1.5)).toBe('tasse')
    expect(unitLabel('tasse', 0)).toBe('tasse')
    expect(unitLabel('tasse', 0.125)).toBe('tasse')
    expect(unitLabel('tasse', -1)).toBe('tasse')
  })

  it('met le dernier mot au pluriel à partir de 2', () => {
    expect(unitLabel('tasse', 2)).toBe('tasses')
    expect(unitLabel('Kilo', 8)).toBe('Kilos')
    expect(unitLabel('petit pot', 3)).toBe('petit pots')
  })

  it('ne double pas un s, un x ou un z', () => {
    expect(unitLabel('colis', 3)).toBe('colis')
    expect(unitLabel('noix', 3)).toBe('noix')
    expect(unitLabel('quiz', 3)).toBe('quiz')
  })

  it('gère les terminaisons en eau et en al', () => {
    expect(unitLabel('carreau', 2)).toBe('carreaux')
    expect(unitLabel('bocal', 2)).toBe('bocaux')
  })

  it('accorde le premier mot d’un nom qui contient une préposition', () => {
    expect(unitLabel('cuillère à soupe', 2)).toBe('cuillères à soupe')
    expect(unitLabel('cuillère à café', 4)).toBe('cuillères à café')
    expect(unitLabel('tasse à café', 2)).toBe('tasses à café')
    expect(unitLabel('boîte de conserve', 2)).toBe('boîtes de conserve')
    expect(unitLabel("bouteille d'huile", 2)).toBe("bouteilles d'huile")
    expect(unitLabel('cuillère à soupe', 1)).toBe('cuillère à soupe')
  })

  it('ignore les espaces autour du nom', () => {
    expect(unitLabel('  tasse ', 3)).toBe('tasses')
  })
})

describe('nombres', () => {
  it('écrit à la française : virgule, quatre décimales au plus, pas de zéro inutile ni de séparateur', () => {
    expect(formatNumber(0.125)).toBe('0,125')
    expect(formatNumber(1000)).toBe('1000')
    expect(formatNumber(2.5)).toBe('2,5')
    expect(formatNumber(1 / 3)).toBe('0,3333')
    expect(formatNumber(10)).toBe('10')
  })

  it('lit la virgule comme le point et refuse ce qui n’est pas un nombre', () => {
    expect(parseNumber('0,125')).toBe(0.125)
    expect(parseNumber(' 1 000 ')).toBe(1000)
    expect(parseNumber('12.5')).toBe(12.5)
    expect(parseNumber(8)).toBe(8)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1,2,3')).toBeNull()
    expect(parseNumber(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('remplit un champ avec la valeur exacte, à la française', () => {
    expect(inputNumber(0.125)).toBe('0,125')
    expect(inputNumber(1000)).toBe('1000')
    expect(inputNumber(0.00000012)).toBe('0,00000012')
    expect(parseNumber(inputNumber(0.1 + 0.2))).toBe(0.1 + 0.2)
  })

  it('écrit une quantité avec son nom accordé', () => {
    expect(quantityLabel(1, 'kilo')).toBe('1 kilo')
    expect(quantityLabel(0.125, 'kilo')).toBe('0,125 kilo')
    expect(quantityLabel(8, 'tasse')).toBe('8 tasses')
  })
})

describe('coefficientOf', () => {
  it('est le nombre de droite divisé par celui de gauche', () => {
    expect(coefficientOf(1, 10)).toBe(10)
    expect(coefficientOf('8', '1')).toBe(0.125)
    expect(coefficientOf('2', '3')).toBeCloseTo(1.5, 12)
  })

  it('n’a pas d’erreur d’arrondi d’un flottant', () => {
    expect(coefficientOf('10', '3')).toBe(0.3)
    expect(coefficientOf('1', '0,3')).toBe(0.3)
  })

  it('est nul si un nombre manque, est nul ou négatif', () => {
    expect(coefficientOf('', '1')).toBeNull()
    expect(coefficientOf('1', '')).toBeNull()
    expect(coefficientOf('0', '1')).toBeNull()
    expect(coefficientOf('1', '-2')).toBeNull()
    expect(coefficientOf('x', '2')).toBeNull()
  })
})

describe('equationProblem', () => {
  const base = { start: 'tasse', end: 'kilo', left: '8', right: '1' }

  it('ne trouve rien à redire à une équation correcte', () => {
    expect(equationProblem(base, true)).toBeNull()
  })

  it('signale tout de suite deux unités identiques', () => {
    expect(equationProblem({ ...base, end: 'tasse' })).toBe('sameUnit')
  })

  it('signale tout de suite un nombre écrit mais nul ou négatif ou faux', () => {
    expect(equationProblem({ ...base, left: '0' })).toBe('left')
    expect(equationProblem({ ...base, right: '-2' })).toBe('right')
    expect(equationProblem({ ...base, right: 'abc' })).toBe('right')
  })

  it('ne se plaint d’un nombre vide qu’à l’enregistrement', () => {
    expect(equationProblem({ ...base, right: '' })).toBeNull()
    expect(equationProblem({ ...base, right: '' }, true)).toBe('right')
    expect(equationProblem({ ...base, left: ' ' }, true)).toBe('left')
  })
})

describe('petites unités', () => {
  it('propose le gramme pour le kilo et le millilitre pour le litre', () => {
    expect(baseUnitOf(kilo, all)?.slug).toBe('gramme')
    expect(baseUnitOf(litre, all)?.slug).toBe('millilitre')
  })

  it('n’en propose pas pour un conditionnement, une unité sans dimension ou la petite unité elle-même', () => {
    expect(baseUnitOf(paquet, all)).toBeUndefined()
    expect(baseUnitOf(cuillere, all)).toBeUndefined()
    expect(baseUnitOf(gramme, all)).toBeUndefined()
  })

  it('liste les unités qui se convertissent en l’unité d’achat par leur facteur de base', () => {
    expect(sameMeasureUnits(kilo, all).map((unit) => unit.slug)).toEqual(['gramme', 'kilo'])
    expect(sameMeasureUnits(paquet, all)).toEqual([paquet])
    expect(sameMeasureUnits(cuillere, all)).toEqual([cuillere])
  })

  it('exprime une quantité dans une autre unité de la même mesure', () => {
    expect(inUnit(0.001, kilo, gramme)).toBe(1)
    expect(inUnit(10, gramme, kilo)).toBe(0.01)
    expect(inUnit(5, kilo, kilo)).toBe(5)
    expect(inUnit(5, gramme, cuillere)).toBe(5)
  })
})

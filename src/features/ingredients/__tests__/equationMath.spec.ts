import { describe, expect, it } from 'vitest'

import {
  coefficientOf,
  displayOrientation,
  equationProblem,
  formatDisplayNumber,
  formatNumber,
  inputNumber,
  parseNumber,
  quantityLabel,
  unitLabel,
  unitText,
  withDe,
} from '../equationMath'

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

  it('demande de choisir une unité pas encore choisie, à l’enregistrement seulement', () => {
    expect(equationProblem({ ...base, end: '' })).toBeNull()
    expect(equationProblem({ ...base, end: '' }, true)).toBe('noUnit')
    expect(equationProblem({ ...base, start: '' }, true)).toBe('noUnit')
  })

  it('ne se plaint d’un nombre vide qu’à l’enregistrement', () => {
    expect(equationProblem({ ...base, right: '' })).toBeNull()
    expect(equationProblem({ ...base, right: '' }, true)).toBe('right')
    expect(equationProblem({ ...base, left: ' ' }, true)).toBe('left')
  })
})

describe('displayOrientation', () => {
  const stored = (start: string, end: string, coefficient: number) => ({
    startUnitSlug: start,
    endUnitSlug: end,
    coefficient,
  })

  it('garde « 1 bouteille = 30 centilitres » tel qu’enregistré quand l’unité d’achat est à gauche', () => {
    expect(displayOrientation(stored('bouteille', 'centilitre', 30), 'bouteille')).toEqual({
      startSlug: 'bouteille',
      endSlug: 'centilitre',
      value: 30,
      reversed: false,
    })
  })

  it('retourne « 1 centilitre = 0,0333 bouteille » en « 1 bouteille = 30 centilitres » : l’unité d’achat à gauche', () => {
    expect(displayOrientation(stored('centilitre', 'bouteille', 1 / 30), 'bouteille')).toEqual({
      startSlug: 'bouteille',
      endSlug: 'centilitre',
      value: 30,
      reversed: true,
    })
  })

  it('garde l’unité d’achat à gauche même quand le nombre vaut moins de 1', () => {
    expect(displayOrientation(stored('kilo', 'sac', 0.5), 'kilo')).toMatchObject({
      startSlug: 'kilo',
      value: 0.5,
      reversed: false,
    })
    expect(displayOrientation(stored('sac', 'kilo', 2), 'kilo')).toMatchObject({
      startSlug: 'kilo',
      endSlug: 'sac',
      value: 0.5,
      reversed: true,
    })
  })

  it('sans unité d’achat dans la conversion, retourne ce qui vaut moins de 1', () => {
    expect(displayOrientation(stored('gramme', 'kilo', 0.001), 'bouteille')).toEqual({
      startSlug: 'kilo',
      endSlug: 'gramme',
      value: 1000,
      reversed: true,
    })
    expect(displayOrientation(stored('kilo', 'gramme', 1000), undefined)).toMatchObject({
      startSlug: 'kilo',
      reversed: false,
    })
    expect(displayOrientation(stored('sachet', 'paquet', 1), undefined).reversed).toBe(false)
  })

  it('n’invente rien d’un coefficient inutilisable', () => {
    expect(displayOrientation(stored('a', 'b', 0), 'b').reversed).toBe(false)
    expect(displayOrientation(stored('a', 'b', Number.NaN), 'b').reversed).toBe(false)
  })

  it('rend un nombre sans erreur d’arrondi, qui remplit un champ sans bruit', () => {
    const way = displayOrientation(
      stored('centilitre', 'bouteille', 0.03333333333333333),
      'bouteille',
    )
    expect(way.value).toBe(30)
    expect(inputNumber(way.value)).toBe('30')
  })
})

describe('withDe', () => {
  it('élide « de » devant une voyelle', () => {
    expect(withDe('centilitres')).toBe('de centilitres')
    expect(withDe('unités')).toBe("d'unités")
    expect(withDe('œufs')).toBe("d'œufs")
    expect(withDe('cuillères à soupe')).toBe('de cuillères à soupe')
  })
})

describe('pour dire une conversion à voix haute', () => {
  it('sépare les milliers à l’affichage, avec la virgule des décimales', () => {
    expect(formatDisplayNumber(1000).replace(/\s/g, ' ')).toBe('1 000')
    expect(formatDisplayNumber(0.125)).toBe('0,125')
    expect(formatDisplayNumber(10)).toBe('10')
  })

  it('écrit le symbole quand il dit autre chose que le nom, sinon le nom accordé', () => {
    expect(unitText({ name: 'gramme', symbol: 'g' }, 125)).toBe('g')
    expect(unitText({ name: 'kilo', symbol: 'kg' }, 1)).toBe('kg')
    expect(unitText({ name: 'tasse', symbol: 'tasse' }, 1)).toBe('tasse')
    expect(unitText({ name: 'tasse', symbol: 'Tasse' }, 3)).toBe('tasses')
    expect(unitText({ name: 'cuillère à soupe', symbol: '' }, 2)).toBe('cuillères à soupe')
    expect(unitText({ name: 'paquet' }, 1)).toBe('paquet')
  })
})

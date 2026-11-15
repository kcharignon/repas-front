import { describe, expect, it } from 'vitest'

import {
  MINIMUM_RELEVANCE,
  foldName,
  isSameName,
  jaroWinkler,
  rankByName,
  relevance,
} from '../nameSearch'

const option = (value: string, label: string) => ({ value, label })

describe('foldName', () => {
  it('défait les accents, la casse, les ligatures et la ponctuation comme le back', () => {
    expect(foldName('Bœuf haché')).toBe('boeuf-hache')
    expect(foldName('BOEUF')).toBe('boeuf')
    expect(foldName('Œuf')).toBe('oeuf')
    expect(foldName('Jaune d’œuf')).toBe('jaune-d-oeuf')
    expect(foldName('  Crème   fraîche  ')).toBe('creme-fraiche')
    expect(foldName('Pâtes à la façon de Aïoli')).toBe('pates-a-la-facon-de-aioli')
    expect(foldName('!!')).toBe('')
  })
})

describe('jaroWinkler', () => {
  it('vaut 1 pour deux textes identiques et 0 sans lettre commune', () => {
    expect(jaroWinkler('tomate', 'tomate')).toBe(1)
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
    expect(jaroWinkler('', '')).toBe(1)
    expect(jaroWinkler('a', '')).toBe(0)
  })

  it('donne les mêmes valeurs que le back (cas de référence de Jaro-Winkler)', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.9611, 4)
    expect(jaroWinkler('dixon', 'dicksonx')).toBeCloseTo(0.8133, 4)
    expect(jaroWinkler('dwayne', 'duane')).toBeCloseTo(0.84, 2)
  })
})

describe('relevance', () => {
  it('place le nom exact devant le début d’un nom et la faute de frappe', () => {
    const exact = relevance('tomate', 'tomate')
    const start = relevance('tom', 'tomate')
    const typo = relevance('tomtae', 'tomate')

    expect(exact).toBe(1)
    expect(start).toBeGreaterThanOrEqual(MINIMUM_RELEVANCE)
    expect(typo).toBeGreaterThanOrEqual(MINIMUM_RELEVANCE)
    expect(exact).toBeGreaterThan(Math.max(start, typo))
    expect(relevance('tom', 'tomate')).toBeGreaterThan(relevance('tom', 'tomate-cerise'))
  })

  it('ne compte pas un texte au milieu d’un mot', () => {
    expect(relevance('riz', 'chorizo')).toBeLessThan(MINIMUM_RELEVANCE)
  })

  it('ne dépasse jamais 0,999 sans nom identique', () => {
    expect(relevance('boeuf', 'boeuf-hache')).toBeLessThan(1)
    expect(relevance('', 'tomate')).toBe(0)
    expect(relevance('tomate', '')).toBe(0)
  })
})

describe('isSameName', () => {
  it('reconnaît le même nom malgré la casse, les accents et les ligatures', () => {
    expect(isSameName('Boeuf', 'Bœuf')).toBe(true)
    expect(isSameName('boeuf', 'BŒUF')).toBe(true)
    expect(isSameName('epaule', 'Épaule')).toBe(true)
  })

  it('ne confond pas un nom proche avec le même nom', () => {
    expect(isSameName('Boeuf', 'Bœuf haché')).toBe(false)
    expect(isSameName('boeu', 'Bœuf')).toBe(false)
    expect(isSameName('', 'Bœuf')).toBe(false)
    expect(isSameName('!!', '??')).toBe(false)
  })
})

describe('rankByName', () => {
  const options = [
    option('hache', 'Bœuf haché'),
    option('boeuf', 'Bœuf'),
    option('steak', 'Steak de bœuf'),
    option('tomate', 'Tomate'),
    option('chorizo', 'Chorizo'),
    option('riz', 'Riz'),
  ]

  it('trouve « Bœuf » en tapant « Boeuf », le nom exact d’abord', () => {
    expect(rankByName(options, 'Boeuf').map((o) => o.value)).toEqual(['boeuf', 'hache', 'steak'])
  })

  it('trouve aussi en tapant la ligature, avec ou sans accent', () => {
    expect(rankByName(options, 'bœuf')[0]?.value).toBe('boeuf')
    expect(rankByName(options, 'BOEUF HACHE')[0]?.value).toBe('hache')
  })

  it('rattrape une faute de frappe', () => {
    expect(rankByName(options, 'tomtae').map((o) => o.value)).toEqual(['tomate'])
    expect(rankByName(options, 'boeuff')[0]?.value).toBe('boeuf')
  })

  it('ne trouve pas un texte au milieu d’un mot, ni rien de lointain', () => {
    expect(rankByName(options, 'riz').map((o) => o.value)).toEqual(['riz'])
    expect(rankByName(options, 'cardamome')).toEqual([])
  })

  it('rend tous les choix sans texte, et aucun pour un texte sans lettre', () => {
    expect(rankByName(options, '')).toHaveLength(options.length)
    expect(rankByName(options, '   ')).toHaveLength(options.length)
    expect(rankByName(options, '!!')).toEqual([])
  })

  it('classe les ex æquo dans l’ordre alphabétique, toujours le même', () => {
    const twins = [
      option('b', 'Petits pois'),
      option('a', 'Petits pois'),
      option('c', 'Petit pois'),
    ]

    expect(rankByName(twins, 'petits pois').map((o) => o.value)).toEqual(['a', 'b', 'c'])
    expect(rankByName([...twins].reverse(), 'petits pois').map((o) => o.value)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

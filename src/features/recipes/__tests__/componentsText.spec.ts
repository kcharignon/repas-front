// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  canLessTimes,
  canMoreTimes,
  copiedMessage,
  formatTimes,
  joinNames,
  nextTimes,
  parseTimes,
  previousTimes,
  timesHelp,
  usedInNames,
} from '../componentsText'

// Le nombre de fois d'une recette utilisée (COMP-006) : tapé avec une virgule, réglé de 0,5 en 0,5, borné de 0,01 à 100 comme le back.
describe('le nombre de fois', () => {
  it.each([
    ['1', 1],
    ['0,5', 0.5],
    ['0.5', 0.5],
    [' 2,25 ', 2.25],
    ['0,01', 0.01],
    ['100', 100],
    ['.5', 0.5],
    ['3,', 3],
  ])('lit « %s »', (typed, value) => {
    expect(parseTimes(typed)).toBe(value)
  })

  it.each(['', ' ', '0', '0,009', '100,01', '101', '-1', 'abc', '1e2', '1,2,3', '1 2', 'NaN', '∞'])(
    'refuse « %s »',
    (typed) => {
      expect(parseTimes(typed)).toBeNull()
    },
  )

  it('l’écrit comme on le lit en France', () => {
    expect(formatTimes(0.5)).toBe('0,5')
    expect(formatTimes(1)).toBe('1')
    expect(formatTimes(2.25)).toBe('2,25')
    expect(formatTimes(1000 / 3)).toBe('333,333')
  })

  it('« + » passe au multiple de 0,5 au-dessus, sans dépasser 100', () => {
    expect([1, 1.5, 0.3, 0.5, 99.9, 100].map(nextTimes)).toEqual([1.5, 2, 0.5, 1, 100, 100])
    expect(nextTimes(null)).toBe(0.5)
    expect(canMoreTimes(100)).toBe(false)
    expect(canMoreTimes(99.5)).toBe(true)
    expect(canMoreTimes(null)).toBe(true)
  })

  it('« − » passe au multiple de 0,5 en dessous, jamais moins de 0,5', () => {
    expect([2, 1.5, 1.2, 1, 0.8].map(previousTimes)).toEqual([1.5, 1, 1, 0.5, 0.5])
    expect(canLessTimes(1)).toBe(true)
    expect(canLessTimes(0.5)).toBe(false)
    expect(canLessTimes(0.2)).toBe(false)
    expect(canLessTimes(null)).toBe(false)
  })

  it('se dit en mots, jamais à 1 fois', () => {
    expect(timesHelp(1, 'Pâte')).toBeNull()
    expect(timesHelp(null, 'Pâte')).toBeNull()
    expect(timesHelp(2, 'Crème au citron')).toBe(
      'Tu prends 2 fois les quantités de Crème au citron.',
    )
    expect(timesHelp(0.5, 'Meringue')).toBe('Tu prends la moitié des quantités de Meringue.')
    expect(timesHelp(1.5, 'Pâte')).toBe('Tu prends 1,5 fois les quantités de Pâte.')
  })
})

describe('les listes de noms', () => {
  it('joint avec « et »', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A et B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B et C')
  })

  it('dit où une recette sert : deux noms, puis « et N autre(s) »', () => {
    expect(usedInNames(['Tarte'])).toBe('Tarte')
    expect(usedInNames(['Tarte', 'Quiche'])).toBe('Tarte et Quiche')
    expect(usedInNames(['Tarte', 'Quiche', 'Tourte'])).toBe('Tarte, Quiche et 1 autre')
    expect(usedInNames(['Tarte', 'Quiche', 'Tourte', 'Flan', 'Cake'])).toBe(
      'Tarte, Quiche et 3 autres',
    )
  })

  it('dit ce qui est copié', () => {
    const used = (...names: string[]) => names.map((name) => ({ name }))
    expect(copiedMessage('Tarte', [])).toBe('« Tarte » est dans tes recettes.')
    expect(copiedMessage('Tarte', used('Pâte'))).toBe('Tarte et Pâte sont dans tes recettes.')
    expect(copiedMessage('Tarte', used('Pâte', 'Crème'))).toBe(
      'Tarte, Pâte et Crème sont dans tes recettes.',
    )
    expect(copiedMessage('Tarte', used('A', 'B', 'C'))).toBe(
      'Tarte et 3 autres recettes sont dans tes recettes.',
    )
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { lowerFirst } from '@/design/lowerFirst'
import {
  amountOf,
  amountSuffix,
  countsFor,
  countsIn,
  isCountUnit,
  oneOf,
  parseRatio,
  ratioLine,
} from '../partsText'

describe('lowerFirst', () => {
  it('met la première lettre en minuscule, ligature comprise', () => {
    expect(lowerFirst("Jaune d'œuf")).toBe("jaune d'œuf")
    expect(lowerFirst('Œuf')).toBe('œuf')
  })

  it('laisse un sigle et le reste du nom tels quels', () => {
    expect(lowerFirst('BBQ sauce')).toBe('BBQ sauce')
    expect(lowerFirst('Farine T55')).toBe('farine T55')
    expect(lowerFirst('')).toBe('')
  })
})

describe('l’unité « tout court »', () => {
  it('est l’unité, avec ou sans accent, ou aucune unité', () => {
    expect(isCountUnit('unité')).toBe(true)
    expect(isCountUnit('Unite')).toBe(true)
    expect(isCountUnit('')).toBe(true)
    expect(isCountUnit(undefined)).toBe(true)
    expect(isCountUnit('gousse')).toBe(false)
  })
})

describe('les phrases d’une partie', () => {
  it('« 1 œuf » pour l’unité, « 1 gousse de vanille » pour une autre', () => {
    expect(oneOf('Œuf', 'unité')).toBe('1 œuf')
    expect(oneOf('Vanille', 'gousse')).toBe('1 gousse de vanille')
    expect(oneOf('Orange', 'tranche')).toBe("1 tranche d'orange")
  })

  it('accorde la partie avec le nombre', () => {
    expect(amountOf("Jaune d'œuf", 'unité', 1)).toBe("1 jaune d'œuf")
    expect(amountOf("Jaune d'œuf", 'unité', 2)).toBe("2 jaunes d'œuf")
    expect(amountOf('Demi-gousse', 'unité', 4)).toBe('4 demi-gousses')
    expect(amountOf('Farine complète', 'kilo', 1.5)).toBe('1,5 kilo de farine complète')
    expect(amountOf('Farine complète', 'kilo', 3)).toBe('3 kilos de farine complète')
  })

  it('dit la ligne d’une carte : « 1 œuf = 1 jaune d’œuf »', () => {
    expect(
      ratioLine(
        { name: 'Œuf', unitName: 'unité' },
        { name: "Jaune d'œuf", unitName: 'unité', ratio: 1 },
      ),
    ).toBe("1 œuf = 1 jaune d'œuf")
    expect(
      ratioLine(
        { name: 'Vanille', unitName: 'gousse' },
        { name: 'Demi-gousse', unitName: 'unité', ratio: 2 },
      ),
    ).toBe('1 gousse de vanille = 2 demi-gousses')
  })

  it('accorde ce qui suit le champ avec le nombre tapé (1 tant qu’il est illisible)', () => {
    expect(amountSuffix("Jaune d'œuf", 'unité', 1)).toBe("jaune d'œuf")
    expect(amountSuffix("Jaune d'œuf", 'unité', 2)).toBe("jaunes d'œuf")
    expect(amountSuffix("Jaune d'œuf", 'unité', null)).toBe("jaune d'œuf")
    expect(amountSuffix('Farine', 'kilo', 2)).toBe('kilos de farine')
  })
})

describe('où compte une partie', () => {
  it('met au pluriel un nom sûr : un mot, ou un nom suivi de son complément', () => {
    expect(countsIn('Œuf')).toBe('tes œufs')
    expect(countsIn('Pomme de terre')).toBe('tes pommes de terre')
    expect(countsFor('Œuf')).toBe('des œufs')
    expect(countsFor("Blanc d'œuf")).toBe("des blancs d'œuf")
  })

  it('cite le nom entre guillemets quand le pluriel n’est pas sûr', () => {
    expect(countsIn('Crème fraîche')).toBe('« Crème fraîche »')
    expect(countsFor('Crème fraîche')).toBe('« Crème fraîche »')
  })
})

describe('le nombre d’une partie', () => {
  it('se tape à la française et reste dans les bornes du back', () => {
    expect(parseRatio('1')).toBe(1)
    expect(parseRatio('0,5')).toBe(0.5)
    expect(parseRatio('2.5')).toBe(2.5)
    expect(parseRatio('0,000001')).toBe(0.000001)
    expect(parseRatio('1000000')).toBe(1_000_000)
  })

  it('refuse le vide, un mot, zéro, un négatif et plus que le plafond', () => {
    for (const bad of ['', ' ', 'deux', '0', '-1', '0,0000001', '1000001', 'Infinity'])
      expect([bad, parseRatio(bad)]).toEqual([bad, null])
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { formatEuros, groupLines, toBuy } from '../estimate'
import { estimate, estimateLines } from './estimateFixtures'

// Les espaces de la mise en forme française sont insécables : on les compare en espaces ordinaires
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('estimation du coût : mise en forme et rangement', () => {
  it('écrit les montants en euros au format français', () => {
    expect(plain(formatEuros(1247))).toBe('12,47 €')
    expect(plain(formatEuros(5))).toBe('0,05 €')
    expect(plain(formatEuros(0))).toBe('0,00 €')
    expect(plain(formatEuros(123456))).toBe('1 234,56 €')
  })

  it('compte les lignes à acheter, sans les « déjà à la maison »', () => {
    expect(toBuy(estimate())).toBe(12)
    expect(toBuy(estimate({ estimatedLines: 0, unestimatedLines: 0 }))).toBe(0)
  })

  it('range les lignes par ce qu’elles font au total, dans l’ordre reçu', () => {
    const groups = groupLines(estimateLines)

    expect(groups.estimated.map((line) => line.ingredientSlug)).toEqual([
      'beurre',
      'farine',
      'huile',
      'lait',
      'pates',
      'riz',
      'sucre',
      'vinaigre',
    ])
    expect(groups.unestimated.map((line) => line.status)).toEqual([
      'NO_PRODUCT',
      'NO_PRICE',
      'NO_PRODUCT',
      'TO_CHECK',
    ])
    expect(groups.haveAtHome.map((line) => line.ingredientSlug)).toEqual(['sel'])
  })
})

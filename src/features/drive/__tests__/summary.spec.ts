import { describe, expect, it } from 'vitest'

import { countOutcomes, formatPrice, remaining, visibleCounts } from '../summary'
import { result } from './results'

describe('récapitulatif', () => {
  it('compte une issue par ligne', () => {
    expect(countOutcomes(result())).toEqual({
      added: 8,
      chosen: 3,
      haveAtHome: 1,
      skipped: 0,
      unavailable: 0,
      failed: 0,
    })
  })

  it('compte chaque issue', () => {
    const counts = countOutcomes(
      result({
        outcome: 'partial',
        lines: [
          { ingredientSlug: 'a', outcome: 'ADDED', productId: '1', quantity: 1, usedRank: 1 },
          { ingredientSlug: 'b', outcome: 'ADDED', productId: '2', quantity: 1, usedRank: 1 },
          {
            ingredientSlug: 'c',
            outcome: 'CHOSEN',
            quantity: 1,
            placement: 'ONCE',
            product: { id: '3', label: 'C' },
          },
          { ingredientSlug: 'd', outcome: 'SKIPPED' },
          { ingredientSlug: 'e', outcome: 'UNAVAILABLE' },
          { ingredientSlug: 'f', outcome: 'FAILED', error: 'BLOCKED' },
        ],
      }),
    )

    expect(counts).toEqual({
      added: 2,
      chosen: 1,
      haveAtHome: 0,
      skipped: 1,
      unavailable: 1,
      failed: 1,
    })
  })

  it('ne montre que les compteurs qui existent, jamais « Échecs » ni « Prix lus », jamais un zéro', () => {
    const counts = countOutcomes(
      result({
        lines: [
          { ingredientSlug: 'a', outcome: 'ADDED', productId: '1', quantity: 1, usedRank: 1 },
          { ingredientSlug: 'b', outcome: 'SKIPPED' },
          { ingredientSlug: 'f', outcome: 'FAILED', error: 'BLOCKED' },
        ],
      }),
    )

    expect(visibleCounts(counts)).toEqual([
      { key: 'added', value: 1 },
      { key: 'skipped', value: 1 },
    ])
    expect(visibleCounts(countOutcomes(result({ lines: [] })))).toEqual([])
  })

  it('compte ce qui reste à ajouter : les échecs et les articles sans produit disponible', () => {
    expect(remaining(countOutcomes(result()))).toBe(0)
    expect(
      remaining(
        countOutcomes(
          result({
            lines: [
              { ingredientSlug: 'e', outcome: 'UNAVAILABLE' },
              { ingredientSlug: 'f', outcome: 'FAILED', error: 'NETWORK' },
              { ingredientSlug: 'g', outcome: 'FAILED', error: 'BLOCKED' },
            ],
          }),
        ),
      ),
    ).toBe(3)
  })

  it('écrit un prix en euros', () => {
    expect(formatPrice(189).replace(/\s/g, ' ')).toBe('1,89 €')
  })
})

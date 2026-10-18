import { describe, expect, it } from 'vitest'

import { countOutcomes, failedLines, formatPrice } from '../summary'
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
      priced: 0,
    })
  })

  it('compte les prix lus (lignes ajoutées et produits choisis) et chaque issue', () => {
    const counts = countOutcomes(
      result({
        outcome: 'partial',
        lines: [
          {
            ingredientSlug: 'a',
            outcome: 'ADDED',
            productId: '1',
            quantity: 1,
            usedRank: 1,
            price: { cents: 100 },
          },
          { ingredientSlug: 'b', outcome: 'ADDED', productId: '2', quantity: 1, usedRank: 1 },
          {
            ingredientSlug: 'c',
            outcome: 'CHOSEN',
            quantity: 1,
            placement: 'ONCE',
            product: { id: '3', label: 'C', price: { cents: 200 } },
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
      priced: 2,
    })
  })

  it('liste les lignes en échec avec leur code', () => {
    expect(
      failedLines(
        result({
          lines: [
            { ingredientSlug: 'a', outcome: 'FAILED', error: 'BLOCKED' },
            { ingredientSlug: 'b', outcome: 'SKIPPED' },
            { ingredientSlug: 'c', outcome: 'FAILED', error: 'NETWORK' },
          ],
        }),
      ),
    ).toEqual([
      { slug: 'a', error: 'BLOCKED' },
      { slug: 'c', error: 'NETWORK' },
    ])
  })

  it('écrit un prix en euros', () => {
    expect(formatPrice(189).replace(/\s/g, ' ')).toBe('1,89 €')
  })
})

import type { ResultLine, ResultMessage } from '@drive-protocol'

export const RUN = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

const added = (slug: string, productId: string, extra: Partial<ResultLine> = {}): ResultLine =>
  ({
    ingredientSlug: slug,
    outcome: 'ADDED',
    productId,
    quantity: 1,
    usedRank: 1,
    ...extra,
  }) as ResultLine

/**
 * Un passage réussi, données inventées : 8 lignes ajoutées (Farine avec son produit de secours, n° 2), 3 choisies sur le site
 * (2 mémorisées, 1 pour cette fois, la dernière avec un produit refusé), 1 « j'en ai toujours ».
 */
export function result(overrides: Partial<ResultMessage> = {}): ResultMessage {
  return {
    v: 1,
    type: 'result',
    runId: RUN,
    agentVersion: '1.0.0',
    outcome: 'completed',
    store: { id: '123456' },
    lines: [
      added('farine', '222333', { usedRank: 2, quantity: 2, unavailableIds: ['123456'] }),
      added('beurre', '300001'),
      added('lait', '300002'),
      added('oeufs', '300003'),
      added('riz', '300004'),
      added('sucre', '300005'),
      added('pates', '300006'),
      added('huile', '300007'),
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: {
          id: '555111',
          ean: null,
          label: 'Poivre noir moulu 50 g',
          content: { value: 50, unit: 'g' },
        },
      },
      {
        ingredientSlug: 'curry',
        outcome: 'CHOSEN',
        quantity: 2,
        placement: 'FALLBACK',
        product: { id: '555222', ean: '12345678', label: 'Curry doux 40 g' },
      },
      {
        ingredientSlug: 'moutarde',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'ONCE',
        product: { id: '555333', label: 'Moutarde fine 200 g' },
        rejected: [{ id: '999111', label: 'Moutarde forte 200 g' }],
      },
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
    ],
    ...overrides,
  }
}

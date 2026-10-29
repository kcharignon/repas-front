// @vitest-environment node
// Les pièces de l'orchestrateur (DRV-305) : phase A d'une ligne, prix remonté, issue globale, résultat.
import { describe, expect, it } from 'vitest'

import { ERROR_CODES, LIMITS, type ResultLine } from '../protocol'
import {
  buildResult,
  cartsOf,
  changesOf,
  endingOf,
  endProps,
  priceOf,
  resultLines,
  settleKnownLine,
} from '../src/flow'
import { emptyState } from '../src/flow/run-state'
import { candidate, fakeAdapter, known, plan, product } from './flow-helpers'

describe('settleKnownLine', () => {
  const noQuestion = () => Promise.reject(new Error('aucune question attendue'))

  it('saute un produit refusé sans le chercher ni le compter comme indisponible, même s’il figure dans la liste', async () => {
    // Given : une ligne que la validation du plan n'aurait pas laissée passer (défense en profondeur)
    const line = known(
      'farine',
      [product('999000'), product('1000002')],
      [{ id: '999000', label: 'Farine refusée' }],
    )
    const { adapter, calls } = fakeAdapter({ '999000': {}, '1000002': {} })

    // When
    const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

    // Then : le rang est celui de la liste, rien n'est cherché ni écrit pour le refusé
    expect(calls).toEqual(['search 1000002', 'cart 1000002 1'])
    expect(verdict).toEqual({
      kind: 'done',
      line: {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000002',
        quantity: 1,
        usedRank: 2,
      },
    })
  })

  it('n’ajoute jamais un produit qui n’est pas dans la liste : sans produit utilisable, la ligne attend', async () => {
    const line = known('farine', [product('1000001')])
    const { adapter, calls } = fakeAdapter({
      '1000001': { stock: 0, obtained: () => 0 },
      '1000002': {},
    })

    const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

    expect(verdict).toEqual({
      kind: 'waiting',
      unavailable: ['1000001'],
      notes: [{ id: '1000001', reason: 'OUT_OF_STOCK', tried: 1 }],
    })
    expect(calls).toEqual(['search 1000001', 'cart 1000001 1'])
  })

  it('une ligne sans produit attend, sans requête', async () => {
    const { adapter, calls } = fakeAdapter()

    const verdict = await settleKnownLine(
      { ingredientSlug: 'farine', name: 'Farine', status: 'KNOWN' },
      { adapter, askQuantity: noQuestion },
    )

    expect(verdict).toEqual({ kind: 'waiting', unavailable: [], notes: [] })
    expect(calls).toEqual([])
  })

  it('remonte le prix lu avec l’issue ADDED, pas avant', async () => {
    const { adapter } = fakeAdapter({ '1000001': { price: 129 }, '1000002': {} })

    const priced = await settleKnownLine(known('a', [product('1000001')]), {
      adapter,
      askQuantity: noQuestion,
    })
    const unpriced = await settleKnownLine(known('b', [product('1000002')]), {
      adapter,
      askQuantity: noQuestion,
    })

    expect(priced).toMatchObject({ line: { price: { cents: 129 } } })
    expect(unpriced).toMatchObject({ line: { outcome: 'ADDED' } })
    expect((unpriced as { line: ResultLine }).line).not.toHaveProperty('price')
  })

  describe('le contenu lu en direct (DRV-613)', () => {
    const needed = { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
    const line = { ...known('farine', [product('1000001', 4)]), needed }

    it('met le nombre calculé sur le contenu lu et rend l’écart avec celui du plan, sans rien demander', async () => {
      // Given : 800 g demandés, le plan compte 4 produits (200 g) ; le site en vend de 500 g
      const { adapter, writes } = fakeAdapter({ '1000001': { content: { value: 500, unit: 'g' } } })

      // When
      const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

      // Then
      expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
      expect(verdict).toMatchObject({
        kind: 'done',
        line: { outcome: 'ADDED', quantity: 2 },
        change: { planned: 4, live: 2 },
      })
    })

    it('ne rend aucun écart quand le calcul en direct donne le nombre du plan', async () => {
      const { adapter } = fakeAdapter({ '1000001': { content: { value: 200, unit: 'g' } } })

      const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

      expect(verdict).toMatchObject({ kind: 'done', line: { quantity: 4 } })
      expect(verdict).not.toHaveProperty('change')
    })

    it('utilise la même formule que la phase B, arrondi supérieur compris', async () => {
      // Given : 800 g demandés, 300 g par produit : 3 (2,67 arrondi au-dessus)
      const { adapter, writes } = fakeAdapter({ '1000001': { content: { value: 300, unit: 'g' } } })

      const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

      expect(writes).toEqual([{ id: '1000001', quantity: 3 }])
      expect(verdict).toMatchObject({ change: { planned: 4, live: 3 } })
    })

    it('un contenu en direct qui pousserait au-delà de 99 est plafonné comme en phase B', async () => {
      const { adapter, writes } = fakeAdapter({
        '1000001': { content: { value: 1, unit: 'g' }, stock: 500 },
      })

      await settleKnownLine(line, { adapter, askQuantity: noQuestion })

      expect(writes).toEqual([{ id: '1000001', quantity: LIMITS.packsMax }])
    })

    it('un produit que le panier refuse : une seule tentative, aucun écart signalé', async () => {
      const { adapter, writes } = fakeAdapter({
        '1000001': { stock: 0, obtained: () => 0, content: { value: 500, unit: 'g' } },
      })

      const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

      expect(writes).toHaveLength(1)
      expect(verdict).toMatchObject({ kind: 'waiting', unavailable: ['1000001'] })
      expect(verdict).not.toHaveProperty('change')
    })
  })

  it('plafonne la quantité rendue à 99', async () => {
    const { adapter } = fakeAdapter({ '1000001': { obtained: () => 150 } })

    const verdict = await settleKnownLine(known('a', [product('1000001', 99)]), {
      adapter,
      askQuantity: noQuestion,
    })

    expect(verdict).toMatchObject({ line: { quantity: 99 } })
  })
})

describe('priceOf', () => {
  it.each([
    ['sans prix', candidate('1', { price: null }), undefined],
    ['un prix', candidate('1', { price: 129 }), { cents: 129 }],
    [
      'un prix et son prix à la mesure',
      candidate('1', { price: 129, perMeasure: { cents: 258, unit: 'kg' } }),
      { cents: 129, perMeasure: { cents: 258, unit: 'kg' } },
    ],
    ['un prix nul', candidate('1', { price: 0 }), { cents: 0 }],
    ['un prix négatif', candidate('1', { price: -5 }), undefined],
    ['un prix non entier', candidate('1', { price: 1.5 }), undefined],
    ['un prix démesuré', candidate('1', { price: LIMITS.cents + 1 }), undefined],
    [
      'un prix à la mesure démesuré (le prix seul reste)',
      candidate('1', { price: 129, perMeasure: { cents: LIMITS.cents + 1, unit: 'l' } }),
      { cents: 129 },
    ],
  ])('%s', (_name, input, expected) => {
    expect(priceOf(input)).toEqual(expected)
  })
})

describe('endingOf', () => {
  const added: ResultLine = {
    ingredientSlug: 'a',
    outcome: 'ADDED',
    productId: '1',
    quantity: 1,
    usedRank: 1,
  }

  it.each([
    ['rien à signaler', [added], false, null, { outcome: 'completed' }],
    ['aucune ligne', [], false, null, { outcome: 'completed' }],
    [
      'une ligne en échec',
      [{ ingredientSlug: 'a', outcome: 'FAILED', error: 'NETWORK' }],
      false,
      null,
      { outcome: 'partial' },
    ],
    [
      'une ligne indisponible',
      [{ ingredientSlug: 'a', outcome: 'UNAVAILABLE' }],
      false,
      null,
      { outcome: 'partial' },
    ],
    ['l’arrêt de l’utilisateur', [added], true, null, { outcome: 'aborted' }],
    ['des requêtes bloquées', [added], false, 'BLOCKED', { outcome: 'partial', code: 'BLOCKED' }],
    [
      'une connexion perdue',
      [added],
      false,
      'NOT_LOGGED_IN',
      { outcome: 'error', code: 'NOT_LOGGED_IN' },
    ],
    [
      'une erreur malgré l’arrêt',
      [added],
      true,
      'CONTRACT_CHANGED',
      { outcome: 'error', code: 'CONTRACT_CHANGED' },
    ],
  ] as const)('%s', (_name, lines, stopped, code, expected) => {
    expect(endingOf(lines, stopped, code)).toEqual(expected)
  })
})

describe('changesOf', () => {
  const lines = [known('farine', [product('1')]), known('sucre', [product('2')])]

  it('rend les lignes recalculées dans l’ordre du plan, avec le nom de l’ingrédient', () => {
    const state = emptyState('x', 1)
    state.changes.push(
      { ingredientSlug: 'sucre', planned: 1, live: 2 },
      { ingredientSlug: 'farine', planned: 3, live: 1 },
    )

    expect(changesOf(plan(lines), state)).toEqual([
      { name: 'Farine', planned: 3, live: 1 },
      { name: 'Sucre', planned: 1, live: 2 },
    ])
  })

  it('garde une seule mention par ligne et ignore un ingrédient qui n’est pas dans le plan', () => {
    const state = emptyState('x', 1)
    state.changes.push(
      { ingredientSlug: 'farine', planned: 3, live: 1 },
      { ingredientSlug: 'farine', planned: 5, live: 9 },
      { ingredientSlug: 'inconnu', planned: 1, live: 2 },
    )

    expect(changesOf(plan(lines), state)).toEqual([{ name: 'Farine', planned: 3, live: 1 }])
  })

  it('ne rend rien sans mention', () => {
    expect(changesOf(plan(lines), emptyState('x', 1))).toEqual([])
  })
})

describe('cartsOf (ticket M)', () => {
  const lines = [known('farine', [product('1')]), known('sucre', [product('2')])]

  it('sépare les quantités conservées et les quantités illisibles, dans l’ordre du plan, avec le nom de l’ingrédient', () => {
    const state = emptyState('x', 1)
    state.carts.push(
      { ingredientSlug: 'sucre', kind: 'UNREADABLE', wanted: 1, inCart: 4 },
      { ingredientSlug: 'farine', kind: 'KEPT', wanted: 2, inCart: 5 },
    )

    expect(cartsOf(plan(lines), state)).toEqual({
      kept: [{ name: 'Farine', wanted: 2, inCart: 5 }],
      unreadable: [{ name: 'Sucre', atLeast: 4 }],
    })
  })

  it('une quantité illisible sans plancher a « atLeast » nul', () => {
    const state = emptyState('x', 1)
    state.carts.push({ ingredientSlug: 'farine', kind: 'UNREADABLE', wanted: 2, inCart: null })

    expect(cartsOf(plan(lines), state).unreadable).toEqual([{ name: 'Farine', atLeast: null }])
  })

  it('garde une seule mention par ligne et ignore un ingrédient qui n’est pas dans le plan', () => {
    const state = emptyState('x', 1)
    state.carts.push(
      { ingredientSlug: 'farine', kind: 'KEPT', wanted: 2, inCart: 5 },
      { ingredientSlug: 'farine', kind: 'KEPT', wanted: 1, inCart: 9 },
      { ingredientSlug: 'inconnu', kind: 'KEPT', wanted: 1, inCart: 2 },
    )

    expect(cartsOf(plan(lines), state)).toEqual({
      kept: [{ name: 'Farine', wanted: 2, inCart: 5 }],
      unreadable: [],
    })
  })

  it('ne rend rien sans mention', () => {
    expect(cartsOf(plan(lines), emptyState('x', 1))).toEqual({ kept: [], unreadable: [] })
  })
})

describe('le résultat', () => {
  it.each(ERROR_CODES)('porte un message d’erreur fixe et court pour « %s »', (code) => {
    const result = buildResult(plan([]), [], { outcome: 'error', code }, '1.2.3')

    expect(result.error?.code).toBe(code)
    expect(result.error?.message.length).toBeGreaterThan(0)
    expect(result.error?.message.length).toBeLessThanOrEqual(LIMITS.errorMessage)
    expect(result.agentVersion).toBe('1.2.3')
  })

  it('range les lignes dans l’ordre du plan, ignore celles qui n’ont pas été traitées et signale celles qui attendent', () => {
    const lines = [
      known('a', [product('1')]),
      known('b', [product('2')]),
      known('c', [product('3')]),
      known('d', [product('4')]),
    ]
    const state = emptyState('x', 1)
    state.done.c = { ingredientSlug: 'c', outcome: 'SKIPPED' }
    state.done.a = { ingredientSlug: 'a', outcome: 'HAVE_AT_HOME' }
    state.waiting.d = ['4']

    expect(resultLines(plan(lines), state)).toEqual([
      { ingredientSlug: 'a', outcome: 'HAVE_AT_HOME' },
      { ingredientSlug: 'c', outcome: 'SKIPPED' },
      { ingredientSlug: 'd', outcome: 'UNAVAILABLE', unavailableIds: ['4'] },
    ])
  })

  it('compte les issues pour l’écran de fin', () => {
    const lines: ResultLine[] = [
      { ingredientSlug: 'a', outcome: 'ADDED', productId: '1', quantity: 1, usedRank: 1 },
      { ingredientSlug: 'b', outcome: 'SKIPPED' },
      { ingredientSlug: 'c', outcome: 'SKIPPED' },
      { ingredientSlug: 'd', outcome: 'FAILED', error: 'NETWORK' },
    ]

    expect(endProps(lines, { outcome: 'partial' })).toEqual({
      outcome: 'partial',
      added: 1,
      chosen: 0,
      haveAtHome: 0,
      skipped: 2,
      unavailable: 0,
      failed: 1,
    })
  })

  it('ajoute les lignes recalculées à l’écran de fin, et seulement s’il y en a', () => {
    const changes = [{ name: 'Farine', planned: 3, live: 1 }]

    expect(endProps([], { outcome: 'completed' }, changes)).toMatchObject({ changes })
    expect(endProps([], { outcome: 'completed' }, [])).not.toHaveProperty('changes')
    expect(endProps([], { outcome: 'completed' })).not.toHaveProperty('changes')
  })

  it('ajoute « slow » à l’écran de fin quand Leclerc a mis trop de temps à répondre, et seulement alors', () => {
    expect(endProps([], { outcome: 'partial' }, [], undefined, true)).toMatchObject({ slow: true })
    expect(endProps([], { outcome: 'partial' }, [], undefined, false)).not.toHaveProperty('slow')
    expect(endProps([], { outcome: 'partial' })).not.toHaveProperty('slow')
  })

  it('ajoute les quantités conservées et illisibles à l’écran de fin, et seulement s’il y en a', () => {
    const carts = {
      kept: [{ name: 'Farine', wanted: 2, inCart: 5 }],
      unreadable: [{ name: 'Sucre', atLeast: null }],
    }

    expect(endProps([], { outcome: 'completed' }, [], carts)).toMatchObject(carts)
    const none = endProps([], { outcome: 'completed' }, [], { kept: [], unreadable: [] })
    expect(none).not.toHaveProperty('kept')
    expect(none).not.toHaveProperty('unreadable')
    expect(endProps([], { outcome: 'completed' })).not.toHaveProperty('kept')
  })
})

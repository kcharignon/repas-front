// Les pièces de l'orchestrateur (DRV-305) : phase A d'une ligne, prix remonté, issue globale, résultat.
import { describe, expect, it } from 'vitest'

import { ERROR_CODES, LIMITS, type ResultLine } from '../protocol'
import { buildResult, endingOf, endProps, priceOf, resultLines, settleKnownLine } from '../src/flow'
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
    const { adapter, calls } = fakeAdapter({ '1000001': { stock: 0 }, '1000002': {} })

    const verdict = await settleKnownLine(line, { adapter, askQuantity: noQuestion })

    expect(verdict).toEqual({ kind: 'waiting', unavailable: ['1000001'] })
    expect(calls).toEqual(['search 1000001'])
  })

  it('une ligne sans produit attend, sans requête', async () => {
    const { adapter, calls } = fakeAdapter()

    const verdict = await settleKnownLine(
      { ingredientSlug: 'farine', name: 'Farine', status: 'KNOWN' },
      { adapter, askQuantity: noQuestion },
    )

    expect(verdict).toEqual({ kind: 'waiting', unavailable: [] })
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
})

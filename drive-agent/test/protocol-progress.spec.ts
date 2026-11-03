// @vitest-environment node
// Le message `progress` de l'agent vers l'application (DRV-769) : les lignes d'un résultat, jamais vers Repas.
import { describe, expect, it } from 'vitest'

import { LIMITS, ProtocolError, validateProgress } from '../protocol'

const RUN = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
const base = (lines: unknown[] = []) => ({ v: 1, type: 'progress', runId: RUN, lines })
const added = (slug: string) => ({
  ingredientSlug: slug,
  outcome: 'ADDED',
  productId: '1000001',
  quantity: 1,
  usedRank: 1,
})

describe('validateProgress', () => {
  it.each([
    ['aucune ligne faite', base()],
    [
      'une ligne ajoutée et une « j’en ai toujours »',
      base([added('farine'), { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' }]),
    ],
    [
      'un produit choisi',
      base([
        {
          ingredientSlug: 'poivre',
          outcome: 'CHOSEN',
          quantity: 1,
          placement: 'PRIMARY',
          product: { id: '555111', label: 'Poivre de test' },
        },
      ]),
    ],
    ['la borne de lignes', base(Array.from({ length: LIMITS.lines }, (_v, i) => added(`a${i}`)))],
  ])('accepte %s', (_name, message) => {
    expect(() => validateProgress(message)).not.toThrow()
  })

  it.each([
    ['une version inconnue', { ...base(), v: 2 }],
    ['un autre type', { ...base(), type: 'result' }],
    ['sans identifiant de passage', { v: 1, type: 'progress', lines: [] }],
    ['un identifiant qui n’est pas un UUID', { ...base(), runId: 'abc' }],
    ['sans lignes', { v: 1, type: 'progress', runId: RUN }],
    ['trop de lignes', base(Array.from({ length: LIMITS.lines + 1 }, (_v, i) => added(`a${i}`)))],
    ['une issue de ligne inconnue', base([{ ingredientSlug: 'farine', outcome: 'EN_ROUTE' }])],
    [
      'une ligne ajoutée sans produit',
      base([{ ingredientSlug: 'farine', outcome: 'ADDED', quantity: 1, usedRank: 1 }]),
    ],
    ['une clé en trop', { ...base(), outcome: 'partial' }],
  ])('refuse %s', (_name, message) => {
    expect(() => validateProgress(message)).toThrow(ProtocolError)
  })
})

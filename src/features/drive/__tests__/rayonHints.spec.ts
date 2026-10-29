// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { rayonHintsOf } from '../buildPlanMessage'
import { catalogIdOf } from '../choices'

describe('rayonHintsOf', () => {
  it('garde les rayons valides dans l’ordre reçu', () => {
    expect(rayonHintsOf({ rayonHints: [41, 12, 60] })).toEqual([41, 12, 60])
  })

  it.each([[undefined], [null], [[]]])('rien d’appris (%j) : liste vide', (rayonHints) => {
    expect(rayonHintsOf({ rayonHints })).toEqual([])
  })

  it('écarte les valeurs invalides et les doublons, et s’arrête à trois', () => {
    expect(
      rayonHintsOf({ rayonHints: [0, 41, 41, -2, 1.5, Number.NaN, 12, 60, 7] as number[] }),
    ).toEqual([41, 12, 60])
  })
})

describe('catalogIdOf', () => {
  it.each([[1], [41], [2_147_483_647]])('garde %s', (value) => {
    expect(catalogIdOf(value)).toBe(value)
  })

  it.each([[0], [-1], [1.5], [2_147_483_648], [Number.NaN], ['41'], [null], [undefined], [{}]])(
    'écarte %j',
    (value) => {
      expect(catalogIdOf(value)).toBeNull()
    },
  )
})

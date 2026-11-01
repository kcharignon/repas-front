// Ce que la liste demande pour un article (DRV-757, suite) : « Il te faut : 2 unités. », jamais « 2 unité ». Le nom d'une unité-mot se met au pluriel dès deux ; un symbole (g, kg,
// ml, cl, l) ne s'accorde jamais.
import { describe, expect, it } from 'vitest'

import { formatNeeded } from '../src/ui/strings'
import { S } from '../src/ui/strings'

describe('la quantité demandée par la liste', () => {
  it.each([
    [2, 'unité', 'unité', '2 unités'],
    [1, 'unité', 'unité', '1 unité'],
    [1.5, 'tranche', 'tranche', '1,5 tranche'],
    [15, 'tranche', 'tranche', '15 tranches'],
    [2, 'cuillère à soupe', 'cuillère à soupe', '2 cuillères à soupe'],
    [3, 'œuf', undefined, '3 œufs'],
    [2, 'pot', undefined, '2 pots'],
    [800, 'g', 'gramme', '800 g'],
    [2, 'kg', 'kilo', '2 kg'],
    [250, 'ml', undefined, '250 ml'],
    [2, 'cl', 'centilitre', '2 cl'],
    [2, 'l', undefined, '2 l'],
  ])('%s « %s » (nom : %s) se dit « %s »', (quantity, unitSymbol, unitName, expected) => {
    expect(formatNeeded({ quantity, unitSymbol, ...(unitName && { unitName }) })).toBe(expected)
  })

  it('la phrase de l’écran de choix : « Il te faut : 2 unités. »', () => {
    expect(
      S.picker.need(formatNeeded({ quantity: 2, unitSymbol: 'unité', unitName: 'unité' }) ?? ''),
    ).toBe('Il te faut : 2 unités.')
  })

  it('une ligne sans quantité n’écrit rien', () => {
    expect(formatNeeded(null)).toBeNull()
    expect(formatNeeded(undefined)).toBeNull()
  })
})

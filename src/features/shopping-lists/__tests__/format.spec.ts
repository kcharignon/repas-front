// @vitest-environment node
import { describe, expect, it } from 'vitest'

import agreement from '../../../../drive-agent/fixtures/unit-agreement.json'

import { formatQuantity, imageUrl } from '@/features/shopping-lists/format'

describe('formatQuantity', () => {
  it.each([
    [1.6, 'kg', '1,6 kg'],
    [4, '', '4'],
    [0.5, 'l', '0,5 l'],
    [1 / 3, 'kg', '0,33 kg'],
    [1500, 'g', '1 500 g'],
    [4, 'tasse', '4 tasses'],
    [1, 'tasse', '1 tasse'],
    [1.5, 'paquet', '1,5 paquet'],
    [3, 'cuillère à soupe', '3 cuillères à soupe'],
    [2, 'cl', '2 cl'],
  ])('%s + « %s » donne « %s »', (value, unit, expected) => {
    // Intl insère une espace insécable fine : on compare sans tenir compte du type d'espace
    expect(formatQuantity(value, unit).replace(/\s/g, ' ')).toBe(expected)
  })
})

describe('formatQuantity, la même règle que l’agent du drive', () => {
  // `drive-agent/test/needed-text.spec.ts` lit le même fichier : la quantité d'un article se dit pareil sur le site et dans la carte de l'agent
  it.each(agreement.cases)(
    '$quantity « $unitSymbol » se dit « $expected »',
    ({ quantity, unitSymbol, expected }) => {
      expect(formatQuantity(quantity, unitSymbol).replace(/\s/g, ' ')).toBe(expected)
    },
  )
})

describe('imageUrl', () => {
  it('rend absolu un chemin relatif du back', () => {
    expect(imageUrl('images/department/fruits.png')).toBe('/images/department/fruits.png')
  })

  it('laisse une adresse absolue (icône hébergée ailleurs)', () => {
    expect(imageUrl('https://cdn-icons-png.flaticon.com/128/699/699044.png')).toBe(
      'https://cdn-icons-png.flaticon.com/128/699/699044.png',
    )
  })

  it('laisse un chemin absolu', () => {
    expect(imageUrl('/images/logo.png')).toBe('/images/logo.png')
  })
})

import { describe, expect, it } from 'vitest'

import { formatQuantity, imageUrl } from '@/features/shopping-lists/format'

describe('formatQuantity', () => {
  it.each([
    [1.6, 'kg', '1,6 kg'],
    [4, '', '4'],
    [0.5, 'l', '0,5 l'],
    [1 / 3, 'kg', '0,33 kg'],
    [1500, 'g', '1 500 g'],
  ])('%s + « %s » donne « %s »', (value, unit, expected) => {
    // Intl insère une espace insécable fine : on compare sans tenir compte du type d'espace
    expect(formatQuantity(value, unit).replace(/\s/g, ' ')).toBe(expected)
  })
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

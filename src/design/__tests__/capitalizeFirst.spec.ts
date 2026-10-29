// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { capitalizeFirst } from '@/design/capitalizeFirst'

describe('capitalizeFirst', () => {
  it('met la première lettre en majuscule et garde la suite telle quelle', () => {
    expect(capitalizeFirst('pâtes carbonara')).toBe('Pâtes carbonara')
    expect(capitalizeFirst('de la farine T55')).toBe('De la farine T55')
    expect(capitalizeFirst('tarte aux POMMES')).toBe('Tarte aux POMMES')
  })

  it('gère les accents et la ligature œ', () => {
    expect(capitalizeFirst('éclair')).toBe('Éclair')
    expect(capitalizeFirst('œufs')).toBe('Œufs')
    expect(capitalizeFirst('œuf au plat')).toBe('Œuf au plat')
    expect(capitalizeFirst('àl’ancienne')).toBe('Àl’ancienne')
  })

  it("est idempotent et n'abaisse jamais", () => {
    expect(capitalizeFirst('Pâtes')).toBe('Pâtes')
    expect(capitalizeFirst(capitalizeFirst('œufs'))).toBe('Œufs')
    expect(capitalizeFirst('ÉCLAIR')).toBe('ÉCLAIR')
  })

  it('laisse une chaîne vide ou faite d’espaces inchangée', () => {
    expect(capitalizeFirst('')).toBe('')
    expect(capitalizeFirst('   ')).toBe('   ')
  })

  it("laisse tel quel un premier caractère qui n'est pas une lettre", () => {
    expect(capitalizeFirst('7 up')).toBe('7 up')
    expect(capitalizeFirst('(sans gluten) pain')).toBe('(sans gluten) pain')
    expect(capitalizeFirst("'tit pain")).toBe("'tit pain")
  })

  it('conserve les espaces de tête et met en majuscule la lettre qui suit', () => {
    expect(capitalizeFirst('  pâtes')).toBe('  Pâtes')
    expect(capitalizeFirst('\tœufs')).toBe('\tŒufs')
  })

  it('ne touche pas une lettre hors du plan de base ni un emoji', () => {
    expect(capitalizeFirst('🍝 pâtes')).toBe('🍝 pâtes')
    expect(capitalizeFirst('ñoquis')).toBe('Ñoquis')
  })
})

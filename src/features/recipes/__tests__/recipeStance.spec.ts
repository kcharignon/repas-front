// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { sameName, stanceOf } from '../recipeStance'
import type { StanceInput } from '../recipeStance'

const LINK = 'https://www.marmiton.org/recettes/recette_the-tarte-au-citron-meringuee_22082.aspx'
const base: StanceInput = {
  isAdmin: false,
  canEdit: undefined,
  mineIds: undefined,
  id: 'r1',
  sourceUrl: null,
  originalId: null,
}

describe('stanceOf : à qui est la recette', () => {
  describe('un utilisateur ordinaire', () => {
    it('suit canEdit du back, sans attendre la liste de ses recettes', () => {
      expect(stanceOf({ ...base, canEdit: true })).toBe('mine')
      expect(stanceOf({ ...base, canEdit: false })).toBe('other')
    })

    it('ne devient jamais la version commune, même avec le lien Marmiton et sans original', () => {
      expect(stanceOf({ ...base, canEdit: false, sourceUrl: LINK, mineIds: [] })).toBe('other')
      expect(stanceOf({ ...base, canEdit: true, sourceUrl: LINK, mineIds: [] })).toBe('mine')
    })

    it('sans canEdit (back plus ancien) : la liste de ses recettes, comme avant', () => {
      expect(stanceOf(base)).toBe('unknown')
      expect(stanceOf({ ...base, mineIds: ['r1', 'r2'] })).toBe('mine')
      expect(stanceOf({ ...base, mineIds: ['r2'] })).toBe('other')
    })
  })

  describe("l'administrateur (canEdit est vrai pour toute recette qu'il lit)", () => {
    const admin: StanceInput = { ...base, isAdmin: true, canEdit: true }

    it('attend la liste de ses recettes', () => {
      expect(stanceOf(admin)).toBe('unknown')
    })

    it('la sienne', () => {
      expect(stanceOf({ ...admin, mineIds: ['r1'] })).toBe('mine')
      expect(stanceOf({ ...admin, mineIds: ['r1'], sourceUrl: LINK, originalId: null })).toBe(
        'mine',
      )
    })

    it("celle d'un autre reste celle d'un autre", () => {
      expect(stanceOf({ ...admin, mineIds: [] })).toBe('other')
    })

    it('la version commune : une recette Marmiton qui n’est pas la sienne ni la copie d’une autre', () => {
      expect(stanceOf({ ...admin, mineIds: [], sourceUrl: LINK, originalId: null })).toBe('common')
    })

    it('la copie Marmiton d’un autre (elle a un original) n’est pas la version commune', () => {
      expect(stanceOf({ ...admin, mineIds: [], sourceUrl: LINK, originalId: 'c1' })).toBe('other')
    })

    it('un back qui ne rend pas originalId ne fait pas deviner la version commune', () => {
      expect(stanceOf({ ...admin, mineIds: [], sourceUrl: LINK, originalId: undefined })).toBe(
        'other',
      )
    })
  })
})

describe('sameName', () => {
  it('ignore la casse et les espaces autour', () => {
    expect(sameName(' Tarte au citron ', 'tarte au citron')).toBe(true)
    expect(sameName('Tarte', 'Tarte au citron')).toBe(false)
  })
})

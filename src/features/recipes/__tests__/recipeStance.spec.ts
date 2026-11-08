// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { stanceOf } from '../recipeStance'
import type { StanceInput } from '../recipeStance'

const base: StanceInput = {
  isAdmin: false,
  canEdit: undefined,
  mineIds: undefined,
  id: 'r1',
  ownerless: undefined,
}

describe('stanceOf : à qui est la recette', () => {
  describe('un utilisateur ordinaire', () => {
    it('suit canEdit du back, sans attendre la liste de ses recettes', () => {
      expect(stanceOf({ ...base, canEdit: true })).toBe('mine')
      expect(stanceOf({ ...base, canEdit: false })).toBe('other')
    })

    it('ne devient jamais la version commune, même si la fiche la dit sans propriétaire', () => {
      expect(stanceOf({ ...base, canEdit: false, ownerless: true, mineIds: [] })).toBe('other')
      expect(stanceOf({ ...base, canEdit: true, ownerless: true, mineIds: [] })).toBe('mine')
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
      expect(stanceOf({ ...admin, mineIds: ['r1'], ownerless: false })).toBe('mine')
    })

    it("celle d'un autre reste celle d'un autre", () => {
      expect(stanceOf({ ...admin, mineIds: [] })).toBe('other')
    })

    it('la version commune : ownerless du back, sans attendre la liste de ses recettes', () => {
      expect(stanceOf({ ...admin, ownerless: true })).toBe('common')
      expect(stanceOf({ ...admin, mineIds: [], ownerless: true })).toBe('common')
    })

    it('une recette ordinaire d’un autre (même copiée de Marmiton) n’est pas la version commune', () => {
      expect(stanceOf({ ...admin, mineIds: [], ownerless: false })).toBe('other')
    })

    it('un back qui ne rend pas ownerless ne fait pas deviner la version commune', () => {
      expect(stanceOf({ ...admin, mineIds: [], ownerless: undefined })).toBe('other')
    })
  })
})

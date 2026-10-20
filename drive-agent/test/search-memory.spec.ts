// @vitest-environment node
// La recherche mémorisée (DRV-650) : ce que l'agent cherche si la recherche du plan ne répond rien, et la recherche à rendre à Repas.
import { describe, expect, it } from 'vitest'

import type { PlanLine } from '../protocol'
import { fallbackSteps, rememberedSearch } from '../src/flow'
import { fresh, known, product } from './flow-helpers'

describe('fallbackSteps', () => {
  const line = known('cereale', [
    product('1000001', 1, '  Céréales\u200b  Coussins   Choco 500 g '),
    product('1000002', 1, 'Autre'),
  ])

  it('le libellé nettoyé du premier produit mémorisé non perdu, puis le nom avec ses formes', () => {
    expect(fallbackSteps(line, line.products ?? [], undefined)).toEqual([
      { text: 'Céréales Coussins Choco 500 g', forms: false },
      { text: 'Cereale', forms: true },
    ])
  })

  it('un produit introuvable a déjà été cherché par son libellé : le suivant est pris', () => {
    const reasons = new Map([['1000001', 'NOT_FOUND' as const]])

    expect(fallbackSteps(line, line.products ?? [], reasons)[0]).toEqual({
      text: 'Autre',
      forms: false,
    })
  })

  it('tous introuvables : le nom seulement', () => {
    const reasons = new Map([
      ['1000001', 'NOT_FOUND' as const],
      ['1000002', 'NOT_FOUND' as const],
    ])

    expect(fallbackSteps(line, line.products ?? [], reasons)).toEqual([
      { text: 'Cereale', forms: true },
    ])
  })

  it('une ligne sans produit mémorisé : le libellé du produit à remplacer', () => {
    const replacing: PlanLine = {
      ...fresh('cereale'),
      replaces: { id: '1', label: 'Céréales du moment' },
    }

    expect(fallbackSteps(replacing, [], undefined)[0]).toEqual({
      text: 'Céréales du moment',
      forms: false,
    })
  })

  it('un libellé trop long est coupé à 80 points de code, comme ce qui sera mémorisé', () => {
    const long = known('cereale', [product('1000001', 1, '🥚'.repeat(120))])

    expect(fallbackSteps(long, long.products ?? [], undefined)[0]).toEqual({
      text: '🥚'.repeat(80),
      forms: false,
    })
  })

  it('un nouvel article sans rien à remplacer : le nom seulement', () => {
    expect(fallbackSteps(fresh('cereale'), [], undefined)).toEqual([
      { text: 'Cereale', forms: true },
    ])
  })
})

describe('rememberedSearch', () => {
  const planned = { ...fresh('cereale'), searchQuery: 'céréales coussins' }

  it.each([
    ['rien n’a répondu', null, null],
    ['la même recherche que le plan', 'céréales coussins', null],
    ['la même, aux espaces près', '  céréales   coussins ', null],
    ['une autre recherche', 'cereales coussins choco', 'cereales coussins choco'],
    ['une autre recherche à nettoyer', 'cereales\u200b  choco', 'cereales choco'],
    ['une recherche trop courte', 'x', null],
  ])('%s', (_name, listed, expected) => {
    expect(rememberedSearch(planned, listed)).toBe(expected)
  })

  it('sans recherche dans le plan, c’est le nom de l’ingrédient qu’on compare', () => {
    const { searchQuery: _unused, ...bare } = fresh('cereale')

    expect(rememberedSearch(bare, 'Cereale')).toBeNull()
    expect(rememberedSearch(bare, 'cereale coussin')).toBe('cereale coussin')
  })
})

import { describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'
import {
  blockKey,
  effectSentence,
  groupByDepartment,
  levelOf,
  pairKey,
  sidesOf,
  unitList,
  usageText,
  usesSentence,
} from '../mergeText'
import { duplicates, pair, side } from './mergeFixtures'

const t = (key: string, named?: Record<string, unknown>, plural?: number) =>
  plural === undefined ? i18n.global.t(key, named ?? {}) : i18n.global.t(key, named ?? {}, plural)

const absorbed = (recipeCount: number, listCount: number) => ({
  name: 'Tomates',
  recipeCount,
  listCount,
})

describe('usageText', () => {
  it.each([
    [7, 2, '7 recettes · 2 listes'],
    [1, 1, '1 recette · 1 liste'],
    [0, 2, '2 listes'],
    [3, 0, '3 recettes'],
    [0, 0, ''],
  ])('%i recettes et %i listes : « %s »', (recipeCount, listCount, expected) => {
    expect(usageText(t, { recipeCount, listCount })).toBe(expected)
  })
})

describe('effectSentence', () => {
  const sentence = (recipes: number, lists: number) =>
    effectSentence(t, absorbed(recipes, lists), { name: 'Tomate' })

  it.each([
    [7, 2, '7 recettes et 2 listes passent sur « Tomate ».'],
    [12, 3, '12 recettes et 3 listes passent sur « Tomate ».'],
    [1, 1, '1 recette et 1 liste passent sur « Tomate ».'],
    [1, 0, '1 recette passe sur « Tomate ».'],
    [0, 1, '1 liste passe sur « Tomate ».'],
    [4, 0, '4 recettes passent sur « Tomate ».'],
    [0, 2, '2 listes passent sur « Tomate ».'],
    [0, 0, '« Tomates » n’est utilisé nulle part.'],
  ])('%i recettes et %i listes', (recipes, lists, expected) => {
    expect(sentence(recipes, lists)).toBe(expected)
  })
})

describe('usesSentence', () => {
  const sentence = (recipeCount: number, listCount: number) =>
    usesSentence(t, { recipeCount, listCount, absorbedName: 'Tomates' }, 'Tomate')

  it.each([
    [7, 2, '7 recettes et 2 listes de courses utiliseront « Tomate ».'],
    [7, 0, '7 recettes utiliseront « Tomate ».'],
    [0, 1, '1 liste de courses utilisera « Tomate ».'],
    [0, 0, '« Tomates » n’est utilisé nulle part.'],
  ])('%i recettes et %i listes', (recipeCount, listCount, expected) => {
    expect(sentence(recipeCount, listCount)).toBe(expected)
  })
})

describe('unitList', () => {
  it('cite une, deux ou trois unités', () => {
    expect(unitList(t, ['tranche'])).toBe('« tranche »')
    expect(unitList(t, ['tranche', 'pincée'])).toBe('« tranche » et « pincée »')
    expect(unitList(t, ['tranche', 'pincée', 'gousse'])).toBe(
      '« tranche », « pincée » et « gousse »',
    )
  })
})

describe('levelOf', () => {
  it('garde un niveau connu et lit un niveau inconnu comme une suggestion', () => {
    expect(levelOf({ level: 'EXACT' })).toBe('EXACT')
    expect(levelOf({ level: 'TYPO' })).toBe('TYPO')
    expect(levelOf({ level: 'ALIAS' as 'EXACT' })).toBe('SUGGESTION')
    expect(levelOf({ level: undefined as unknown as 'EXACT' })).toBe('SUGGESTION')
  })
})

describe('blockKey', () => {
  it('donne un texte à chaque refus connu, un texte générique à un refus inconnu, aucun sans refus', () => {
    expect(blockKey(null)).toBeNull()
    expect(blockKey(undefined)).toBeNull()
    expect(blockKey('UNIT_MISSING')).toBeNull()
    expect(blockKey('IN_SENT_LIST')).toBe('blocked.IN_SENT_LIST')
    expect(blockKey('COMMON_INGREDIENT')).toBe('blocked.COMMON_INGREDIENT')
    expect(blockKey('SAME_INGREDIENT')).toBe('blocked.SAME_INGREDIENT')
    expect(blockKey('USED_BY_ANOTHER_USER')).toBe('blocked.USED_BY_ANOTHER_USER')
    expect(blockKey('QUELQUE_CHOSE_DE_NOUVEAU')).toBe('blockedOther')
  })
})

describe('groupByDepartment', () => {
  it('range les paires par rayon dans l’ordre où le back les rend', () => {
    const groups = groupByDepartment(duplicates.member)

    expect(groups.map((group) => [group.slug, group.name, group.pairs.length])).toEqual([
      ['fruit-et-legume', 'Fruit & légume', 1],
      ['epicerie', 'Épicerie', 2],
    ])
  })

  it('rend rien pour rien', () => {
    expect(groupByDepartment([])).toEqual([])
  })
})

describe('sidesOf', () => {
  const tomate = side('tomate', 'Tomate', 12, 3)
  const tomates = side('tomates', 'Tomates', 7, 2)
  const both = pair(tomate, tomates, 'tomate')

  it('garde la suggestion du back sans choix', () => {
    expect(sidesOf(both, undefined)).toEqual({ kept: tomate, absorbed: tomates })
  })

  it('suit le choix de l’utilisateur, dans un sens comme dans l’autre', () => {
    expect(sidesOf(both, 'tomates')).toEqual({ kept: tomates, absorbed: tomate })
    expect(sidesOf(both, 'tomate')).toEqual({ kept: tomate, absorbed: tomates })
  })

  it('retombe sur le premier côté si le slug ne désigne aucun des deux', () => {
    expect(sidesOf(both, 'autre').kept).toEqual(tomate)
  })

  it('a une clé de paire stable', () => {
    expect(pairKey(both)).toBe('tomate|tomates')
  })
})

// @vitest-environment node
// Le nombre de produits d'un produit choisi (DRV-306) : les mêmes règles que `PackCalculator` du dépôt back (`architecture.md` § 6).
import { describe, expect, it } from 'vitest'

import type { Dimension, NeededQuantity } from '../protocol'
import { packsFor } from '../src/flow'
import type { Content } from '../src/leclerc'

const need = (
  quantity: number,
  dimension: Dimension | null,
  baseFactor: number | null = 1,
  unitSymbol = 'u',
): NeededQuantity => ({ quantity, unitSymbol, dimension, baseFactor })
const grams = (value: number): Content => ({ value, unit: 'g' })
const millilitres = (value: number): Content => ({ value, unit: 'ml' })
const pieces = (value: number): Content => ({ value, unit: 'piece' })

describe('packsFor', () => {
  it.each([
    ['800 g avec des produits de 500 g', need(800, 'WEIGHT'), grams(500), 2],
    ['1 kg (facteur 1000) avec des produits de 500 g', need(1, 'WEIGHT', 1000), grams(500), 2],
    ['300 g avec un produit de 1 kg', need(300, 'WEIGHT'), grams(1000), 1],
    [
      '1,5 l (facteur 1000) avec des produits de 500 ml',
      need(1.5, 'VOLUME', 1000),
      millilitres(500),
      3,
    ],
    ['25 cl (facteur 10) avec des produits de 1 l', need(25, 'VOLUME', 10), millilitres(1000), 1],
    [
      '0,3 kg avec des produits de 100 g : pas d’erreur d’arrondi',
      need(0.3, 'WEIGHT', 1000),
      grams(100),
      3,
    ],
    ['un poids immense : plafonné à 99', need(50_000, 'WEIGHT'), grams(100), 99],
    ['6 pièces avec des boîtes de 12', need(6, 'COUNT'), pieces(12), 1],
    ['6 pièces avec des boîtes de 4', need(6, 'COUNT'), pieces(4), 2],
    ['2 paquets, quel que soit le contenu', need(2, 'PACKAGE'), grams(500), 2],
    ['2 paquets sans contenu connu', need(2, 'PACKAGE'), null, 2],
    ['2,2 paquets : arrondi au-dessus', need(2.2, 'PACKAGE'), null, 3],
  ])('%s : calculé', (_name, needed, content, packs) => {
    expect(packsFor(needed, content)).toEqual({ packs, status: 'COMPUTED' })
  })

  it.each([
    ['sans quantité demandée', undefined, grams(500)],
    ['une quantité nulle', need(0, 'WEIGHT'), grams(500)],
    ['une dimension inconnue', need(800, null), grams(500)],
    ['une unité sans dimension (cuillère)', { quantity: 2, unitSymbol: 'cuillère' }, grams(500)],
    ['un poids sans contenu connu', need(800, 'WEIGHT'), null],
    ['un poids avec un contenu en millilitres', need(800, 'WEIGHT'), millilitres(500)],
    ['un volume avec un contenu en grammes', need(800, 'VOLUME'), grams(500)],
    ['un poids avec un contenu en pièces', need(800, 'WEIGHT'), pieces(6)],
    ['un facteur d’unité absent', need(800, 'WEIGHT', null), grams(500)],
    ['un facteur d’unité nul', need(800, 'WEIGHT', 0), grams(500)],
    ['un contenu nul', need(800, 'WEIGHT'), grams(0)],
  ])('%s : à vérifier, sans nombre', (_name, needed, content) => {
    expect(packsFor(needed, content)).toEqual({ packs: null, status: 'TO_CHECK' })
  })

  it.each([
    ['des pièces demandées sans contenu connu', null],
    ['des pièces demandées avec un contenu en grammes', grams(500)],
  ])('%s : la quantité elle-même, à vérifier', (_name, content) => {
    expect(packsFor(need(6, 'COUNT'), content)).toEqual({ packs: 6, status: 'TO_CHECK' })
  })

  it('en demande au moins un', () => {
    expect(packsFor(need(10, 'WEIGHT'), grams(1000)).packs).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { validateResult } from '@drive-protocol'
import type { ResultLine } from '@drive-protocol'

import { buildChoiceBatches, MAX_INTENTS } from '../choices'
import { result } from './results'

const batchOf = (lines: ResultLine[]) => buildChoiceBatches(result({ lines }))

describe('buildChoiceBatches', () => {
  it('le résultat de référence est valide pour le protocole', () => {
    expect(() => validateResult(result())).not.toThrow()
  })

  it('un passage réussi enregistre 4 intentions en un appel : 2 ajouts, 1 « j’en ai toujours », 1 refus', () => {
    const [batch, ...others] = buildChoiceBatches(result())

    expect(others).toEqual([])
    expect(
      batch?.map((intent) => [intent.ingredientSlug, intent.action, intent.placement]),
    ).toEqual([
      ['poivre', 'ADD_PRODUCT', 'PRIMARY'],
      ['curry', 'ADD_PRODUCT', 'FALLBACK'],
      ['moutarde', 'REJECT_PRODUCT', null],
      ['sel', 'HAVE_AT_HOME', null],
    ])
  })

  it('traduit le produit : identifiant en chaîne, libellé, code-barres, contenu', () => {
    const [batch] = buildChoiceBatches(result())

    expect(batch?.[0]?.product).toEqual({
      retailerProductId: '555111',
      label: 'Poivre noir moulu 50 g',
      ean: null,
      content: { value: 50, unit: 'g' },
      price: null,
    })
    expect(batch?.[1]?.product).toMatchObject({
      retailerProductId: '555222',
      ean: '12345678',
      content: null,
    })
    expect(batch?.[2]?.product).toEqual({
      retailerProductId: '999111',
      label: 'Moutarde forte 200 g',
      ean: null,
      content: null,
      price: null,
    })
  })

  it('ne mémorise rien pour « cette fois seulement », les lignes passées, indisponibles ou en échec', () => {
    expect(
      batchOf([
        {
          ingredientSlug: 'poivre',
          outcome: 'CHOSEN',
          quantity: 1,
          placement: 'ONCE',
          product: { id: '1', label: 'Poivre' },
        },
        { ingredientSlug: 'sel', outcome: 'SKIPPED' },
        { ingredientSlug: 'riz', outcome: 'UNAVAILABLE', unavailableIds: ['2'] },
        { ingredientSlug: 'lait', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sucre', outcome: 'ADDED', productId: '3', quantity: 1, usedRank: 2 },
      ]),
    ).toEqual([])
  })

  it('rafraîchit le prix de chaque ligne ajoutée qui en porte un', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '222333',
        quantity: 1,
        usedRank: 1,
        price: { cents: 189, perMeasure: { cents: 189, unit: 'kg' } },
      },
      {
        ingredientSlug: 'riz',
        outcome: 'ADDED',
        productId: '300004',
        quantity: 1,
        usedRank: 1,
        price: { cents: 250 },
      },
      { ingredientSlug: 'lait', outcome: 'ADDED', productId: '300002', quantity: 1, usedRank: 1 },
    ])

    expect(batch).toEqual([
      {
        ingredientSlug: 'farine',
        action: 'REFRESH_PRICE',
        placement: null,
        product: {
          retailerProductId: '222333',
          label: null,
          ean: null,
          content: null,
          price: { cents: 189, perMeasure: { cents: 189, unit: 'kg' } },
        },
      },
      {
        ingredientSlug: 'riz',
        action: 'REFRESH_PRICE',
        placement: null,
        product: {
          retailerProductId: '300004',
          label: null,
          ean: null,
          content: null,
          price: { cents: 250, perMeasure: null },
        },
      },
    ])
  })

  it('envoie le prix du produit choisi avec son ajout', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555111', label: 'Poivre', price: { cents: 329 } },
      },
    ])

    expect(batch?.[0]?.product?.price).toEqual({ cents: 329, perMeasure: null })
  })

  it('ne garde pas un prix au-delà de ce que le back accepte', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'riz',
        outcome: 'ADDED',
        productId: '300004',
        quantity: 1,
        usedRank: 1,
        price: { cents: 1_000_001 },
      },
      {
        ingredientSlug: 'lait',
        outcome: 'ADDED',
        productId: '300002',
        quantity: 1,
        usedRank: 1,
        price: { cents: 100, perMeasure: { cents: 5_000_000, unit: 'l' } },
      },
    ])

    expect(batch).toHaveLength(1)
    expect(batch?.[0]?.product?.price).toEqual({ cents: 100, perMeasure: null })
  })

  it('met « j’en ai toujours » après les produits refusés du même ingrédient', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'sel',
        outcome: 'HAVE_AT_HOME',
        rejected: [
          { id: '10', label: 'Sel fin' },
          { id: '11', label: 'Sel gros' },
        ],
      },
    ])

    expect(batch?.map((intent) => intent.action)).toEqual([
      'REJECT_PRODUCT',
      'REJECT_PRODUCT',
      'HAVE_AT_HOME',
    ])
  })

  it('un produit choisi et aussi refusé n’est pas refusé : le lot serait rejeté en entier', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555111', label: 'Poivre' },
        rejected: [
          { id: '555111', label: 'Poivre' },
          { id: '999', label: 'Poivre blanc' },
        ],
      },
    ])

    expect(batch?.map((intent) => [intent.action, intent.product?.retailerProductId])).toEqual([
      ['REJECT_PRODUCT', '999'],
      ['ADD_PRODUCT', '555111'],
    ])
  })

  it('coupe en lots de 200 intentions au plus, sans séparer les intentions d’une ligne', () => {
    const lines: ResultLine[] = Array.from({ length: 100 }, (_, index) => ({
      ingredientSlug: `article-${index}`,
      outcome: 'HAVE_AT_HOME',
      rejected: [
        { id: `${index}1`, label: 'A' },
        { id: `${index}2`, label: 'B' },
      ],
    }))

    const batches = batchOf(lines)

    expect(batches.map((batch) => batch.length)).toEqual([198, 102])
    expect(batches.every((batch) => batch.length <= MAX_INTENTS)).toBe(true)
    // Les trois intentions d'un ingrédient restent ensemble
    expect(batches[0]?.[197]).toMatchObject({
      ingredientSlug: 'article-65',
      action: 'HAVE_AT_HOME',
    })
  })
})

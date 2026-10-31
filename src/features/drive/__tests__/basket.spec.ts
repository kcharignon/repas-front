// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ResultLine } from '@drive-protocol'

import { basketBatches, basketSlugsOf, MAX_BASKET_SLUGS } from '../basket'
import { result } from './results'

// Données SYNTHÉTIQUES : produits et ingrédients inventés.
const added = (slug: string): ResultLine => ({
  ingredientSlug: slug,
  outcome: 'ADDED',
  productId: '123456',
  quantity: 1,
  usedRank: 1,
})
const chosen = (slug: string, extra: Partial<ResultLine> = {}): ResultLine =>
  ({
    ingredientSlug: slug,
    outcome: 'CHOSEN',
    quantity: 1,
    placement: 'PRIMARY',
    product: { id: '555111', label: 'Produit de test' },
    ...extra,
  }) as ResultLine

const slugsOf = (lines: ResultLine[]) => basketSlugsOf(result({ lines }))

describe('basketSlugsOf : ce que le passage a vraiment mis au panier (DRV-747)', () => {
  it('une ligne ajoutée est au panier', () => {
    expect(slugsOf([added('farine')])).toEqual(['farine'])
  })

  it('un produit choisi sans la clé notInCart est au panier (un agent d’avant la clé ne la pose jamais)', () => {
    expect(slugsOf([chosen('poivre')])).toEqual(['poivre'])
  })

  it('un produit choisi que le panier n’a pas pris (notInCart) ne coche rien', () => {
    expect(slugsOf([chosen('poivre', { notInCart: true } as Partial<ResultLine>)])).toEqual([])
  })

  it.each<[string, ResultLine]>([
    ['« J’en ai toujours »', { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' }],
    ['« Pas cette fois »', { ingredientSlug: 'sel', outcome: 'SKIPPED' }],
    ['un produit introuvable', { ingredientSlug: 'sel', outcome: 'UNAVAILABLE' }],
    ['un échec', { ingredientSlug: 'sel', outcome: 'FAILED', error: 'NETWORK' }],
  ])('%s ne coche rien : c’est un article manquant', (_label, line) => {
    expect(slugsOf([line])).toEqual([])
  })

  it('garde l’ordre du résultat, sans doublon (le back refuse deux fois le même slug)', () => {
    expect(
      slugsOf([
        chosen('poivre'),
        added('farine'),
        { ingredientSlug: 'sel', outcome: 'SKIPPED' },
        added('farine'),
      ]),
    ).toEqual(['poivre', 'farine'])
  })

  it('un résultat sans ligne (arrêt avant le moindre ajout) ne donne rien', () => {
    expect(slugsOf([])).toEqual([])
  })
})

describe('basketBatches : au plus 1 000 slugs par appel', () => {
  const slugs = (count: number) => Array.from({ length: count }, (_value, index) => `a${index}`)

  it('un seul appel jusqu’à la borne du back', () => {
    expect(basketBatches(slugs(MAX_BASKET_SLUGS)).map((batch) => batch.length)).toEqual([1000])
  })

  it('découpe au-delà, sans rien perdre ni répéter', () => {
    const batches = basketBatches(slugs(2500))

    expect(batches.map((batch) => batch.length)).toEqual([1000, 1000, 500])
    expect(batches.flat()).toEqual(slugs(2500))
  })

  it('aucun appel sans slug : le back refuse un tableau vide', () => {
    expect(basketBatches([])).toEqual([])
  })
})

// Ticket D de l'audit du 2026-10-18 (H3) : en phase A, un produit connu se cherche par son libellé complet ; si cette recherche ne le retrouve
// pas, l'agent essaie les formes dérivées du libellé (les mêmes que pour un nom d'ingrédient), une par une, au plus 4, et ne déclare le produit
// « plus disponible » qu'en dernier recours. Un produit retrouvé en une requête ne change rien.
import { describe, expect, it } from 'vitest'

import { MAX_FALLBACKS, searchForms } from '../src/flow'
import { expectConform, fakeAdapter, fakeUi, known, makeFlow, plan, product } from './flow-helpers'

const LABEL = 'Crème fraîche épaisse Laiterie du Test 20 cl'
const CREAM = product('1000028', 2, LABEL)

function pass(
  sees: (query: string, id: string) => boolean,
  shelf: Parameters<typeof fakeAdapter>[0] = { '1000028': {} },
) {
  const site = fakeAdapter(shelf, { sees })
  const screens = fakeUi()
  const { flow, sent } = makeFlow({ ui: screens.ui, adapter: site.adapter })
  const start = () => flow.start(plan([known('creme', [CREAM])]))
  return { site, start, sent }
}

describe('un produit retrouvé par son libellé complet', () => {
  it('ne coûte qu’une recherche : le repli n’est pas essayé', async () => {
    // Given
    const test = pass(() => true)

    // When
    await test.start()

    // Then
    expect(test.site.searched).toEqual([{ query: LABEL, id: '1000028' }])
    expect(test.site.writes).toEqual([{ id: '1000028', quantity: 2 }])
    expect(expectConform(test.sent[0]).lines).toEqual([
      { ingredientSlug: 'creme', outcome: 'ADDED', productId: '1000028', quantity: 2, usedRank: 1 },
    ])
  })

  it('un produit retrouvé mais en rupture de stock est indisponible tout de suite : on ne le cherche pas davantage', async () => {
    const test = pass(() => true, { '1000028': { stock: 0 } })

    await test.start()

    expect(test.site.searched).toHaveLength(1)
    expect(test.site.writes).toEqual([])
  })
})

describe('un produit que le libellé complet ne retrouve pas', () => {
  it('est cherché par la forme sans accents du libellé, retrouvé, et mis au panier avec le rang 1', async () => {
    // Given : le moteur ne comprend le libellé que sans accents
    const forms = searchForms(LABEL)
    const test = pass((query) => query === forms[0])

    // When
    await test.start()

    // Then
    expect(test.site.searched.map((search) => search.query)).toEqual([LABEL, forms[0]])
    expect(test.site.writes).toEqual([{ id: '1000028', quantity: 2 }])
    expect(expectConform(test.sent[0]).lines).toEqual([
      { ingredientSlug: 'creme', outcome: 'ADDED', productId: '1000028', quantity: 2, usedRank: 1 },
    ])
  })

  it('essaie les formes dans l’ordre de searchForms, s’arrête à la première qui le retrouve et ne rejoue aucune requête', async () => {
    // Given : seule la dernière forme le retrouve
    const forms = searchForms(LABEL)
    const last = forms.at(-1) ?? ''
    const test = pass((query) => query === last)

    // When
    await test.start()

    // Then
    const queries = test.site.searched.map((search) => search.query)
    expect(queries).toEqual([LABEL, ...forms])
    expect(new Set(queries).size).toBe(queries.length)
    expect(queries.length).toBeLessThanOrEqual(1 + MAX_FALLBACKS)
    expect(test.site.writes).toEqual([{ id: '1000028', quantity: 2 }])
  })

  it('aucune forme ne le retrouve : « plus disponible » en dernier recours, après 5 requêtes au plus, rien au panier', async () => {
    // Given
    const test = pass(() => false)

    // When
    await test.start()

    // Then
    const queries = test.site.searched.map((search) => search.query)
    expect(queries).toEqual([LABEL, ...searchForms(LABEL)])
    expect(queries.length).toBeLessThanOrEqual(1 + MAX_FALLBACKS)
    expect(test.site.writes).toEqual([])
    expect(expectConform(test.sent[0]).lines).toEqual([
      { ingredientSlug: 'creme', outcome: 'UNAVAILABLE', unavailableIds: ['1000028'] },
    ])
  })

  it('chaque produit connu a son propre repli : le premier introuvable n’empêche pas de retrouver le second', async () => {
    // Given : deux produits connus, le premier introuvable sous toute requête, le second retrouvé par sa forme sans accents
    const second = product('1000029', 1, 'Crème légère Laiterie du Test 20 cl')
    const site = fakeAdapter(
      { '1000029': {} },
      {
        sees: (query, id) => id === '1000029' && query === 'creme legere laiterie du test 20 cl',
      },
    )
    const { flow, sent } = makeFlow({ ui: fakeUi().ui, adapter: site.adapter })

    // When
    await flow.start(plan([known('creme', [CREAM, second])]))

    // Then
    expect(site.writes).toEqual([{ id: '1000029', quantity: 1 }])
    expect(expectConform(sent[0]).lines).toEqual([
      {
        ingredientSlug: 'creme',
        outcome: 'ADDED',
        productId: '1000029',
        quantity: 1,
        usedRank: 2,
        unavailableIds: ['1000028'],
      },
    ])
  })
})

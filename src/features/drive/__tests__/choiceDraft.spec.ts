// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { DriveChoice, DriveChoiceProduct } from '@/api'
import * as draft from '../choiceDraft'

const product = (id: string): DriveChoiceProduct => ({
  productId: `p-${id}`,
  retailerProductId: '123456',
  label: `Produit ${id}`,
})

const choice = (accepted: string[], rejected: string[], haveAtHome = false): DriveChoice => ({
  ingredientSlug: 'farine',
  ingredientName: 'Farine',
  haveAtHome,
  accepted: accepted.map((id, index) => ({ rank: index + 1, product: product(id) })),
  rejected: rejected.map(product),
  updatedAt: '2026-10-18T10:00:00+02:00',
})

const ids = (list: DriveChoiceProduct[]) => list.map((item) => item.productId)

describe('brouillon d’une préférence de produits', () => {
  it('range les produits acceptés dans l’ordre de leur rang', () => {
    const read = choice(['a', 'b'], [])
    read.accepted.reverse()

    expect(ids(draft.draftOf(read).accepted)).toEqual(['p-a', 'p-b'])
  })

  it('monte et descend un produit, sans effet aux extrémités', () => {
    const start = draft.draftOf(choice(['a', 'b', 'c'], []))

    expect(ids(draft.move(start, 'p-a', 1).accepted)).toEqual(['p-b', 'p-a', 'p-c'])
    expect(ids(draft.move(start, 'p-c', -1).accepted)).toEqual(['p-a', 'p-c', 'p-b'])
    expect(draft.move(start, 'p-a', -1)).toBe(start)
    expect(draft.move(start, 'p-c', 1)).toBe(start)
    expect(draft.move(start, 'inconnu', 1)).toBe(start)
  })

  it('retire un produit sans le refuser', () => {
    const next = draft.remove(draft.draftOf(choice(['a', 'b'], ['c'])), 'p-a')

    expect(ids(next.accepted)).toEqual(['p-b'])
    expect(ids(next.rejected)).toEqual(['p-c'])
  })

  it('refuse un produit : il passe des acceptés aux refusés sans être perdu', () => {
    const next = draft.reject(draft.draftOf(choice(['a', 'b'], ['c'])), 'p-a')

    expect(ids(next.accepted)).toEqual(['p-b'])
    expect(ids(next.rejected)).toEqual(['p-c', 'p-a'])
  })

  it('accepte de nouveau un produit refusé, à la fin des acceptés', () => {
    const next = draft.acceptAgain(draft.draftOf(choice(['a', 'b'], ['c'])), 'p-c')

    expect(ids(next.accepted)).toEqual(['p-a', 'p-b', 'p-c'])
    expect(next.rejected).toEqual([])
  })

  it('ne dépasse ni 5 produits acceptés ni 20 refusés', () => {
    const full = draft.draftOf(choice(['a', 'b', 'c', 'd', 'e'], ['f']))
    expect(draft.canAcceptAgain(full)).toBe(false)
    expect(draft.acceptAgain(full, 'p-f')).toBe(full)

    const ids20 = Array.from({ length: 20 }, (_, index) => `r${index}`)
    const refused = draft.draftOf(choice(['a'], ids20))
    expect(draft.canReject(refused)).toBe(false)
    expect(draft.reject(refused, 'p-a')).toBe(refused)
  })

  it('n’envoie ni produit accepté ni refusé pour « j’en ai toujours », mais les garde pour décocher', () => {
    const start = draft.draftOf(choice(['a', 'b'], ['c']))
    const home = draft.toggleHaveAtHome(start, true)

    expect(draft.toPayload(home, 'leclerc', '123456')).toEqual({
      retailer: 'leclerc',
      storeId: '123456',
      haveAtHome: true,
      accepted: [],
      rejected: [],
    })
    expect(ids(draft.toggleHaveAtHome(home, false).accepted)).toEqual(['p-a', 'p-b'])
    expect(draft.toPayload(start, 'leclerc', '123456')).toEqual({
      retailer: 'leclerc',
      storeId: '123456',
      haveAtHome: false,
      accepted: ['p-a', 'p-b'],
      rejected: ['p-c'],
    })
  })

  it('sait si le brouillon diffère de l’état lu, ordre compris', () => {
    const read = choice(['a', 'b'], ['c'])
    const start = draft.draftOf(read)

    expect(draft.isDirty(start, read)).toBe(false)
    expect(draft.isDirty(draft.move(start, 'p-a', 1), read)).toBe(true)
    expect(draft.isDirty(draft.toggleHaveAtHome(start, true), read)).toBe(true)
    expect(draft.isDirty(draft.reject(start, 'p-a'), read)).toBe(true)
  })

  it('reconnaît un brouillon vide', () => {
    expect(draft.isEmpty(draft.draftOf(choice([], [])))).toBe(true)
    expect(draft.isEmpty(draft.draftOf(choice([], [], true)))).toBe(false)
    expect(draft.isEmpty(draft.draftOf(choice(['a'], [])))).toBe(false)
  })
})

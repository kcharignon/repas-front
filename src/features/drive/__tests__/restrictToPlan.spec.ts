import { describe, expect, it } from 'vitest'
import type { ResultLine } from '@drive-protocol'

import { expectedFromPlan, restrictToPlan } from '../restrictToPlan'
import type { ExpectedLine } from '../restrictToPlan'
import { plan } from './fixtures'
import { result } from './results'

// Données SYNTHÉTIQUES : produits et ingrédients inventés.
const expected: ExpectedLine[] = [
  { ingredientSlug: 'farine', status: 'KNOWN', products: ['123456', '222333'] },
  { ingredientSlug: 'lait', status: 'KNOWN', products: ['300002'] },
  { ingredientSlug: 'poivre', status: 'NEW', products: [] },
  { ingredientSlug: 'sel', status: 'HAVE_AT_HOME', products: [] },
  { ingredientSlug: 'riz', status: 'SKIP', products: [] },
]

const added = (slug: string, productId: string): ResultLine => ({
  ingredientSlug: slug,
  outcome: 'ADDED',
  productId,
  quantity: 1,
  usedRank: 1,
})

const chosen = (slug: string, extra: Partial<ResultLine> = {}): ResultLine =>
  ({
    ingredientSlug: slug,
    outcome: 'CHOSEN',
    quantity: 1,
    placement: 'PRIMARY',
    product: { id: '555111', label: 'Poivre noir moulu 50 g' },
    ...extra,
  }) as ResultLine

/** Ce qui reste d'un résultat qui n'a que ces lignes, et combien ont été ignorées. */
function restrict(lines: ResultLine[], from: readonly ExpectedLine[] = expected) {
  const restricted = restrictToPlan(result({ lines }), from)

  return { slugs: restricted.result.lines.map((line) => line.ingredientSlug), ...restricted }
}

describe('restrictToPlan : une ligne dont le slug n’est pas dans le plan', () => {
  it('est ignorée et comptée, sans toucher aux autres lignes ni au reste du résultat', () => {
    const original = result({
      outcome: 'partial',
      error: { code: 'BLOCKED', message: 'Trop de demandes' },
      lines: [
        added('farine', '123456'),
        chosen('inconnu'),
        { ingredientSlug: 'pirate', outcome: 'HAVE_AT_HOME' },
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      ],
    })

    const restricted = restrictToPlan(original, expected)

    expect(restricted.ignored).toBe(2)
    expect(restricted.result.lines.map((line) => line.ingredientSlug)).toEqual(['farine', 'sel'])
    expect(restricted.result).toMatchObject({
      type: 'result',
      runId: original.runId,
      outcome: 'partial',
      error: { code: 'BLOCKED' },
      store: { id: '123456' },
    })
    // Le résultat reçu n'est pas modifié
    expect(original.lines).toHaveLength(4)
  })

  it('ignore toutes les lignes quand le plan n’en a aucune', () => {
    const { slugs, ignored } = restrict([added('farine', '123456'), chosen('poivre')], [])

    expect(slugs).toEqual([])
    expect(ignored).toBe(2)
  })

  it('ne confond pas un slug avec une propriété héritée d’un objet', () => {
    expect(restrict([chosen('constructor'), chosen('__proto__')]).slugs).toEqual([])
  })

  it('garde tout, sans rien compter, quand chaque ligne est dans le plan', () => {
    const { slugs, ignored } = restrict([
      added('farine', '222333'),
      { ingredientSlug: 'lait', outcome: 'UNAVAILABLE', unavailableIds: ['300002'] },
      chosen('poivre'),
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      { ingredientSlug: 'riz', outcome: 'SKIPPED' },
    ])

    expect(slugs).toEqual(['farine', 'lait', 'poivre', 'sel', 'riz'])
    expect(ignored).toBe(0)
  })
})

describe('restrictToPlan : un produit mis au panier', () => {
  it('doit être l’un des produits du plan pour une ligne connue', () => {
    expect(restrict([added('farine', '123456'), added('farine', '222333')]).ignored).toBe(0)
    expect(restrict([added('farine', '999999')]).ignored).toBe(1)
  })

  it('n’est pas possible pour une ligne à choisir, « déjà à la maison » ou passée', () => {
    const { slugs, ignored } = restrict([
      added('poivre', '123456'),
      added('sel', '123456'),
      added('riz', '123456'),
    ])

    expect(slugs).toEqual([])
    expect(ignored).toBe(3)
  })
})

describe('restrictToPlan : un produit choisi sur le site', () => {
  it('est possible pour une ligne à choisir, y compris une ligne connue que l’utilisateur a remplacée (envoyée « à choisir »)', () => {
    expect(restrict([chosen('poivre')]).ignored).toBe(0)
  })

  it('est refusé pour une ligne connue envoyée telle quelle, « déjà à la maison » ou passée', () => {
    const { slugs, ignored } = restrict([chosen('farine'), chosen('sel'), chosen('riz')])

    expect(slugs).toEqual([])
    expect(ignored).toBe(3)
  })

  it('est accepté pour une ligne connue dont aucun produit n’était disponible (l’agent les nomme tous)', () => {
    expect(restrict([chosen('lait', { unavailableIds: ['300002'] })]).ignored).toBe(0)
    expect(restrict([chosen('farine', { unavailableIds: ['123456', '222333'] })]).ignored).toBe(0)
  })

  it('est refusé quand un produit connu n’est pas dit indisponible, ou qu’aucun ne l’est', () => {
    expect(restrict([chosen('farine', { unavailableIds: ['123456'] })]).ignored).toBe(1)
    expect(restrict([chosen('farine', { unavailableIds: ['999999'] })]).ignored).toBe(1)
    expect(restrict([chosen('lait', { unavailableIds: [] })]).ignored).toBe(1)
    expect(restrict([chosen('lait')]).ignored).toBe(1)
  })
})

describe('restrictToPlan : « j’en ai toujours »', () => {
  it('se rattache à toute ligne du plan sauf une ligne passée', () => {
    const lines: ResultLine[] = ['farine', 'poivre', 'sel', 'riz'].map((slug) => ({
      ingredientSlug: slug,
      outcome: 'HAVE_AT_HOME',
    }))

    expect(restrict(lines).slugs).toEqual(['farine', 'poivre', 'sel'])
  })
})

describe('expectedFromPlan : le plan relu du back', () => {
  const lines = expectedFromPlan(plan())

  it('garde le slug, le statut et les identifiants des produits, dans l’ordre', () => {
    expect(lines.find((line) => line.ingredientSlug === 'farine')).toEqual({
      ingredientSlug: 'farine',
      status: 'KNOWN',
      products: ['123456', '222333'],
      replaceable: true,
    })
    expect(lines.find((line) => line.ingredientSlug === 'poivre')).toEqual({
      ingredientSlug: 'poivre',
      status: 'NEW',
      products: [],
    })
    expect(lines.find((line) => line.ingredientSlug === 'sel')?.status).toBe('HAVE_AT_HOME')
  })

  it('accepte un produit choisi pour une ligne connue, qu’il a pu remplacer (le back ne le sait pas)', () => {
    expect(restrict([chosen('farine')], lines).ignored).toBe(0)
    expect(restrict([added('farine', '999999')], lines).ignored).toBe(1)
    expect(restrict([chosen('sel')], lines).ignored).toBe(1)
  })
})

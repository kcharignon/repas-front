// @vitest-environment node
// Un produit choisi que le panier ne prend pas (DRV-644) : la réponse du panier lue, l'état gardé pour la reprise, l'écran de fin, le diagnostic.
import { LECLERC } from './retailer-fixtures'
import { describe, expect, it } from 'vitest'

import type { ResultLine } from '../protocol'
import { endProps, hasSomethingToRead, unreachedOf } from '../src/flow'
import { emptyState, readLastRefusals, RunStore } from '../src/flow/run-state'
import { readCartResponse } from '../src/leclerc/cart'
import { probeLines } from '../src/diagnostic/probes'
import { S } from '../src/ui'
import { fakeStorage, plan, RUN_ID } from './flow-helpers'

const reply = (product: Record<string, unknown>) =>
  JSON.stringify([
    { eTypeEvenement: 101, sIdUnique: 'Produit1000001', ...product },
    {
      eTypeEvenement: 1,
      sIdUnique: 'Panier123456',
      iQuantitePanier: 0,
      sTotalAPayer: '0,00 €',
      lstProduitsLight: [],
    },
  ])

describe('ce que la réponse du panier dit du produit', () => {
  it('lit le stock et l’étiquette de disponibilité de l’évènement du produit', () => {
    const reading = readCartResponse(reply({ iQteDisponible: 0, eDisponibilite: 2 }), '1000001')

    expect(reading.obtained).toBe(0)
    expect(reading.product).toEqual({ stock: 0, availability: 2 })
  })

  it('un nombre en texte se lit ; ce qui manque est null ; aucune des deux valeurs : pas de motif', () => {
    expect(readCartResponse(reply({ iQteDisponible: '5' }), '1000001').product).toEqual({
      stock: 5,
      availability: null,
    })
    expect(readCartResponse(reply({ autre: 1 }), '1000001').product).toBeNull()
  })

  it('l’évènement d’un autre produit ne compte pas', () => {
    expect(readCartResponse(reply({ iQteDisponible: 0 }), '1000009').product).toBeNull()
  })
})

const CHOSEN: ResultLine = {
  ingredientSlug: 'sirop',
  outcome: 'CHOSEN',
  product: { id: '2000001', label: 'Sirop Teisseire Fraise 60cl' },
  quantity: 1,
  placement: 'PRIMARY',
}
const note = {
  ingredientSlug: 'sirop',
  reason: 'OUT_OF_STOCK' as const,
  label: 'Sirop Teisseire Fraise 60cl',
  stock: 0,
  availability: 2,
}

describe('l’état de reprise', () => {
  it('garde les produits non pris par le panier, et un état plus ancien n’en a pas', () => {
    const storage = fakeStorage()
    const store = new RunStore(storage)
    const state = { ...emptyState(RUN_ID, 1), unreached: [note] }

    store.save(state)

    expect(store.load(RUN_ID)?.unreached).toEqual([note])
    const { unreached: _unreached, ...old } = state
    storage.setItem('repas:run:' + RUN_ID, JSON.stringify(old))
    expect(store.load(RUN_ID)?.unreached).toEqual([])
  })

  it('refuse un état dont la raison, le nom ou un nombre n’a pas la bonne forme (le stockage est partagé avec la page)', () => {
    const store = new RunStore(fakeStorage())
    for (const bad of [
      { ...note, reason: 'NOT_FOUND' },
      { ...note, label: '' },
      { ...note, stock: -1 },
      { ...note, availability: 'x' },
    ]) {
      store.save({ ...emptyState(RUN_ID, 1), unreached: [bad as never] })
      expect(store.load(RUN_ID)).toBeNull()
    }
  })

  it('ne garde pour le diagnostic ni nom ni identifiant : un mot fixe et deux nombres', () => {
    const storage = fakeStorage()

    new RunStore(storage).keepRefusals([note])

    expect(storage.getItem('repas:last-refusals')).toBe(
      '[{"reason":"OUT_OF_STOCK","stock":0,"availability":2}]',
    )
    expect(readLastRefusals(storage)).toEqual([
      { reason: 'OUT_OF_STOCK', stock: 0, availability: 2 },
    ])
    new RunStore(storage).keepRefusals([])
    expect(readLastRefusals(storage)).toEqual([])
  })
})

describe('l’écran de fin', () => {
  const sirop = plan([{ ingredientSlug: 'sirop', name: 'Sirop', status: 'NEW' }])

  it('dit le produit non pris une fois, seulement pour une ligne du plan qui a fini CHOSEN', () => {
    const state = { ...emptyState(RUN_ID, 1), unreached: [note], done: { sirop: CHOSEN } }

    expect(unreachedOf(sirop, state)).toEqual([
      { label: 'Sirop Teisseire Fraise 60cl', reason: 'OUT_OF_STOCK' },
    ])
    expect(unreachedOf(sirop, { ...state, done: {} })).toEqual([])
    expect(unreachedOf(plan([]), state)).toEqual([])
  })

  it('un envoi terminé n’est plus rendu à Repas sans rien montrer : l’écran de fin porte la phrase', () => {
    const quiet = endProps([CHOSEN], { outcome: 'completed' })
    const told = endProps(
      [CHOSEN],
      { outcome: 'completed' },
      [],
      undefined,
      false,
      [],
      [{ label: 'Sirop Teisseire Fraise 60cl', reason: 'OUT_OF_STOCK' }],
    )

    expect(hasSomethingToRead(quiet)).toBe(false)
    expect(hasSomethingToRead(told)).toBe(true)
  })

  it('une phrase par produit, avec la raison, au tutoiement et sans mot d’avertissement', () => {
    const say = (name: string, reason: keyof ReturnType<typeof S.end.unreached.why>) =>
      S.end.unreached.item(name, S.end.unreached.why(LECLERC)[reason])
    expect(say('Sirop Teisseire Fraise 60cl', 'OUT_OF_STOCK')).toBe(
      '« Sirop Teisseire Fraise 60cl » est enregistré, mais pas dans ton panier : Leclerc le dit en rupture dans ton magasin.',
    )
    expect(say('Sirop', 'COMING_SOON')).toBe(
      '« Sirop » est enregistré, mais pas dans ton panier. Leclerc indique « Bientôt disponible » : tu ne peux pas le commander pour l’instant.',
    )
    expect(say('Sirop', 'CART_REFUSED')).toBe(
      '« Sirop » est enregistré, mais pas dans ton panier : Leclerc n’a pas voulu le mettre au panier, sans en donner la raison.',
    )
  })
})

describe('le diagnostic', () => {
  it('ajoute la valeur lue (stock, étiquette), jamais un nom ni un identifiant', () => {
    const lines = probeLines({
      arrival: null,
      common: null,
      nonsense: null,
      lastRefusals: [
        { reason: 'OUT_OF_STOCK', stock: 0, availability: 2 },
        { reason: 'CART_REFUSED', stock: null, availability: null },
      ],
    })

    expect(lines.slice(1)).toEqual([
      ' - Dernier envoi, produits choisis non pris par le panier : 1 : en rupture (iQteDisponible : 0, eDisponibilite : 2) ; 2 : refusé par le panier (iQteDisponible : absent, eDisponibilite : absente)',
    ])
  })
})

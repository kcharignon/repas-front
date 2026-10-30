// @vitest-environment node
// `offerId`, l'identifiant d'offre FACULTATIF d'un produit (DRV-722) côté web : recopié champ par champ dans le message du protocole et rendu à Repas par
// `PUT /drive/choices`. Aucune enseigne du registre n'a d'offre (Leclerc : `offerIdPattern` à `null`) ; l'enseigne à offres des tests est FICTIVE et
// aucune règle d'Auchan n'est écrite ici.
import { describe, expect, it } from 'vitest'
import {
  decodeMessage,
  encodeMessage,
  RETAILER_IDS,
  STORES,
  validatePlan,
  validateResult,
} from '@drive-protocol'
import type { PlanMessage, ResultLine } from '@drive-protocol'

import type { DrivePlan } from '@/api'
import { buildPlanMessage } from '../buildPlanMessage'
import { buildChoiceBatches, countChoices } from '../choices'
import { DEFAULT_RETAILER, offerIdOf, retailerOf, type Retailer } from '../retailers'
import { plan } from './fixtures'
import { result } from './results'

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
const OFFER_A = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'
const OFFER_B = 'c3b2a1d0-5e4f-4a6b-9c8d-7e6f5a4b3c2d'

/** L'enseigne fictive à offres du web : le motif du contrat des enseignes (`offerIdPattern`). */
const exemple: Retailer = { ...DEFAULT_RETAILER, offerIdPattern: UUID }

/** Le plan du back avec des offres (DRV-721) : la farine préférée et son secours en ont, les autres non. */
function planWithOffers(): DrivePlan {
  const withOffers = plan()
  const [first, second] = withOffers.lines[0]!.products
  Object.assign(first!, { offerId: OFFER_A })
  Object.assign(second!, { offerId: OFFER_B })

  return withOffers
}

const productsOf = (message: PlanMessage, slug: string) =>
  message.lines.find((line) => line.ingredientSlug === slug)?.products ?? []

describe('offerIdOf', () => {
  it('rien pour une enseigne sans offre, quelle que soit la valeur', () => {
    expect(DEFAULT_RETAILER.offerIdPattern).toBeNull()
    expect(offerIdOf(OFFER_A, DEFAULT_RETAILER)).toBeNull()
    expect(offerIdOf(OFFER_A, retailerOf('leclerc'))).toBeNull()
  })

  it('la valeur seulement si elle a la forme de l’enseigne et 40 caractères au plus', () => {
    expect(offerIdOf(OFFER_A, exemple)).toBe(OFFER_A)
    for (const odd of [
      '',
      'pas une offre',
      OFFER_A.toUpperCase(),
      `${OFFER_A}0`,
      null,
      undefined,
      12,
      [OFFER_A],
    ])
      expect(offerIdOf(odd, exemple)).toBeNull()
    expect(offerIdOf('a'.repeat(41), { ...exemple, offerIdPattern: '^[a-z]+$' })).toBeNull()
    expect(offerIdOf('a'.repeat(40), { ...exemple, offerIdPattern: '^[a-z]+$' })).toBe(
      'a'.repeat(40),
    )
  })
})

describe('buildPlanMessage et l’identifiant d’offre', () => {
  it('Leclerc : un plan du back qui porterait des offres repart sans, octet pour octet comme sans elles', () => {
    const withOffers = buildPlanMessage(planWithOffers(), {}, RUN_ID)
    const without = buildPlanMessage(plan(), {}, RUN_ID)

    expect(encodeMessage(withOffers)).toBe(encodeMessage(without))
    expect(JSON.stringify(withOffers)).not.toContain('offerId')
    expect(() => validatePlan(withOffers)).not.toThrow()
  })

  it('une enseigne à offres : la clé part sur les produits qui en ont, jamais en bloc, jamais null', () => {
    const message = buildPlanMessage(planWithOffers(), {}, RUN_ID, { retailer: exemple })

    expect(productsOf(message, 'farine').map((product) => product.offerId)).toEqual([
      OFFER_A,
      OFFER_B,
    ])
    for (const line of message.lines.filter((one) => one.ingredientSlug !== 'farine'))
      for (const product of line.products ?? []) expect(product).not.toHaveProperty('offerId')
    expect(JSON.stringify(message)).not.toContain('null,"offerId"')
  })

  it('ne recopie pas une offre mal formée : l’agent rejetterait le plan entier', () => {
    const odd = planWithOffers()
    Object.assign(odd.lines[0]!.products[0]!, { offerId: 'pas une offre' })

    const farine = productsOf(buildPlanMessage(odd, {}, RUN_ID, { retailer: exemple }), 'farine')

    expect(farine[0]).not.toHaveProperty('offerId')
    expect(farine[1]).toMatchObject({ offerId: OFFER_B })
  })

  it('l’offre ne sert à aucune autre clé du message (champ par champ)', () => {
    const hostile = planWithOffers()
    Object.assign(hostile.lines[0]!.products[0]!, { inconnu: 'x' })

    const [first] = productsOf(
      buildPlanMessage(hostile, {}, RUN_ID, { retailer: exemple }),
      'farine',
    )

    expect(Object.keys(first!).sort()).toEqual(
      ['content', 'id', 'label', 'offerId', 'packs', 'packsStatus'].sort(),
    )
  })

  it('le message d’une enseigne à offres est valide pour le protocole de cette enseigne', () => {
    const ids = RETAILER_IDS as unknown as string[]
    const stores = STORES as unknown as Record<string, (typeof STORES)['leclerc']>
    ids.push('exemple')
    stores.exemple = {
      host: /^[a-z0-9-]+\.exemple\.invalid$/,
      id: /^[0-9]{1,12}$/,
      base: () => true,
      offerId: new RegExp(UUID),
    }
    try {
      const message = {
        ...buildPlanMessage(planWithOffers(), {}, RUN_ID, { retailer: exemple }),
        retailer: 'exemple',
        store: { id: '123456', host: 'courses-test.exemple.invalid' },
      } as unknown as PlanMessage

      expect(() => validatePlan(decodeMessage(encodeMessage(message)))).not.toThrow()
    } finally {
      ids.splice(ids.indexOf('exemple'), 1)
      delete stores.exemple
    }
  })
})

describe('buildChoiceBatches et l’identifiant d’offre', () => {
  const lines = (offerId: unknown): ResultLine[] =>
    [
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: {
          id: '555111',
          label: 'Poivre noir moulu 50 g',
          ...(offerId !== undefined && { offerId }),
        },
      },
      {
        ingredientSlug: 'curry',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'FALLBACK',
        product: { id: '555222', label: 'Curry doux 40 g' },
      },
      {
        ingredientSlug: 'moutarde',
        outcome: 'HAVE_AT_HOME',
        rejected: [{ id: '999111', label: 'Moutarde forte 200 g' }],
      },
    ] as ResultLine[]

  const intents = (offerId: unknown, retailer?: Retailer) =>
    buildChoiceBatches(result({ lines: lines(offerId) }), new Map(), retailer).flat()

  it('une enseigne à offres : l’offre du produit choisi part dans son ADD_PRODUCT, et dans aucun autre', () => {
    const batch = intents(OFFER_A, exemple)

    expect(batch.find((intent) => intent.ingredientSlug === 'poivre')?.product).toMatchObject({
      retailerProductId: '555111',
      offerId: OFFER_A,
    })
    expect(batch.find((intent) => intent.ingredientSlug === 'curry')?.product).not.toHaveProperty(
      'offerId',
    )
    expect(
      JSON.stringify(batch.filter((intent) => intent.action === 'REJECT_PRODUCT')),
    ).not.toContain('offerId')
    expect(countChoices([batch])).toBe(countChoices([intents(undefined, exemple)]))
  })

  it('Leclerc : l’offre est retirée, sinon le back refuserait tout le lot (422)', () => {
    expect(JSON.stringify(intents(OFFER_A))).not.toContain('offerId')
    expect(JSON.stringify(intents(OFFER_A))).toBe(JSON.stringify(intents(undefined)))
  })

  it('une offre mal formée n’est pas envoyée', () => {
    for (const odd of ['pas une offre', '', 12, null, OFFER_A.toUpperCase()])
      expect(JSON.stringify(intents(odd, exemple))).not.toContain('offerId')
  })

  it('un résultat sans offre repart exactement comme avant', () => {
    expect(JSON.stringify(intents(undefined, exemple))).toBe(
      JSON.stringify(buildChoiceBatches(result({ lines: lines(undefined) })).flat()),
    )
  })

  it('le résultat du protocole n’accepte pas d’offre tant qu’aucune enseigne n’en a', () => {
    expect(() => validateResult(result({ lines: lines(OFFER_A) }))).toThrow(/offerId/)
  })
})

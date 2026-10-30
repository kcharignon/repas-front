// @vitest-environment node
// `offerId`, l'identifiant d'offre FACULTATIF d'un produit (DRV-722) : dans le produit connu d'un plan et dans le produit choisi d'un résultat.
// Sa forme est celle de l'enseigne du message ; une enseigne sans offre (Leclerc) l'interdit. Le registre ne contient aucune enseigne à offres :
// ces tests en déclarent deux fictives (`offer-retailer.ts`), aucune règle d'Auchan n'est écrite ici.
import { describe, expect, it } from 'vitest'

import {
  anyOfferId,
  decodeMessage,
  encodeMessage,
  LIMITS,
  ProtocolError,
  STORES,
  validatePlan,
  validateResult,
} from '../protocol'
import {
  EXEMPLE,
  EXEMPLE_LARGE,
  OFFER_A,
  OFFER_B,
  OFFER_UUID,
  useOfferRetailers,
} from './offer-retailer'

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

function pathOf(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof ProtocolError) return error.path
    throw error
  }
  return '(accepté)'
}

/** Un plan de l'enseigne `retailer` avec un seul produit connu, portant `extra`. */
function plan(retailer: string, host: string, extra: object = {}) {
  return {
    v: 1,
    type: 'plan',
    runId: RUN_ID,
    retailer,
    store: { id: '000123', host },
    returnPath: '/drive/retour',
    lines: [
      {
        ingredientSlug: 'farine',
        name: 'Farine',
        status: 'KNOWN',
        products: [
          {
            id: '1000001',
            label: 'Farine de test 1 kg',
            packs: 1,
            packsStatus: 'COMPUTED',
            ...extra,
          },
          { id: '1000002', label: 'Farine de test 500 g' },
        ],
      },
    ],
  }
}

const leclercPlan = (extra: object = {}) => plan('leclerc', 'fd0-courses.leclercdrive.fr', extra)
const examplePlan = (extra: object = {}) => plan(EXEMPLE.id, EXEMPLE.host, extra)

/** Un résultat avec un produit choisi portant `extra`. */
function chosen(extra: object = {}) {
  return {
    v: 1,
    type: 'result',
    runId: RUN_ID,
    agentVersion: '1.0.0',
    outcome: 'completed',
    store: { id: '000123' },
    lines: [
      {
        ingredientSlug: 'farine',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '1000001', label: 'Farine de test 1 kg', ...extra },
      },
    ],
  }
}

describe('Leclerc n’a pas d’offre : le protocole d’avant ne change pas', () => {
  it('aucune enseigne du registre n’a d’offre, donc un résultat ne peut en porter aucune', () => {
    expect(STORES.leclerc.offerId).toBeNull()
    expect(anyOfferId()).toBeNull()
  })

  it('refuse offerId dans un plan de Leclerc, même bien formé, à son chemin', () => {
    expect(pathOf(() => validatePlan(leclercPlan({ offerId: OFFER_A })))).toBe(
      'lines[0].products[0].offerId',
    )
  })

  it('refuse offerId dans un résultat tant qu’aucune enseigne n’a d’offre', () => {
    expect(pathOf(() => validateResult(chosen({ offerId: OFFER_A })))).toBe(
      'lines[0].product.offerId',
    )
  })

  it('un plan et un résultat sans offerId repartent octet pour octet', () => {
    for (const message of [leclercPlan(), chosen()]) {
      const before = encodeMessage(message)
      const validated = message.type === 'plan' ? validatePlan(message) : validateResult(message)

      expect(encodeMessage(validated)).toBe(before)
      expect(JSON.stringify(decodeMessage(before))).not.toContain('offerId')
    }
  })
})

describe('une enseigne à offres (fictive)', () => {
  useOfferRetailers()

  it('a une forme d’offre, l’union de ces formes sert à un résultat', () => {
    expect(STORES[EXEMPLE.id as 'leclerc'].offerId).toBe(OFFER_UUID)
    expect(anyOfferId()?.test(OFFER_A)).toBe(true)
  })

  describe('dans un plan', () => {
    it('accepte l’offre d’un produit connu, et un plan qui n’en a pas', () => {
      expect(validatePlan(examplePlan({ offerId: OFFER_A }))).toBeTruthy()
      expect(validatePlan(examplePlan())).toBeTruthy()
    })

    it('accepte une offre pour chaque produit d’une ligne, de rang 1 à 5', () => {
      const message = examplePlan({ offerId: OFFER_A })
      const line = message.lines[0]!
      line.products = [1, 2, 3, 4, 5].map((rank) => ({
        id: `100000${rank}`,
        label: `Produit ${rank}`,
        offerId: rank % 2 === 0 ? OFFER_B : OFFER_A,
      }))

      expect(validatePlan(message)).toBeTruthy()
    })

    it.each([
      ['une offre qui n’a pas la forme de l’enseigne', 'ABC-123'],
      ['une offre en majuscules', OFFER_A.toUpperCase()],
      ['une offre vide', ''],
      ['une offre nulle', null],
      ['une offre numérique', 12345],
      ['une offre en liste', [OFFER_A]],
      ['une offre avec un espace', `${OFFER_A} `],
    ])('refuse %s', (_name, offerId) => {
      expect(pathOf(() => validatePlan(examplePlan({ offerId })))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it('ne l’accepte ni sur un produit refusé ni sur un produit remplacé', () => {
      const rejected = examplePlan()
      Object.assign(rejected.lines[0]!, {
        rejected: [{ id: '1000009', label: 'Non', offerId: OFFER_A }],
      })
      const replaces = examplePlan()
      Object.assign(replaces.lines[0]!, {
        replaces: { id: '1000009', label: 'Non', offerId: OFFER_A },
      })

      expect(pathOf(() => validatePlan(rejected))).toBe('lines[0].rejected[0].offerId')
      expect(pathOf(() => validatePlan(replaces))).toBe('lines[0].replaces.offerId')
    })

    it('juge la forme d’après l’enseigne du MESSAGE, pas d’après une autre', () => {
      // Un mot de lettres est une offre de « exemple-large », jamais de « exemple »
      expect(
        validatePlan(plan(EXEMPLE_LARGE.id, EXEMPLE_LARGE.host, { offerId: 'abcdef' })),
      ).toBeTruthy()
      expect(pathOf(() => validatePlan(examplePlan({ offerId: 'abcdef' })))).toBe(
        'lines[0].products[0].offerId',
      )
      expect(pathOf(() => validatePlan(leclercPlan({ offerId: 'abcdef' })))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it(`borne l’offre à ${LIMITS.offerId} caractères`, () => {
      const large = (offerId: string) => plan(EXEMPLE_LARGE.id, EXEMPLE_LARGE.host, { offerId })

      expect(validatePlan(large('a'.repeat(LIMITS.offerId)))).toBeTruthy()
      expect(pathOf(() => validatePlan(large('a'.repeat(LIMITS.offerId + 1))))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it('un plan chargé d’offres reste sous la limite des 64 Ko, 100 lignes de 5 produits comprises', () => {
      const message = examplePlan()
      message.lines = Array.from({ length: 100 }, (_unused, line) => ({
        ingredientSlug: `ingredient-${line}`,
        name: 'Ingrédient',
        status: 'KNOWN',
        products: Array.from({ length: 5 }, (_u, rank) => ({
          id: String(1_000_000 + line * 10 + rank),
          label: 'Produit',
          offerId: OFFER_A,
        })),
      })) as never

      expect(() => encodeMessage(validatePlan(message))).not.toThrow()
    })

    it('ne change rien à un setup', () => {
      const setup = { ...examplePlan(), type: 'setup' } as Record<string, unknown>
      delete setup.lines

      expect(validatePlan(setup)).toBeTruthy()
    })
  })

  describe('dans un résultat', () => {
    it('accepte l’offre du produit choisi, avec les autres faits du produit', () => {
      expect(validateResult(chosen({ offerId: OFFER_A }))).toBeTruthy()
      expect(
        validateResult(
          chosen({ offerId: OFFER_B, rayonId: 41, familyId: 410, price: { cents: 199 } }),
        ),
      ).toBeTruthy()
      expect(validateResult(chosen())).toBeTruthy()
    })

    it.each([
      ['une offre qui n’a la forme d’aucune enseigne', 'ABC-123'],
      ['une offre vide', ''],
      ['une offre nulle', null],
      ['une offre numérique', 42],
      ['une offre de 41 caractères', 'a'.repeat(LIMITS.offerId + 1)],
    ])('refuse %s', (_name, offerId) => {
      expect(pathOf(() => validateResult(chosen({ offerId })))).toBe('lines[0].product.offerId')
    })

    it('ne l’accepte jamais sur un produit refusé', () => {
      const result = chosen()
      Object.assign(result.lines[0]!, {
        rejected: [{ id: '1000009', label: 'Non', offerId: OFFER_A }],
      })

      expect(pathOf(() => validateResult(result))).toBe('lines[0].rejected[0].offerId')
    })

    it('ne l’accepte pas sur une ligne ajoutée (le produit est connu de Repas)', () => {
      const added = chosen()
      added.lines = [
        {
          ingredientSlug: 'farine',
          outcome: 'ADDED',
          productId: '1000001',
          quantity: 1,
          usedRank: 1,
          offerId: OFFER_A,
        },
      ] as never

      expect(pathOf(() => validateResult(added))).toBe('lines[0].offerId')
    })
  })
})

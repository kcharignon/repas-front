// @vitest-environment node
// `offerId`, l'identifiant d'offre FACULTATIF d'un produit (DRV-722) : dans le produit connu d'un plan et dans le produit choisi d'un résultat.
// Sa forme est celle de l'enseigne du message ; une enseigne sans offre (Leclerc) l'interdit. Auchan (DRV-727) a des offres en UUID : ses tests visent son
// entrée réelle du registre. Une enseigne fictive à offre large (`offer-retailer.ts`) ne sert qu'à éprouver la borne de 40 caractères et le jugement par
// l'enseigne du message.
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
  EXEMPLE_LARGE,
  OFFER_A,
  OFFER_B,
  OFFER_UUID,
  useLargeOfferRetailer,
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

/** Un identifiant de produit d'Auchan (un UUID inventé) : le rang `n` de 1 à 99999999. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** Le magasin d'Auchan : un UUID inventé, jamais une adresse. */
const AUCHAN_STORE = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'

/** Un plan de l'enseigne `retailer` avec un seul produit connu, portant `extra` ; `ids` : les identifiants de produit de sa forme. */
function plan(
  retailer: string,
  store: { id: string; host: string },
  ids: [string, string],
  extra: object = {},
) {
  return {
    v: 1,
    type: 'plan',
    runId: RUN_ID,
    retailer,
    store,
    returnPath: '/drive/retour',
    lines: [
      {
        ingredientSlug: 'farine',
        name: 'Farine',
        status: 'KNOWN',
        products: [
          {
            id: ids[0],
            label: 'Farine de test 1 kg',
            packs: 1,
            packsStatus: 'COMPUTED',
            ...extra,
          },
          { id: ids[1], label: 'Farine de test 500 g' },
        ],
      },
    ],
  }
}

const leclercPlan = (extra: object = {}) =>
  plan(
    'leclerc',
    { id: '000123', host: 'fd0-courses.leclercdrive.fr' },
    ['1000001', '1000002'],
    extra,
  )
const auchanPlan = (extra: object = {}) =>
  plan('auchan', { id: AUCHAN_STORE, host: 'www.auchan.fr' }, [uuid(1), uuid(2)], extra)
const largePlan = (extra: object = {}) =>
  plan(EXEMPLE_LARGE.id, { id: '000123', host: EXEMPLE_LARGE.host }, ['1000001', '1000002'], extra)

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
  it('Leclerc n’a pas d’offre ; la forme d’un résultat est celle d’Auchan, la seule enseigne à offres', () => {
    expect(STORES.leclerc.offerId).toBeNull()
    expect(anyOfferId()?.test(OFFER_A)).toBe(true)
    expect(anyOfferId()?.test('ABC-123')).toBe(false)
  })

  it('refuse offerId dans un plan de Leclerc, même bien formé, à son chemin', () => {
    expect(pathOf(() => validatePlan(leclercPlan({ offerId: OFFER_A })))).toBe(
      'lines[0].products[0].offerId',
    )
  })

  it('refuse offerId dans un résultat quand il n’a la forme d’aucune enseigne à offres', () => {
    expect(pathOf(() => validateResult(chosen({ offerId: '1000001' })))).toBe(
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

describe('Auchan, une enseigne à offres', () => {
  useLargeOfferRetailer()

  it('a une forme d’offre, l’union de ces formes sert à un résultat', () => {
    expect(STORES.auchan.offerId).toStrictEqual(OFFER_UUID)
    expect(anyOfferId()?.test(OFFER_A)).toBe(true)
  })

  describe('dans un plan', () => {
    it('accepte l’offre d’un produit connu, et un plan qui n’en a pas', () => {
      expect(validatePlan(auchanPlan({ offerId: OFFER_A }))).toBeTruthy()
      expect(validatePlan(auchanPlan())).toBeTruthy()
    })

    it('accepte une offre pour chaque produit d’une ligne, de rang 1 à 5', () => {
      const message = auchanPlan({ offerId: OFFER_A })
      const line = message.lines[0]!
      line.products = [1, 2, 3, 4, 5].map((rank) => ({
        id: uuid(rank),
        label: `Produit ${rank}`,
        offerId: rank % 2 === 0 ? OFFER_B : OFFER_A,
      }))

      expect(validatePlan(message)).toBeTruthy()
    })

    it.each([
      ['une offre qui n’a pas la forme de l’enseigne', 'ABC-123'],
      ['une offre numérique en chaîne (la forme de Leclerc)', '1000001'],
      ['une offre en majuscules', OFFER_A.toUpperCase()],
      ['une offre vide', ''],
      ['une offre nulle', null],
      ['une offre numérique', 12345],
      ['une offre en liste', [OFFER_A]],
      ['une offre avec un espace', `${OFFER_A} `],
    ])('refuse %s', (_name, offerId) => {
      expect(pathOf(() => validatePlan(auchanPlan({ offerId })))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it('ne l’accepte ni sur un produit refusé ni sur un produit remplacé', () => {
      const rejected = auchanPlan()
      Object.assign(rejected.lines[0]!, {
        rejected: [{ id: uuid(9), label: 'Non', offerId: OFFER_A }],
      })
      const replaces = auchanPlan()
      Object.assign(replaces.lines[0]!, {
        replaces: { id: uuid(9), label: 'Non', offerId: OFFER_A },
      })

      expect(pathOf(() => validatePlan(rejected))).toBe('lines[0].rejected[0].offerId')
      expect(pathOf(() => validatePlan(replaces))).toBe('lines[0].replaces.offerId')
    })

    it('juge la forme d’après l’enseigne du MESSAGE, pas d’après une autre', () => {
      // Un mot de lettres est une offre de « exemple-large » (fictive), jamais d’Auchan
      expect(validatePlan(largePlan({ offerId: 'abcdef' }))).toBeTruthy()
      expect(pathOf(() => validatePlan(auchanPlan({ offerId: 'abcdef' })))).toBe(
        'lines[0].products[0].offerId',
      )
      expect(pathOf(() => validatePlan(leclercPlan({ offerId: 'abcdef' })))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it(`borne l’offre à ${LIMITS.offerId} caractères`, () => {
      const large = (offerId: string) => largePlan({ offerId })

      expect(validatePlan(large('a'.repeat(LIMITS.offerId)))).toBeTruthy()
      expect(pathOf(() => validatePlan(large('a'.repeat(LIMITS.offerId + 1))))).toBe(
        'lines[0].products[0].offerId',
      )
    })

    it('un plan chargé d’offres reste sous la limite des 64 Ko, 100 lignes de 5 produits comprises', () => {
      const message = auchanPlan()
      message.lines = Array.from({ length: 100 }, (_unused, line) => ({
        ingredientSlug: `ingredient-${line}`,
        name: 'Ingrédient',
        status: 'KNOWN',
        products: Array.from({ length: 5 }, (_u, rank) => ({
          id: uuid(1_000_000 + line * 10 + rank),
          label: 'Produit',
          offerId: OFFER_A,
        })),
      })) as never

      expect(() => encodeMessage(validatePlan(message))).not.toThrow()
    })

    it('ne change rien à un setup', () => {
      const setup = { ...auchanPlan(), type: 'setup' } as Record<string, unknown>
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

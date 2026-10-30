// @vitest-environment node
// Le registre de l'agent et le protocole contre le contrat des enseignes du back (DRV-704) : `retailers.sample.json`, recopié du back par
// `make samples-update`, dit les identifiants, les noms, la forme de l'adresse d'un magasin et celle d'un produit. Un identifiant, un nom ou une
// règle d'adresse qui n'est pas le même ici et au back fait échouer ce test. Le contrat peut gagner des champs (additifs) : seuls ceux que l'agent
// connaît sont comparés. Depuis DRV-727 le contrat a deux entrées (Leclerc et Auchan, dont le magasin est un identifiant explicite, pas une adresse).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  decodeMessage,
  encodeMessage,
  ProtocolError,
  RETAILER_IDS,
  validatePlan,
  validateResult,
  type PlanMessage,
} from '../protocol'
import { RETAILERS } from '../src/retailers'
import { home, known, plan, product } from './flow-helpers'

interface ContractRetailer {
  id: string
  name: string
  nameDe: string
  storeAddressPattern: string
  storeAddressExample: string
  productIdPattern: string
  storeIdSource: 'URL' | 'EXPLICIT'
  storeIdPattern: string
  offerIdPattern: string | null
}

const path = fileURLToPath(new URL('../fixtures/contract/retailers.sample.json', import.meta.url))
const contract = (JSON.parse(readFileSync(path, 'utf8')) as { retailers: ContractRetailer[] })
  .retailers

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

/** Des identifiants de test, de toutes les formes que le contrat sait distinguer (des entiers de longueurs variées, des UUID bons et mauvais). */
const SAMPLE_IDS = [
  '1',
  '123456',
  '123456789012',
  '1234567890123',
  'a1',
  '',
  '12 3',
  '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
  '0B5F8A2E-3C1D-4E7F-9A6B-123456789ABC',
  '0b5f8a2e-3c1d-4e7f-9a6b-123456789ab',
  '0b5f8a2e3c1d4e7f9a6b123456789abc',
]

/** Un plan de cette enseigne, sur ce magasin et avec ce produit : le protocole le juge. */
function planFor(
  retailer: string,
  store: { id: string; host: string },
  productId: string,
  extra: object = {},
) {
  return {
    ...plan([known('farine', [{ ...product(productId), ...extra }]), home('sel')], RUN_ID),
    retailer,
    store,
  } as PlanMessage
}

/** Le premier identifiant de test qui a la forme `pattern` du contrat. */
function sample(pattern: string): string {
  const found = SAMPLE_IDS.find((id) => new RegExp(pattern).test(id))
  if (found === undefined) throw new Error('aucun identifiant de test pour ' + pattern)
  return found
}

/** Le magasin de l'exemple de cette enseigne : lu dans l'adresse (`URL`) ou, `EXPLICIT`, un identifiant de la forme du contrat. */
function storeOf(retailer: ContractRetailer): { id: string; host: string } {
  const host = new URL(retailer.storeAddressExample).hostname
  if (retailer.storeIdSource === 'EXPLICIT') return { id: sample(retailer.storeIdPattern), host }
  const found = new RegExp(retailer.storeAddressPattern).exec(retailer.storeAddressExample)
  return { id: found?.[1] ?? '', host }
}

describe('le registre de l’agent et le contrat des enseignes du back', () => {
  it('a les mêmes enseignes, dans le même ordre, avec les mêmes noms', () => {
    expect(RETAILERS.map(({ id, name, nameDe }) => ({ id, name, nameDe }))).toEqual(
      contract.map(({ id, name, nameDe }) => ({ id, name, nameDe })),
    )
  })

  it('et le protocole connaît exactement ces identifiants', () => {
    expect([...RETAILER_IDS]).toEqual(contract.map(({ id }) => id))
  })

  describe.each(contract)('$id', (retailer) => {
    const example = new URL(retailer.storeAddressExample)
    const found = new RegExp(retailer.storeAddressPattern).exec(retailer.storeAddressExample)
    const entry = RETAILERS.find(({ id }) => id === retailer.id)
    const store = storeOf(retailer)
    const productId = sample(retailer.productIdPattern)

    it('l’exemple d’adresse suit le motif du contrat', () => {
      expect(found).not.toBeNull()
    })

    it('reconnaît l’hôte de l’exemple, et seulement les siens', () => {
      expect(entry?.matchesHost(example.hostname)).toBe(true)
      expect(entry?.matchesHost('exemple.invalid')).toBe(false)
      expect(entry?.matchesHost(`${example.hostname}.exemple.invalid`)).toBe(false)
    })

    it('accepte pour magasin celui de l’exemple (hôte et identifiant) et refuse un autre hôte', () => {
      expect(() => validatePlan(planFor(retailer.id, store, productId))).not.toThrow()
      expect(() =>
        validatePlan(planFor(retailer.id, { ...store, host: 'exemple.invalid' }, productId)),
      ).toThrow(ProtocolError)
    })

    it('juge un identifiant de magasin comme le contrat (`storeIdPattern`)', () => {
      const pattern = new RegExp(retailer.storeIdPattern)
      // Le protocole de Leclerc s'arrête à 12 chiffres, le contrat en admet 20 (DRV-720) : un écart connu, plus strict côté agent, qui ne laisse rien passer de trop.
      const ids = SAMPLE_IDS.filter((id) => retailer.storeIdSource !== 'URL' || id.length <= 12)
      const accepted = (id: string) => {
        try {
          validatePlan(planFor(retailer.id, { ...store, id }, productId))
          return true
        } catch {
          return false
        }
      }

      expect(ids.map(accepted)).toEqual(ids.map((id) => pattern.test(id)))
    })

    it('ne lit le magasin dans l’adresse que si le contrat le dit (`storeIdSource`)', () => {
      // « URL » : l’adresse porte l’identifiant (un groupe du motif) ; « EXPLICIT » : elle n’en porte aucun, c’est une constante de l’enseigne
      expect(found?.length ?? 0).toBe(retailer.storeIdSource === 'URL' ? 3 : 1)
    })

    it('accepte pour adresse de base d’un magasin celle de l’exemple, et refuse un autre magasin', () => {
      const result = (baseUrl: string) =>
        validateResult({
          v: 1,
          type: 'setup-result',
          runId: RUN_ID,
          agentVersion: '1.0.0',
          store: { ...store, baseUrl, label: null },
        })

      expect(() => result(retailer.storeAddressExample)).not.toThrow()
      expect(() => result(`https://${example.hostname}/autre-page`)).toThrow(ProtocolError)
      expect(() =>
        result(retailer.storeAddressExample.replace(example.hostname, 'x.invalid')),
      ).toThrow(ProtocolError)
    })

    it('juge un identifiant de produit comme le contrat', () => {
      const pattern = new RegExp(retailer.productIdPattern)
      const accepted = (id: string) => {
        try {
          validatePlan(planFor(retailer.id, store, id))
          return true
        } catch {
          return false
        }
      }

      expect(SAMPLE_IDS.map(accepted)).toEqual(SAMPLE_IDS.map((id) => pattern.test(id)))
    })

    it('juge un identifiant d’offre comme le contrat (`offerIdPattern`, `null` : aucune offre, la clé est refusée)', () => {
      const pattern = retailer.offerIdPattern === null ? null : new RegExp(retailer.offerIdPattern)
      const accepted = (offerId: string) => {
        try {
          validatePlan(planFor(retailer.id, store, productId, { offerId }))
          return true
        } catch {
          return false
        }
      }

      expect(SAMPLE_IDS.map(accepted)).toEqual(SAMPLE_IDS.map((id) => pattern?.test(id) ?? false))
    })
  })

  it('un message encodé garde son enseigne', () => {
    for (const retailer of contract) {
      const { id, productIdPattern } = retailer
      const message = planFor(id, storeOf(retailer), sample(productIdPattern))
      expect(validatePlan(decodeMessage(encodeMessage(message))).retailer).toBe(id)
    }
  })
})

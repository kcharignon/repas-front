// @vitest-environment node
// Le registre de l'agent et le protocole contre le contrat des enseignes du back (DRV-704) : `retailers.sample.json`, recopié du back par
// `make samples-update`, dit les identifiants, les noms, la forme de l'adresse d'un magasin et celle d'un produit. Un identifiant, un nom ou une
// règle d'adresse qui n'est pas le même ici et au back fait échouer ce test. Le contrat peut gagner des champs (additifs) : seuls ceux que l'agent
// connaît sont comparés.
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
}

const path = fileURLToPath(new URL('../fixtures/contract/retailers.sample.json', import.meta.url))
const contract = (JSON.parse(readFileSync(path, 'utf8')) as { retailers: ContractRetailer[] })
  .retailers

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

/** Un plan de cette enseigne, sur ce magasin et avec ce produit : le protocole le juge. */
function planFor(retailer: string, store: { id: string; host: string }, productId: string) {
  return {
    ...plan([known('farine', [product(productId)]), home('sel')], RUN_ID),
    retailer,
    store,
  } as PlanMessage
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

    it('l’exemple d’adresse suit le motif du contrat', () => {
      expect(found).not.toBeNull()
    })

    it('reconnaît l’hôte de l’exemple, et seulement les siens', () => {
      expect(entry?.matchesHost(example.hostname)).toBe(true)
      expect(entry?.matchesHost('exemple.invalid')).toBe(false)
      expect(entry?.matchesHost(`${example.hostname}.exemple.invalid`)).toBe(false)
    })

    it('accepte pour magasin celui de l’exemple (hôte et identifiant) et refuse un autre hôte', () => {
      const store = { id: found?.[1] ?? '', host: example.hostname }

      expect(() => validatePlan(planFor(retailer.id, store, '1000001'))).not.toThrow()
      expect(() =>
        validatePlan(planFor(retailer.id, { ...store, host: 'exemple.invalid' }, '1000001')),
      ).toThrow(ProtocolError)
    })

    it('accepte pour adresse de base d’un magasin celle de l’exemple, et refuse un autre magasin', () => {
      const store = { id: found?.[1] ?? '', host: example.hostname }
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
      const store = { id: found?.[1] ?? '', host: example.hostname }

      const ids = ['1', '123456', '123456789012', '1234567890123', 'a1', '', '12 3']
      const accepted = (id: string) => {
        try {
          validatePlan(planFor(retailer.id, store, id))
          return true
        } catch {
          return false
        }
      }

      expect(ids.map(accepted)).toEqual(ids.map((id) => pattern.test(id)))
    })
  })

  it('un message encodé garde son enseigne', () => {
    for (const { id, storeAddressExample } of contract) {
      const host = new URL(storeAddressExample).hostname
      const message = planFor(id, { id: '123456', host }, '1000001')
      expect(validatePlan(decodeMessage(encodeMessage(message))).retailer).toBe(id)
    }
  })
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'

import { DEFAULT_RETAILER, RETAILERS, finalizeLink, retailerOf, retailerParams } from '../retailers'
import type { Retailer } from '../retailers'
import { parseStoreAddress } from '../storeAddress'
import { translateFor } from './retailerT'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

// Les champs que le web connaît ; le contrat peut en gagner d'autres (additifs), ils sont tolérés.
const CONTRACT_FIELDS = [
  'id',
  'name',
  'nameDe',
  'storeAddressPattern',
  'storeAddressExample',
  'productIdPattern',
] as const

const contract = JSON.parse(
  readFileSync(join(root, 'drive-agent', 'fixtures', 'contract', 'retailers.sample.json'), 'utf8'),
) as { retailers: Record<string, unknown>[] }

// Une enseigne fictive : prouve que les textes n'ont rien de propre à Leclerc.
const fictive: Retailer = {
  ...DEFAULT_RETAILER,
  name: 'Marché-Test',
  nameDe: 'd’Exemple',
  appName: 'Drive Exemple',
}

describe('le registre des enseignes du web', () => {
  it('concorde avec le contrat commun des couches', () => {
    expect(RETAILERS.map((retailer) => retailer.id)).toEqual(
      contract.retailers.map((entry) => entry.id),
    )
    for (const entry of contract.retailers) {
      const retailer = retailerOf(entry.id as string)
      for (const field of CONTRACT_FIELDS) expect(retailer[field]).toBe(entry[field])
    }
  })

  it('lit l’exemple d’adresse du contrat comme le motif du contrat', () => {
    for (const retailer of RETAILERS) {
      expect(new RegExp(retailer.storeAddressPattern).test(retailer.storeAddressExample)).toBe(true)
      expect(parseStoreAddress(retailer.storeAddressExample, retailer)?.baseUrl).toBe(
        retailer.storeAddressExample,
      )
    }
  })

  it('repli sur l’enseigne par défaut pour un identifiant inconnu', () => {
    expect(retailerOf('inconnue')).toBe(DEFAULT_RETAILER)
    expect(retailerOf(undefined)).toBe(DEFAULT_RETAILER)
  })

  it('donne l’accueil du drive hors application et l’adresse du magasin dans l’application', () => {
    expect(finalizeLink('https://x-test.leclercdrive.fr/magasin-123456-123456')).toBe(
      DEFAULT_RETAILER.homeUrl,
    )
    expect(
      finalizeLink('https://x-test.leclercdrive.fr/magasin-123456-123456-Ville-Test', true),
    ).toBe('https://x-test.leclercdrive.fr/magasin-123456-123456')
  })

  it('dit le nom, son élision et le nom de l’application par paramètre', () => {
    const t = translateFor(fictive)

    expect(t('driveReturn.basketReady')).toBe(
      'Ton panier est prêt. Retrouve-le dans l’appli Drive Exemple.',
    )
    expect(t('driveReturn.errorCode.UNSUPPORTED_PAGE.happened')).toBe(
      'Repas ne peut pas travailler sur cette page d’Exemple.',
    )
    expect(t('driveAccount.appMenuHelp')).toBe('Version, mode d’emploi et déconnexion d’Exemple.')
    expect(t('driveSend.summary.allNew', {}, 3)).toBe('tous sont à choisir sur Marché-Test')
    expect(i18n.global.t('driveAccount.appMenuHelp', retailerParams(DEFAULT_RETAILER))).toBe(
      'Version, mode d’emploi et déconnexion de Leclerc.',
    )
  })
})

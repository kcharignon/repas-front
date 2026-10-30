// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'

import fr from '@/i18n/fr'

import {
  DEFAULT_RETAILER,
  RETAILERS,
  appServes,
  finalizeLink,
  retailerOf,
  retailerParams,
} from '../retailers'
import type { Retailer } from '../retailers'
import { parseStoreAddress, readExplicitStore } from '../storeAddress'
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
  'storeIdSource',
  'storeIdPattern',
  'offerIdPattern',
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
      // Le magasin se lit dans l'adresse (`URL`) ou n'y est pas (`EXPLICIT` : l'adresse est une constante, aucune adresse ne dit le magasin)
      expect(parseStoreAddress(retailer.storeAddressExample, retailer)?.baseUrl).toBe(
        retailer.storeIdSource === 'URL' ? retailer.storeAddressExample : undefined,
      )
    }
  })

  it('compte deux enseignes dont Leclerc d’abord : l’enseigne par défaut ne change pas', () => {
    expect(RETAILERS.map((retailer) => retailer.id)).toEqual(['leclerc', 'auchan'])
    expect(DEFAULT_RETAILER.id).toBe('leclerc')
    expect(retailerOf(undefined).id).toBe('leclerc')
    expect(retailerOf('auchan').id).toBe('auchan')
  })

  describe('Auchan (DRV-727)', () => {
    const auchan = retailerOf('auchan')

    it('a son nom, son nom avec « de » élidé, son accueil et un magasin explicite', () => {
      expect(auchan).toMatchObject({
        name: 'Auchan',
        nameDe: 'd’Auchan',
        homeUrl: 'https://www.auchan.fr/courses',
        storeIdSource: 'EXPLICIT',
      })
      expect(retailerOf('leclerc')).toMatchObject({ storeIdSource: 'URL', nameDe: 'de Leclerc' })
    })

    it('ne lit jamais le magasin dans une adresse, même celle du site', () => {
      for (const address of [
        auchan.storeAddressExample,
        'https://www.auchan.fr/courses',
        'https://www.auchan.fr/magasin-123456-123456',
        retailerOf('leclerc').storeAddressExample,
      ])
        expect(parseStoreAddress(address, auchan)).toBeNull()
      expect(auchan.readStore(new URL(auchan.storeAddressExample))).toBeNull()
    })

    it('n’accepte pour magasin qu’un UUID lu par l’application et l’adresse constante du site', () => {
      const id = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'
      expect(readExplicitStore(id, 'https://www.auchan.fr/', auchan)).toEqual({
        id,
        baseUrl: 'https://www.auchan.fr/',
      })
      for (const [wrongId, wrongBase] of [
        ['123456', 'https://www.auchan.fr/'],
        [id.toUpperCase(), 'https://www.auchan.fr/'],
        [id, 'https://compte.auchan.fr/'],
        [id, 'http://www.auchan.fr/'],
        [id, 'https://www.auchan.fr/courses'],
        [id, 'https://www.auchan.fr.exemple.invalid/'],
        [id, 'https://www.auchan.fr'],
      ] as const)
        expect(readExplicitStore(wrongId, wrongBase, auchan)).toBeNull()
      // Un magasin dont l'identifiant est dans l'adresse (Leclerc) ne passe jamais par là
      expect(
        readExplicitStore(
          '123456',
          retailerOf('leclerc').storeAddressExample,
          retailerOf('leclerc'),
        ),
      ).toBeNull()
    })

    it('« Finaliser » mène à l’accueil des courses, dans l’application comme dans un navigateur', () => {
      expect(finalizeLink('https://www.auchan.fr/', true, auchan)).toBe(auchan.homeUrl)
      expect(finalizeLink('https://www.auchan.fr/', false, auchan)).toBe(auchan.homeUrl)
      expect(finalizeLink(null, true, auchan)).toBeNull()
    })

    it('dit son nom, son élision et le nom de son application par paramètre, sans un mot de Leclerc', () => {
      const t = translateFor(auchan)

      expect(t('driveReturn.basketReady')).toBe(
        'Ton panier est prêt. Retrouve-le dans l’appli Auchan.',
      )
      expect(t('driveReturn.errorCode.UNSUPPORTED_PAGE.happened')).toBe(
        'Repas ne peut pas travailler sur cette page d’Auchan.',
      )
      expect(t('driveAccount.appMenuHelp')).toBe('Version, mode d’emploi et déconnexion d’Auchan.')
      expect(t('driveSend.summary.allNew', {}, 3)).toBe('tous sont à choisir sur Auchan')
    })

    it('n’écrit « Leclerc » dans aucun texte du drive rendu pour elle, hors de la section de Leclerc', () => {
      const t = translateFor(auchan)
      const keys: string[] = []
      const walk = (node: unknown, path: string) => {
        if (typeof node === 'string') keys.push(path)
        else if (typeof node === 'object' && node !== null)
          for (const [name, child] of Object.entries(node))
            walk(child, path === '' ? name : `${path}.${name}`)
      }
      for (const group of [
        'driveTerms',
        'driveSend',
        'driveReturn',
        'driveSettings',
        'driveAccount',
      ])
        walk((fr as unknown as Record<string, unknown>)[group], group)

      const leaking = keys
        .filter((key) => !key.startsWith('driveTerms.retailers.'))
        // Les textes à nombre (« | ») se rendent avec un nombre
        .filter((key) => /leclerc/i.test(t(key, { count: 2, total: 3, name: 'x', tail: '123' }, 2)))

      expect(leaking).toEqual([])
    })
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

  it('une application qui n’annonce rien ne sert que le drive d’avant (DRV-707, DRV-709)', () => {
    expect(appServes(undefined, DEFAULT_RETAILER.id)).toBe(true)
    expect(appServes(undefined, 'auchan')).toBe(false)
    expect(appServes(['leclerc', 'auchan'], 'auchan')).toBe(true)
    expect(appServes(['auchan'], 'leclerc')).toBe(false)
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

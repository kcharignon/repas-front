// @vitest-environment node
// Le magasin lu dans l'adresse de la page (DRV-303). Numéros et noms INVENTÉS.
import { describe, expect, it } from 'vitest'

import { RetailerError } from '../src/retailers'
import { usesMobileProtocol } from '../src/leclerc/mobile'
import {
  isMobileHost,
  readDeliveryPoint,
  readPageStore,
  readStorePaths,
} from '../src/leclerc/store'

const HOST = 'fd0-courses.leclercdrive.fr'

describe('readStorePaths', () => {
  it('lit l’identifiant et l’hôte, et donne l’adresse de base sans suffixe de ville', () => {
    // When
    const paths = readStorePaths({
      hostname: HOST,
      pathname: '/magasin-000123-000123-Ville-Test/recherche.aspx',
    })

    // Then
    expect(paths.store).toEqual({
      id: '000123',
      host: HOST,
      baseUrl: `https://${HOST}/magasin-000123-000123`,
      label: null,
    })
    expect(paths.pagePath).toBe('/magasin-000123-000123-Ville-Test')
    expect(paths.cartPath).toBe('/magasin-000123-000123')
  })

  it.each([
    ['sans ville', '/magasin-000123-000123/accueil.aspx'],
    ['à la racine du magasin', '/magasin-000123-000123'],
    ['avec une ville à tirets', '/magasin-000123-000123-Saint-Test-Sur-Mer/panier.aspx'],
  ])('lit une page %s', (_name, pathname) => {
    const paths = readStorePaths({ hostname: HOST, pathname })

    expect(paths.cartPath).toBe('/magasin-000123-000123')
    expect(paths.store.id).toBe('000123')
  })

  it('porte le libellé donné', () => {
    expect(
      readStorePaths({ hostname: HOST, pathname: '/magasin-1-2/x' }, 'Drive de test').store.label,
    ).toBe('Drive de test')
  })

  it.each([
    ['un hôte hors leclercdrive.fr', 'courses-test.exemple.invalid', '/magasin-000123-000123/x'],
    [
      'un faux sous-domaine',
      'fd0-courses.leclercdrive.fr.exemple.invalid',
      '/magasin-000123-000123/x',
    ],
    ['une page sans magasin', HOST, '/accueil'],
    ['un magasin au second identifiant non numérique', HOST, '/magasin-000123-abc/x'],
    ['un chemin qui ne commence pas par le magasin', HOST, '/x/magasin-000123-000123'],
  ])('refuse %s : UNSUPPORTED_PAGE', (_name, hostname, pathname) => {
    expect(() => readStorePaths({ hostname, pathname })).toThrow(RetailerError)
    expect(() => readStorePaths({ hostname, pathname })).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE' }),
    )
  })

  it('met l’hôte en minuscules', () => {
    expect(
      readStorePaths({ hostname: HOST.toUpperCase(), pathname: '/magasin-1-2/x' }).store.host,
    ).toBe(HOST)
  })
})

describe('la version mobile de Leclerc (DRV-754)', () => {
  it.each([
    ['m-courses.leclercdrive.fr'],
    ['M-COURSES.LECLERCDRIVE.FR'],
    ['m-autre.leclercdrive.fr'],
    ['m.leclercdrive.fr'],
  ])('%s est un site mobile', (host) => {
    expect(isMobileHost(host)).toBe(true)
  })

  it.each([
    ['fd0-courses.leclercdrive.fr'],
    ['fd14-courses.leclercdrive.fr'],
    ['courses-test.leclercdrive.fr'],
    ['www.leclercdrive.fr'],
    ['mm-courses.leclercdrive.fr'],
    ['xm-courses.leclercdrive.fr'],
    ['mobile-courses.leclercdrive.fr.exemple.invalid'],
    ['m-courses.exemple.invalid'],
  ])('%s n’est pas pris pour un site mobile de l’enseigne', (host) => {
    expect(isMobileHost(host)).toBe(false)
  })

  it('lit les numéros du magasin dans une adresse de m-courses (sans .aspx, ville en minuscules)', () => {
    expect(
      readPageStore({
        hostname: 'm-courses.leclercdrive.fr',
        pathname: '/magasin-206911-206911-saint-priest',
      }),
    ).toEqual({
      id: '206911',
      second: '206911',
      pagePath: '/magasin-206911-206911-saint-priest',
      cartPath: '/magasin-206911-206911',
    })
  })

  it('une page de m-courses sans adresse de magasin : PAGE_PATH ; hors leclercdrive.fr : PAGE_HOST', () => {
    expect(() => readPageStore({ hostname: 'm-courses.leclercdrive.fr', pathname: '/' })).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_PATH' }),
    )
    expect(() =>
      readPageStore({ hostname: 'm-courses.exemple.invalid', pathname: '/magasin-1-2' }),
    ).toThrow(expect.objectContaining({ cause: 'PAGE_HOST' }))
  })

  it.each([
    ['m-courses.leclercdrive.fr', '/magasin-206911-206911-saint-priest', true],
    [
      'fd8-courses.leclercdrive.fr',
      '/magasin-206911-206911-saint-priest/mobile-detail-panier.aspx',
      true,
    ],
    ['fd8-courses.leclercdrive.fr', '/magasin-206911-206911-Saint-Priest/recherche.aspx', false],
    ['www.leclercdrive.fr', '/', false],
    [
      'fd8-espace-client.leclercdrive.fr',
      '/drive/magasin-206911-206911-Saint-Priest/authentification.aspx',
      false,
    ],
  ])('%s%s parle comme la version mobile : %s', (hostname, pathname, mobile) => {
    expect(usesMobileProtocol({ hostname, pathname })).toBe(mobile)
  })

  it('un hôte hors leclercdrive.fr garde sa cause PAGE_HOST, même s’il commence par « m- »', () => {
    expect(() =>
      readStorePaths({ hostname: 'm-courses.exemple.invalid', pathname: '/magasin-1-2/x' }),
    ).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_HOST' }))
  })
})

describe('readDeliveryPoint', () => {
  const store = readStorePaths({ hostname: HOST, pathname: '/magasin-000123-000123/x' }).store

  it.each([
    ['du JSON', '{"sNoPointLivraison":"555123","autre":1}', '555123'],
    ['du JavaScript', "var sNoPointLivraison = '555123';", '555123'],
    ['un attribut', 'sNoPointLivraison: 555123', '555123'],
    [
      'un attribut HTML aux guillemets échappés',
      '<div data-c="{&quot;sNoPointLivraison&quot;:&quot;555123&quot;}">',
      '555123',
    ],
  ])('le lit dans %s', (_name, text, expected) => {
    expect(readDeliveryPoint(text, store)).toBe(expected)
  })

  it('prend à défaut l’identifiant de l’adresse', () => {
    expect(readDeliveryPoint('<html>rien</html>', store)).toBe('000123')
  })
})

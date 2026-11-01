// @vitest-environment node
// Le magasin lu dans l'adresse de la page (DRV-303). Numéros et noms INVENTÉS.
import { describe, expect, it } from 'vitest'

import { RetailerError } from '../src/retailers'
import { usesMobileProtocol } from '../src/leclerc/mobile'
import {
  cameFromNationalHome,
  cityOfPath,
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
  it.each([['m-courses.leclercdrive.fr'], ['M-COURSES.LECLERCDRIVE.FR']])(
    '%s est un site mobile',
    (host) => {
      expect(isMobileHost(host)).toBe(true)
    },
  )

  it.each([
    ['fd0-courses.leclercdrive.fr'],
    ['fd14-courses.leclercdrive.fr'],
    ['courses-test.leclercdrive.fr'],
    ['www.leclercdrive.fr'],
    ['mm-courses.leclercdrive.fr'],
    ['m-courses2.leclercdrive.fr'],
    ['m-autre.leclercdrive.fr'],
    ['m.leclercdrive.fr'],
    ['m-courses.leclercdrive.fr.attaquant.fr'],
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
        pathname: '/magasin-654321-654321-ville-test',
      }),
    ).toEqual({
      id: '654321',
      second: '654321',
      pagePath: '/magasin-654321-654321-ville-test',
      cartPath: '/magasin-654321-654321',
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
    ['m-courses.leclercdrive.fr', '/magasin-654321-654321-ville-test', true],
    [
      'fd8-courses.leclercdrive.fr',
      '/magasin-654321-654321-ville-test/mobile-detail-panier.aspx',
      true,
    ],
    ['fd8-courses.leclercdrive.fr', '/magasin-654321-654321-Ville-Test/recherche.aspx', false],
    ['www.leclercdrive.fr', '/', false],
    [
      'fd8-espace-client.leclercdrive.fr',
      '/drive/magasin-654321-654321-Ville-Test/authentification.aspx',
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

describe('cityOfPath (DRV-755) : le nom de la ville d’une adresse de magasin, pour l’écran', () => {
  it.each([
    ['/magasin-000123-000123-ville-test', 'Ville-Test'],
    ['/magasin-000123-000123-saint-priest', 'Saint-Priest'],
    ['/magasin-000123-000123-saint-maur-des-fosses.aspx', 'Saint-Maur-des-Fosses'],
    ['/magasin-000123-000123-Ville-Test/recherche.aspx', 'Ville-Test'],
    ['/magasin-000123-000123-l-isle-d-abeau', 'L-Isle-d-Abeau'],
    ['/magasin-000123-000123-bo%C3%A9', 'Boé'],
  ])('%s : %s', (path, city) => {
    expect(cityOfPath(path)).toBe(city)
  })

  it.each([
    ['sans ville', '/magasin-000123-000123'],
    ['sans ville, avec .aspx', '/magasin-000123-000123.aspx'],
    ['pas une page de magasin', '/connexion'],
    ['un échappement illisible', '/magasin-000123-000123-%E0%A4%A'],
    ['un caractère de contrôle', '/magasin-000123-000123-ville%00test'],
    ['une balise', '/magasin-000123-000123-%3Cscript%3E'],
    ['trop long', `/magasin-000123-000123-${'a'.repeat(100)}`],
  ])('%s : rien (jamais un morceau d’adresse à l’écran)', (_name, path) => {
    expect(cityOfPath(path)).toBeNull()
  })
})

describe('cameFromNationalHome (DRV-755)', () => {
  it('seul l’accueil national de l’enseigne, en https, est l’endroit où l’on choisit son magasin', () => {
    expect(cameFromNationalHome('https://www.leclercdrive.fr/')).toBe(true)
    expect(cameFromNationalHome('https://m-courses.leclercdrive.fr/')).toBe(false)
    expect(cameFromNationalHome('https://fd0-courses.leclercdrive.fr/')).toBe(false)
    expect(cameFromNationalHome('https://www.leclercdrive.fr.exemple.invalid/')).toBe(false)
    expect(cameFromNationalHome('')).toBe(false)
  })
})

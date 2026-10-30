// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { retailerOf } from '../retailers'
import { parseMobileStoreAddress, parseStoreAddress, storeTail } from '../storeAddress'

const base = 'https://exemple.leclercdrive.fr/magasin-123456-123456'

describe('adresse d’un magasin', () => {
  it('lit l’identifiant et l’adresse de base', () => {
    expect(parseStoreAddress(base)).toEqual({ id: '123456', baseUrl: base })
  })

  it('ramène une adresse collée du navigateur à l’adresse de base', () => {
    for (const pasted of [
      `  ${base}  `,
      `${base}/`,
      `${base}/accueil?a=1#haut`,
      'HTTPS://Exemple.LeclercDrive.fr/magasin-123456-123456',
    ])
      expect(parseStoreAddress(pasted)).toEqual({ id: '123456', baseUrl: base })
  })

  it('garde les zéros initiaux de l’identifiant', () => {
    expect(parseStoreAddress('https://exemple.leclercdrive.fr/magasin-001234-005678')).toEqual({
      id: '001234',
      baseUrl: 'https://exemple.leclercdrive.fr/magasin-001234-005678',
    })
  })

  it('refuse tout ce qui n’est pas l’adresse d’un magasin Leclerc Drive', () => {
    for (const wrong of [
      '',
      'pas une adresse',
      'http://exemple.leclercdrive.fr/magasin-123456-123456',
      'https://exemple.example.com/magasin-123456-123456',
      'https://leclercdrive.fr.example.com/magasin-123456-123456',
      'https://a.b.leclercdrive.fr/magasin-123456-123456',
      'https://exemple.leclercdrive.fr:8443/magasin-123456-123456',
      'https://nom:mot@exemple.leclercdrive.fr/magasin-123456-123456',
      'https://exemple.leclercdrive.fr/magasin-123456',
      'https://exemple.leclercdrive.fr/magasin-abc-123456',
      'https://exemple.leclercdrive.fr/magasin-1234567890123-1',
      'https://exemple.leclercdrive.fr/autre/magasin-123456-123456',
      'https://exemple.leclercdrive.fr/magasin-123456-123456x',
    ])
      expect([wrong, parseStoreAddress(wrong)]).toEqual([wrong, null])
  })

  it('montre les derniers chiffres de l’identifiant', () => {
    expect(storeTail('123456')).toBe('456')
    expect(storeTail('12')).toBe('12')
  })
})

describe('adresse du site mobile d’un magasin (DRV-741)', () => {
  const opened = 'https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test'

  it('reconnaît l’adresse mobile, avec ou sans .aspx, avec ou sans ville, et la ramène à l’adresse à ouvrir', () => {
    for (const [pasted, expected] of [
      [`${opened}`, opened],
      [`${opened}.aspx`, opened],
      [`  ${opened}.aspx?a=1#haut  `, opened],
      [`${opened}/accueil.aspx`, opened],
      [
        'https://m-courses.leclercdrive.fr/magasin-123456-123456',
        'https://m-courses.leclercdrive.fr/magasin-123456-123456',
      ],
      [
        'https://m-courses.leclercdrive.fr/magasin-123456-123456.aspx',
        'https://m-courses.leclercdrive.fr/magasin-123456-123456',
      ],
      ['HTTPS://M-Courses.LeclercDrive.fr/magasin-123456-123456-ville-test.aspx', opened],
      [
        'https://m.leclercdrive.fr/magasin-123456-123456-ville-test',
        'https://m.leclercdrive.fr/magasin-123456-123456-ville-test',
      ],
    ] as const)
      expect([pasted, parseMobileStoreAddress(pasted)]).toEqual([pasted, expected])
  })

  it('ne l’enregistre jamais comme un magasin : parseStoreAddress la refuse avec une ville ou un .aspx', () => {
    expect(parseStoreAddress(`${opened}.aspx`)).toBeNull()
    expect(parseStoreAddress(opened)).toBeNull()
  })

  it('refuse ce qui n’est pas l’adresse mobile d’un magasin Leclerc', () => {
    for (const wrong of [
      '',
      'pas une adresse',
      'http://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test',
      'https://m-courses.example.com/magasin-123456-123456-ville-test',
      'https://m-courses.leclercdrive.fr.example.com/magasin-123456-123456',
      'https://a.m-courses.leclercdrive.fr/magasin-123456-123456',
      'https://m-courses.leclercdrive.fr:8443/magasin-123456-123456-ville-test',
      'https://nom:mot@m-courses.leclercdrive.fr/magasin-123456-123456-ville-test',
      'https://m-courses.leclercdrive.fr/',
      'https://m-courses.leclercdrive.fr/connexion.aspx',
      'https://m-courses.leclercdrive.fr/magasin-123456',
      'https://m-courses.leclercdrive.fr/magasin-abc-123456',
      'https://m-courses.leclercdrive.fr/magasin-1234567890123-1',
      'https://m-courses.leclercdrive.fr/autre/magasin-123456-123456',
      'https://m-courses.leclercdrive.fr/magasin-123456-123456x.y',
      // une adresse du site ordinateur n'est pas une adresse mobile
      'https://fd9-courses.leclercdrive.fr/magasin-123456-123456-ville-test.aspx',
      'https://exemple.leclercdrive.fr/magasin-123456-123456',
      'https://courses.leclercdrive.fr/magasin-123456-123456',
      'https://mx.leclercdrive.fr/magasin-123456-123456',
    ])
      expect([wrong, parseMobileStoreAddress(wrong)]).toEqual([wrong, null])
  })

  it('Auchan n’a pas de site mobile à refuser', () => {
    const auchan = retailerOf('auchan')

    expect(parseMobileStoreAddress(`${opened}.aspx`, auchan)).toBeNull()
  })

  it('une adresse du site ordinateur avec une ville est refusée comme avant (aucune attente modifiée)', () => {
    expect(
      parseStoreAddress(
        'https://fd9-courses.leclercdrive.fr/magasin-123456-123456-ville-test.aspx',
      ),
    ).toBeNull()
  })
})

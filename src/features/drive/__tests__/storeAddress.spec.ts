// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parseStoreAddress, storeTail } from '../storeAddress'

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

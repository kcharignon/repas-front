import { describe, expect, it } from 'vitest'

import { checksum, fragmentUrl, makeFragment, readLabHash, verifyFragment } from '../fragment'

describe('makeFragment', () => {
  it.each([6, 16, 64])('fabrique un fragment de %s Ko exactement', (ko) => {
    // When
    const fragment = makeFragment(ko * 1024)

    // Then
    expect(fragment).toHaveLength(ko * 1024)
    expect(fragment).toMatch(/^\d+\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/)
  })

  it('est le même à chaque fois pour une taille donnée, et différent d’une taille à l’autre', () => {
    expect(makeFragment(2048)).toBe(makeFragment(2048))
    expect(makeFragment(2048).slice(-50)).not.toBe(makeFragment(4096).slice(-50))
  })

  it('refuse une taille trop petite pour son en-tête', () => {
    expect(() => makeFragment(5)).toThrow(RangeError)
  })

  it('ne contient que des caractères sûrs dans une adresse', () => {
    expect(encodeURIComponent(makeFragment(1024))).toBe(makeFragment(1024))
  })
})

describe('verifyFragment', () => {
  it('reconnaît un fragment arrivé intact', () => {
    const fragment = makeFragment(16 * 1024)

    expect(verifyFragment(fragment)).toEqual({
      kind: 'intact',
      length: 16384,
      text: '16384 caractères reçus, contenu intact',
    })
  })

  it('reconnaît un fragment tronqué', () => {
    const fragment = makeFragment(16 * 1024).slice(0, 10000)

    const verdict = verifyFragment(fragment)

    expect(verdict.kind).toBe('abîmé')
    expect(verdict.text).toContain('annoncée 16384, reçue 10000')
  })

  it('reconnaît un contenu modifié de même taille', () => {
    const fragment = makeFragment(2048)
    const altered = `${fragment.slice(0, -1)}${fragment.endsWith('A') ? 'B' : 'A'}`

    const verdict = verifyFragment(altered)

    expect(verdict.kind).toBe('abîmé')
    expect(verdict.text).toContain('contenu modifié')
  })

  it('reconnaît « ok » et une forme inconnue', () => {
    expect(verifyFragment('ok').kind).toBe('ok')
    expect(verifyFragment('n’importe quoi')).toMatchObject({ kind: 'inconnu', length: 14 })
  })
})

describe('readLabHash', () => {
  it('lit ce qui suit #lab=', () => {
    expect(readLabHash('#lab=ok')?.kind).toBe('ok')
    expect(readLabHash(`#lab=${makeFragment(6144)}`)?.kind).toBe('intact')
  })

  it('ignore un fragment qui n’est pas celui du banc', () => {
    expect(readLabHash('')).toBeNull()
    expect(readLabHash('#liste')).toBeNull()
  })
})

describe('fragmentUrl et empreinte', () => {
  it('construit l’adresse vers Repas', () => {
    const url = fragmentUrl('https://kantin.eu', 6)

    expect(url.startsWith('https://kantin.eu/#lab=6144.')).toBe(true)
    expect(url.length).toBe('https://kantin.eu/#lab='.length + 6144)
  })

  it('donne une empreinte de huit caractères hexadécimaux', () => {
    expect(checksum('')).toBe('811c9dc5')
    expect(checksum('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(checksum('abc')).not.toBe(checksum('abd'))
  })
})

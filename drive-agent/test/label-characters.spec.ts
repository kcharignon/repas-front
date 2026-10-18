// @vitest-environment node
// Les libellés lus sur le site de l'enseigne sont débarrassés, à la source, des caractères que le back refuse (revue de sécurité du back,
// défaut D2) : un seul libellé marqué ferait échouer `PUT /drive/choices` en bloc (`422 DRIVE_CHOICE_INVALID`).
import { describe, expect, it } from 'vitest'

import { cleanText } from '../src/text'
import { BACK_FORBIDDEN, BACK_FORBIDDEN_PATTERN_PHP, backAcceptsLabel } from './back-label-rules'

const LAST_CODE_POINT = 0x10ffff
const isSurrogate = (code: number) => code >= 0xd800 && code <= 0xdfff

describe('la copie des règles du back', () => {
  it('reproduit le motif du back : contrôles, séparateurs de ligne, sens de lecture, largeur nulle, marque d’ordre des octets', () => {
    expect(BACK_FORBIDDEN_PATTERN_PHP).toContain('\\x{200B}-\\x{200F}')
    expect(BACK_FORBIDDEN.test('a\u200Bb')).toBe(true)
    expect(BACK_FORBIDDEN.test('a\u202Eb')).toBe(true)
    expect(BACK_FORBIDDEN.test('a\uFEFFb')).toBe(true)
    expect(BACK_FORBIDDEN.test('a\u2028b')).toBe(true)
    expect(BACK_FORBIDDEN.test('a\u0007b')).toBe(true)
    expect(BACK_FORBIDDEN.test('Farine de blé T55 – œufs × 2 ’ 5 %')).toBe(false)
  })

  it('refuse un libellé marqué, vide ou fait d’espaces ; accepte un vrai libellé', () => {
    expect(backAcceptsLabel('Farine de blé T55 1 kg')).toBe(true)
    expect(backAcceptsLabel('Farine\u200B de blé')).toBe(false)
    expect(backAcceptsLabel('')).toBe(false)
    expect(backAcceptsLabel('\u00A0 \u3000')).toBe(false)
    expect(backAcceptsLabel('a'.repeat(256))).toBe(false)
  })
})

describe('cleanText retire tout ce que le back refuse', () => {
  it('pour chaque point de code Unicode : rien de ce que le motif du back refuse ne survit', () => {
    // Given : tous les points de code (le motif du back est recopié dans back-label-rules.ts)
    const survivors: string[] = []
    let refusedByBack = 0

    // When
    for (let code = 0; code <= LAST_CODE_POINT; code++) {
      if (isSurrogate(code)) continue
      const character = String.fromCodePoint(code)
      if (BACK_FORBIDDEN.test(character)) refusedByBack++
      if (BACK_FORBIDDEN.test(cleanText(`a${character}b`))) {
        survivors.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
      }
    }

    // Then
    expect(survivors).toEqual([])
    expect(refusedByBack, 'le motif du back doit bien refuser quelque chose').toBeGreaterThan(60)
  })

  it('ne retire rien d’autre : tout caractère que le back accepte et qui n’est pas une espace est gardé', () => {
    const changed: string[] = []

    for (let code = 0; code <= LAST_CODE_POINT; code++) {
      if (isSurrogate(code)) continue
      const character = String.fromCodePoint(code)
      if (BACK_FORBIDDEN.test(character) || /\s/u.test(character)) continue
      if (cleanText(`a${character}b`) !== `a${character}b`) {
        changed.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
      }
    }

    expect(changed).toEqual([])
  })

  it.each([
    ['NUL', '\u0000'],
    ['cloche', '\u0007'],
    ['échappement', '\u001B'],
    ['suppression', '\u007F'],
    ['contrôle C1', '\u0080'],
    ['ligne suivante', '\u0085'],
    ['marque de lettre arabe', '\u061C'],
    ['espace de largeur nulle', '\u200B'],
    ['antiliant de largeur nulle', '\u200C'],
    ['liant de largeur nulle', '\u200D'],
    ['marque gauche-droite', '\u200E'],
    ['marque droite-gauche', '\u200F'],
    ['séparateur de ligne', '\u2028'],
    ['séparateur de paragraphe', '\u2029'],
    ['encastrement gauche-droite', '\u202A'],
    ['encastrement droite-gauche', '\u202B'],
    ['fin de mise en forme directionnelle', '\u202C'],
    ['forçage gauche-droite', '\u202D'],
    ['forçage droite-gauche', '\u202E'],
    ['joint de mots', '\u2060'],
    ['isolat gauche-droite', '\u2066'],
    ['isolat droite-gauche', '\u2067'],
    ['isolat de premier fort', '\u2068'],
    ['fin d’isolat', '\u2069'],
    ['marque d’ordre des octets', '\uFEFF'],
  ])('retire %s', (_name, character) => {
    const cleaned = cleanText(`Farine${character}de blé`)

    expect(BACK_FORBIDDEN.test(cleaned)).toBe(false)
    expect(backAcceptsLabel(cleaned)).toBe(true)
  })

  it('retire une moitié de paire de substitution : elle n’est pas un texte et le JSON du back la refuserait', () => {
    expect(cleanText('Lait\uD800 entier')).toBe('Lait entier')
    expect(cleanText('Lait \uDC00entier')).toBe('Lait entier')
    expect(cleanText('Lait 🥛 entier')).toBe('Lait 🥛 entier')
  })
})

describe('cleanText garde la normalisation des espaces', () => {
  it('une largeur nulle disparaît sans laisser d’espace, une vraie espace ou un saut de ligne reste un mot séparé', () => {
    expect(cleanText('Fa\u200Brine')).toBe('Farine')
    expect(cleanText('Farine\u00A0de\u2003blé\u3000T55')).toBe('Farine de blé T55')
    expect(cleanText('Farine\nde\r\nblé\tT55\u2028bio\u2029fine\u0085')).toBe(
      'Farine de blé T55 bio fine',
    )
    expect(cleanText('  Farine \u200B  de  \uFEFF blé  ')).toBe('Farine de blé')
  })

  it('un texte fait seulement d’invisibles et d’espaces est vide', () => {
    expect(cleanText('\u200B\u200B')).toBe('')
    expect(cleanText('\uFEFF \u00A0 \u202E')).toBe('')
    expect(cleanText('')).toBe('')
  })

  it('laisse un vrai libellé intact : accents, apostrophe courbe, tiret demi-cadratin, œ, ×, %, emoji', () => {
    const label = 'Œufs bio d’une ferme – 6 × 53 g, 100 % plein air 🥚'

    expect(cleanText(label)).toBe(label)
    expect(backAcceptsLabel(cleanText(label))).toBe(true)
  })
})

// @vitest-environment node
// La recherche mémorisée (DRV-650) : le back refuse EN BLOC le lot de `PUT /drive/choices` (les produits choisis du passage avec elle) si une
// recherche n'a pas de 2 à 80 caractères (points de code) une fois les espaces réduites, ou porte un caractère de contrôle, de format ou un
// séparateur de ligne ou de paragraphe. `cleanSearchQuery` rend un texte que le back accepte, ou `null` (alors rien n'est envoyé).
import { describe, expect, it } from 'vitest'

import { cleanSearchQuery, LIMITS } from '../protocol'
import { BACK_FORBIDDEN } from './back-label-rules'

const points = (text: string) => [...text].length

/** Ce que le back vérifie d'une recherche, d'après le ticket DRV-650 : rognée, espaces réduites, 2 à 80 points de code, rien d'interdit. */
function backAcceptsSearch(text: string): boolean {
  return (
    text === text.replace(/\s+/gu, ' ').trim() &&
    points(text) >= 2 &&
    points(text) <= 80 &&
    !BACK_FORBIDDEN.test(text) &&
    !/\p{Cs}/u.test(text)
  )
}

describe('les bornes du module sont celles du back', () => {
  it('2 à 80 caractères', () => {
    expect(LIMITS.searchQueryMin).toBe(2)
    expect(LIMITS.searchQueryMax).toBe(80)
  })
})

describe('cleanSearchQuery', () => {
  it.each([
    ['un texte propre', 'céréales coussins', 'céréales coussins'],
    ['des espaces de bord', '   céréales coussins  ', 'céréales coussins'],
    ['une suite d’espaces', 'céréales    coussins', 'céréales coussins'],
    [
      'des espaces insécables (U+00A0, U+202F)',
      'céréales\u00a0\u00a0coussins\u202fchoco',
      'céréales coussins choco',
    ],
    ['un saut de ligne et une tabulation', 'céréales\ncoussins\tchoco', 'céréales coussins choco'],
    ['un séparateur de ligne et de paragraphe (Zl, Zp)', 'a\u2028b\u2029c', 'a b c'],
    ['un caractère de contrôle (Cc)', 'cé\u0000réa\u001fles', 'céréales'],
    ['un trait d’union conditionnel (Cf)', 'cé\u00adréales', 'céréales'],
    [
      'une largeur nulle et le sens de lecture (Cf)',
      'cé\u200b\u200d\u200e\u202ereales',
      'céreales',
    ],
    ['une marque d’ordre des octets (Cf)', '\ufeffcéréales', 'céréales'],
    ['un caractère de TAG (Cf)', 'céréales\u{e0041}', 'céréales'],
    ['un emoji', 'œufs 🥚 bio', 'œufs 🥚 bio'],
    ['une moitié de paire de substitution', 'céréales\ud83d', 'céréales'],
  ])('%s', (_name, text, expected) => {
    expect(cleanSearchQuery(text)).toBe(expected)
  })

  it.each([
    ['vide', ''],
    ['des espaces', '    '],
    ['un seul caractère', 'x'],
    ['un seul caractère entre espaces et invisibles', ' \u200bx\u200b '],
    ['que des invisibles', '\u200b\u00ad\ufeff'],
    ['un seul emoji', '🥚'],
  ])('moins de 2 caractères : %s donne null (rien n’est envoyé)', (_name, text) => {
    expect(cleanSearchQuery(text)).toBeNull()
  })

  it('deux caractères suffisent, deux points de code d’un emoji aussi', () => {
    expect(cleanSearchQuery('ab')).toBe('ab')
    expect(cleanSearchQuery('🥚🥚')).toBe('🥚🥚')
  })

  describe('la coupe se fait en points de code', () => {
    it.each([79, 80])('%i caractères : gardés tels quels', (count) => {
      const text = 'a'.repeat(count)
      expect(cleanSearchQuery(text)).toBe(text)
    })

    it('81 caractères : coupés à 80', () => {
      expect(cleanSearchQuery('a'.repeat(81))).toBe('a'.repeat(80))
    })

    it('un emoji qui tombe sur le 80e point de code reste entier', () => {
      // 79 lettres + un emoji (deux unités UTF-16) + une lettre : 81 points de code, 82 unités
      const cut = cleanSearchQuery(`${'a'.repeat(79)}🥚z`)
      expect(cut).toBe(`${'a'.repeat(79)}🥚`)
      expect(points(cut ?? '')).toBe(80)
      expect(JSON.parse(JSON.stringify(cut))).toBe(cut)
    })

    it('80 emojis de 4 octets : gardés entiers, le 81e est coupé', () => {
      expect(cleanSearchQuery('🥚'.repeat(81))).toBe('🥚'.repeat(80))
    })

    it('l’espace laissée par la coupe est rognée', () => {
      expect(cleanSearchQuery(`${'a'.repeat(79)} bcd`)).toBe('a'.repeat(79))
    })
  })

  it('tout ce qu’elle rend est accepté par les règles du back, y compris sur du texte hostile', () => {
    const hostile = [
      '<img src=x onerror="window.pwned=1">',
      "'; DROP TABLE drive_choice; --",
      'a\u202eb\u2066c\u2069d',
      `  ${'é'.repeat(200)}  `,
      '\u0085ligne suivante\u0085',
      'x'.repeat(79) + '\u200b' + 'y'.repeat(10),
      '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}',
    ]
    const cleaned = hostile
      .map((text) => cleanSearchQuery(text))
      .filter((text): text is string => text !== null)

    expect(cleaned.length).toBeGreaterThan(0)
    expect(cleaned.filter((text) => !backAcceptsSearch(text))).toEqual([])
  })

  it('est idempotente', () => {
    for (const text of ['  céréales\u00a0\u00a0coussins ', `${'a'.repeat(79)}🥚z`, 'a\u200bb']) {
      const once = cleanSearchQuery(text)
      expect(cleanSearchQuery(once ?? '')).toBe(once)
    }
  })
})

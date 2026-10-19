// @vitest-environment node
// Les libellés lus sur le site de l'enseigne sont débarrassés, à la source, des caractères que le back refuse (revue de sécurité du back,
// défaut D2, puis PR #198 du back qui refuse tous les caractères de format `Cf` et une liste d'invisibles) : un seul libellé marqué ferait
// échouer `PUT /drive/choices` en bloc (`422 DRIVE_CHOICE_INVALID`).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRODUCTS } from '../fake-leclerc/catalog'
import { searchPage } from '../fake-leclerc/pages'
import { labelOf } from '../src/flow'
import { toCandidate } from '../src/leclerc/candidate'
import { extractProducts, type RawProduct } from '../src/leclerc/embedded'
import { cleanText } from '../src/text'
import { BACK_FORBIDDEN, BACK_FORBIDDEN_PATTERN_PHP, backAcceptsLabel } from './back-label-rules'
import { fixture } from './leclerc-helpers'

const LAST_CODE_POINT = 0x10ffff
const isSurrogate = (code: number) => code >= 0xd800 && code <= 0xdfff
const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

/**
 * Ce que le back refuse, point de code par point de code, écrit À LA MAIN d'après la documentation de `Product.php` (PR #198), et non tiré du
 * motif : si l'agent en laisse passer un seul, le test échoue. Chaque plage est énumérée entièrement.
 * - `Cc` : contrôles ; `Zl` et `Zp` ; `Cf` : tous les caractères de format (listés ici d'après Unicode 17) ;
 * - puis les invisibles d'autres catégories, nommés un à un dans le motif du back.
 * Les plages `Cf` dépendent de la version d'Unicode du navigateur qui exécute l'agent (la WebView) : celles qui sont anciennes y sont toutes ;
 * les plus récentes (U+0890 et U+0891 en Unicode 14, U+13439 à U+1343F en Unicode 15) ne sont retirées que par un navigateur à jour.
 */
const REFUSED: Array<[name: string, from: number, to: number]> = [
  ['contrôles C0 (NUL, cloche, tabulation, sauts de ligne, échappement…)', 0x0000, 0x001f],
  ['suppression et contrôles C1 (dont « ligne suivante »)', 0x007f, 0x009f],
  ['trait d’union conditionnel (très courant sur les pages web)', 0x00ad, 0x00ad],
  ['joint de graphèmes (Mn)', 0x034f, 0x034f],
  ['signes de format arabes (nombres, fin de verset…)', 0x0600, 0x0605],
  ['marque de lettre arabe', 0x061c, 0x061c],
  ['signe arabe de fin de verset', 0x06dd, 0x06dd],
  ['marque d’abréviation syriaque', 0x070f, 0x070f],
  ['signes arabes de livre sterling (Unicode 14)', 0x0890, 0x0891],
  ['signe arabe de disputé', 0x08e2, 0x08e2],
  ['remplisseurs hangul (Lo)', 0x115f, 0x1160],
  ['voyelles inhérentes khmères (Mn)', 0x17b4, 0x17b5],
  ['sélecteurs de variation mongols et séparateur de voyelles', 0x180b, 0x180f],
  ['espaces et jointures de largeur nulle, marques de sens de lecture', 0x200b, 0x200f],
  ['séparateurs de ligne et de paragraphe', 0x2028, 0x2029],
  ['encastrements et forçages du sens de lecture', 0x202a, 0x202e],
  ['joint de mots et opérateurs mathématiques invisibles', 0x2060, 0x2064],
  ['isolats du sens de lecture et formes arabes obsolètes', 0x2066, 0x206f],
  ['remplisseur hangul (Lo)', 0x3164, 0x3164],
  ['sélecteurs de variation (Mn)', 0xfe00, 0xfe0f],
  ['marque d’ordre des octets', 0xfeff, 0xfeff],
  ['remplisseur hangul demi-chasse (Lo)', 0xffa0, 0xffa0],
  ['ancres d’annotation interlinéaire', 0xfff9, 0xfffb],
  ['signe de nombre kaithi', 0x110bd, 0x110bd],
  ['signe de fin de nombre kaithi', 0x110cd, 0x110cd],
  ['contrôles de format des hiéroglyphes égyptiens', 0x13430, 0x1343f],
  ['contrôles de format de la sténographie', 0x1bca0, 0x1bca3],
  ['contrôles de format musicaux', 0x1d173, 0x1d17a],
  ['bloc des TAG, points réservés compris', 0xe0000, 0xe007f],
  ['sélecteurs de variation supplémentaires (Mn)', 0xe0100, 0xe01ef],
]

/** Ce que l'agent change en espace au lieu de retirer : le texte reste lisible. */
const BECOMES_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029])

/** Tous les points de code d'une plage. */
const codesOf = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

describe('la copie des règles du back', () => {
  it('reproduit le motif du back (PR #198) : contrôles, tous les caractères de format, séparateurs, invisibles listés', () => {
    expect(BACK_FORBIDDEN_PATTERN_PHP).toContain('\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}')
    expect(BACK_FORBIDDEN_PATTERN_PHP).toContain('\\x{E0000}-\\x{E007F}\\x{E0100}-\\x{E01EF}')
    const characters = [
      '\u00AD', // trait d'union conditionnel
      '\u200B', // largeur nulle
      '\u202E', // inversion du sens de lecture
      '\u2061', // opérateur invisible
      '\uFEFF', // marque d'ordre des octets
      '\u2028', // séparateur de ligne
      '\u0007', // cloche
      '\u034F', // joint de graphèmes
      '\u3164', // remplisseur hangul
      '\uFE0F', // sélecteur de variation
      '\u{E0001}', // TAG
      '\u{E0100}', // sélecteur de variation supplémentaire
    ]
    expect(characters.filter((character) => !BACK_FORBIDDEN.test(`a${character}b`))).toEqual([])
    expect(
      BACK_FORBIDDEN.test('Farine de blé T55 – œufs × 2 ’ 5 % ® ™ ° € « » \u00A0 \u202F 🥚'),
    ).toBe(false)
  })

  it('refuse un libellé marqué, vide ou fait d’espaces ; accepte un vrai libellé', () => {
    expect(backAcceptsLabel('Farine de blé T55 1 kg')).toBe(true)
    expect(backAcceptsLabel('Farine\u200B de blé')).toBe(false)
    expect(backAcceptsLabel('Fro\u00ADmage')).toBe(false)
    expect(backAcceptsLabel('')).toBe(false)
    expect(backAcceptsLabel('\u00A0 \u3000')).toBe(false)
    expect(backAcceptsLabel('a'.repeat(256))).toBe(false)
    expect(backAcceptsLabel('Lait\uD800')).toBe(false)
  })

  it('la liste écrite à la main ci-dessus est exactement ce que le motif refuse (sinon une version d’Unicode a changé : la relire)', () => {
    const refused: number[] = []
    for (let code = 0; code <= LAST_CODE_POINT; code++) {
      if (!isSurrogate(code) && BACK_FORBIDDEN.test(String.fromCodePoint(code))) refused.push(code)
    }

    const listed = REFUSED.flatMap(([, from, to]) => codesOf(from, to))

    expect(refused.filter((code) => !listed.includes(code)).map(hex)).toEqual([])
    expect(listed.filter((code) => !refused.includes(code)).map(hex)).toEqual([])
    expect(refused.length).toBeGreaterThan(500)
  })
})

describe('cleanText retire tout ce que le back refuse', () => {
  it.each(REFUSED)(
    'plage : %s (un essai par point de code)',
    (_name: string, from: number, to: number) => {
      const survivors: string[] = []
      const badlyCut: string[] = []

      for (const code of codesOf(from, to)) {
        const character = String.fromCodePoint(code)
        const cleaned = cleanText(`a${character}b`)
        // Au milieu d'un mot : rien ne reste, et les deux moitiés se recollent (sauf un saut de ligne, qui reste un séparateur)
        if (BACK_FORBIDDEN.test(cleaned)) survivors.push(hex(code))
        if (cleaned !== (BECOMES_SPACE.has(code) ? 'a b' : 'ab')) badlyCut.push(hex(code))
        // Seul, ou aux bords d'un libellé : il n'en reste rien non plus
        if (cleanText(character) !== '') survivors.push(`${hex(code)} (seul)`)
        if (cleanText(`${character}Farine${character}`) !== 'Farine')
          survivors.push(`${hex(code)} (bords)`)
      }

      expect(survivors).toEqual([])
      expect(badlyCut).toEqual([])
    },
  )

  it('pour chaque point de code Unicode : rien de ce que le motif du back refuse ne survit', () => {
    // Given : tous les points de code (le motif du back est recopié dans back-label-rules.ts)
    const survivors: string[] = []

    // When
    for (let code = 0; code <= LAST_CODE_POINT; code++) {
      if (isSurrogate(code)) continue
      if (BACK_FORBIDDEN.test(cleanText(`a${String.fromCodePoint(code)}b`))) {
        survivors.push(hex(code))
      }
    }

    // Then
    expect(survivors).toEqual([])
  })

  it('ne retire rien d’autre : tout caractère que le back accepte et qui n’est pas une espace est gardé', () => {
    const changed: string[] = []

    for (let code = 0; code <= LAST_CODE_POINT; code++) {
      if (isSurrogate(code)) continue
      const character = String.fromCodePoint(code)
      if (BACK_FORBIDDEN.test(character) || /\s/u.test(character)) continue
      if (cleanText(`a${character}b`) !== `a${character}b`) changed.push(hex(code))
    }

    expect(changed).toEqual([])
  })

  it('retire une moitié de paire de substitution : elle n’est pas un texte et le JSON du back la refuserait', () => {
    expect(cleanText('Lait\uD800 entier')).toBe('Lait entier')
    expect(cleanText('Lait \uDC00entier')).toBe('Lait entier')
    expect(cleanText('Lait 🥛 entier')).toBe('Lait 🥛 entier')
  })

  it('un trait d’union conditionnel au milieu d’un mot le laisse entier (jamais une espace à sa place)', () => {
    expect(cleanText('Fro\u00ADmage ra\u00ADpé 200\u00AD g')).toBe('Fromage rapé 200 g')
    expect(cleanText('\u00AD')).toBe('')
  })
})

describe('cleanText garde les libellés français légitimes', () => {
  it.each([
    ['lettres accentuées', 'Crème brûlée à la façon d’Éloïse, noël ÿ ü ê'],
    ['œ, æ et ligatures', 'Œufs bio de Cœur-de-Lion, æther, ﬁn, ﬂeur, ﬀ'],
    ['®, ™ et ©', 'Marque® Fictive™ 2026 ©'],
    ['degré, euro, pour cent, esperluette', 'Bière 5,5 ° – 33 cl, 2,50 € – 100 % pur jus & pulpe'],
    ['apostrophe courbe et guillemets français', '« Pur jus » d’orange'],
    ['accent combinant (e puis U+0301)', 'Café moulu'],
    ['un emoji simple', 'Œufs 🥚 frais'],
    ['un tiret demi-cadratin et un signe fois', 'Lait – 6 × 1 L'],
  ])('%s : %s', (_name, label) => {
    expect(cleanText(label)).toBe(label)
    expect(backAcceptsLabel(cleanText(label))).toBe(true)
  })

  it.each([
    ['espace insécable U+00A0', 'Camembert 250\u00A0g', 'Camembert 250 g'],
    ['espace fine insécable U+202F', 'Prix 2,50\u202F€ le kilo', 'Prix 2,50 € le kilo'],
    ['les deux, en suite', '6\u00A0\u202F x\u00A01 L', '6 x 1 L'],
  ])(
    'l’%s est acceptée par le back et devient une espace ordinaire : les mots restent séparés',
    (_name, label, expected) => {
      expect(BACK_FORBIDDEN.test(label)).toBe(false)
      expect(backAcceptsLabel(label)).toBe(true)
      expect(cleanText(label)).toBe(expected)
      expect(backAcceptsLabel(cleanText(label))).toBe(true)
    },
  )

  it('revers assumé du back : un emoji écrit avec une jointure ou le sélecteur U+FE0F perd cet invisible mais reste lisible', () => {
    expect(cleanText('👨\u200D👩')).toBe('👨👩')
    expect(cleanText('Cœur ❤\uFE0F')).toBe('Cœur ❤')
    expect(backAcceptsLabel(cleanText('Cœur ❤\uFE0F'))).toBe(true)
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
    expect(cleanText('\u00AD\u2061\u{E0001}')).toBe('')
    expect(cleanText('')).toBe('')
  })

  it('laisse un vrai libellé intact : accents, apostrophe courbe, tiret demi-cadratin, œ, ×, %, emoji', () => {
    const label = 'Œufs bio d’une ferme – 6 × 53 g, 100 % plein air 🥚'

    expect(cleanText(label)).toBe(label)
    expect(backAcceptsLabel(cleanText(label))).toBe(true)
  })
})

// —— Le texte de chaque produit lu passe le contrôle du back ———————————————————————————————————————————————————————————————————

/** Un caractère écrit en `\uXXXX` (une unité de 16 bits à la fois), comme le JSON de la page de l'enseigne l'écrit. */
const escaped = (text: string) =>
  Array.from(
    { length: text.length },
    (_unit, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, '0')}`,
  ).join('')

/** Les textes d'un produit brut qui pourraient partir vers le back ou s'afficher : libellés, texte du prix par mesure, unités du contenu net. */
const textsOf = (raw: RawProduct): string[] =>
  [
    raw.label1,
    raw.label2,
    raw.measureText,
    ...(raw.structured ? [raw.structured.unitMeasure, raw.structured.totalUnit] : []),
  ].filter((text): text is string => text !== null)

/** Le texte normalisé de chaque produit lu : accepté par le back, tel quel (rien d’interdit n’a survécu à la lecture). */
function expectBackAccepts(products: readonly RawProduct[]): void {
  for (const raw of products) {
    const candidate = toCandidate(raw)
    for (const text of textsOf(raw)) {
      expect(
        BACK_FORBIDDEN.test(text) || /\p{Cs}/u.test(text),
        `produit ${raw.id} : « ${text} »`,
      ).toBe(false)
    }
    // Ce qui part vers Repas : les deux lignes jointes, de 1 à 255 caractères
    expect(backAcceptsLabel(labelOf(candidate)), `produit ${raw.id}`).toBe(true)
  }
}

describe('le texte normalisé de chaque produit lu passe le contrôle du back', () => {
  it('toutes les pages d’exemple de l’enseigne (drive-agent/fixtures/leclerc) : libellés, contenu, prix par mesure', () => {
    // Given
    const pages = readdirSync(join(__dirname, '..', 'fixtures', 'leclerc')).filter((name) =>
      name.endsWith('.html'),
    )

    // When
    const products = pages.flatMap((name) => extractProducts(fixture(name)).products)

    // Then : des produits ont bien été lus (le contrôle ne passe pas à vide)
    expect(products.length).toBeGreaterThanOrEqual(4)
    expectBackAccepts(products)
  })

  it('tout le catalogue du faux site (dont le produit aux invisibles 1000032)', () => {
    // When
    const { products } = extractProducts(searchPage('tout', PRODUCTS, new Map()))

    // Then
    expect(products).toHaveLength(PRODUCTS.length)
    expectBackAccepts(products)
    expect(
      labelOf(toCandidate(products.find((product) => product.id === '1000032') as RawProduct)),
    ).toBe('Vinaigre de cidre Verger Imaginaire 75 cl')
  })

  it.each(REFUSED)(
    'une page dont les libellés portent, écrits en \\uXXXX, tous les caractères de la plage : %s',
    (_name: string, from: number, to: number) => {
      // Given : un produit par point de code, dans les deux libellés
      const codes = codesOf(from, to)
      const page = `<script>{"lstProduits":[${codes
        .map((code, index) => {
          const marked = escaped(`Sel${String.fromCodePoint(code)}fin`)
          return `{"iIdProduit":${2000000 + index},"sLibelleLigne1":"${marked} de test","sLibelleLigne2":"${escaped(`50${String.fromCodePoint(code)}0 g`)}"}`
        })
        .join(',')}]}</script>`

      // When
      const { products } = extractProducts(page)

      // Then : tous les produits sont lus, sans le caractère, et leur libellé complet est accepté par le back
      expect(products).toHaveLength(codes.length)
      expectBackAccepts(products)
      const misread = products.flatMap((raw, index) => {
        const code = codes[index] ?? 0
        const separator = BECOMES_SPACE.has(code) ? ' ' : ''
        const expected = [`Sel${separator}fin de test`, `50${separator}0 g`]
        return raw.label1 === expected[0] && raw.label2 === expected[1] ? [] : [hex(code)]
      })
      expect(misread).toEqual([])
    },
  )

  it('un libellé fait d’entités HTML invisibles (&#xAD;, &#8291;) est nettoyé de même', () => {
    const page =
      '<script>{"iIdProduit":9,"sLibelleLigne1":"Fro&#xAD;mage&#8291; blanc","sLibelleLigne2":"500&#x2061; g"}</script>'

    const { products } = extractProducts(page.replace(/"/g, '&quot;'))

    expect(products.map((raw) => [raw.label1, raw.label2])).toEqual([['Fromage blanc', '500 g']])
    expectBackAccepts(products)
  })
})

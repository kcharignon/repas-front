import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Les contrastes des thèmes « Citrouille & nuit » (ADR 0010) et « Houx & neige » (ADR 0011), lus dans la feuille de style elle-même : WCAG AA, 4,5:1 pour du texte.

const css = readFileSync('src/design/theme.css', 'utf8')

/** Les déclarations `--jeton: #rrggbb` du bloc qui suit exactement ce sélecteur. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Bloc introuvable dans theme.css : ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const found: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi))
    found[name!] = value!.toLowerCase()

  return found
}

const channel = (hex: string, start: number) => {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
/** Le rapport de contraste WCAG entre deux couleurs. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (light + 0.05) / (dark + 0.05)
}

const seasons = ['halloween', 'noel'] as const
const palettes = Object.fromEntries(
  seasons.map((season) => [
    season,
    {
      light: tokens(`:root[data-season='${season}']`),
      darkSystem: tokens(`:root[data-season='${season}']:not([data-theme='light'])`),
      darkForced: tokens(`:root[data-season='${season}'][data-theme='dark']`),
    },
  ]),
) as Record<
  (typeof seasons)[number],
  Record<'light' | 'darkSystem' | 'darkForced', Record<string, string>>
>
/** Les jetons de décor, qui ne portent ni texte ni fond de texte et ne changent pas avec le mode. */
const decorTokens = ['moon', 'star']

const pairs = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'soft'],
  ['primary', 'bg'],
  ['primary', 'surface'],
  ['primary', 'soft'],
  ['on-primary', 'primary'],
  ['on-accent', 'accent'],
  ['on-danger', 'danger'],
  ['on-danger-soft', 'danger-soft'],
  ['danger', 'surface'],
  ['white', 'brand'],
] as const

for (const season of seasons) {
  const { light, darkSystem, darkForced } = palettes[season]

  for (const [mode, palette] of [
    ['clair', light],
    ['sombre (système)', darkSystem],
    ['sombre (forcé)', darkForced],
  ] as const) {
    describe(`thème saisonnier ${season}, ${mode}`, () => {
      const color = (name: string) => (name === 'white' ? '#ffffff' : palette[name]!)

      for (const [front, back] of pairs) {
        it(`${front} sur ${back} : au moins 4,5:1`, () => {
          expect(palette[front === 'white' ? back : front], `${front} défini`).toBeDefined()
          expect(palette[back], `${back} défini`).toBeDefined()

          expect(contrast(color(front), color(back))).toBeGreaterThanOrEqual(4.5)
        })
      }
    })
  }

  describe(`thème saisonnier ${season} : cohérence des blocs`, () => {
    it('le sombre du système et le sombre forcé disent la même chose', () => {
      expect(darkSystem).toEqual(darkForced)
    })

    it('définit les mêmes jetons en clair et en sombre (sauf ceux du décor, qui ne changent pas)', () => {
      const names = (palette: Record<string, string>) =>
        Object.keys(palette).filter((n) => !decorTokens.includes(n))

      expect(names(darkForced).sort()).toEqual(names(light).sort())
    })

    it('le danger reste un rouge ou un corail, jamais l’accent', () => {
      for (const palette of [light, darkForced]) {
        expect(hue(palette.danger!)).toBeLessThan(15)
        expect(hue(palette.accent!)).toBeGreaterThan(25)
      }
    })
  })
}

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const max = Math.max(r!, g!, b!)
  const min = Math.min(r!, g!, b!)
  const delta = max - min
  const raw =
    max === r!
      ? ((g! - b!) / delta) % 6
      : max === g!
        ? (b! - r!) / delta + 2
        : (r! - g!) / delta + 4

  return (raw * 60 + 360) % 360
}

describe('thème de Noël : les choix de la maquette', () => {
  const { light, darkForced } = palettes.noel

  it('l’étoile du décor est la même en clair et en sombre', () => {
    expect(light.star).toBe('#f9d98a')
    expect(darkForced.star).toBe('#f9d98a')
    expect(light.moon).toBeUndefined()
  })

  it('le bandeau est bordeaux et le danger reste un rouge qui s’en distingue', () => {
    for (const palette of [light, darkForced]) {
      expect(hue(palette.brand!)).toBeGreaterThan(330)
      expect(palette.danger).not.toBe(palette.brand)
      expect(contrast(palette.danger!, palette.brand!)).toBeGreaterThan(1.3)
    }
  })

  it('ne définit pas l’avertissement : il reste celui du thème de base', () => {
    for (const palette of [light, darkForced]) {
      expect(palette['warning-soft']).toBeUndefined()
      expect(palette['on-warning-soft']).toBeUndefined()
    }
  })
})

describe('thèmes saisonniers : la couleur d’accent', () => {
  it('ne porte jamais de texte, de liseré ni de trait : seulement des fonds', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)

        return /\.(vue|ts)$/.test(name) ? [path] : []
      })
    const offenders = files('src').filter((file) =>
      /(?:text|border|ring|outline|stroke|fill|decoration|divide|caret|accent|from|via|to)-accent(?![\w-])/.test(
        readFileSync(file, 'utf8').replace(/bg-accent/g, ''),
      ),
    )

    expect(offenders).toEqual([])
  })
})

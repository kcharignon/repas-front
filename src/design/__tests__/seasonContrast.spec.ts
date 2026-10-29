// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SEASONS, type Season } from '../season'
import { PACKS } from '../season/art'

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

const seasons = SEASONS
const palettes = Object.fromEntries(
  seasons.map((season) => [
    season,
    {
      light: tokens(`:root[data-season='${season}']`),
      darkSystem: tokens(`:root[data-season='${season}']:not([data-theme='light'])`),
      darkForced: tokens(`:root[data-season='${season}'][data-theme='dark']`),
    },
  ]),
) as Record<Season, Record<'light' | 'darkSystem' | 'darkForced', Record<string, string>>>

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

    it('définit les mêmes jetons en clair et en sombre', () => {
      const names = (palette: Record<string, string>) => Object.keys(palette)

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

/** L'opacité de la scène de fond (`--scene-opacity`) du bloc qui suit exactement ce sélecteur. */
function sceneOpacity(selector: string): number {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const found = /--scene-opacity:\s*([0-9.]+);/.exec(body)
  if (!found) throw new Error(`--scene-opacity absent de ${selector}`)

  return Number(found[1])
}

/** Mélange `front` sur `back` à l'opacité donnée (ce que l'œil voit d'un calque translucide posé sur le fond de la page). */
function mix(front: string, back: string, opacity: number): string {
  const part = (start: number) =>
    Math.round(
      parseInt(front.slice(start, start + 2), 16) * opacity +
        parseInt(back.slice(start, start + 2), 16) * (1 - opacity),
    )
      .toString(16)
      .padStart(2, '0')

  return `#${part(1)}${part(3)}${part(5)}`
}

// ADR 0012 : la scène de fond est posée sous le texte courant. Chaque couleur du fichier, mélangée au fond de la page à l'opacité
// du jeton, doit laisser `ink` et `muted` à 4,5:1 : le pire pixel possible de la scène.
describe('scène de fond des thèmes saisonniers : le texte reste lisible sur son pire pixel', () => {
  const selectors = {
    clair: (season: string) => `:root[data-season='${season}']`,
    'sombre (système)': (season: string) =>
      `:root[data-season='${season}']:not([data-theme='light'])`,
    'sombre (forcé)': (season: string) => `:root[data-season='${season}'][data-theme='dark']`,
  } as const

  for (const season of seasons) {
    const svg = readFileSync(`src/design/season/art/${season}/${PACKS[season].scene}.svg`, 'utf8')
    const colors = [...new Set([...svg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()))]

    it(`${season} : la scène a des couleurs à vérifier`, () => {
      expect(colors.length).toBeGreaterThan(3)
    })

    for (const [mode, selector] of Object.entries(selectors)) {
      const palette = tokens(selector(season))
      const opacity = sceneOpacity(selector(season))

      it(`${season}, ${mode} : opacité ${opacity}, ink et muted gardent 4,5:1`, () => {
        expect(opacity).toBeGreaterThan(0)
        expect(opacity).toBeLessThanOrEqual(0.25)
        for (const color of colors) {
          const worst = mix(color, palette.bg!, opacity)
          for (const text of ['ink', 'muted'] as const)
            expect(
              contrast(palette[text]!, worst),
              `${text} sur ${color} à ${opacity} sur ${palette.bg}`,
            ).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

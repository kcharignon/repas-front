// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// La pastille « Secrète » et le cadenas de l'interrupteur (REC-002) : texte sur fond doux, en clair et en sombre (système et forcé),
// lus dans la feuille de style elle-même. WCAG AA : 4,5:1.

const css = readFileSync('src/design/theme.css', 'utf8')

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
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (light + 0.05) / (dark + 0.05)
}

const palettes = {
  clair: tokens(':root'),
  'sombre (système)': tokens(":root:not([data-theme='light'])"),
  'sombre (forcé)': tokens(":root[data-theme='dark']"),
}

for (const [mode, palette] of Object.entries(palettes)) {
  describe(`recette secrète, thème ${mode}`, () => {
    it('on-secret-soft sur secret-soft : au moins 4,5:1', () => {
      expect(palette['on-secret-soft'], 'on-secret-soft défini').toBeDefined()
      expect(palette['secret-soft'], 'secret-soft défini').toBeDefined()

      expect(contrast(palette['on-secret-soft']!, palette['secret-soft']!)).toBeGreaterThanOrEqual(
        4.5,
      )
    })
  })
}

describe('recette secrète : les couleurs de la maquette (planche 6)', () => {
  it('vert doux en clair', () => {
    expect(palettes.clair).toMatchObject({ 'secret-soft': '#e6f2ec', 'on-secret-soft': '#14513a' })
  })
})

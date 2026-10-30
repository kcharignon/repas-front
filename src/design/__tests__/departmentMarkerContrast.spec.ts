// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// Les repères de rayon (ING-017) : le trait de l'icône sur sa pastille, en clair et en sombre (système et forcé), lus dans la feuille
// de style elle-même. WCAG AA : 4,5:1 (l'icône n'a besoin que de 3:1, on garde la marge du texte).

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
  describe(`repères de rayon, thème ${mode}`, () => {
    it.each([
      ['on-cold-soft', 'cold-soft'],
      ['on-can-soft', 'can-soft'],
    ])('%s sur %s : au moins 4,5:1', (front, back) => {
      expect(palette[front], `${front} défini`).toBeDefined()
      expect(palette[back], `${back} défini`).toBeDefined()

      expect(contrast(palette[front]!, palette[back]!)).toBeGreaterThanOrEqual(4.5)
    })
  })
}

describe('repères de rayon : les couleurs de la maquette (planche 4)', () => {
  it('flocon et boîte, clair puis sombre', () => {
    expect(palettes.clair).toMatchObject({
      'cold-soft': '#e3f0fa',
      'on-cold-soft': '#1a62a0',
      'can-soft': '#f7e8d2',
      'on-can-soft': '#8a4f12',
    })
    for (const mode of ['sombre (système)', 'sombre (forcé)'] as const)
      expect(palettes[mode]).toMatchObject({
        'cold-soft': '#16324a',
        'on-cold-soft': '#8fd0ff',
        'can-soft': '#3a2a14',
        'on-can-soft': '#f0b878',
      })
  })
})

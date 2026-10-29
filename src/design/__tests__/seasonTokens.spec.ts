import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SEASONS, applySeason, type Season } from '../season'

// Les couleurs de chaque thème saisonnier (ADR 0010 à 0016), figées en VALEUR : le bandeau de marque (`--brand`) et le fond de la page
// (`--bg`), en clair et en sombre. `seasonContrast.spec.ts` ne juge que des rapports de contraste entre jetons ; ce fichier garde ce que
// le navigateur affiche : changer une couleur de la maquette se fait ici ET dans `theme.css`, jamais par mégarde. La cascade réelle
// (le sombre du système bat le clair, le sombre forcé bat le système) reste prouvée en navigateur par `e2e/theme-season.spec.ts`.

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

interface Colors {
  /** Le bandeau en clair : c'est aussi la couleur de la barre du navigateur. */
  readonly brandLight: string
  readonly brandDark: string
  readonly bgLight: string
  readonly bgDark: string
  /** Un jour en pleine saison, pour lire la barre du navigateur posée par `applySeason`. */
  readonly day: Date
}

const COLORS: Record<Season, Colors> = {
  galette: {
    brandLight: '#223b86',
    brandDark: '#1a2a66',
    bgLight: '#fbf6e8',
    bgDark: '#111832',
    day: new Date(2027, 0, 15, 12),
  },
  valentin: {
    brandLight: '#a8326a',
    brandDark: '#7d2350',
    bgLight: '#fff6f7',
    bgDark: '#1d0f17',
    day: new Date(2027, 1, 12, 12),
  },
  paques: {
    brandLight: '#6a50b0',
    brandDark: '#4a367f',
    bgLight: '#f7f8ee',
    bgDark: '#1a1310',
    day: new Date(2027, 2, 20, 12),
  },
  ete: {
    brandLight: '#b8460f',
    brandDark: '#8a3209',
    bgLight: '#fffaf0',
    bgDark: '#0a1e24',
    day: new Date(2027, 6, 15, 12),
  },
  automne: {
    brandLight: '#4d5a16',
    brandDark: '#3a4410',
    bgLight: '#faf3e3',
    bgDark: '#17160c',
    day: new Date(2027, 8, 20, 12),
  },
  halloween: {
    brandLight: '#43206b',
    brandDark: '#2d1850',
    bgLight: '#f7f2ea',
    bgDark: '#110b1b',
    day: new Date(2026, 9, 27, 12),
  },
  noel: {
    brandLight: '#7a1530',
    brandDark: '#5a1226',
    bgLight: '#f3f6f7',
    bgDark: '#0b1520',
    day: new Date(2026, 11, 20, 12),
  },
}

const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

describe('couleurs des thèmes saisonniers, lues dans theme.css', () => {
  it('la table couvre exactement les saisons du registre', () => {
    expect(Object.keys(COLORS).sort()).toEqual([...SEASONS].sort())
  })

  describe.each(SEASONS)('%s', (season) => {
    const colors = COLORS[season]

    it('clair : le bandeau et le fond de la maquette', () => {
      const light = tokens(`:root[data-season='${season}']`)

      expect(light.brand).toBe(colors.brandLight)
      expect(light.bg).toBe(colors.bgLight)
    })

    it('sombre selon le système : le bandeau et le fond de la maquette', () => {
      const dark = tokens(`:root[data-season='${season}']:not([data-theme='light'])`)

      expect(dark.brand).toBe(colors.brandDark)
      expect(dark.bg).toBe(colors.bgDark)
    })

    it('sombre forcé : le même bandeau et le même fond que le sombre du système', () => {
      const forced = tokens(`:root[data-season='${season}'][data-theme='dark']`)

      expect(forced.brand).toBe(colors.brandDark)
      expect(forced.bg).toBe(colors.bgDark)
    })

    it('le bloc sombre du système n’agit que si le système est sombre', () => {
      const system = `:root[data-season='${season}']:not([data-theme='light'])`

      expect(css).toContain(`@media (prefers-color-scheme: dark) {\n  ${system} {`)
    })
  })

  describe('la barre du navigateur', () => {
    beforeEach(() => {
      document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#1E6B4C">')
    })
    afterEach(() => {
      document.querySelector('meta[name="theme-color"]')?.remove()
      document.documentElement.removeAttribute('data-season')
    })

    it.each(SEASONS)('%s : elle prend le bandeau clair de la saison', (season) => {
      vi.setSystemTime(COLORS[season].day)

      applySeason()

      expect(document.documentElement.dataset.season).toBe(season)
      expect(meta()!.toLowerCase()).toBe(COLORS[season].brandLight)
    })
  })
})

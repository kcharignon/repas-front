import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOGO_SHAPES } from '../../src/design/logoGeometry'

// L'identité visuelle (docs/logo/README.md) : les fichiers livrés viennent tous de scripts/brand-assets.mjs ; ce test garde leurs mesures
// et leur accord avec la géométrie du composant RepasLogo.vue (la source unique). Les captures de la fiche du store viennent avec STORE-015.
const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path))
const text = (path: string) => read(path).toString('utf8')

/** Largeur, hauteur et type de couleur (6 = RVB avec transparence) d'un PNG. */
const png = (path: string) => {
  const bytes = read(path)
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], size: bytes.length }
}

describe('icônes du site', () => {
  it.each([
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/icon-maskable-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
    ['src/assets/logo.png', 192],
  ])('%s fait %i x %i px', (path, size) => {
    expect(png(path)).toMatchObject({ width: size, height: size })
  })

  it('l’icône de l’onglet porte trois tailles : 16, 32 et 48 px', () => {
    const ico = read('public/favicon.ico')
    const count = ico.readUInt16LE(4)

    expect(ico.readUInt16LE(2)).toBe(1)
    expect(Array.from({ length: count }, (_, i) => ico[6 + 16 * i])).toEqual([16, 32, 48])
  })
})

describe('icône de la fiche du store', () => {
  it('fait 512 x 512 px, en 32 bits avec transparence, et pèse moins de 1 024 Ko', () => {
    const icon = png('android/store/images/icon.png')

    expect(icon).toMatchObject({ width: 512, height: 512, colorType: 6 })
    expect(icon.size).toBeLessThan(1024 * 1024)
  })

  it('a pour source un SVG sans texte ni image externe', () => {
    const svg = text('android/store/icon.svg')

    expect(svg).toContain('viewBox="0 0 108 108"')
    expect(svg).not.toMatch(/<text|<image|href=/)
  })
})

describe('icône de l’application Android', () => {
  const foreground = text('android/app/src/main/res/drawable/ic_launcher_foreground.xml')
  const monochrome = text('android/app/src/main/res/drawable/ic_launcher_monochrome.xml')
  const pathData = (xml: string) => [...xml.matchAll(/android:pathData="([^"]*)"/g)].map((m) => m[1])

  it('dessine les mêmes formes que le logo du site, dans le même ordre', () => {
    expect(pathData(foreground)).toEqual(LOGO_SHAPES.map((shape) => shape.d))
    expect(pathData(monochrome)).toEqual(LOGO_SHAPES.map((shape) => shape.d))
  })

  it('garde la coche en safran ; la version thématique est d’une seule couleur', () => {
    expect(foreground).toContain('@color/saffron')
    expect(monochrome).not.toContain('saffron')
    expect(new Set([...monochrome.matchAll(/(?:fillColor|strokeColor)="([^"]*)"/g)].map((m) => m[1]))).toEqual(
      new Set(['#FFFFFF', '#00000000']),
    )
  })

  it('tient dans la zone sûre : le dessin est réduit autour de son centre', () => {
    expect(foreground).toMatch(/android:scaleX="0\.88"/)
    expect(monochrome).toMatch(/android:scaleX="0\.88"/)
  })
})

describe('logos de référence', () => {
  it.each(['clair', 'vert', 'sombre', 'mono-basilic', 'mono-blanc'])('existent en empilé et en horizontal (%s)', (variant) => {
    for (const layout of ['empile', 'horizontal']) {
      const svg = text(`docs/logo/logo-${layout}-${variant}.svg`)

      expect(svg).toContain('aria-label="Repas"')
      expect(svg).not.toMatch(/<text|font-family/)
    }
  })
})

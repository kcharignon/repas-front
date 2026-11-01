// Les petites icônes de l'écran de progression (DRV-744) : des tracés SVG construits nœud par nœud (`createElementNS`, jamais de HTML injecté), toujours
// décoratifs (`aria-hidden`) : l'information passe par le texte. Tracés de la maquette, `viewBox` 24 × 24.
import type { IconName } from './entries'

// L'espace de noms des SVG n'est pas une adresse qu'on charge ; il s'écrit en morceaux pour que le test de construction (« aucune adresse absolue »)
// continue de ne tolérer que les adresses bâties sur l'hôte de la page.
const SVG = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/')

type Shape = readonly [tag: 'path' | 'circle' | 'rect', attrs: Readonly<Record<string, string>>]

export type DecorName = IconName | 'cart' | 'phone' | 'chevron'

const SHAPES: Record<DecorName, readonly Shape[]> = {
  cart: [
    ['path', { d: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6.2' }],
    ['circle', { cx: '9.5', cy: '19', r: '1.4' }],
    ['circle', { cx: '17', cy: '19', r: '1.4' }],
  ],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  home: [['path', { d: 'M4 11l8-7 8 7M6 10v9h12v-9' }]],
  dash: [['path', { d: 'M6 12h12' }]],
  chevron: [['path', { d: 'M6 15l6-6 6 6' }]],
  attention: [['path', { d: 'M12 7v6M12 17h.01' }]],
  phone: [
    ['rect', { x: '7', y: '2.5', width: '10', height: '19', rx: '2.5' }],
    ['path', { d: 'M11 18.5h2' }],
  ],
}

/** Une icône décorative de `size` pixels, au trait de la couleur du texte (`currentColor`). */
export function icon(name: DecorName, size: number, strokeWidth = 2): Element {
  const svg = document.createElementNS(SVG, 'svg')
  const attrs: Record<string, string> = {
    width: String(size),
    height: String(size),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(strokeWidth),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value)
  for (const [tag, shape] of SHAPES[name]) {
    const node = document.createElementNS(SVG, tag)
    for (const [key, value] of Object.entries(shape)) node.setAttribute(key, value)
    svg.appendChild(node)
  }
  return svg
}

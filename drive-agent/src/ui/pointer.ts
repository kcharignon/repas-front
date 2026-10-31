// Le repère du guide (DRV-751) : entourer dans la page de l'enseigne le contrôle que la personne doit toucher, avec une petite flèche et « Touche ici » juste dessous
// (maquette du propriétaire : trait de 3 px safran, décalage de 3 px). L'agent ne modifie JAMAIS la page : le cadre et son repère vivent dans un second conteneur, à
// côté de celui de l'interface (Shadow DOM fermé, épinglé comme lui, sans prise sur les touchers : `pointer-events: none`) ; seule une lecture de la position du
// contrôle (`getBoundingClientRect`) et un défilement vers lui (`scrollIntoView`, une fois) touchent la page. Le cadre suit le contrôle quand la page défile ou change
// de taille. Rien ne s'anime : aucune pulsation, donc rien à couper pour `prefers-reduced-motion`.
import { append, h } from './dom'
import { displayLayout, measureDisplay } from './scale'
import { installStyles } from './sheet'
import { S } from './strings'

/** Le trait et le décalage du cadre, en pixels de l'interface (dp) : ceux de la maquette. */
const STROKE = 3
const GAP = 3
/** Sous le cadre : la flèche (10) et le repère (30) en dp, et l'air qu'on garde entre le repère et la carte du guide. */
const TAG_HEIGHT = 40
const CLEARANCE = 8

/** Les couleurs de la maquette : le safran (jeton `accent`) et son texte (`on-accent`), les mêmes en clair et en sombre. */
const POINTER_STYLES = `
:host{all:initial}
.ring{position:fixed;box-sizing:border-box;border:${STROKE}px solid #f4b73f;pointer-events:none}
.tag{position:fixed;display:flex;flex-direction:column;align-items:flex-start;transform-origin:0 0;pointer-events:none;font:700 15px/1.2 system-ui,sans-serif}
.tag.above{flex-direction:column-reverse}
.arrow{display:block;width:18px;height:10px;flex:none}
.tag.above .arrow{transform:scaleY(-1)}
.label{padding:6px 12px;border-radius:10px;background:#f4b73f;color:#2a1c00;white-space:nowrap}
[hidden]{display:none!important}
`

export interface PointerOptions {
  win: Window & typeof globalThis
  attachShadow: (host: Element, init: ShadowRootInit) => ShadowRoot
  mode: 'closed' | 'open'
}

export interface Pointer {
  /** Entoure le contrôle que `get` rend (relu à chaque mesure) ; `card` rend la boîte de la carte du guide, que le repère ne doit pas toucher. */
  point(get: () => HTMLElement | null, card: () => DOMRect | null): void
  /** Retire le cadre, le repère et les écouteurs. */
  clear(): void
}

const SVG = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/')

function arrow(): Element {
  const svg = document.createElementNS(SVG, 'svg')
  for (const [key, value] of Object.entries({
    width: '18',
    height: '10',
    viewBox: '0 0 18 10',
    class: 'arrow',
    'aria-hidden': 'true',
    focusable: 'false',
  }))
    svg.setAttribute(key, value)
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', 'M1 10 L9 1 L17 10 Z')
  path.setAttribute('fill', '#f4b73f')
  svg.appendChild(path)
  return svg
}

/** Épingle le conteneur sur la fenêtre, juste sous celui de l'interface, sans prise sur les touchers. */
function pin(host: HTMLElement): void {
  const rules: [string, string][] = [
    ['all', 'initial'],
    ['display', 'block'],
    ['position', 'fixed'],
    ['inset', '0'],
    ['z-index', '2147483646'],
    ['visibility', 'visible'],
    ['opacity', '1'],
    ['pointer-events', 'none'],
  ]
  for (const [name, value] of rules) host.style.setProperty(name, value, 'important')
}

const px = (value: string): number => {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

export function createPointer(options: PointerOptions): Pointer {
  const { win } = options
  let view: {
    host: HTMLElement
    ring: HTMLElement
    tag: HTMLElement
    arrow: Element
  } | null = null
  let get: () => HTMLElement | null = () => null
  let card: () => DOMRect | null = () => null
  let scrolled = false
  let frame = 0
  let late = 0

  const scale = (): number => displayLayout(measureDisplay(win)).scale

  /** Fait défiler la page, une seule fois, pour que le contrôle et son repère restent visibles AU-DESSUS de la carte du guide. */
  function bringIntoView(target: HTMLElement, s: number): void {
    try {
      const limit = (card()?.top ?? win.innerHeight) - CLEARANCE * s
      const fits = () => {
        const rect = target.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom + (GAP * 2 + TAG_HEIGHT) * s <= limit
      }
      if (fits()) return
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
      if (!fits()) {
        const rect = target.getBoundingClientRect()
        win.scrollBy(0, rect.bottom + (GAP * 2 + TAG_HEIGHT) * s - limit)
      }
    } catch {
      // La page refuse de défiler : le cadre se pose là où est le contrôle.
    }
  }

  function layout(): void {
    if (view === null) return
    const target = get()
    const rect = target?.isConnected === true ? target.getBoundingClientRect() : null
    const s = scale()
    const visible =
      rect !== null &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < win.innerHeight &&
      rect.right > 0 &&
      rect.left < win.innerWidth
    view.ring.hidden = !visible
    view.tag.hidden = !visible
    if (!visible || target === null || rect === null) return
    if (!scrolled) {
      scrolled = true
      bringIntoView(target, s)
      return layout()
    }
    const out = (STROKE + GAP) * s
    const radius = px(win.getComputedStyle(target).borderTopLeftRadius)
    const { ring, tag } = view
    ring.style.setProperty('left', `${rect.left - out}px`)
    ring.style.setProperty('top', `${rect.top - out}px`)
    ring.style.setProperty('width', `${rect.width + 2 * out}px`)
    ring.style.setProperty('height', `${rect.height + 2 * out}px`)
    ring.style.setProperty('border-width', `${STROKE * s}px`)
    ring.style.setProperty('border-radius', `${Math.min(radius * s + out, 999)}px`)
    tag.style.setProperty('transform', s === 1 ? 'none' : `scale(${s})`)
    const width = tag.offsetWidth * s
    const height = TAG_HEIGHT * s
    const cardTop = card()?.top ?? win.innerHeight
    const below = rect.bottom + out + CLEARANCE * s
    const fitsBelow = below + height <= Math.min(cardTop - 4 * s, win.innerHeight)
    const above = rect.top - out - CLEARANCE * s - height
    const placeAbove = !fitsBelow && above >= 0
    tag.classList.toggle('above', placeAbove)
    const left = Math.max(8 * s, Math.min(rect.left, win.innerWidth - width - 8 * s))
    tag.style.setProperty('left', `${left}px`)
    tag.style.setProperty('top', `${placeAbove ? above : below}px`)
    // La flèche vise le milieu du contrôle, sans sortir du repère
    const aim = rect.left + rect.width / 2 - left - 9 * s
    view.arrow.setAttribute(
      'style',
      `margin-left:${Math.max(6, Math.min(aim, Math.max(6, width - 24 * s))) / s}px`,
    )
  }

  const schedule = (): void => {
    if (frame !== 0) return
    frame = win.requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function mount() {
    if (view !== null) return view
    const host = h('div')
    pin(host)
    const root = options.attachShadow(host, { mode: options.mode })
    installStyles(win, root, POINTER_STYLES)
    const ring = h('div', { class: 'ring', hidden: true })
    const label = h('span', { class: 'label', text: S.guide.pointer })
    const tagArrow = arrow()
    const tag = h('div', { class: 'tag', hidden: true }, tagArrow, label)
    append(root, ring, tag)
    win.document.documentElement.appendChild(host)
    view = { host, ring, tag, arrow: tagArrow }
    win.addEventListener('scroll', schedule, { capture: true, passive: true })
    win.addEventListener('resize', schedule)
    win.visualViewport?.addEventListener('resize', schedule)
    win.visualViewport?.addEventListener('scroll', schedule)
    return view
  }

  return {
    point(next, nextCard) {
      get = next
      card = nextCard
      scrolled = false
      mount()
      layout()
      // La page finit de se dessiner après l'arrivée du guide (images, polices) : une seconde mesure.
      win.clearTimeout(late)
      late = win.setTimeout(layout, 400)
    },
    clear() {
      win.clearTimeout(late)
      if (frame !== 0) win.cancelAnimationFrame(frame)
      frame = 0
      if (view === null) return
      win.removeEventListener('scroll', schedule, { capture: true })
      win.removeEventListener('resize', schedule)
      win.visualViewport?.removeEventListener('resize', schedule)
      win.visualViewport?.removeEventListener('scroll', schedule)
      view.host.remove()
      view = null
    },
  }
}

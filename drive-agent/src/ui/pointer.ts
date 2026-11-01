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
/**
 * Le contrôle est résolu (lu dans la page par l'enseigne : un parcours du document) à l'affichage, gardé tant qu'il est dans la page, et relu au plus UNE fois par
 * seconde quand il manque ou a disparu, ou au redimensionnement : jamais à chaque image d'un défilement.
 */
const RESOLVE_MS = 1_000
/** Le cadre est remesuré toutes les 500 ms même sans défilement (images et polices qui finissent de charger). */
const REMEASURE_MS = 500

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

/** Ce que le repère entoure : un contrôle de la page, ou le seul MOT de ce contrôle qu'il faut toucher (un menu à deux zones, DRV-757). */
export interface Spot {
  element: HTMLElement
  word?: string | undefined
}

export interface Pointer {
  /**
   * Entoure le contrôle que `get` rend (relu à chaque mesure) ; `card` rend la boîte de la carte du guide, que le repère ne doit pas toucher ; `avoid` rend ce que le repère
   * ne doit pas recouvrir non plus (la ville proposée sous le champ, les magasins) : sans place libre au-dessous ni au-dessus, le cadre reste et le repère s'efface.
   */
  point(get: () => Spot | null, card: () => DOMRect | null, avoid?: () => readonly DOMRect[]): void
  /** Le contrôle à entourer a peut-être changé : il est relu à la prochaine mesure. */
  refresh(): void
  /** Retire le cadre, le repère et les écouteurs. */
  clear(): void
}

/** Le repère se retire dès que le contrôle est touché (ou que la personne y écrit) ; ce temps suffit à une navigation. */
const TOUCHED_MS = 2_000

/** La boîte du seul mot `word` dans `element` (un menu « Connexion / Inscription » a deux zones) ; à défaut, celle de tout l'élément. */
function boxOf(element: HTMLElement, word: string | undefined): DOMRect {
  if (word !== undefined) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = (node.textContent ?? '').toLowerCase().indexOf(word.toLowerCase())
      if (at < 0) continue
      const range = element.ownerDocument.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + word.length)
      const box = range.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) return box
    }
  }
  return element.getBoundingClientRect()
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
  let get: () => Spot | null = () => null
  let card: () => DOMRect | null = () => null
  let avoid: () => readonly DOMRect[] = () => []
  /** Le mot à entourer, et le dernier moment où le contrôle a été touché. */
  let word: string | undefined
  let touchedAt = 0
  let scrolled = false
  let frame = 0
  let timer = 0
  /** Le contrôle résolu, et quand ; `refresh` : le prochain tour doit le relire (la fenêtre a changé de taille). */
  let cached: HTMLElement | null = null
  let resolvedAt = 0
  let refresh = false
  /** Le contrôle autre que celui du repère que la dernière lecture a désigné : il faut le lire une seconde fois pour le suivre. */
  let pending: HTMLElement | null = null

  const scale = (): number => displayLayout(measureDisplay(win)).scale

  /**
   * Où est la carte du guide : en bas (le cas ordinaire) ou en haut (`keep-clear.ts`, pour ne pas couvrir un mur de cookies). Le contrôle et son repère doivent rester dans
   * l'espace qu'elle laisse : `low` (sous la carte quand elle est en haut) et `limit` (au-dessus d'elle quand elle est en bas).
   */
  function room(s: number): { low: number; limit: number } {
    const box = card()
    if (box !== null && box.top + box.height / 2 < win.innerHeight / 2) {
      return { low: box.bottom + CLEARANCE * s, limit: win.innerHeight }
    }
    return { low: 0, limit: (box?.top ?? win.innerHeight) - CLEARANCE * s }
  }

  /** Fait défiler la page, une seule fois, pour que le contrôle et son repère restent visibles HORS de la carte du guide (au-dessus d'elle, ou en dessous si elle est en haut). */
  function bringIntoView(target: HTMLElement, s: number): void {
    try {
      const { low, limit } = room(s)
      const fits = () => {
        const rect = target.getBoundingClientRect()
        return rect.top >= low && rect.bottom + (GAP * 2 + TAG_HEIGHT) * s <= limit
      }
      if (fits()) return
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
      if (!fits()) {
        const rect = target.getBoundingClientRect()
        win.scrollBy(
          0,
          rect.top < low ? rect.top - low : rect.bottom + (GAP * 2 + TAG_HEIGHT) * s - limit,
        )
      }
    } catch {
      // La page refuse de défiler : le cadre se pose là où est le contrôle.
    }
  }

  /**
   * Le contrôle à entourer : relu au plus une fois par seconde, ou tout de suite à la demande. Un contrôle gardé parce qu'il est encore dans la page ne suffit pas (DRV-759, mesuré :
   * la liste des magasins se réécrit et le repère restait sur un contrôle que la lecture ne désignait plus, bien plus bas que la première carte).
   */
  function resolve(): HTMLElement | null {
    const at = Date.now()
    if (refresh || at - resolvedAt >= RESOLVE_MS) {
      let spot = get()
      // Un autre contrôle n'est suivi que lu deux fois de suite : une lecture qui alterne chaque seconde ne fait pas sauter le repère (DRV-759)
      if (
        cached?.isConnected === true &&
        spot !== null &&
        spot.element !== cached &&
        spot.element !== pending
      ) {
        pending = spot.element
        spot = { element: cached, word }
      }
      // Un autre contrôle : le repère revient (la page ne défile qu'une fois pour lui)
      if (spot?.element !== cached) {
        scrolled = false
        touchedAt = 0
      }
      cached = spot?.element ?? null
      word = spot?.word
      resolvedAt = at
      refresh = false
    } else if (cached?.isConnected !== true) {
      cached = null
    }
    return cached
  }

  function layout(): void {
    if (view === null) return
    // Un conteneur que la page a retiré ou réécrit (un panneau qui s'ouvre) est remis, épinglé (DRV-757)
    if (!view.host.isConnected) win.document.documentElement.appendChild(view.host)
    pin(view.host)
    const target = resolve()
    const rect = target?.isConnected === true ? boxOf(target, word) : null
    const s = scale()
    // Touché, ou le champ où la personne écrit : le repère n'a plus rien à dire (il recouvrirait la ville proposée dessous)
    const touched =
      target !== null &&
      (Date.now() - touchedAt < TOUCHED_MS || target.contains(win.document.activeElement))
    const visible =
      !touched &&
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
    const radius = word === undefined ? px(win.getComputedStyle(target).borderTopLeftRadius) : 6
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
    const { low, limit } = room(s)
    const below = rect.bottom + out + CLEARANCE * s
    const above = rect.top - out - CLEARANCE * s - height
    const left = Math.max(8 * s, Math.min(rect.left, win.innerWidth - width - 8 * s))
    // Le repère ne couvre pas ce que la page vient d'afficher : au-dessous du contrôle, sinon au-dessus ; sans place libre, le cadre seul
    const others = [...avoid()].filter((box) => box.width > 0 && box.height > 0)
    const free = (at: number): boolean =>
      !others.some(
        (box) =>
          box.left < left + width &&
          box.right > left &&
          box.top < at + height &&
          box.bottom > at &&
          !(
            box.top <= rect.top + 1 &&
            box.bottom >= rect.bottom - 1 &&
            box.left <= rect.left + 1 &&
            box.right >= rect.right - 1
          ),
      )
    const fitsBelow = below + height <= Math.min(limit + CLEARANCE * s - 4 * s, win.innerHeight)
    const roomAbove = above >= low
    const placeAbove = (!fitsBelow || !free(below)) && roomAbove
    tag.hidden = !(placeAbove ? free(above) : fitsBelow && free(below)) && others.length > 0
    tag.classList.toggle('above', placeAbove)
    tag.style.setProperty('left', `${left}px`)
    tag.style.setProperty('top', `${placeAbove ? above : below}px`)
    // La flèche vise le milieu du contrôle, sans sortir du repère
    const aim = rect.left + rect.width / 2 - left - 9 * s
    view.arrow.setAttribute(
      'style',
      `margin-left:${Math.max(6, Math.min(aim, Math.max(6, width - 24 * s))) / s}px`,
    )
  }

  const onResize = (): void => {
    refresh = true
    schedule()
  }

  /** Un toucher sur le contrôle (ou dedans) : le repère s'efface. */
  const onTouch = (event: Event): void => {
    if (cached !== null && event.composedPath().includes(cached)) {
      touchedAt = Date.now()
      schedule()
    }
  }

  const schedule = (): void => {
    if (frame !== 0) return
    // Une fenêtre sans images d'animation (un document de test) : mesure tout de suite
    if (typeof win.requestAnimationFrame !== 'function') return layout()
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
    win.addEventListener('resize', onResize)
    win.addEventListener('pointerdown', onTouch, { capture: true, passive: true })
    win.addEventListener('focusin', schedule, true)
    win.addEventListener('focusout', schedule, true)
    win.visualViewport?.addEventListener('resize', onResize)
    win.visualViewport?.addEventListener('scroll', schedule)
    return view
  }

  return {
    point(next, nextCard, nextAvoid = () => []) {
      get = next
      card = nextCard
      avoid = nextAvoid
      touchedAt = 0
      scrolled = false
      cached = null
      resolvedAt = 0
      refresh = true
      mount()
      layout()
      // La page finit de se dessiner après l'arrivée du guide (images, polices) : le cadre est remesuré de temps en temps, sans relire le contrôle à chaque fois.
      win.clearInterval(timer)
      timer = win.setInterval(layout, REMEASURE_MS)
    },
    refresh() {
      refresh = true
      schedule()
    },
    clear() {
      win.clearInterval(timer)
      cached = null
      if (frame !== 0) win.cancelAnimationFrame(frame)
      frame = 0
      if (view === null) return
      win.removeEventListener('scroll', schedule, { capture: true })
      win.removeEventListener('resize', onResize)
      win.removeEventListener('pointerdown', onTouch, { capture: true })
      win.removeEventListener('focusin', schedule, true)
      win.removeEventListener('focusout', schedule, true)
      win.visualViewport?.removeEventListener('resize', onResize)
      win.visualViewport?.removeEventListener('scroll', schedule)
      view.host.remove()
      view = null
    },
  }
}

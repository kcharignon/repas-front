// L'interface superposée : un Shadow DOM fermé dans un conteneur plein écran, au-dessus de la page de l'enseigne.
import type { RetailerInfo } from '../retailers/names'
import { append, clear, h } from './dom'
import { displayLayout, measureDisplay, type DisplayLayout } from './scale'
import { RENDERERS, type Rendered } from './screens'
import { S } from './strings'
import { STYLES } from './styles'
import type { ProgressPatch, ScreenAnswer, ScreenName, ScreenProps, Ui } from './types'

export interface UiOptions {
  /** La fenêtre de la page. */
  win?: Window & typeof globalThis
  /**
   * `closed` (par défaut) : la page ne peut pas lire l'interface. `open` ne sert qu'aux tests d'accessibilité, dont l'outil ne
   * traverse pas un Shadow DOM fermé.
   */
  mode?: 'closed' | 'open'
  /** Comment poser le Shadow DOM sur le conteneur : l'`attachShadow` pris au démarrage de l'agent (`primitives.ts`) ; à défaut, celui du conteneur. */
  attachShadow?: (host: Element, init: ShadowRootInit) => ShadowRoot
  /** L'enseigne de la page : les écrans la nomment par son nom (jamais écrit en dur, DRV-705). */
  retailer: RetailerInfo
}

/** L'interface, et son conteneur dans la page (`null` tant qu'aucun écran n'est affiché). */
export interface UiHandle extends Ui {
  readonly host: HTMLElement | null
}

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]'

/**
 * Le conteneur est épinglé par des déclarations en ligne `!important`, posées par l'objet CSSOM (une politique de sécurité de la page
 * peut interdire l'attribut `style`, pas cet objet) : une règle de la page, `!important` comprise, ne peut ni le cacher ni le déplacer.
 */
function pin(host: HTMLElement): void {
  const rules: [string, string][] = [
    ['all', 'initial'],
    ['display', 'block'],
    ['position', 'fixed'],
    ['inset', '0'],
    ['z-index', '2147483647'],
    ['visibility', 'visible'],
    ['opacity', '1'],
    ['pointer-events', 'auto'],
  ]
  for (const [name, value] of rules) host.style.setProperty(name, value, 'important')
}

/**
 * Pose le cadre de l'interface sur la zone visible de la page, agrandi de son facteur (`scale.ts`) : sa largeur, en pixels CSS, est alors celle
 * de l'écran en dp, comme sur un téléphone ordinaire, et il remplit exactement la zone (aucun défilement horizontal). Par des déclarations
 * CSSOM (`style.setProperty`), comme le conteneur : une politique de sécurité de la page peut interdire l'attribut `style`, pas cet objet.
 */
function place(overlay: HTMLElement, layout: DisplayLayout): void {
  const { style } = overlay
  if (layout.width <= 0 || layout.height <= 0) {
    // Aucune mesure : le cadre remplit le conteneur, à l'échelle de la page (feuille de style).
    for (const name of ['left', 'top', 'width', 'height', 'transform']) style.removeProperty(name)
    return
  }
  style.setProperty('left', `${layout.left}px`)
  style.setProperty('top', `${layout.top}px`)
  style.setProperty('width', `${layout.width / layout.scale}px`)
  style.setProperty('height', `${layout.height / layout.scale}px`)
  if (layout.scale === 1) style.removeProperty('transform')
  else style.setProperty('transform', `scale(${layout.scale})`)
}

/** Feuille de style sans balise `<style>` (une politique de sécurité de la page pourrait l'interdire) ; à défaut, la balise. */
function installStyles(win: Window & typeof globalThis, root: ShadowRoot): void {
  try {
    const sheet = new win.CSSStyleSheet()
    sheet.replaceSync(STYLES)
    root.adoptedStyleSheets = [sheet]
  } catch {
    root.appendChild(h('style', { text: STYLES }))
  }
}

export function createUi(options: UiOptions): UiHandle {
  const win = options.win ?? window
  const mode = options.mode ?? 'closed'
  const attach = options.attachShadow ?? ((target, init) => target.attachShadow(init))
  let view: {
    host: HTMLElement
    root: ShadowRoot
    overlay: HTMLElement
    backdrop: HTMLElement
    current: Rendered | null
  } | null = null
  /** Remet le cadre à la bonne échelle quand l'affichage change : fenêtre, rotation, clavier, zoom ou défilement de la zone visible. */
  const replace = () => {
    if (view) place(view.overlay, displayLayout(measureDisplay(win)))
  }
  /** Numéro du dernier écran affiché : la réponse d'un écran remplacé est ignorée. */
  let serial = 0

  function mount() {
    if (view) return view
    const host = h('div')
    pin(host)
    const root = attach(host, { mode })
    installStyles(win, root)
    const overlay = h('div', {
      class: 'overlay',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': S.dialog },
    })
    overlay.addEventListener('keydown', (event) => trapFocus(event as KeyboardEvent, root, overlay))
    // Le fond remplit toute la fenêtre ; le cadre, lui, suit la zone visible (la page peut être agrandie au pincement).
    const backdrop = h('div', { class: 'backdrop' })
    append(root, backdrop, overlay)
    win.document.documentElement.appendChild(host)
    view = { host, root, overlay, backdrop, current: null }
    replace()
    win.addEventListener('resize', replace)
    win.visualViewport?.addEventListener('resize', replace)
    win.visualViewport?.addEventListener('scroll', replace)
    return view
  }

  return {
    retailer: options.retailer,
    get host() {
      return view?.host ?? null
    },
    show<K extends ScreenName>(screen: K, props: ScreenProps<K>): Promise<ScreenAnswer<K>> {
      const shown = mount()
      shown.current?.dispose?.()
      const mine = ++serial
      return new Promise((resolve) => {
        const render = RENDERERS[screen] as (
          props: ScreenProps<K>,
          answer: (value: ScreenAnswer<K>) => void,
          retailer: RetailerInfo,
        ) => Rendered
        const rendered = render(
          props,
          (value) => {
            if (mine === serial) resolve(value)
          },
          options.retailer,
        )
        clear(shown.overlay)
        shown.overlay.appendChild(rendered.el)
        shown.current = rendered
        setSheet(shown, rendered.sheet === true)
        setDark(shown, rendered.dark === true)
        rendered.start?.()
        rendered.el.scrollTop = 0
        const first = rendered.focus ?? rendered.el.querySelector<HTMLElement>(FOCUSABLE)
        first?.focus({ preventScroll: true })
      })
    },
    update(patch: ProgressPatch) {
      view?.current?.update?.(patch)
    },
    close() {
      serial += 1
      view?.current?.dispose?.()
      view?.host.remove()
      if (view) {
        win.removeEventListener('resize', replace)
        win.visualViewport?.removeEventListener('resize', replace)
        win.visualViewport?.removeEventListener('scroll', replace)
      }
      view = null
    },
  }
}

/**
 * Un bandeau (`sheet`) laisse la page visible et touchable : le conteneur ne capte plus les touchers (seul le bandeau les capte, `styles.ts`), il
 * n'y a pas de fond et la fenêtre n'est plus modale. Tout autre écran remet le plein écran. Par une déclaration CSSOM `!important`, comme le reste
 * de l'épinglage : une règle de la page ne la bat pas.
 */
function setSheet(
  view: { host: HTMLElement; overlay: HTMLElement; backdrop: HTMLElement },
  sheet: boolean,
): void {
  view.overlay.classList.toggle('sheet', sheet)
  view.overlay.setAttribute('aria-modal', sheet ? 'false' : 'true')
  view.backdrop.hidden = sheet
  view.host.style.setProperty('pointer-events', sheet ? 'none' : 'auto', 'important')
}

/**
 * Une palette sombre propre à l'écran (`dark`, DRV-744 : l'écran de progression), posée sur le cadre ET sur le fond pour qu'aucune marge claire ne
 * reste visible quand le cadre ne remplit pas toute la fenêtre. Tout autre écran retrouve la palette du thème du téléphone.
 */
function setDark(view: { overlay: HTMLElement; backdrop: HTMLElement }, dark: boolean): void {
  view.overlay.classList.toggle('dark', dark)
  view.backdrop.classList.toggle('dark', dark)
}

/** Garde le clavier dans l'écran : Tab après le dernier élément revient au premier, Maj+Tab avant le premier va au dernier. */
function trapFocus(event: KeyboardEvent, root: ShadowRoot, overlay: HTMLElement): void {
  if (event.key !== 'Tab') return
  // Une partie cachée (`hidden` : la confirmation de l'écran de choix, le rapport du diagnostic) n'est pas dans l'ordre de tabulation.
  const items = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (item) => item.closest('[hidden]') === null,
  )
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = root.activeElement
  if (event.shiftKey && (active === first || !overlay.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !overlay.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

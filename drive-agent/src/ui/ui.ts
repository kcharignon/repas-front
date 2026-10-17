// L'interface superposée : un Shadow DOM fermé dans un conteneur plein écran, au-dessus de la page de l'enseigne.
import { append, clear, h } from './dom'
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

export function createUi(options: UiOptions = {}): UiHandle {
  const win = options.win ?? window
  const mode = options.mode ?? 'closed'
  let view: {
    host: HTMLElement
    root: ShadowRoot
    overlay: HTMLElement
    current: Rendered | null
  } | null = null
  /** Numéro du dernier écran affiché : la réponse d'un écran remplacé est ignorée. */
  let serial = 0

  function mount() {
    if (view) return view
    const host = h('div')
    pin(host)
    const root = host.attachShadow({ mode })
    installStyles(win, root)
    const overlay = h('div', {
      class: 'overlay',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': S.dialog },
    })
    overlay.addEventListener('keydown', (event) => trapFocus(event as KeyboardEvent, root, overlay))
    append(root, overlay)
    win.document.documentElement.appendChild(host)
    view = { host, root, overlay, current: null }
    return view
  }

  return {
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
        ) => Rendered
        const rendered = render(props, (value) => {
          if (mine === serial) resolve(value)
        })
        clear(shown.overlay)
        shown.overlay.appendChild(rendered.el)
        shown.current = rendered
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
      view = null
    },
  }
}

/** Garde le clavier dans l'écran : Tab après le dernier élément revient au premier, Maj+Tab avant le premier va au dernier. */
function trapFocus(event: KeyboardEvent, root: ShadowRoot, overlay: HTMLElement): void {
  if (event.key !== 'Tab') return
  const items = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)]
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

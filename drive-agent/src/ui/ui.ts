// L'interface superposée : un Shadow DOM fermé dans un conteneur plein écran, au-dessus de la page de l'enseigne.
import type { RetailerInfo } from '../retailers/names'
import { append, clear, h } from './dom'
import { safe, type CardFacts } from '../diagnostic/foreground'
import { fitGuide, reachable, touchVerdict, type Fit } from './fit'
import { createPointer, type Pointer } from './pointer'
import { displayLayout, measureDisplay, type DisplayLayout } from './scale'
import { installStyles } from './sheet'
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
  /** Un écran est à l'écran (vrai) ou plus aucun (faux) : dit à l'application, qui pose un bandeau de repli quand l'agent est là mais ne montre rien (DRV-760). */
  onVisible?: (shown: boolean) => void
}

/** L'interface, et son conteneur dans la page (`null` tant qu'aucun écran n'est affiché). */
export interface UiHandle extends Ui {
  readonly host: HTMLElement | null
  /** Ce que l'application peut lire de la carte quand « aucune carte » (DRV-760) : des formes seulement ; `step` : le dernier état du flux, donné par l'appelant. */
  probe(step: string | null): CardFacts
}

/** Combien de fois par ouverture le conteneur est remis en dernier enfant du document. */
const MAX_MOVES = 3

/** L'interface a-t-elle le focus ? (Un Shadow DOM fermé : l'élément actif du document est son hôte.) */
function hasFocus(win: Window, host: Element): boolean {
  return win.document.activeElement === host
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
  /** Le cadre et le repère que le guide pose dans la page (DRV-751), dans un second conteneur ; créé au premier besoin. */
  let pointer: Pointer | null = null
  /** La place de la carte du guide (DRV-757) : réduite, en haut ou en bas, ou effacée quand la page a besoin de la place. */
  let fit: Fit | null = null
  let present = 0
  /** Les déplacements du conteneur depuis l'ouverture (plafonnés : `MAX_MOVES`). */
  let moves = 0
  let lastShown: boolean | null = null
  /** L'écran affiché (pour le diagnostic de la carte). */
  let screenName: ScreenName | null = null
  const report = (shown: boolean): void => {
    if (shown === lastShown) return
    lastShown = shown
    options.onVisible?.(shown)
  }

  function mount() {
    if (view) return view
    const host = h('div')
    pin(host)
    const root = attach(host, { mode })
    installStyles(win, root, STYLES)
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
    // La page peut retirer ou réécrire un conteneur étranger quand elle se redessine (un panneau qui s'ouvre) : il est remis à sa place, épinglé, sans que la carte revienne de zéro (DRV-757)
    moves = 0
    present = win.setInterval(() => {
      if (view === null) return
      const { host } = view
      if (!host.isConnected) {
        // La page l'a retiré : il revient, toujours
        win.document.documentElement.appendChild(host)
      } else if (host.nextElementSibling !== null && moves < MAX_MOVES && !hasFocus(win, host)) {
        // Un élément a été ajouté à <html> APRÈS l'agent (les murs posés dans <body> sont déjà avant lui) : à z-index égal le dernier est au-dessus, l'agent redevient le dernier. Au plus
        // trois fois par ouverture et jamais s'il a le focus : un site qui remet sa couche en dernier à chaque passe ferait battre l'agent sans fin (perte de focus, animations relancées)
        moves += 1
        win.document.documentElement.appendChild(host)
      }
      pin(host)
      setSheet(view, view.overlay.classList.contains('sheet'))
      // Un écran sans placement (progression, résumé…) peut aussi être recouvert par un mur en couche supérieure : le repli de l'application doit le savoir
      if (fit === null && view.current !== null) report(reachable(view.current.el, win))
    }, 500)
    return view
  }

  return {
    retailer: options.retailer,
    get host() {
      return view?.host ?? null
    },
    show<K extends ScreenName>(screen: K, props: ScreenProps<K>): Promise<ScreenAnswer<K>> {
      const shown = mount()
      screenName = screen
      shown.current?.dispose?.()
      pointer?.clear()
      fit?.stop()
      fit = null
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
        if (rendered.pointAt !== undefined) {
          pointer ??= createPointer({ win, attachShadow: attach, mode })
          pointer.point(
            rendered.pointAt,
            () => (rendered.el.hidden ? null : rendered.el.getBoundingClientRect()),
            rendered.avoid,
          )
        }
        if (rendered.fit !== undefined) {
          const placing = rendered.fit
          fit = fitGuide(win, rendered.el, {
            needs: placing.needs,
            consent: placing.consent,
            collapsible: placing.collapsible,
            pointed: () => rendered.pointAt?.()?.element ?? null,
            changed: () => pointer?.refresh(),
            visible: report,
          })
          const placed = fit
          placing.link.ask = (pref) => placed.ask(pref)
        }
        if (rendered.fit === undefined) report(reachable(rendered.el, win))
        rendered.start?.()
        rendered.el.scrollTop = 0
        const first = rendered.focus ?? rendered.el.querySelector<HTMLElement>(FOCUSABLE)
        first?.focus({ preventScroll: true })
      })
    },
    probe(step) {
      const host = view?.host ?? null
      const card = view?.current?.el ?? null
      const rect = card?.getBoundingClientRect()
      const active = win.document.activeElement
      return {
        shown: lastShown,
        screen: card === null ? null : screenName,
        box: rect
          ? ([rect.left, rect.top, rect.width, rect.height].map(Math.round) as [
              number,
              number,
              number,
              number,
            ])
          : null,
        touch: card === null ? null : touchVerdict(card, win),
        last: host === null ? null : host.parentElement?.lastElementChild === host,
        moves,
        active: active === null ? '' : safe(active.tagName.toLowerCase()),
        step,
      }
    },
    update(patch: ProgressPatch) {
      view?.current?.update?.(patch)
    },
    close() {
      serial += 1
      pointer?.clear()
      fit?.stop()
      fit = null
      win.clearInterval(present)
      // Rien n'avait été montré (une fermeture sans écran) : rien à dire de plus, l'application n'a pas à apprendre qu'un écran « disparaît » (DRV-760)
      if (lastShown !== null) report(false)
      view?.current?.dispose?.()
      view?.host.remove()
      screenName = null
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

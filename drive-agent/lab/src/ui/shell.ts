// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Coquille du banc : superposition en Shadow DOM, menu des essais (les 12 du ticket, plus le 3b), cadre plein écran.
import { LAB_NOTICE } from '../config'
import type { LabEnv } from '../env'
import { ESSAIS } from '../essais'
import { formatEvent } from '../frame'
import { maskStore } from '../redact'
import { parseStore } from '../store'
import { append, clear, h } from './dom'
import { STYLES } from './styles'
import type { Essai, FrameSession, LabState, ScreenContext } from './types'
import { button } from './widgets'

export const HOST_ID = 'repas-lab-host'
const OPEN_EVENT = 'repas-lab:open'

export interface Lab {
  host: HTMLElement
  state: LabState
  open(): void
  close(): void
  showMenu(): void
  showEssai(id: number | string): void
}

/** Feuille de style sans `<style>` (une politique de sécurité de la page pourrait l'interdire) ; à défaut, un élément `<style>`. */
function installStyles(root: ShadowRoot): void {
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(STYLES)
    root.adoptedStyleSheets = [sheet]
  } catch {
    root.appendChild(h('style', { text: STYLES }))
  }
}

export function createLab(env: LabEnv): Lab {
  const doc = env.win.document
  const state: LabState = { lastQuery: null, lastProducts: [], lastAdded: null, frame: null }

  const host = h('div', { attrs: { id: HOST_ID } })
  const root = host.attachShadow({ mode: 'open' })
  installStyles(root)

  const title = h('h1', { text: 'Banc d’essai', attrs: { tabindex: '-1' } })
  const back = button('← Menu', () => showMenu())
  const closeButton = button('Fermer', () => close())
  const main = h('main')
  const overlay = h(
    'div',
    {
      class: 'overlay',
      hidden: true,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Banc d’essai Repas' },
    },
    h('header', {}, back, title, closeButton),
    h('p', { class: 'notice', text: LAB_NOTICE }),
    main,
  )
  const frameLayer = h('div')
  append(root, overlay, frameLayer)
  overlay.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') close()
  })

  const store = () => parseStore(env.win.location)

  function openFrame(url: string, onLoad: (iframe: HTMLIFrameElement) => void): FrameSession {
    state.frame?.close()
    const iframe = h('iframe', {
      class: 'lab-frame',
      attrs: { title: 'Page du magasin dans le cadre' },
    })
    iframe.addEventListener('load', () => onLoad(iframe))
    iframe.src = url

    const live = h('p', {
      class: 'live',
      text: 'Cadre ouvert. Ajoute un produit avec les boutons de Leclerc : il sera repéré ici.',
      attrs: { role: 'status', 'aria-live': 'polite' },
    })
    let opened = true
    const session: FrameSession = {
      iframe,
      events: [],
      disarm: null,
      onEvent: null,
      record(event) {
        session.events.push(event)
        live.textContent = maskStore(formatEvent(event), store())
        session.onEvent?.(event)
      },
      show() {
        bar.hidden = false
        iframe.hidden = false
        overlay.hidden = true
      },
      hide() {
        bar.hidden = true
        iframe.hidden = true
        overlay.hidden = false
      },
      close() {
        session.disarm?.()
        session.disarm = null
        bar.remove()
        iframe.remove()
        opened = false
        if (state.frame === session) state.frame = null
        overlay.hidden = false
      },
      isOpen: () => opened,
    }
    const bar = h(
      'div',
      { class: 'framebar' },
      button('Retour au banc', () => session.hide()),
      button('Fermer le cadre', () => session.close(), 'danger'),
      live,
    )
    append(frameLayer, bar, iframe)
    overlay.hidden = true
    state.frame = session
    return session
  }

  const context: ScreenContext = { env, state, main, store, openFrame }

  function screen(heading: string, withBack: boolean): void {
    clear(main)
    title.textContent = heading
    back.hidden = !withBack
    overlay.scrollTop = 0
    title.focus()
  }

  function showMenu(): void {
    screen('Banc d’essai', false)
    const list = h('ul', { class: 'menu' })
    for (const essai of ESSAIS) {
      list.appendChild(
        h(
          'li',
          {},
          h(
            'button',
            { attrs: { type: 'button' }, on: { click: () => showEssai(essai.id) } },
            h('span', { class: 'num', text: `${essai.id}.` }),
            h('strong', { text: essai.title }),
            h('br'),
            h('span', { class: 'hint', text: essai.summary }),
          ),
        ),
      )
    }
    append(
      main,
      h('p', { class: 'hint', text: 'Touche un essai. Chaque résultat se copie.' }),
      list,
    )
  }

  function showEssai(id: number | string): void {
    const essai: Essai | undefined = ESSAIS.find((item) => item.id === id)
    if (!essai) return
    screen(`${essai.id}. ${essai.title}`, true)
    essai.render(context)
  }

  function open(): void {
    overlay.hidden = false
    showMenu()
  }

  function close(): void {
    state.frame?.close()
    overlay.hidden = true
  }

  host.addEventListener(OPEN_EVENT, open)
  const parent = doc.body ?? doc.documentElement
  parent.appendChild(host)
  return { host, state, open, close, showMenu, showEssai }
}

/** Lancement par le favori : ouvre le banc, ou rouvre celui qui existe déjà sur la page. */
export function launch(env: LabEnv): Lab | null {
  const existing = env.win.document.getElementById(HOST_ID)
  if (existing) {
    existing.dispatchEvent(new env.win.CustomEvent(OPEN_EVENT))
    return null
  }
  const lab = createLab(env)
  lab.open()
  return lab
}

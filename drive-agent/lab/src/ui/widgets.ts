// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Petits éléments d'interface partagés par les essais.
import { maskStore } from '../redact'
import { append, h } from './dom'
import type { ScreenContext } from './types'

export function button(
  label: string,
  onClick: () => void,
  kind: 'primary' | 'plain' | 'danger' = 'plain',
): HTMLButtonElement {
  return h('button', {
    text: label,
    class: kind === 'plain' ? '' : kind,
    attrs: { type: 'button' },
    on: { click: onClick },
  })
}

let counter = 0

/** Un champ avec son étiquette ; l'étiquette est reliée au champ (lecteurs d'écran, toucher sur le texte). */
export function labelled<T extends HTMLElement>(label: string, control: T): HTMLElement {
  const id = `lab-champ-${++counter}`
  control.id = id
  return h('div', {}, h('label', { text: label, attrs: { for: id } }), control)
}

export function hint(text: string): HTMLElement {
  return h('p', { class: 'hint', text })
}

export function heading(text: string): HTMLElement {
  return h('h2', { text })
}

export interface ResultsPanel {
  el: HTMLElement
  set(lines: readonly string[]): void
  add(...lines: string[]): void
  clear(): void
  text(): string
  status(message: string): void
}

/** Zone de résultat : texte lisible, copiable (le numéro du magasin y est masqué), effaçable. */
export function resultsPanel(ctx: ScreenContext): ResultsPanel {
  const lines: string[] = []
  const out = h('pre', {
    class: 'out',
    attrs: { tabindex: '0', 'aria-label': 'Résultat de l’essai' },
  })
  const status = h('p', { class: 'status', attrs: { role: 'status' } })
  const render = () => {
    out.textContent = lines.length > 0 ? lines.join('\n') : 'Pas encore de résultat.'
  }
  const text = () => lines.join('\n')

  const copy = button(
    'Copier le résultat',
    () => {
      void ctx.env.copy(maskStore(text(), ctx.store())).then((done) => {
        status.textContent = done
          ? 'Copié. Le numéro du magasin est masqué dans le texte copié.'
          : 'La copie a échoué : appuie longuement sur le texte pour le sélectionner.'
      })
    },
    'primary',
  )
  const erase = button('Effacer', () => {
    lines.length = 0
    status.textContent = ''
    render()
  })

  const el = h('section', { attrs: { 'aria-live': 'polite', 'aria-label': 'Résultat' } })
  append(el, h('h2', { text: 'Résultat' }), out, h('div', { class: 'row' }, copy, erase), status)
  render()

  return {
    el,
    set(next) {
      lines.length = 0
      lines.push(...next)
      render()
    },
    add(...more) {
      lines.push(...more)
      render()
      out.scrollTop = out.scrollHeight
    },
    clear() {
      lines.length = 0
      render()
    },
    text,
    status(message) {
      status.textContent = message
    },
  }
}

/** Demande de confirmation explicite avant une écriture : rien ne part tant que l'utilisateur n'a pas touché « confirmer ». */
export function confirmBox(
  container: HTMLElement,
  options: { message: string[]; confirmLabel: string; danger?: boolean },
  onConfirm: () => void,
): HTMLElement {
  const box = h('div', {
    class: 'card alert',
    attrs: { role: 'alertdialog', 'aria-label': 'Confirmation' },
  })
  const close = () => box.remove()
  append(
    box,
    ...options.message.map((line) => h('p', { text: line })),
    h(
      'div',
      { class: 'row' },
      button(
        options.confirmLabel,
        () => {
          close()
          onConfirm()
        },
        options.danger ? 'danger' : 'primary',
      ),
      button('Annuler', close),
    ),
  )
  container.appendChild(box)
  return box
}

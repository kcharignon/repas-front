// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Tout ce que le banc demande à la page ou au navigateur passe par ici : les tests le remplacent par des doubles.
import type { FetchFn } from './http'

export type PageWindow = Window & typeof globalThis

export interface LabEnv {
  win: PageWindow
  /** `fetch` de la page (celui de la page, pas une copie : l'anti-bot y accroche ses propres contrôles). */
  fetch: FetchFn
  sleep: (ms: number) => Promise<void>
  random: () => number
  now: () => number
  /** Navigation de la page entière (essais 7 et 8). */
  navigate: (url: string) => void
  /** Copie dans le presse-papiers ; `false` si le navigateur refuse. */
  copy: (text: string) => Promise<boolean>
}

export async function copyText(win: PageWindow, text: string): Promise<boolean> {
  try {
    if (win.navigator.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refus (pas de geste de l'utilisateur, contexte non sécurisé) : on essaie l'ancienne méthode.
  }
  try {
    const area = win.document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    win.document.body.appendChild(area)
    area.select()
    const done = win.document.execCommand('copy')
    area.remove()
    return done
  } catch {
    return false
  }
}

export function realEnv(win: PageWindow = window as PageWindow): LabEnv {
  return {
    win,
    fetch: (input, init) => win.fetch(input, init),
    sleep: (ms) => new Promise((resolve) => win.setTimeout(resolve, ms)),
    random: () => Math.random(),
    now: () => Date.now(),
    navigate: (url) => win.location.assign(url),
    copy: (text) => copyText(win, text),
  }
}

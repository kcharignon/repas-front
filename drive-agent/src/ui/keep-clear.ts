// Une carte du guide ne doit jamais cacher les boutons d'un mur de cookies (DRV-753). Le premier usage d'une enseigne montre souvent un mur (« Tout accepter », « Continuer
// sans accepter »…) : la personne doit pouvoir le toucher, et la carte doit rester visible. Le mur n'est pas à nous : on LIT la position de ses boutons (aucun toucher, aucune
// modification de la page, aucun texte envoyé nulle part) et on pose la carte en bas, ou en haut quand le bas les couvrirait. Si les deux places les couvrent, elle reste en bas.
import { foldLabel } from '../retailers/guide'

/** Les libellés EXACTS (sans accent ni casse) des boutons d'un mur de cookies : choisir, accepter, refuser ou régler. Un libellé qui les contient seulement n'en est pas un. */
const CONSENT_LABELS = new Set([
  'tout accepter',
  'accepter tout',
  'accepter',
  'accepter et fermer',
  "j'accepte",
  'tout refuser',
  'refuser tout',
  'refuser',
  'continuer sans accepter',
  'parametrer les cookies',
  'parametrer mes cookies',
  'parametrer',
  'personnaliser',
  'personnaliser mes choix',
  'gerer mes choix',
  'gerer les cookies',
  'gerer mes cookies',
  'parametres des cookies',
])

const CLICKABLE = 'button, a, [role="button"], input[type="button"], input[type="submit"]'
/** La place qu'on laisse entre la carte et un bouton du mur, en pixels de la page. */
const AIR = 8
/** Le rythme de relecture : le mur se dessine ou se ferme après l'arrivée de la carte. */
const KEEP_CLEAR_MS = 500
/** Le nom du côté haut, dans la feuille de style de l'interface. */
export const AT_TOP = 'top'

/** Les boîtes, à l'écran, des boutons du mur de cookies que la page montre. Une lecture de la page seule. */
export function consentRects(doc: Document, width: number, height: number): DOMRect[] {
  const found: DOMRect[] = []
  for (const element of doc.querySelectorAll<HTMLElement>(CLICKABLE)) {
    const labels = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('value'),
    ].map((label) => foldLabel(label ?? ''))
    if (!labels.some((label) => CONSENT_LABELS.has(label))) continue
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0
    if (visible && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width) {
      found.push(rect)
    }
  }
  return found
}

const covers = (card: DOMRect, rects: readonly DOMRect[]): boolean =>
  rects.some(
    (rect) =>
      rect.left < card.right + AIR &&
      rect.right > card.left - AIR &&
      rect.top < card.bottom + AIR &&
      rect.bottom > card.top - AIR,
  )

/** Place la carte en bas, ou en haut si le bas couvre un bouton du mur et que le haut n'en couvre aucun. */
export function arrange(card: HTMLElement, rects: readonly DOMRect[]): void {
  card.classList.remove(AT_TOP)
  if (rects.length === 0 || !covers(card.getBoundingClientRect(), rects)) return
  card.classList.add(AT_TOP)
  if (covers(card.getBoundingClientRect(), rects)) card.classList.remove(AT_TOP)
}

/** Garde la carte hors des boutons du mur de cookies, tant que la fonction rendue n'est pas appelée. */
export function keepClear(win: Window & typeof globalThis, card: HTMLElement): () => void {
  const check = (): void => {
    try {
      const { innerWidth, innerHeight, document } = win
      arrange(card, consentRects(document, innerWidth, innerHeight))
    } catch {
      // La page ne se laisse pas lire : la carte reste où elle est.
    }
  }
  check()
  const timer = win.setInterval(check, KEEP_CLEAR_MS)
  win.addEventListener('resize', check)
  return () => {
    win.clearInterval(timer)
    win.removeEventListener('resize', check)
  }
}

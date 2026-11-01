// Une carte du guide ne doit jamais cacher les boutons d'un mur de cookies (DRV-753). Le premier usage d'une enseigne montre souvent un mur (« Tout accepter », « Continuer
// sans accepter »…) : la personne doit pouvoir le toucher, et la carte doit rester visible. Le mur n'est pas à nous : on LIT la position de ses boutons (aucun toucher, aucune
// modification de la page, aucun texte envoyé nulle part) et on pose la carte en bas, ou en haut quand le bas les couvrirait. Deux règles passent avant : la carte ne
// va jamais en haut si elle y cacherait le contrôle entouré dans la page ni son repère « Touche ici » (elle reste en bas), et si les deux places couvrent un bouton elle reste en bas.
// LIMITES (non prouvées sur le vrai site) : `querySelectorAll` ne traverse ni Shadow DOM ni iframe : un mur de ce genre rend ce garde sans effet, sans erreur ; les libellés
// sont ceux d'un mur courant, devinés.
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
const KEEP_CLEAR_MS = 1_000
/** Au plus ce nombre de contrôles lus par passe, en partant de la FIN de la page (un mur s'ajoute en fin de document) : un méga-menu ne coûte pas plus. */
export const MAX_SCANNED = 600
/** Un libellé de bouton de mur a 40 caractères au plus ; un contrôle qui contient plus de texte ou plus de trois éléments n'est pas un bouton. */
const MAX_LABEL = 40
const MAX_CHILDREN = 3
/** De quoi couvrir le cadre et le repère « Touche ici » autour du contrôle entouré, en pixels de la page. */
const POINTER_MARGIN = 64
/** Le nom du côté haut, dans la feuille de style de l'interface. */
export const AT_TOP = 'top'

/** Les libellés d'un contrôle, SANS rien lire de gros : l'attribut, la valeur, puis le texte seulement s'il est court et le contrôle simple. */
function labelsOf(element: Element): string[] {
  const labels = [element.getAttribute('aria-label'), element.getAttribute('value')]
  if (element.childElementCount <= MAX_CHILDREN) {
    const text = element.textContent
    if (text !== null && text.length <= MAX_LABEL * 4) labels.push(text)
  }
  return labels
    .filter((label): label is string => label !== null && label.length <= MAX_LABEL * 4)
    .map(foldLabel)
}

/** Les boîtes, à l'écran, des boutons du mur de cookies que la page montre. Une lecture de la page seule, bornée (`MAX_SCANNED`, depuis la fin de la page). */
export function consentRects(doc: Document, width: number, height: number): DOMRect[] {
  const found: DOMRect[] = []
  const all = doc.querySelectorAll<HTMLElement>(CLICKABLE)
  for (let index = all.length - 1; index >= Math.max(0, all.length - MAX_SCANNED); index -= 1) {
    const element = all[index]
    if (element === undefined) continue
    if (!labelsOf(element).some((label) => label.length <= MAX_LABEL && CONSENT_LABELS.has(label)))
      continue
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0
    if (visible && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width) {
      found.push(rect)
    }
  }
  return found
}

const hits = (box: DOMRect, rects: readonly DOMRect[]): boolean =>
  rects.some(
    (rect) =>
      rect.left < box.right + AIR &&
      rect.right > box.left - AIR &&
      rect.top < box.bottom + AIR &&
      rect.bottom > box.top - AIR,
  )

/**
 * Place la carte en bas, ou en haut si le bas couvre un bouton du mur, que le haut n'en couvre aucun ET que le haut ne cache pas ce que `protect` rend (le contrôle entouré
 * et son repère, lus seulement quand le haut est envisagé). Sinon elle reste en bas.
 */
export function arrange(
  card: HTMLElement,
  rects: readonly DOMRect[],
  protect: () => readonly DOMRect[] = () => [],
): void {
  card.classList.remove(AT_TOP)
  if (rects.length === 0 || !hits(card.getBoundingClientRect(), rects)) return
  // Lu AVANT de monter la carte : une fois en haut elle recouvrirait elle-même le contrôle, et on le croirait caché par la page
  const guard = protect()
  card.classList.add(AT_TOP)
  const top = card.getBoundingClientRect()
  if (hits(top, rects) || hits(top, guard)) card.classList.remove(AT_TOP)
}

/**
 * La boîte d'un contrôle entouré, agrandie du cadre et du repère « Touche ici » : ce que la carte ne doit pas cacher. Un contrôle que la personne ne voit pas (hors de
 * l'écran, ou recouvert par un autre élément, comme le champ sous un mur de cookies plein écran) n'a rien à protéger.
 */
export function pointedRects(target: HTMLElement | null): DOMRect[] {
  if (target === null) return []
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return []
  const view = target.ownerDocument.defaultView
  if (view !== null && (rect.bottom <= 0 || rect.top >= view.innerHeight)) return []
  // Sans `elementFromPoint` (un document de test) on ne sait pas : on protège, la carte reste en bas
  const hit = target.ownerDocument.elementFromPoint?.(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  )
  if (hit !== null && hit !== undefined && !target.contains(hit) && !hit.contains(target)) return []
  const top = rect.top - POINTER_MARGIN
  const bottom = rect.bottom + POINTER_MARGIN
  // Un DOMRect n'a que des accesseurs : on en construit un objet plein (les getters ne se copient pas par « ...rect »)
  return [
    {
      top,
      bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: bottom - top,
      x: rect.left,
      y: top,
      toJSON: () => ({}),
    },
  ]
}

/** Garde la carte hors des boutons du mur de cookies, tant que la fonction rendue n'est pas appelée. `pointed` : le contrôle que le guide entoure, s'il y en a un. */
export function keepClear(
  win: Window & typeof globalThis,
  card: HTMLElement,
  pointed: () => HTMLElement | null = () => null,
): () => void {
  const check = (): void => {
    try {
      const { innerWidth, innerHeight, document } = win
      arrange(card, consentRects(document, innerWidth, innerHeight), () => pointedRects(pointed()))
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

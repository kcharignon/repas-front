// La lecture du mur de cookies et du contrôle entouré (DRV-753), dont la place de la carte (`fit.ts`) se sert : jamais d'écriture dans la page. Les libellés du mur et sa lecture
// sont dans `retailers/consent.ts` (les adaptateurs d'enseigne s'en servent aussi).
import { consentButtons, MAX_SCANNED } from '../retailers/consent'

export { MAX_SCANNED }

/** De quoi couvrir le cadre et le repère « Touche ici » autour du contrôle entouré, en pixels de la page. */
const POINTER_MARGIN = 64

/** Les boîtes, à l'écran, des boutons du mur de cookies que la page montre. Une lecture de la page seule, bornée (`MAX_SCANNED`, depuis la fin de la page). */
export function consentRects(doc: Document, width: number, height: number): DOMRect[] {
  return consentButtons(doc, width, height).map((button) => button.getBoundingClientRect())
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

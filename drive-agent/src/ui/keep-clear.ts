// La lecture du mur de cookies et du contrôle entouré (DRV-753), dont la place de la carte (`fit.ts`) se sert : jamais d'écriture dans la page. Les libellés du mur et sa lecture
// sont dans `retailers/consent.ts` (les adaptateurs d'enseigne s'en servent aussi).
import { answerWeight, consentButtons, MAX_SCANNED } from '../retailers/consent'
import { foldLabel } from '../retailers/guide'

export { MAX_SCANNED }

/** De quoi couvrir le cadre et le repère « Touche ici » autour du contrôle entouré, en pixels de la page. */
const POINTER_MARGIN = 64

/**
 * Ce que la personne toucherait à ce point SANS la carte (`ignore` : l'hôte de l'interface de l'agent, que le Shadow DOM fermé rend à la place de la carte) : le premier élément de
 * la pile qui n'est pas la carte. Une lecture seule : la carte n'est pas cachée pour cela. Sans `elementsFromPoint` (un document de test), `elementFromPoint` ; sans l'un ni l'autre, rien.
 */
export function topmost(doc: Document, x: number, y: number, ignore: Element): Element | null {
  if (typeof doc.elementsFromPoint === 'function')
    return (
      doc.elementsFromPoint(x, y).find((one) => one !== ignore && !ignore.contains(one)) ?? null
    )
  return doc.elementFromPoint?.(x, y) ?? null
}

/** Les boîtes, à l'écran, des boutons du mur de cookies que la page montre. Une lecture de la page seule, bornée (`MAX_SCANNED`, depuis la fin de la page). */
export function consentRects(doc: Document, width: number, height: number): DOMRect[] {
  // `w` : ce que coûte de couvrir cette réponse (`answerWeight`), pour la place de la carte quand il n'y en a aucune de libre
  return consentButtons(doc, width, height).map((button) =>
    Object.assign(button.getBoundingClientRect(), { w: answerWeight(button) }),
  )
}

/**
 * La boîte d'un contrôle entouré, agrandie du cadre et du repère « Touche ici » : ce que la carte ne doit pas cacher. Un contrôle que la personne ne voit pas (hors de
 * l'écran, ou recouvert par un autre élément, comme le champ sous un mur de cookies plein écran) n'a rien à protéger.
 */
export function pointedRects(target: HTMLElement | null, ignore: Element | null = null): DOMRect[] {
  if (target === null) return []
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return []
  const view = target.ownerDocument.defaultView
  if (view !== null && (rect.bottom <= 0 || rect.top >= view.innerHeight)) return []
  // Sans `elementFromPoint` (un document de test) on ne sait pas : on protège, la carte reste en bas
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  // `ignore` : la carte de l'agent, que la lecture ne cache pas (DRV-768) et qui ne compte pas parmi ce qui recouvre le contrôle
  const hit =
    ignore === null
      ? target.ownerDocument.elementFromPoint?.(x, y)
      : topmost(target.ownerDocument, x, y, ignore)
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

/** Ce où l'on écrit dans la page : champs, zones de texte, listes, zones éditables. */
const FIELDS =
  'input:not([type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])'
const BUTTONS = 'button, input[type="submit"], input[type="button"], input[type="image"]'
/** Le bouton qui valide un formulaire : de type « submit », ou dont le nom dit de continuer. */
const VALIDATE =
  /^(?:valider|continuer|suivant|envoyer|confirmer|verifier|se connecter|me connecter|connexion)$/

/**
 * Ce qu'une carte du guide ne couvre JAMAIS (DRV-761), quelle que soit l'enseigne et même si elle n'a pas reconnu la page : les champs de saisie, leurs étiquettes et le bouton qui
 * valide le formulaire. Une lecture de la page seule, bornée ; qui les voit vraiment (à l'écran, non recouverts par la page) se juge dans `fit.ts`.
 */
export function formControls(doc: Document): HTMLElement[] {
  const found: HTMLElement[] = []
  for (const field of [...doc.querySelectorAll<HTMLElement>(FIELDS)].slice(0, MAX_SCANNED)) {
    found.push(field, ...Array.from((field as HTMLInputElement).labels ?? []))
  }
  for (const button of [...doc.querySelectorAll<HTMLElement>(BUTTONS)].slice(0, MAX_SCANNED)) {
    const type = button.getAttribute('type')
    const name =
      button.getAttribute('aria-label') ?? button.getAttribute('value') ?? button.textContent ?? ''
    if (type === 'submit' || type === 'image' || VALIDATE.test(foldLabel(name.slice(0, 60))))
      found.push(button)
  }
  return found
}

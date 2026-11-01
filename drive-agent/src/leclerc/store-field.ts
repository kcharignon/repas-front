// Le champ où la personne écrit son code postal sur l'accueil de l'enseigne, quand aucun magasin n'est choisi (DRV-753). Le parcours guidé l'entoure : il n'y écrit JAMAIS, ne le
// touche pas, ne lit que sa position. Le vrai accueil n'a jamais été relevé dans le DOM (constat du propriétaire, 2026-11-01 : un champ de recherche, « Lancer la recherche »,
// « Me géolocaliser », « 1. Je saisis mon code postal ») : on ne devine donc pas un identifiant, on lit des indices que la page écrit à l'intention de la personne, et on ne
// désigne un champ que si on en est sûr. Au moindre doute : `null`, rien n'est entouré (la carte dit quand même quoi faire, sans repère).
import { foldLabel, type GuideTarget } from '../retailers/guide'

/** Les champs où l'on écrit du texte (pas une case, pas un mot de passe, pas un champ caché). */
const TEXT_FIELD =
  'input:not([type]), input[type="text"], input[type="search"], input[type="tel"], input[type="number"]'

/** Le bouton qui lance la recherche du magasin : le champ à entourer est celui qui l'accompagne. */
const SEARCH_LABELS = new Set(['lancer la recherche'])
const CLICKABLE = 'button, [role="button"], input[type="submit"], input[type="button"], a'

/** Un champ que la page montre ; en jsdom, sans mesure, tout champ compte (comme `findControl`). */
const shown = (element: Element): boolean => element.getClientRects().length > 0

const usable = (element: HTMLInputElement): boolean =>
  !element.disabled && !element.readOnly && element.type !== 'hidden'

/** Les mots que la page écrit pour ce champ : son texte d'aide, son nom lu à voix haute, son étiquette, son nom et son identifiant. */
function hintsOf(field: HTMLInputElement): string {
  const doc = field.ownerDocument
  const labels: string[] = []
  if (field.id !== '') {
    for (const label of doc.querySelectorAll('label')) {
      if (label.htmlFor === field.id) labels.push(label.textContent ?? '')
    }
  }
  const wrapping = field.closest('label')
  if (wrapping !== null) labels.push(wrapping.textContent ?? '')
  return foldLabel(
    [
      field.placeholder,
      field.getAttribute('aria-label') ?? '',
      field.title,
      field.name,
      field.id,
      field.getAttribute('autocomplete') ?? '',
      ...labels,
    ].join(' '),
  )
}

/**
 * Le champ de l'accueil de la version mobile (mesuré le 2026-11-01, DRV-754) s'appelle « Où souhaitez-vous récupérer vos courses ? » : un code postal tapé dedans fait
 * apparaître une suggestion de ville, que la personne touche.
 */
const asksPostalCode = (field: HTMLInputElement): boolean =>
  /postal|code postal|zip|\bcp\b|recuperer vos courses/.test(hintsOf(field))

const labelsOfControl = (element: Element): string[] =>
  [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
  ].map((text) => foldLabel(text ?? ''))

/** Le premier champ que la page montre, sinon le premier tout court. */
const firstOf = (fields: HTMLInputElement[]): HTMLInputElement | null =>
  fields.find(shown) ?? fields[0] ?? null

/**
 * Le champ du code postal de la page, ou `null`. D'abord un champ qui dit « code postal » (texte d'aide, nom, étiquette, `autocomplete="postal-code"`) ; à défaut, le seul
 * champ de texte du bloc qui porte le bouton « Lancer la recherche » (le formulaire, sinon le plus petit bloc qui contienne le bouton ET un seul champ). Deux champs sans
 * indice, ou aucun : `null`, on n'entoure pas au hasard.
 */
export function findPostalCodeField(root: ParentNode): GuideTarget | null {
  const fields = [...root.querySelectorAll<HTMLInputElement>(TEXT_FIELD)].filter(usable)
  const named = firstOf(fields.filter(asksPostalCode))
  if (named !== null) return { element: named, label: null }
  for (const control of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (!labelsOfControl(control).some((text) => SEARCH_LABELS.has(text))) continue
    for (let block = control.parentElement; block !== null; block = block.parentElement) {
      const inside = fields.filter((field) => block.contains(field))
      if (inside.length === 1 && inside[0] !== undefined) return { element: inside[0], label: null }
      // Plusieurs champs dans ce bloc : il en couvre trop, aucun n'est sûr
      if (inside.length > 1) break
    }
  }
  return null
}

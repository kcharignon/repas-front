// Le mur de cookies que la page montre (DRV-753, DRV-757) : LIRE ses boutons, jamais les toucher. Le mur n'est pas à nous : la personne répond (« Tout accepter », « Continuer sans
// accepter »…) ; la carte du guide le dit d'abord, se pose hors de ses boutons, et le repère de l'étape se retire tant qu'il est là. Aucune écriture, aucun texte envoyé nulle part.
// LIMITES (non prouvées sur le vrai site) : `querySelectorAll` ne traverse ni Shadow DOM ni iframe : un mur de ce genre rend ce garde sans effet, sans erreur ; les libellés sont
// ceux d'un mur courant, devinés.
import { foldLabel, type GuideLook } from './guide'

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
/** Au plus ce nombre de contrôles lus par passe, en partant de la FIN de la page (un mur s'ajoute en fin de document) : un méga-menu ne coûte pas plus. */
export const MAX_SCANNED = 600
/** Un libellé de bouton de mur a 40 caractères au plus ; un contrôle qui contient plus de texte ou plus de trois éléments n'est pas un bouton. */
const MAX_LABEL = 40
const MAX_CHILDREN = 3

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

/** Les boutons du mur de cookies que la page montre. Une lecture de la page seule, bornée (`MAX_SCANNED`, depuis la fin de la page). */
export function consentButtons(doc: Document, width: number, height: number): HTMLElement[] {
  const found: HTMLElement[] = []
  const all = doc.querySelectorAll<HTMLElement>(CLICKABLE)
  for (let index = all.length - 1; index >= Math.max(0, all.length - MAX_SCANNED); index -= 1) {
    const element = all[index]
    if (element === undefined) continue
    if (!labelsOf(element).some((label) => label.length <= MAX_LABEL && CONSENT_LABELS.has(label)))
      continue
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0
    if (visible && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width) {
      found.push(element)
    }
  }
  return found
}

/** La sous-étape « le mur de cookies est là » : la carte dit d'y répondre d'abord, rien n'est entouré (le contrôle de l'étape est derrière le mur). `null` : pas de mur. */
export function wallLook(doc: Document): GuideLook | null {
  const win = doc.defaultView
  return win !== null && consentButtons(doc, win.innerWidth, win.innerHeight).length > 0
    ? { sub: 'wall', target: null, keep: [], maybe: [] }
    : null
}

/** La phrase de la carte tant que le mur est là : c'est la personne qui répond aux cookies, jamais l'agent. */
export const WALL_TEXT = {
  text: 'D’abord, réponds aux cookies, dans la page.',
  short: 'Réponds aux cookies',
} as const

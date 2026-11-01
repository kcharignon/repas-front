// Ce que la page d'Auchan montre de l'étape guidée (DRV-757), en lectures de la page seule : aucun toucher, aucune saisie, aucune valeur de champ lue, aucune requête. Les pages
// d'Auchan n'ont été relevées qu'en partie (la barre du magasin, DRV-712 et le constat du 2026-11-01 : le panneau « Choisir un drive ou la livraison », son champ « Rechercher
// par : Code postal, ville… », une suggestion « Dardilly 69570 ») : le reste est une FORME PLAUSIBLE, lue par des indices que la page écrit à l'intention de la personne, et au moindre
// doute la sous-étape est la plus générale.
import { wallLook } from '../retailers/consent'
import { foldLabel, isShown, type GuideLook, type GuideStep } from '../retailers/guide'
import { chooseBarTarget } from './page'

const PANEL = '[aria-modal="true"], [role="dialog"], dialog'
const CLICKABLE = 'button, a, li, [role="button"], [role="link"], [role="option"]'
const TEXT_FIELD =
  'input:not([type]), input[type="text"], input[type="search"], input[type="tel"], input[type="number"]'
/** Une suggestion de ville porte un code postal (« Dardilly 69570 »). */
const POSTAL_CODE = /\b\d{5}\b/
/** Le bouton qui choisit ou garde un magasin dans le panneau, une fois la ville choisie. */
const CHOOSE = /^(?:choisir|selectionner|utiliser)\b/
const KEEP = /^utiliser ce (?:magasin|drive)/
const MAX_KEPT = 3

const shown = isShown
const textOf = (element: Element): string => foldLabel(element.textContent ?? '')
const top = (element: Element): number => element.getBoundingClientRect().top
const labelOf = (element: Element): string | null => {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text !== '' && text.length <= 40 ? text : null
}
const look = (
  sub: GuideLook['sub'],
  target: HTMLElement | null,
  keep: readonly HTMLElement[] = [],
  maybe: readonly HTMLElement[] = [],
): GuideLook => ({
  sub,
  target: target === null ? null : { element: target, label: labelOf(target) },
  keep,
  maybe,
})

/** Le panneau où l'on choisit son drive : le premier panneau modal que la page montre et qui a un champ de texte. */
function panelField(root: Document): { panel: HTMLElement; field: HTMLElement } | null {
  for (const panel of root.querySelectorAll<HTMLElement>(PANEL)) {
    if (!shown(panel)) continue
    const field = [...panel.querySelectorAll<HTMLElement>(TEXT_FIELD)].find(shown)
    if (field !== undefined) return { panel, field }
  }
  return null
}

/** Les contrôles du panneau sous le champ qui répondent à `keep` (ou portent un code postal pour la ville), les plus profonds, de haut en bas. */
function below(
  panel: HTMLElement,
  field: HTMLElement,
  accept: (text: string) => boolean,
): HTMLElement[] {
  const edge = field.getBoundingClientRect().bottom - 4
  const found = [...panel.querySelectorAll<HTMLElement>(CLICKABLE)].filter(
    (one) => one !== field && shown(one) && top(one) >= edge && accept(textOf(one)),
  )
  return found
    .filter((one) => !found.some((other) => other !== one && one.contains(other)))
    .sort((a, b) => top(a) - top(b))
    .slice(0, MAX_KEPT)
}

export function readAuchanLook(root: Document, step: GuideStep): GuideLook | null {
  const wall = wallLook(root)
  if (wall !== null) return wall
  if (step !== 'store') return null
  const open = panelField(root)
  if (open === null) {
    const bar = chooseBarTarget(root)
    return bar === null ? null : look('bar', bar.element, [bar.element])
  }
  const { panel, field } = open
  const [keep] = below(panel, field, (text) => KEEP.test(text))
  if (keep !== undefined) return look('confirm', keep, [keep])
  const [choose, ...more] = below(panel, field, (text) => CHOOSE.test(text))
  if (choose !== undefined) return look('shop', choose, [choose], more)
  const [city, ...cities] = below(panel, field, (text) => POSTAL_CODE.test(text))
  if (city !== undefined) return look('city', city, [field, city, ...cities])
  return look('field', field, [field])
}

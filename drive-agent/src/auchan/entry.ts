// L'entrée chez Auchan (DRV-717). Chez Leclerc le plan s'ouvre sur un accueil dont « Commencer mes courses » mène au magasin ; chez Auchan le magasin
// est déjà dans la session (il ne se lit pas dans l'adresse) et il n'y a pas de bouton équivalent sur l'accueil (DRV-712, U4, mesuré). Le seul libellé
// d'entrée vu est « Commencer mes achats », sur la page du panier VIDE (`/checkout/cart`). Où il mène : INCONNU. L'agent ne touche donc ce libellé
// que s'il est EXACTEMENT celui-là, et ne suit un lien que s'il reste sur le site de la page (même schéma, même hôte, même port, sans identifiant),
// jamais une adresse lue dans la page vers un autre site. Une page sans ce libellé : rien à faire (`NONE`), pas une erreur. Aucune requête, aucune
// écriture : un clic ou une navigation de la page, à la cadence du `Pacer`.
import type { EntryReading, PageRef, StartButton } from '../retailers/contract'
import { fold } from './page'

const START_LABEL = 'commencer mes achats'
/** Au-delà, un libellé est une phrase, pas un bouton. */
const MAX_LABEL = 40

const CLICKABLE = 'a, button, input[type="button"], input[type="submit"], [role="button"]'

/** Les libellés comparables d'un élément : son texte, `aria-label`, `title` et `value`. */
function labelsOf(element: Element): string[] {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
  ].map((label) => fold(label ?? '').replace(/[\s.:!»›>→]+$/, ''))
}

const isStart = (element: Element): boolean =>
  labelsOf(element).some((label) => label.length <= MAX_LABEL && label === START_LABEL)

const isDisabled = (element: Element): boolean =>
  element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'

/** Une adresse qui ne mène nulle part par elle-même : absente, vide, `#` ou `javascript:`. */
const isAddressless = (href: string | null): boolean =>
  href === null || href === '' || href.startsWith('#') || /^javascript:/i.test(href)

const firstShown = (list: HTMLElement[]): HTMLElement | null =>
  list.find((element) => element.getClientRects().length > 0) ?? list[0] ?? null

/** Un défi de l'anti-robot est dans la page (le cadre ou le script de sa page de vérification) : on n'y touche pas. */
function showsChallenge(root: ParentNode): boolean {
  return root.querySelector('[src*="captcha-delivery.com"]') !== null
}

/** L'adresse complète d'un lien, si elle reste sur le site de la page ; `null` sinon. */
function sameSiteUrl(href: string, page: PageRef): string | null {
  const port = page.port ?? ''
  const protocol = page.protocol ?? 'https:'
  let url: URL
  try {
    url = new URL(
      href,
      `${protocol}//${page.hostname}${port === '' ? '' : `:${port}`}${page.pathname}`,
    )
  } catch {
    return null
  }
  const sound =
    url.protocol === protocol &&
    url.hostname.toLowerCase() === page.hostname.toLowerCase() &&
    url.port === port &&
    url.username === '' &&
    url.password === ''
  return sound ? url.href : null
}

export interface EntryFound {
  reading: EntryReading
  /** Le bouton à toucher quand la lecture est `BUTTON`. */
  button: StartButton | null
}

/** « Commencer mes achats » dans la page : un bouton à toucher, un lien qui reste sur le site, rien, ou un défi de l'anti-robot. */
export function readEntry(root: ParentNode, page: PageRef): EntryFound {
  if (showsChallenge(root)) return { reading: { kind: 'CHALLENGE' }, button: null }
  const found: HTMLElement[] = []
  for (const element of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (!isDisabled(element) && isStart(element)) found.push(element)
  }
  const element = firstShown(found)
  if (element === null) return { reading: { kind: 'NONE' }, button: null }
  const href = element.tagName === 'A' ? (element.getAttribute('href')?.trim() ?? null) : null
  if (isAddressless(href)) return { reading: { kind: 'BUTTON' }, button: element }
  const url = sameSiteUrl(href ?? '', page)
  return url === null
    ? { reading: { kind: 'REFUSED' }, button: null }
    : { reading: { kind: 'LINK', url }, button: null }
}

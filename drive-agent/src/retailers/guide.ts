// Le parcours guidé (DRV-751) : quand le magasin n'est pas encore choisi ou que la personne n'est pas connectée, c'est une ÉTAPE de la première utilisation, pas une erreur.
// L'agent attend, désigne dans la page le contrôle à toucher, et continue tout seul. Ce fichier dit ce que chaque enseigne doit lui donner pour cela : où est le contrôle
// de chaque étape (`RetailerAdapter.guideTarget`). Le contrôle n'est jamais touché par l'agent : il est seulement entouré (`ui/pointer.ts`) ; la personne le touche.

/**
 * Les étapes que l'agent sait guider : choisir son magasin, puis se connecter (le magasin d'abord, comme chez Leclerc qui refuse la connexion sans magasin), et, pour une
 * page qui pose une QUESTION à la personne avant de continuer, y répondre (`basket` : « compléter ton ancien panier ? » d'après la connexion, DRV-754). L'agent ne
 * répond jamais à sa place.
 */
export type GuideStep = 'store' | 'login' | 'basket'

/** Le contrôle de la page à toucher pour une étape : l'élément (jamais touché par l'agent) et son libellé tel que la page l'écrit, pour le citer à la personne. */
export interface GuideTarget {
  element: HTMLElement
  /** Le libellé lisible du contrôle (40 caractères au plus), `null` s'il n'en a pas (une icône sans texte) : le message ne cite alors aucun libellé. */
  label: string | null
}

/** Un texte comparable : sans accent, minuscules, apostrophes droites, espaces réduites. */
export function foldLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Au-delà, un texte est une phrase de la page, pas le libellé d'un contrôle. */
const MAX_LABEL = 40

const CLICKABLE = 'a, button, [role="button"], input[type="button"], input[type="submit"]'

/** Un élément que la page montre (une boîte à l'écran) ; en jsdom, sans mesure, tout élément compte. */
function shown(element: Element): boolean {
  return element.getClientRects().length > 0
}

/** Les libellés d'un contrôle : son texte, `aria-label`, `title` et `value`, chacun nettoyé. */
function labelsOf(element: Element): string[] {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
  ]
    .map((label) => (label ?? '').replace(/\s+/g, ' ').trim())
    .filter((label) => label !== '' && label.length <= MAX_LABEL)
}

/**
 * Le premier contrôle (lien, bouton) de la page dont un libellé, comparé sans accent ni casse, est l'un de `labels` ; ou, à défaut, dont l'`aria-label` ou le `title`
 * CONTIENT l'un de `contains` (une icône sans texte). Le contrôle que la page montre passe avant celui qu'elle cache. Une lecture de la page seule, aucune requête.
 */
export function findControl(
  root: ParentNode,
  labels: ReadonlySet<string>,
  contains: readonly string[] = [],
): GuideTarget | null {
  const found: GuideTarget[] = []
  for (const element of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    const own = labelsOf(element)
    const exact = own.find((label) => labels.has(foldLabel(label)))
    if (exact !== undefined) {
      found.push({ element, label: exact })
      continue
    }
    const hint = [element.getAttribute('aria-label'), element.getAttribute('title')]
      .map((text) => foldLabel(text ?? ''))
      .find((text) => text !== '' && contains.some((word) => text.includes(word)))
    if (hint !== undefined) found.push({ element, label: null })
  }
  return found.find((target) => shown(target.element)) ?? found[0] ?? null
}

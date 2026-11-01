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
  /** Le seul MOT du contrôle à entourer (DRV-757 : « Connexion » d'un menu « Connexion / Inscription », qui a deux zones à toucher) ; absent : tout le contrôle. */
  word?: string
}

/**
 * La sous-étape RÉELLE où en est la personne, lue dans la page (DRV-757) : la carte dit chaque fois quoi faire MAINTENANT. `field` : le champ du code postal est à remplir ;
 * `city` : une ville est proposée ; `shop` : des magasins sont proposés ; `menu` : le menu est fermé ; `connexion` : le menu montre « Connexion » ; `signup` : la page est la
 * création de compte ; `form` : la page est la connexion ; `code` : la page attend le code reçu par e-mail ; `bar` : la barre du magasin est à toucher ; `confirm` : la page demande
 * de garder le magasin ; `wall` : le mur de cookies est là, la personne y répond d'abord.
 */
export type GuideSub =
  | 'field'
  | 'city'
  | 'shop'
  | 'bar'
  | 'confirm'
  | 'wall'
  | 'menu'
  | 'connexion'
  | 'signup'
  | 'form'
  | 'code'

/**
 * Ce que la page montre d'une étape guidée (DRV-757), une lecture de la page seule : la sous-étape (`null` : la page ne le dit pas, la carte garde sa phrase générale), le contrôle
 * à entourer, et ce que la carte ne doit JAMAIS cacher (`keep`, les contrôles à toucher) ou cache le moins possible (`maybe`, les suivants d'une liste).
 */
export interface GuideLook {
  sub: GuideSub | null
  target: GuideTarget | null
  keep: readonly HTMLElement[]
  maybe: readonly HTMLElement[]
}

/** Les mots de la carte pour une sous-étape : la phrase, et la ligne courte de la barre réduite. Propres à l'enseigne (jamais dans l'interface). */
export interface GuideSubText {
  readonly text: string
  readonly short: string
  /** La phrase sans le libellé du contrôle, quand `text` en cite un (`{label}`) et que la page n'en donne aucun. */
  readonly bare?: string
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

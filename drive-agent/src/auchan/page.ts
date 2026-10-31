// Ce que la page d'Auchan laisse voir sans aucune requête : la barre du magasin, la page « introuvable », la forme de l'adresse, les cookies (un nombre
// et un oui/non). Règle absolue du diagnostic (comme chez Leclerc) : des FORMES, des NOMS d'une liste fermée, des NOMBRES ; jamais un libellé, une
// adresse, un cookie (nom ou valeur) ni un identifiant. NON MESURÉ : l'élément exact de la barre (on cherche un élément dont le texte est celui de la
// barre, quelle que soit sa balise) et le titre de la page « introuvable » au-delà d'une page vue le 2026-10-30.
import type { CookieFacts } from '../retailers/contract'
import type { GuideTarget } from '../retailers/guide'

/** Un texte comparable : sans accent, minuscules, apostrophes droites, espaces réduites. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Au-delà, un texte est une phrase de la page, pas une barre. */
const MAX_BAR_TEXT = 120

/**
 * Les textes de la barre quand aucun magasin n'est choisi : « Choisir vos courses » (mesuré, DRV-712) et « Choisir mon mode de livraison » (vu par le propriétaire sur
 * le téléphone de test le 2026-10-31, DRV-751 : le texte du site a changé ou varie ; NON MESURÉ au-delà de ce constat). Le texte entier de l'élément, rien de moins.
 */
const CHOOSE_BARS: readonly string[] = ['choisir vos courses', 'choisir mon mode de livraison']
const BAR_ELEMENTS = 'a, button, [role="button"], p, span, div, li, h1, h2, h3'

/**
 * La barre du magasin en haut de la page (DRV-712, A-4 et A-5, mesurées) : « Choisir vos courses » tant qu'aucun magasin n'est choisi, « Retrait : <le
 * drive> » ensuite. `CHOOSE` : un élément dont TOUT le texte est « Choisir vos courses » ; `WITHDRAWAL` : un élément qui commence par « Retrait : » ;
 * `null` : aucune des deux (page sans barre, forme changée). Aucun libellé de magasin n'est lu.
 */
export function storeBar(root: ParentNode): 'CHOOSE' | 'WITHDRAWAL' | null {
  let withdrawal = false
  for (const element of root.querySelectorAll(BAR_ELEMENTS)) {
    const raw = element.textContent ?? ''
    // Un conteneur de la page entière n'est pas une barre : on ne normalise pas son texte.
    if (raw.length > 4 * MAX_BAR_TEXT) continue
    const text = fold(raw)
    if (text === '' || text.length > MAX_BAR_TEXT) continue
    if (CHOOSE_BARS.includes(text)) return 'CHOOSE'
    if (/^retrait ?:/.test(text)) withdrawal = true
  }
  return withdrawal ? 'WITHDRAWAL' : null
}

/**
 * Le contrôle à toucher pour choisir son magasin (DRV-751) : la barre qui dit « Choisir vos courses » ou « Choisir mon mode de livraison » (le texte entier de
 * l'élément), remontée jusqu'au lien ou bouton qui la porte s'il y en a un tout près. `null` si la page n'a pas cette barre. Son libellé est celui de la page, cité
 * tel quel à la personne ; l'agent ne la touche jamais.
 */
export function chooseBarTarget(root: ParentNode): GuideTarget | null {
  const elements = [...root.querySelectorAll<HTMLElement>(BAR_ELEMENTS)]
  const matches = elements.filter((element) => {
    const raw = element.textContent ?? ''
    return raw.length <= 4 * MAX_BAR_TEXT && CHOOSE_BARS.includes(fold(raw))
  })
  // Le plus petit élément qui porte le texte entier (pas un conteneur du même texte), celui que la page montre de préférence
  const innermost = matches.filter(
    (candidate) => !matches.some((other) => other !== candidate && candidate.contains(other)),
  )
  const element =
    innermost.find((candidate) => candidate.getClientRects().length > 0) ?? innermost[0]
  if (element === undefined) return null
  const control = element.closest<HTMLElement>('a, button, [role="button"]')
  const target = control !== null && control.contains(element) ? control : element
  const label = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { element: target, label: label !== '' && label.length <= 40 ? label : null }
}

/**
 * Les libellés d'un contrôle de connexion (DRV-751, NON MESURÉ : DRV-726 a vu le formulaire de connexion, pas le contrôle de la page des courses qui y mène). Un
 * contrôle dont le libellé est l'un d'eux, ou dont l'`aria-label` ou le `title` parle de connexion ou de compte, est entouré ; sans lui, le message ne cite aucun
 * libellé et dit « le bouton de connexion de la page ».
 */
export const LOGIN_LABELS: ReadonlySet<string> = new Set([
  'se connecter',
  'me connecter',
  'connexion',
  'identifiez-vous',
  "s'identifier",
  'mon compte',
  'se connecter / creer un compte',
  'connexion / inscription',
])
export const LOGIN_HINTS: readonly string[] = ['connect', 'connex', 'compte', 'identif']

/**
 * La page est celle d'une adresse « introuvable » : un VRAI 404 (B-6, mesuré : titre « 404 Not Found Page », « Erreur 404 »). Le code HTTP du document
 * (`PerformanceNavigationTiming`) tranche quand il est connu ; sinon le titre, qui commence par « 404 » (une page vue, pas plus).
 */
export function isNotFoundPage(root: Document, status: number | null): boolean {
  if (status !== null) return status === 404
  return /^404\b/.test(fold(root.title ?? ''))
}

// —— L'adresse en motif ——————————————————————————————————————————————————————————————————————————————————————————————————————

/**
 * Les premiers segments d'adresse qu'on peut écrire dans un rapport : une liste FERMÉE de noms de pages du site vus le 2026-10-30. Toute autre
 * adresse (la page d'un produit est `/<libellé>/pr-C…`, un rayon est un libellé) est cachée : un libellé de produit n'a rien à faire dans un rapport.
 */
const KNOWN_FIRST_SEGMENTS = new Set([
  'courses',
  'recherche',
  'checkout',
  'cart',
  'journey',
  'creation-compte',
  'auth',
  'logout',
])

/** Le motif d'un chemin d'adresse : le premier segment s'il est connu, `…` sinon ; la suite est cachée (`…`). Une requête et un fragment ne sont jamais lus. */
export function addressShape(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? ''
  const segments = path
    .split('/')
    .slice(1)
    .filter((segment) => segment !== '')
  const first = segments[0]
  if (first === undefined) return '/'
  const name = KNOWN_FIRST_SEGMENTS.has(first.toLowerCase()) ? first.toLowerCase() : '…'
  return `/${name}${segments.length >= 2 ? '/…' : ''}`
}

// —— Les cookies ————————————————————————————————————————————————————————————————————————————————————————————————————————————

/**
 * Le compte des cookies lisibles de [raw] (`document.cookie`, lu une fois en mémoire) et la présence du cookie de l'anti-robot (DRV-713, D-1, mesuré :
 * `datadome`). Exception bornée de `consignes-agents.md` : seuls un nombre et un oui/non sortent, jamais un nom ni une valeur. Un cookie `HttpOnly`
 * n'est pas lisible : « non » veut dire « pas lisible par la page », pas « absent ».
 */
export function cookieFacts(raw: string): CookieFacts {
  const names = raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => (part.split('=', 1)[0] ?? '').trim().toLowerCase())
  return { count: names.length, antiBot: names.includes('datadome') }
}

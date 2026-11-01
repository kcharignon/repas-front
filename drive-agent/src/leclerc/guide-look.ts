// Ce que la page de Leclerc montre de l'étape guidée (DRV-757) : la sous-étape où en est la personne, le contrôle à entourer et ce que la carte ne doit pas cacher. Des lectures
// de la page seule : aucun toucher, aucune saisie, aucune requête. Le vrai DOM de ces pages n'a jamais été relevé (seuls les textes et les formes de DRV-754 le sont) : on lit des
// indices que la page écrit à l'intention de la personne, et au moindre doute la sous-étape reste la plus générale (le champ du code postal, le menu).
import { findControl, foldLabel, type GuideLook, type GuideTarget } from '../retailers/guide'
import { findPostalCodeField } from './store-field'
import { LOGIN_CONTROL_LABELS, LOGIN_LABELS } from './session'

const CLICKABLE =
  'button, a, li, [role="button"], [role="link"], [role="option"], input[type="button"], input[type="submit"]'
const HEADINGS = 'h1, h2, h3, h4, h5, h6, [role="heading"], legend, p, span, div'
/** Le titre du panneau des magasins (mesuré le 2026-11-01, DRV-754) : « Choisissez votre service autour du 69720 ». */
const SHOPS_TITLE = 'choisissez votre service'
/** Les puces du panneau (Tous, Drive, Retrait piéton, Livraison à domicile) : des filtres, pas des magasins. */
const CHIP = /^(?:tous|drive|retrait pieton|livraison a domicile)(?: \(?\d+\)?)?$/
/** Au plus trois magasins gardés à l'œil : le premier à toucher, puis les deux suivants. */
const SHOPS_KEPT = 3
/** Une ligne de suggestion porte un code postal (cinq chiffres) : « Saint-Bonnet-de-Mure, Rhône (69720) ». La valeur du champ n'est JAMAIS lue : seulement ce que la page affiche. */
const POSTAL_CODE = /\b\d{5}\b/
/** Les boutons qui valident un formulaire de connexion : à ne jamais couvrir quand la personne écrit. */
const VALIDATE = /^(?:valider|continuer|me connecter|se connecter|connexion)$/
const FIELD =
  'input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], input[type="search"]'
/** La fenêtre du code reçu par e-mail (mesurée) : « Saisissez le code reçu par e-mail ». */
const CODE_TITLE = 'code recu par e-mail'
const MENU_LABELS: ReadonlySet<string> = new Set(['menu', 'ouvrir le menu', 'menu principal'])

const none = (target: GuideTarget | null = null, keep: readonly HTMLElement[] = []): GuideLook => ({
  sub: null,
  target,
  keep,
  maybe: [],
})

const shown = (element: Element): boolean => {
  const { width, height } = element.getBoundingClientRect()
  return width > 0 && height > 0
}
const textOf = (element: Element): string => foldLabel(element.textContent ?? '')
const top = (element: Element): number => element.getBoundingClientRect().top

/** Les plus profonds : un élément qui en contient un autre de la liste n'est pas gardé (le bouton, pas la ligne qui l'entoure). */
function innermost(found: HTMLElement[]): HTMLElement[] {
  return found.filter((one) => !found.some((other) => other !== one && one.contains(other)))
}

/** Les contrôles sous le titre du panneau des magasins, sans les puces : le premier est celui à toucher. */
function shopControls(root: Document): HTMLElement[] {
  const title = [...root.querySelectorAll<HTMLElement>(HEADINGS)].find(
    (one) =>
      one.childElementCount <= 2 &&
      (one.textContent ?? '').length < 120 &&
      textOf(one).startsWith(SHOPS_TITLE) &&
      shown(one),
  )
  if (title === undefined) return []
  const below = title.getBoundingClientRect().bottom - 2
  const found = [...root.querySelectorAll<HTMLElement>(CLICKABLE)].filter(
    (one) => shown(one) && top(one) >= below && !CHIP.test(textOf(one)),
  )
  return innermost(found)
    .sort(
      (a, b) => top(a) - top(b) || a.getBoundingClientRect().left - b.getBoundingClientRect().left,
    )
    .slice(0, SHOPS_KEPT)
}

/** Les lignes de suggestion sous le champ : un contrôle qui porte un code postal (« Saint-Bonnet-de-Mure, Rhône (69720) »). */
function citySuggestions(root: Document, field: HTMLElement): HTMLElement[] {
  const below = field.getBoundingClientRect().bottom - 4
  const found = [...root.querySelectorAll<HTMLElement>(CLICKABLE)].filter((one) => {
    const text = textOf(one)
    return (
      one !== field &&
      !one.contains(field) &&
      text.length <= 120 &&
      POSTAL_CODE.test(text) &&
      shown(one) &&
      top(one) >= below
    )
  })
  return innermost(found)
    .sort((a, b) => top(a) - top(b))
    .slice(0, SHOPS_KEPT)
}

/**
 * L'accueil où l'on choisit son magasin : les magasins proposés (le dernier état), sinon la ville proposée sous le champ, sinon le champ du code postal. Le champ reste
 * à garder libre tant que la personne y écrit ou touche sa ville. Aucune valeur de champ n'est lue.
 */
export function readStoreLook(root: Document): GuideLook {
  const shops = shopControls(root)
  const [first, ...next] = shops
  if (first !== undefined)
    return { sub: 'shop', target: { element: first, label: null }, keep: [first], maybe: next }
  const field = findPostalCodeField(root)
  const input = field?.element
  const kept = input === undefined ? [] : [input]
  const cities = input === undefined ? [] : citySuggestions(root, input)
  const [city] = cities
  if (city !== undefined)
    return {
      sub: 'city',
      target: { element: city, label: null },
      keep: [...kept, ...cities],
      maybe: [],
    }
  // Sans champ de code postal (une page du magasin, où l'on en change) la page ne dit pas où en est la personne
  return { sub: field === null ? null : 'field', target: field, keep: kept, maybe: [] }
}

/** La page demande-t-elle le code reçu par e-mail ? Un titre ou une fenêtre que la page montre. */
function codeAsked(root: Document): boolean {
  return [...root.querySelectorAll<HTMLElement>(`${HEADINGS}, [role="dialog"], dialog`)].some(
    (one) =>
      one.childElementCount <= 3 &&
      (one.textContent ?? '').length < 160 &&
      textOf(one).includes(CODE_TITLE) &&
      shown(one),
  )
}

/** Ce que la carte ne couvre jamais sur la page de connexion : les champs que la page montre (e-mail, mot de passe, les six cases du code) et son bouton de validation. */
function formControls(root: Document): HTMLElement[] {
  const fields = [...root.querySelectorAll<HTMLElement>(FIELD)].filter(shown)
  const buttons = [
    ...root.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"]'),
  ].filter(
    (one) => shown(one) && VALIDATE.test(textOf(one) || foldLabel(one.getAttribute('value') ?? '')),
  )
  return [...fields, ...buttons]
}

/**
 * La connexion. Par l'ADRESSE de la page d'abord (elle ne ment pas, d'une origine à l'autre) : la création de compte (où mène « Inscription », la connexion y est un lien « Me
 * connecter »), la page de connexion (et sa fenêtre du code reçu par e-mail). Sur les pages du magasin de la version mobile : le mot « Connexion » du menu, qui
 * réunit deux zones à toucher (« Connexion » et « / Inscription ») : on n'entoure que le mot ; menu fermé, le bouton du menu.
 */
export function readLoginLook(
  root: Document,
  location: { hostname: string; pathname: string },
  mobilePage: boolean,
): GuideLook {
  const path = location.pathname.toLowerCase()
  if (/creation-compte[a-z0-9-]*\.aspx/.test(path)) {
    const link = findControl(root, LOGIN_LABELS)
    return { ...none(link, link === null ? [] : [link.element]), sub: 'signup' }
  }
  if (/authentification\.aspx|\/connexion/.test(path))
    return { ...none(null, formControls(root)), sub: codeAsked(root) ? 'code' : 'form' }
  if (!mobilePage) return none(findControl(root, LOGIN_CONTROL_LABELS))
  const login = findControl(root, LOGIN_CONTROL_LABELS)
  if (login !== null && shown(login.element)) {
    const both = login.label !== null && foldLabel(login.label).includes('/')
    return {
      ...none({ ...login, ...(both && { word: 'Connexion' }) }, [login.element]),
      sub: 'connexion',
    }
  }
  const menu = findControl(root, MENU_LABELS, ['menu'])
  return { ...none(menu, menu === null ? [] : [menu.element]), sub: 'menu' }
}

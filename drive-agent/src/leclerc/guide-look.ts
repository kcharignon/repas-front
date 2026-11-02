// Ce que la page de Leclerc montre de l'étape guidée (DRV-757) : la sous-étape où en est la personne, le contrôle à entourer et ce que la carte ne doit pas cacher. Des lectures
// de la page seule : aucun toucher, aucune saisie, aucune requête. Le vrai DOM de ces pages n'a jamais été relevé (seuls les textes et les formes de DRV-754 le sont) : on lit des
// indices que la page écrit à l'intention de la personne, et au moindre doute la sous-étape reste la plus générale (le champ du code postal, le menu).
import {
  challengeFrames,
  findControl,
  foldLabel,
  isShown,
  type GuideLook,
  type GuideSub,
  type GuideTarget,
} from '../retailers/guide'
import { isAccountLoginPage } from './account'
import { findPostalCodeField } from './store-field'
import { LOGIN_CONTROL_LABELS, LOGIN_LABELS } from './session'

const CLICKABLE =
  'button, a, li, [role="button"], [role="link"], [role="option"], input[type="button"], input[type="submit"]'
/** Un contrôle RÉEL (jamais une simple ligne de liste) : ce qu'on touche pour choisir un magasin. */
const CONTROL =
  'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
/** La ville proposée est à moins de cela sous le champ, en pixels. */
const SUGGESTION_REACH = 320
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
/** Une case de saisie du mot de passe, ou de l'adresse e-mail. */
const SECRET = 'input[type="password"]'
const EMAIL = 'input[type="email"], input[autocomplete="username"]'
const MENU_LABELS: ReadonlySet<string> = new Set(['menu', 'ouvrir le menu', 'menu principal'])

const none = (target: GuideTarget | null = null, keep: readonly HTMLElement[] = []): GuideLook => ({
  sub: null,
  target,
  keep,
  maybe: [],
})

const shown = isShown
const textOf = (element: Element): string => foldLabel(element.textContent ?? '')
const top = (element: Element): number => element.getBoundingClientRect().top

/** Les plus profonds : un élément qui en contient un autre de la liste n'est pas gardé (le bouton, pas la ligne qui l'entoure). */
function innermost(found: HTMLElement[]): HTMLElement[] {
  return found.filter((one) => !found.some((other) => other !== one && one.contains(other)))
}

/** Une carte de magasin est un bloc LARGE (au moins 60 % de la fenêtre) : une puce de filtre, « Afficher la carte », « Retour » ne le sont pas. */
const CARD_WIDTH = 0.6
/** Et pas HAUT : au-delà de 40 % de la fenêtre c'est le conteneur de la liste (le curseur est hérité), pas une carte. */
const CARD_HEIGHT = 0.4
/** Au plus ce nombre de blocs gardés, parmi au plus quatre fois autant d'éléments lus après le titre, par passe. */
const MAX_BLOCKS = 400
const BLOCKS =
  'li, div, article, section, ul, ol, main, [role="listitem"], [role="option"], [role="list"], [role="listbox"]'
/** `NodeFilter.SHOW_ELEMENT`. */
const SHOW_ELEMENT = 1

/**
 * Les cartes de magasin que la page rend cliquables sans en faire des liens (un bloc à curseur « main », DRV-760 : la recette réelle a désigné une puce de filtre, au-dessus des
 * cartes, et la barre s'est posée sur la première carte) : les blocs larges, sous le titre, au curseur main alors que leur parent ne l'a pas (le bloc de la carte, pas ce qu'il contient).
 * Le curseur est HÉRITÉ : un `ul` ou un `main` à curseur main passerait pour l'unique carte et le cadre entourerait toute la liste. Un bloc plus haut que 40 % de la fenêtre, ou qui a au
 * moins deux blocs larges pour enfants, est un conteneur : il n'est pas gardé et ses enfants à curseur main le deviennent. Le parcours part du TITRE du panneau (les cartes le suivent)
 * et non du début du document : une liste en fin de page ne tombe pas hors des premiers éléments lus.
 */
function pointerBlocks(root: Document, title: HTMLElement, below: number): HTMLElement[] {
  const win = root.defaultView
  if (win === null || root.documentElement === null) return []
  const wide = win.innerWidth * CARD_WIDTH
  const tall = win.innerHeight * CARD_HEIGHT
  const found: HTMLElement[] = []
  const containers = new Set<Element>()
  const walker = root.createTreeWalker(root.documentElement, SHOW_ELEMENT)
  walker.currentNode = title
  for (let read = 0; read < MAX_BLOCKS * 4 && found.length < MAX_BLOCKS; read += 1) {
    const one = walker.nextNode() as HTMLElement | null
    if (one === null) break
    if (!one.matches(BLOCKS)) continue
    const rect = one.getBoundingClientRect()
    if (rect.top < below || rect.width < wide) continue
    if (win.getComputedStyle(one).cursor !== 'pointer') continue
    const parent = one.parentElement
    // Le parent a le curseur (il l'a donné) : seul le fils d'un conteneur déjà écarté est une carte
    if (
      parent !== null &&
      win.getComputedStyle(parent).cursor === 'pointer' &&
      !containers.has(parent)
    )
      continue
    if (!shown(one)) continue
    if (rect.height > tall || wideChildren(one, wide) >= 2) {
      containers.add(one)
      continue
    }
    found.push(one)
  }
  return found
}

/** Combien d'enfants directs de `block` sont des blocs larges (une liste de cartes, pas une carte). */
function wideChildren(block: HTMLElement, wide: number): number {
  return [...block.children].filter(
    (child) => child.matches(BLOCKS) && child.getBoundingClientRect().width >= wide,
  ).length
}

/** Les contrôles sous le titre du panneau des magasins, sans les puces : le premier est celui à toucher. Des cartes larges (liens ou blocs cliquables) passent avant tout autre contrôle. */
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
  const found = [...root.querySelectorAll<HTMLElement>(CONTROL)].filter(
    (one) => shown(one) && top(one) >= below && !CHIP.test(textOf(one)),
  )
  const width = (root.defaultView?.innerWidth ?? 0) * CARD_WIDTH
  const cards = [
    ...found.filter((one) => one.getBoundingClientRect().width >= width),
    ...pointerBlocks(root, title, below),
  ]
  // Des cartes larges : la première est le contrôle à toucher (les plus extérieures : le bloc de la carte, pas son titre)
  const list =
    cards.length > 0
      ? cards.filter((one) => !cards.some((other) => other !== one && other.contains(one)))
      : innermost(found)
  return list
    .sort(
      (a, b) => top(a) - top(b) || a.getBoundingClientRect().left - b.getBoundingClientRect().left,
    )
    .slice(0, SHOPS_KEPT)
}

/** Les lignes de suggestion sous le champ : un contrôle qui porte un code postal (« Saint-Bonnet-de-Mure, Rhône (69720) »). */
function citySuggestions(root: Document, field: HTMLElement): HTMLElement[] {
  const box = field.getBoundingClientRect()
  const found = [...root.querySelectorAll<HTMLElement>(CLICKABLE)].filter((one) => {
    const text = textOf(one)
    if (one === field || one.contains(field) || text.length > 120 || !POSTAL_CODE.test(text))
      return false
    if (!shown(one)) return false
    // Une ligne de la liste de suggestions : juste sous le champ, dans sa colonne, jamais dans l'en-tête, le menu ou le pied de page (un « 75001 » d'une adresse n'en est pas une) ;
    // une simple ligne de liste (`li`) ne compte que dans une vraie liste
    const at = one.getBoundingClientRect()
    const column = at.left < box.right + 24 && at.right > box.left - 24
    const near = at.top >= box.bottom - 4 && at.top <= box.bottom + SUGGESTION_REACH
    const apart = one.closest('nav, header, footer') !== null
    const real = one.tagName !== 'LI' || one.closest('[role="listbox"], ul, ol') !== null
    return column && near && !apart && real
  })
  return innermost(found)
    .sort((a, b) => top(a) - top(b))
    .slice(0, SHOPS_KEPT)
}

/**
 * L'accueil où l'on choisit son magasin : les magasins proposés (le dernier état), sinon la ville proposée sous le champ, sinon le champ du code postal. Le champ reste
 * à garder libre tant que la personne y écrit ou touche sa ville. Aucune valeur de champ n'est lue.
 */
function storeLook(root: Document): GuideLook {
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

/** Les contrôles de la page du choix du magasin qu'on ne couvre pas : « Retour » et « Me géolocaliser » (mesuré : la barre réduite, en haut, les recouvrait en partie). */
const PAGE_CONTROLS: ReadonlySet<string> = new Set(['retour', 'me geolocaliser'])

/** Voir `storeLook` ; la page du choix du magasin garde aussi libres son « Retour » et son « Me géolocaliser » (le libellé ENTIER, jamais « Retour aux courses de… »). */
export function readStoreLook(root: Document): GuideLook {
  const look = storeLook(root)
  if (look.sub === null) return look
  const own = [...root.querySelectorAll<HTMLElement>(CONTROL)].filter(
    (one) =>
      shown(one) &&
      [textOf(one), foldLabel(one.getAttribute('aria-label') ?? '')].some((label) =>
        PAGE_CONTROLS.has(label),
      ),
  )
  return { ...look, keep: [...look.keep, ...own] }
}

/** Ce que dit la page de connexion réelle (mesuré le 2026-11-01). Le même texte existe, CACHÉ, sur l'accueil et sur la présentation du magasin. */
const LOGIN_TEXT = /connectez-vous avec votre compte/i

/** Le bloc d'un champ : le texte de connexion doit y être. Seulement `main`, un dialogue, ou la page : un titre, un texte et un champ n'ont aucune raison de partager un `form` ou une `section` (mesuré : le texte et le champ sont à 250 pixels l'un de l'autre). */
const FIELD_BLOCK = 'main, [role="dialog"], dialog'
/** Un découpage qui ne laisse rien voir (`clip-path: inset(100%)`, `inset(50%)`, un polygone réduit à un point). */
const CLIPPED_AWAY = /^inset\((?:100|50)%\)$|^polygon\(0(?:px)? 0(?:px)?, 0/
/** Un élément a une vraie taille : au moins 8 pixels dans les deux sens (une classe « sr-only », 1 × 1 pixel, ne se voit pas). */
const sized = (element: Element): boolean => {
  const { width, height } = element.getBoundingClientRect()
  return width >= 8 && height >= 8
}

/**
 * Le texte à l'écran ? Son élément est montré, de vraie taille, au-dessous du haut du document (pas `top: -9999px`) et sans `clip-path` qui cache tout ; aucun ancêtre jusqu'au bloc
 * n'est minuscule en rognant (`height: 0` et `overflow` autre que visible, ou non lu) ; la boîte du texte lui-même n'est pas rejetée hors de la fenêtre (`text-indent: -9999px`).
 * LIMITE : un texte de la couleur du fond, ou masqué par un autre élément, ne se détecte pas.
 */
function textOnScreen(node: Node, block: Element): boolean {
  const parent = node.parentElement
  const win = node.ownerDocument?.defaultView
  if (parent === null || !shown(parent) || !sized(parent)) return false
  if (parent.getBoundingClientRect().bottom + (win?.scrollY ?? 0) <= 0) return false
  for (let up: Element | null = parent; up !== null && up !== block; up = up.parentElement) {
    const style = win?.getComputedStyle(up)
    if (CLIPPED_AWAY.test(style?.clipPath ?? '')) return false
    // Un ancêtre minuscule qui rogne cache ce qu'il contient ; un `display: contents` n'a aucune boîte et ne rogne rien ; un `overflow` non lu n'est pas un rognage
    if (up !== parent && !sized(up) && style?.overflow !== 'visible' && style?.overflow !== '')
      return false
  }
  const range = node.ownerDocument?.createRange()
  range?.selectNodeContents(node)
  const box = range?.getBoundingClientRect?.()
  const width = win?.innerWidth ?? 0
  return box === undefined || (width > 0 && box.right > 0 && box.left < width) || box.width === 0
}

/**
 * La page est-elle celle de la connexion d'après ce qu'elle MONTRE : le texte « Connectez-vous avec votre compte… » à l'écran (`textOnScreen`), dans le même bloc (`main`, dialogue ou
 * page) qu'un champ de saisie montré. Un script, un style, un élément caché, minuscule ou rejeté hors écran n'en est pas un. Une lecture ciblée (les champs, puis les nœuds de texte de
 * leur bloc, une fois par bloc), sans sérialiser le document ni lire une valeur.
 */
export function showsLoginText(root: Document): boolean {
  const blocks = new Set<Element>()
  for (const field of root.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])')) {
    if (shown(field)) blocks.add(field.closest(FIELD_BLOCK) ?? root.body)
  }
  for (const block of blocks) {
    const walker = root.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.nodeValue ?? ''
      if (text.length < 200 && LOGIN_TEXT.test(text) && textOnScreen(node, block)) return true
    }
  }
  return false
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

/** La case de vérification « Je suis un humain » (mesurée) : une case dont l'étiquette dit humain ou robot. Que la personne coche : l'agent n'y touche jamais. */
function humanBox(box: HTMLInputElement): boolean {
  const label = [box.getAttribute('aria-label'), box.closest('label')?.textContent].join(' ')
  return /humain|robot/.test(foldLabel(label))
}

/**
 * Ce que la carte ne couvre jamais sur la page de connexion : les champs que la page montre (e-mail, mot de passe, les six cases du code), son bouton de validation, la case « Je suis
 * un humain » et le cadre de vérification (hCaptcha) qui s'ouvre ; `crowded` : ce cadre couvre plus de 30 % de la fenêtre, la carte se réduit.
 */
function formControls(root: Document): { keep: HTMLElement[]; crowded: boolean } {
  const fields = [...root.querySelectorAll<HTMLElement>(FIELD)].filter(shown)
  const buttons = [
    ...root.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"]'),
  ].filter(
    (one) => shown(one) && VALIDATE.test(textOf(one) || foldLabel(one.getAttribute('value') ?? '')),
  )
  const humans = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(
    (one) => shown(one) && humanBox(one),
  )
  const { frames, crowded } = challengeFrames(root, ['hcaptcha'])
  return { keep: [...fields, ...buttons, ...humans, ...frames], crowded }
}

/**
 * Où en est la connexion, lu dans la page (deux temps : l'adresse e-mail, puis le mot de passe avec la case « Je suis un humain ») : le code reçu par e-mail d'abord, puis le cadre de
 * vérification ouvert (la personne le fait), le mot de passe, l'adresse e-mail ; la page ne dit rien de connu : la phrase d'ensemble. Aucune valeur de champ n'est lue.
 */
function loginSub(root: Document, crowded: boolean): GuideSub {
  if (codeAsked(root)) return 'code'
  if (crowded) return 'human'
  if ([...root.querySelectorAll<HTMLElement>(SECRET)].some(shown)) return 'password'
  if ([...root.querySelectorAll<HTMLElement>(EMAIL)].some(shown)) return 'email'
  return 'form'
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
  // La page de connexion : son adresse, ou toute page du compte de l'enseigne qui n'est pas le compte connecté (une page de connexion d'un chemin inconnu)
  if (
    /authentification\.aspx|\/connexion/.test(path) ||
    isAccountLoginPage(location.hostname, path)
  ) {
    const { keep, crowded } = formControls(root)
    return { ...none(null, keep), sub: loginSub(root, crowded), crowded }
  }
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

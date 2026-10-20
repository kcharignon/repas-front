// L'entrée dans le magasin (DRV-625, DRV-629). Le plan s'ouvre sur l'accueil de l'enseigne, où « Commencer mes courses » mène aux pages du
// magasin. Sur le vrai site (constat du 2026-10-19) c'est un BOUTON sans adresse : l'agent le CLIQUE comme le ferait un toucher (`findStartButton`,
// au rythme du `Pacer`) ; la page qui s'ouvre reçoit ensuite le plan, et l'agent y vérifie le magasin. Si c'est un vrai lien, il le suit, mais
// SEULEMENT si son adresse a la forme d'une page du magasin du plan. Ce fichier lit « Commencer mes courses » dans le texte de la page (sans
// requête) : pour agir (`readEntry`) et pour le diagnostic (`entryFacts`).
// Règle absolue du diagnostic : des FORMES (motif d'adresse, `N` pour un nombre, `V` pour la ville), oui/non, jamais un numéro, une ville ni une
// adresse complète. `entry.spec.ts` le prouve avec une page hostile. L'adresse que l'agent suit, elle, n'est jamais rapportée.
import { STORE_HOST } from '../../protocol'
import { decodeEntities } from './embedded'
import { fold, INVISIBLE } from './page-text'
import { isChallenge } from './pacer'
import { addressShape } from './probe'
import { isMobileHost, type LocationLike } from './store'

/** Au-delà, un lien est une phrase, pas un libellé de bouton. */
const MAX_LABEL = 40

/** Un lien ou un bouton : ses attributs (bornés) et son contenu (borné : un libellé n'est pas un paragraphe). */
const ANCHOR = /<(a|button)\b([^>]{0,500})>([\s\S]{0,300}?)<\/\1\s*>/gi
/** Un bouton de formulaire (`<input type="button" value="…">`) : son libellé est son attribut `value`. */
const INPUT = /<input\b([^>]{0,500})>/gi
const INPUT_TYPE = /\btype\s*=\s*(?:"(?:button|submit)"|'(?:button|submit)')/i
const VALUE = /\bvalue\s*=\s*(?:"([^"]{0,100})"|'([^']{0,100})')/i
const HREF = /\bhref\s*=\s*(?:"([^"]{0,500})"|'([^']{0,500})')/i
const ATTRIBUTE_LABEL = /\b(?:aria-label|title)\s*=\s*(?:"([^"]{0,100})"|'([^']{0,100})')/i

const START_LABEL = 'commencer mes courses'

/** Où mène l'adresse d'un lien, sans la dire : le même site que la page, une adresse sans site, un autre drive Leclerc ou un autre site. */
export type LinkWhere = 'RELATIVE' | 'SAME_HOST' | 'LECLERC_HOST' | 'OTHER_SITE'

/** Ce que la page laisse voir d'un lien : présent ou non, la forme de son adresse et où elle mène. Jamais l'adresse. */
export interface LinkFacts {
  present: boolean
  /** Le motif de l'adresse (`/magasin-N-N-V/`, `/…/panier.aspx`), `null` sans lien ou sans adresse (un bouton). */
  shape: string | null
  where: LinkWhere | null
}

export interface EntryFacts {
  start: LinkFacts
  /** Vrai si la page montre « Commencer mes courses » sans adresse navigable : un bouton que l'agent peut cliquer (le vrai site, DRV-629). */
  clickable: boolean
}

/** L'adresse de la page, telle que `window.location` la donne (`protocol` et `port` seulement si elle les connaît). */
export type PageRef = Pick<LocationLike, 'hostname' | 'pathname'> &
  Partial<Pick<LocationLike, 'protocol' | 'port'>>

/** Ce que l'agent peut faire de l'accueil du magasin. */
export type EntryReading =
  /** Le lien est là et mène à une page du magasin du plan : `url` est l'adresse à suivre (complète, vérifiée). */
  | { kind: 'LINK'; url: string }
  /**
   * « Commencer mes courses » est un bouton sans adresse navigable (le vrai site, DRV-629) : l'agent le clique, comme un toucher. On ne sait pas
   * où il mène ; la page qui s'ouvre reçoit le plan et l'agent y vérifie le magasin.
   */
  | { kind: 'BUTTON' }
  /** Pas de lien « Commencer mes courses » dans la page (visiteur, page inattendue, site changé). */
  | { kind: 'NONE' }
  /** La page est celle d'un défi de l'anti-robot : on n'y touche pas. */
  | { kind: 'CHALLENGE' }
  /** Le lien existe, mais ne mène pas à une page du magasin du plan (autre magasin, autre site, forme inconnue). */
  | { kind: 'REFUSED' }

interface Anchor {
  /** Le libellé comparable, ou l'un des libellés (texte, `aria-label`, `title`). */
  labels: string[]
  href: string | null
}

const trimLabel = (label: string) => label.replace(/[\s.:!»›>→]+$/, '')

/** Les liens et boutons du texte visible de la page (les scripts, styles et commentaires n'en sont pas). */
function anchorsOf(page: string): Anchor[] {
  const visible = page.replace(INVISIBLE, ' ')
  const anchors: Anchor[] = []
  const labelsOf = (...texts: Array<string | undefined>) =>
    texts
      .map((label) => trimLabel(fold(label ?? '')))
      .filter((label) => label !== '' && label.length <= MAX_LABEL)
  for (const match of visible.matchAll(ANCHOR)) {
    const attributes = match[2] ?? ''
    const attribute = ATTRIBUTE_LABEL.exec(attributes)
    const href = match[1]?.toLowerCase() === 'a' ? HREF.exec(attributes) : null
    const raw = href?.[1] ?? href?.[2]
    anchors.push({
      labels: labelsOf(match[3], attribute?.[1] ?? attribute?.[2]),
      href: raw === undefined ? null : decodeEntities(raw).trim(),
    })
  }
  for (const match of visible.matchAll(INPUT)) {
    const attributes = match[1] ?? ''
    if (!INPUT_TYPE.test(attributes)) continue
    const value = VALUE.exec(attributes)
    const attribute = ATTRIBUTE_LABEL.exec(attributes)
    anchors.push({
      labels: labelsOf(value?.[1] ?? value?.[2], attribute?.[1] ?? attribute?.[2]),
      href: null,
    })
  }
  return anchors
}

const portOf = (page: PageRef) => page.port ?? ''
const protocolOf = (page: PageRef) => page.protocol ?? 'https:'

function resolve(href: string, page: PageRef): URL | null {
  // Un lien sans adresse de navigation (`#`, `javascript:`, `mailto:`) n'est pas une page.
  if (href === '' || href.startsWith('#')) return null
  try {
    const port = portOf(page) === '' ? '' : `:${portOf(page)}`
    const url = new URL(href, `${protocolOf(page)}//${page.hostname}${port}${page.pathname}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** Un nom de page qu'on peut écrire dans un rapport : un nom de fichier du site (`panier.aspx`). Tout autre nom de dossier est caché. */
const FILE_SEGMENT = /^[a-z][a-z0-9_.-]{0,30}\.(?:aspx|html?|php)$/i
const STORE_SEGMENT = /^magasin-N-N(?:-V)?$/

/** Le motif de l'adresse d'un lien pour le rapport : numéros et ville cachés, et tout nom de dossier hors magasin remplacé par `…`. */
function reportShape(pathname: string): string {
  const shape = addressShape(pathname)
  const trailing = shape.length > 1 && shape.endsWith('/')
  const segments = shape
    .split('/')
    .slice(1)
    .filter((segment) => segment !== '')
    .map((segment) =>
      STORE_SEGMENT.test(segment) ||
      segment === 'V' ||
      segment === '…' ||
      FILE_SEGMENT.test(segment)
        ? segment
        : '…',
    )
  return `/${segments.join('/')}${trailing ? '/' : ''}`
}

function where(href: string, url: URL | null, page: PageRef): LinkWhere | null {
  if (url === null) return null
  if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return 'RELATIVE'
  if (url.hostname.toLowerCase() === page.hostname.toLowerCase()) return 'SAME_HOST'
  return STORE_HOST.test(url.hostname.toLowerCase()) ? 'LECLERC_HOST' : 'OTHER_SITE'
}

function factsOf(anchor: Anchor | undefined, page: PageRef): LinkFacts {
  if (anchor === undefined) return { present: false, shape: null, where: null }
  const url = anchor.href === null ? null : resolve(anchor.href, page)
  return {
    present: true,
    shape: url === null ? null : reportShape(url.pathname),
    where: anchor.href === null ? null : where(anchor.href, url, page),
  }
}

const isStart = (anchor: Anchor) => anchor.labels.includes(START_LABEL)

/** Une adresse qui ne mène nulle part par elle-même : absente, vide, `#` ou `javascript:` (le bouton du vrai site agit par son script). */
const isAddressless = (href: string | null) =>
  href === null || href === '' || href.startsWith('#') || /^javascript:/i.test(href)

/**
 * Ce que la page laisse voir pour le diagnostic : « Commencer mes courses », présent ou non, la forme de son adresse s'il en a une, et si c'est
 * un bouton à cliquer. Aucune requête, aucune écriture.
 */
export function entryFacts(pageText: string, page: PageRef): EntryFacts {
  const anchor = anchorsOf(pageText).find(isStart)
  return {
    start: factsOf(anchor, page),
    clickable: anchor !== undefined && isAddressless(anchor.href),
  }
}

/** Ce que `findStartButton` rend : de quoi toucher le bouton. */
export interface StartButton {
  click(): void
}

const CLICKABLE = 'a, button, input[type="button"], input[type="submit"], [role="button"]'

/** Les éléments qui ne sont ni lien ni bouton mais que le site peut rendre cliquables (un `div` ou un `span` à gestionnaire de clic). */
const LOOKS_CLICKABLE = '[onclick], [tabindex], div, span, label, li, p'

/** Le texte, `aria-label`, `title` et `value` d'un élément, comparables. */
const labelsOfElement = (element: Element): string[] =>
  [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
  ].map((label) => trimLabel(fold(label ?? '')))

const hasStartLabel = (element: Element): boolean =>
  labelsOfElement(element).some((label) => label.length <= MAX_LABEL && label === START_LABEL)

const isDisabled = (element: Element): boolean =>
  element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'

/** Un élément que le site a rendu cliquable sans en faire un lien ni un bouton : gestionnaire de clic, ordre de tabulation ou curseur « main ». */
function isPointer(element: HTMLElement): boolean {
  if (element.hasAttribute('onclick') || element.hasAttribute('tabindex')) return true
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element).cursor === 'pointer'
  } catch {
    return false
  }
}

const firstShown = (list: HTMLElement[]): HTMLElement | null =>
  list.find((element) => element.getClientRects().length > 0) ?? list[0] ?? null

/**
 * Le bouton « Commencer mes courses » SANS adresse navigable dans la page (le DOM, pas son texte : c'est lui qu'on touche). Même libellé que
 * `readEntry` : le texte, `aria-label`, `title` ou `value` ; un élément désactivé ou qui est un vrai lien (adresse `http`) n'en est pas un. De
 * plusieurs, le premier qui est affiché. Faute de lien ou de bouton, l'élément le plus profond dont le libellé est exactement celui-là et que
 * le site a rendu cliquable (`onclick`, `tabindex` ou curseur « main ») : ce que toucherait un doigt. `null` sans bouton.
 */
export function findStartButton(root: ParentNode): StartButton | null {
  const found: HTMLElement[] = []
  for (const element of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (isDisabled(element)) continue
    if (element.tagName === 'A' && !isAddressless(element.getAttribute('href')?.trim() ?? null))
      continue
    if (hasStartLabel(element)) found.push(element)
  }
  const button = firstShown(found)
  if (button !== null) return button
  const loose: HTMLElement[] = []
  for (const element of root.querySelectorAll<HTMLElement>(LOOKS_CLICKABLE)) {
    if (isDisabled(element) || element.closest(CLICKABLE) !== null) continue
    // Le plus profond : un conteneur dont un enfant porte déjà le libellé n'est pas touché à la place de cet enfant.
    if (Array.from(element.children).some(hasStartLabel)) continue
    if (hasStartLabel(element) && isPointer(element)) loose.push(element)
  }
  return firstShown(loose)
}

/**
 * Le chemin de l'accueil d'un magasin AVEC sa ville : `/magasin-N-N-Ville`, une barre finale permise, rien d'autre (ni page du magasin, ni
 * panier, ni mentions légales). Le groupe 1 est le premier numéro.
 */
const STORE_HOME_PATH = /^\/magasin-([0-9]{1,12})-[0-9]{1,12}-[^/?#]+\/?$/i

/**
 * Un lien de la page qui mène à l'ACCUEIL du magasin du plan (« Mon magasin », un magasin choisi dans la liste) : le même magasin que le plan
 * (premier numéro identique), sur un hôte `*.leclercdrive.fr` qui n'est pas le site mobile, avec le même schéma et le même port que la page,
 * sans identifiant. Rend l'adresse complète, `null` sans lien sûr. Jamais un autre magasin, jamais une page autre que l'accueil du magasin.
 */
function findStoreHomeLink(pageText: string, page: PageRef, storeId: string): string | null {
  for (const anchor of anchorsOf(pageText)) {
    if (anchor.href === null) continue
    const url = resolve(anchor.href, page)
    if (url === null) continue
    const found = STORE_HOME_PATH.exec(url.pathname)
    const host = url.hostname.toLowerCase()
    if (
      found?.[1] === storeId &&
      url.protocol === protocolOf(page) &&
      url.port === portOf(page) &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      STORE_HOST.test(host) &&
      !isMobileHost(host)
    )
      return url.href
  }
  return null
}

/** `/magasin-<id>-<id>` suivi de `-Ville`, de `/` ou de la fin du chemin : le même motif que `readStorePaths`. */
const STORE_PATH = /^\/magasin-([0-9]{1,12})-([0-9]{1,12})(?:-[^/?#]*)?(?=\/|$)/i

/**
 * « Commencer mes courses » dans la page : un bouton sans adresse (`BUTTON`, à cliquer), ou un lien, vérifié : il n'est suivi que s'il mène à une page de MAGASIN du plan (même premier numéro que
 * le magasin du plan), sur un hôte `*.leclercdrive.fr` qui n'est pas le site mobile, avec le même schéma et le même port que la page, sans
 * identifiant dans l'adresse. Toute autre adresse est refusée : une adresse lue dans la page n'est pas une adresse de navigation de confiance.
 * `storeId` : le premier numéro de l'adresse du magasin du plan (`plan.store.id`).
 */
export function readEntry(pageText: string, page: PageRef, storeId: string): EntryReading {
  if (isChallenge(pageText.replace(INVISIBLE, ' '))) return { kind: 'CHALLENGE' }
  const anchor = anchorsOf(pageText).find(isStart)
  if (anchor === undefined) {
    // Pas de « Commencer mes courses » (l'étape « choisir mon magasin » de l'accueil) : un lien vers l'accueil du magasin du plan va droit au but.
    const home = findStoreHomeLink(pageText, page, storeId)
    return home === null ? { kind: 'NONE' } : { kind: 'LINK', url: home }
  }
  if (isAddressless(anchor.href)) return { kind: 'BUTTON' }
  const url = resolve(anchor.href ?? '', page)
  if (url === null) return { kind: 'REFUSED' }
  const host = url.hostname.toLowerCase()
  const found = STORE_PATH.exec(url.pathname)
  const sound =
    url.protocol === protocolOf(page) &&
    url.port === portOf(page) &&
    url.username === '' &&
    url.password === '' &&
    STORE_HOST.test(host) &&
    !isMobileHost(host) &&
    found?.[1] === storeId
  return sound ? { kind: 'LINK', url: url.href } : { kind: 'REFUSED' }
}

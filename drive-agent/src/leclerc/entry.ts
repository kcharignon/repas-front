// L'entrée dans le magasin (DRV-625). Le plan s'ouvre sur l'accueil de l'enseigne, où le bouton « Commencer mes courses » mène aux pages du
// magasin : l'agent le suit lui-même, mais SEULEMENT si son adresse a la forme d'une page du magasin du plan. Ce fichier lit deux liens dans le
// texte de la page (sans requête) :
//   - « Commencer mes courses » : pour le suivre (`readEntry`) et pour le diagnostic (`entryFacts`) ;
//   - le lien du panier, s'il y en a un : pour le diagnostic seul (l'adresse du panier du vrai site n'a jamais été relevée).
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

/** Un lien : ses attributs (bornés) et son contenu (borné : un libellé n'est pas un paragraphe). */
const ANCHOR = /<a\b([^>]{0,500})>([\s\S]{0,300}?)<\/a\s*>/gi
const HREF = /\bhref\s*=\s*(?:"([^"]{0,500})"|'([^']{0,500})')/i
const ATTRIBUTE_LABEL = /\b(?:aria-label|title)\s*=\s*(?:"([^"]{0,100})"|'([^']{0,100})')/i

const START_LABEL = 'commencer mes courses'
/** Les libellés du lien du panier (comparables, voir `fold`) : le panier tout seul, ou précédé d'un verbe, suivi d'un compte éventuel. */
const BASKET_LABEL = /^(?:(?:voir|acceder a|aller a)\s+)?(?:mon|le|votre|au)?\s*panier(?:\s|$)/
const BASKET_PAGE = /(^|\/)panier[a-z0-9_.-]*$/i

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
  basket: LinkFacts
}

/** L'adresse de la page, telle que `window.location` la donne (`protocol` et `port` seulement si elle les connaît). */
export type PageRef = Pick<LocationLike, 'hostname' | 'pathname'> &
  Partial<Pick<LocationLike, 'protocol' | 'port'>>

/** Ce que l'agent peut faire de l'accueil du magasin. */
export type EntryReading =
  /** Le lien est là et mène à une page du magasin du plan : `url` est l'adresse à suivre (complète, vérifiée). */
  | { kind: 'LINK'; url: string }
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

/** Les liens du texte visible de la page (les scripts, styles et commentaires n'en sont pas). */
function anchorsOf(page: string): Anchor[] {
  const visible = page.replace(INVISIBLE, ' ')
  const anchors: Anchor[] = []
  for (const match of visible.matchAll(ANCHOR)) {
    const attributes = match[1] ?? ''
    const attribute = ATTRIBUTE_LABEL.exec(attributes)
    const href = HREF.exec(attributes)
    const raw = href?.[1] ?? href?.[2]
    anchors.push({
      labels: [match[2] ?? '', attribute?.[1] ?? attribute?.[2] ?? '']
        .map((label) => trimLabel(fold(label)))
        .filter((label) => label !== '' && label.length <= MAX_LABEL),
      href: raw === undefined ? null : decodeEntities(raw).trim(),
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

function isBasket(anchor: Anchor, page: PageRef): boolean {
  if (anchor.labels.some((label) => BASKET_LABEL.test(label))) return true
  const url = anchor.href === null ? null : resolve(anchor.href, page)
  return url !== null && BASKET_PAGE.test(url.pathname.split(/[?#]/, 1)[0] ?? '')
}

/**
 * Ce que la page laisse voir pour le diagnostic : le lien « Commencer mes courses » et le lien du panier, présents ou non, avec la forme de
 * leur adresse. Aucune requête, aucune écriture.
 */
export function entryFacts(pageText: string, page: PageRef): EntryFacts {
  const anchors = anchorsOf(pageText)
  return {
    start: factsOf(anchors.find(isStart), page),
    basket: factsOf(
      anchors.find((anchor) => isBasket(anchor, page)),
      page,
    ),
  }
}

/** `/magasin-<id>-<id>` suivi de `-Ville`, de `/` ou de la fin du chemin : le même motif que `readStorePaths`. */
const STORE_PATH = /^\/magasin-([0-9]{1,12})-([0-9]{1,12})(?:-[^/?#]*)?(?=\/|$)/i

/**
 * Le lien « Commencer mes courses » de la page, vérifié : il n'est suivi que s'il mène à une page de MAGASIN du plan (même premier numéro que
 * le magasin du plan), sur un hôte `*.leclercdrive.fr` qui n'est pas le site mobile, avec le même schéma et le même port que la page, sans
 * identifiant dans l'adresse. Toute autre adresse est refusée : une adresse lue dans la page n'est pas une adresse de navigation de confiance.
 * `storeId` : le premier numéro de l'adresse du magasin du plan (`plan.store.id`).
 */
export function readEntry(pageText: string, page: PageRef, storeId: string): EntryReading {
  if (isChallenge(pageText.replace(INVISIBLE, ' '))) return { kind: 'CHALLENGE' }
  const anchor = anchorsOf(pageText).find(isStart)
  if (anchor === undefined) return { kind: 'NONE' }
  const url = anchor.href === null ? null : resolve(anchor.href, page)
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

// Le menu « Rayons » de la page du magasin (DRV-647, étape 0) : les libellés de rayons sont-ils dans le DOM, et avec quel identifiant dans l'adresse
// du lien ? La page en cours est lue telle qu'elle est (sans requête, sans clic, sans ouvrir le menu). Ce qui sort : l'identifiant lu dans l'adresse,
// le libellé du rayon (texte de catalogue public, nettoyé et borné, écarté s'il ressemble à une donnée : un nombre long, une adresse e-mail, la ville
// du magasin), la FORME des adresses (`addressShape` : ni numéro de magasin ni ville) et le NOM des paramètres de leurs requêtes. Jamais une adresse.
import { cleanText } from '../text'
import { addressShape } from './probe'
import { aisleVocabulary, type VocabularyKey } from './reply-shape'
import type { LocationLike } from './store'

/** Un lien de la page : l'attribut `href` tel quel, son texte, et s'il est dans le bloc du menu « Rayons ». */
export interface PageLink {
  href: string
  text: string
  inMenu: boolean
}

/** Ce que le DOM de la page montre de ses liens et du menu « Rayons ». */
export interface PageLinks {
  /** Un élément de la page s'intitule « Rayons » (ou « Nos rayons », « Tous les rayons »). */
  menu: boolean
  links: readonly PageLink[]
}

/** Un lien de rayon (ou du menu « Rayons ») : l'identifiant lu dans son adresse et son libellé (`null` : écarté). */
export interface MenuAisle {
  /** `RAYON` : l'adresse parle de rayon ; `MENU` : un lien du bloc « Rayons » dont l'adresse ne dit pas sa sorte. */
  kind: 'RAYON' | 'MENU'
  id: number | null
  label: string | null
}

export interface AisleMenuFacts {
  /** Le titre « Rayons » est dans la page. */
  menu: boolean
  /** Les liens lus dans la page, et ceux du bloc « Rayons ». */
  links: number
  menuLinks: number
  /** Les liens de rayon distincts, dans l'ordre de la page ([MAX_MENU_AISLES] au plus). */
  aisles: MenuAisle[]
  /** Le nombre de liens de rayon distincts, avant le plafond. */
  aisleCount: number
  /** Les liens de famille distincts (seulement comptés), et leurs identifiants. */
  families: number
  /** Tous les identifiants de rayon et de famille lus dans les adresses (des nombres, pour la correspondance avec les produits). */
  aisleIds: number[]
  familyIds: number[]
  /** Les formes distinctes des adresses des liens de rayon et de famille, avec les noms des paramètres de requête ([MAX_SHAPES] au plus). */
  shapes: string[]
  /** Les clés de l'état embarqué de la page qui parlent de rayon, de filtre ou de menu (des noms et des nombres). */
  vocabulary: VocabularyKey[]
}

/** Au plus autant de liens de rayon décrits (une ligne chacun dans le rapport). */
export const MAX_MENU_AISLES = 40
/** Au plus autant de formes d'adresse. */
export const MAX_SHAPES = 5
/** Au plus autant de liens lus dans la page, et de nœuds de texte parcourus pour trouver le titre du menu. */
export const MAX_LINKS = 3000
const MAX_TEXT_NODES = 50_000
/** Au plus autant d'identifiants gardés pour la correspondance. */
const MAX_IDS = 2000
/** La longueur au plus d'un libellé rapporté. */
export const MAX_LABEL = 60

const MENU_TITLES = new Set(['rayons', 'nos rayons', 'tous les rayons', 'tous nos rayons'])
/** Combien de parents remonter depuis le titre pour trouver le bloc du menu, et combien de liens il doit porter au moins. */
const MENU_LEVELS = 6
const MENU_MIN_LINKS = 5

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim()

/**
 * Les liens de la page et le bloc du menu « Rayons », lus dans le DOM en cours (aucune requête, aucun clic : un menu replié est lu tel quel). Le bloc
 * est le premier parent du titre qui porte au moins [MENU_MIN_LINKS] liens. [MAX_LINKS] liens au plus.
 */
export function readPageLinks(doc: Document): PageLinks {
  const blocks: Element[] = []
  let titled = false
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, 4 /* NodeFilter.SHOW_TEXT */)
  for (let seen = 0; seen < MAX_TEXT_NODES && blocks.length < 5; seen++) {
    const node = walker.nextNode()
    if (node === null) break
    const raw = node.nodeValue ?? ''
    if (raw.length > 40 || !MENU_TITLES.has(fold(raw))) continue
    // Un titre sans bloc de liens autour compte aussi : un menu chargé au survol.
    titled = true
    let block = node.parentElement
    for (let level = 0; block !== null && level < MENU_LEVELS; level++) {
      if (block.querySelectorAll('a[href]').length >= MENU_MIN_LINKS) {
        if (!blocks.includes(block)) blocks.push(block)
        break
      }
      block = block.parentElement
    }
  }
  const links: PageLink[] = []
  for (const anchor of [...doc.querySelectorAll('a[href]')].slice(0, MAX_LINKS)) {
    const text = (anchor.textContent ?? '').slice(0, 300)
    links.push({
      href: (anchor.getAttribute('href') ?? '').slice(0, 2000),
      text: text.trim() === '' ? (anchor.getAttribute('title') ?? '').slice(0, 300) : text,
      inMenu: blocks.some((block) => block.contains(anchor)),
    })
  }
  return { menu: titled, links }
}

const STORE_CITY = /^\/magasin-\d{1,12}-\d{1,12}-([^/?#]+)/i
/** Ce qui parle du compte de l'utilisateur, dans une adresse ou un libellé replié (`fold`). */
const ACCOUNT =
  /compte|command|factur|panier|connex|identif|profil|fidel|adress|livraison|creneau|ticket|client|login|logout|account/i
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,30}$/

/** Le libellé rapportable d'un lien : nettoyé, resserré, borné ; `null` s'il est vide ou ressemble à une donnée (nombre long, e-mail, ville). */
export function safeAisleLabel(text: string, city: string | null): string | null {
  const label = cleanText(text).replace(/\s+/g, ' ').trim()
  if (label === '' || label.includes('@') || /\d{4,}/.test(label)) return null
  if (city !== null) {
    const town = fold(city)
    if (town.length >= 3 && fold(label).includes(town)) return null
  }
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label
}

/** Le numéro de [keyword] (`rayon`, `famille`) dans une adresse : un paramètre qui porte ce mot (`idRayon=12`), sinon `rayon-12` dans le chemin. */
function idOf(url: URL, keyword: string): number | null {
  const value = (raw: string | undefined) => {
    if (raw === undefined || !/^\d{1,9}$/.test(raw)) return null
    const id = Number(raw)
    return id > 0 ? id : null
  }
  for (const [name, raw] of url.searchParams) {
    if (name.toLowerCase().includes(keyword)) {
      const id = value(raw)
      if (id !== null) return id
    }
  }
  return value(new RegExp(`${keyword}s?[-_/=]?(\\d{1,9})(?!\\d)`, 'i').exec(url.pathname)?.[1])
}

/** Le numéro d'un lien du bloc « Rayons » dont l'adresse ne dit pas sa sorte : le premier nombre de son dernier segment (hors segment du magasin). */
function menuIdOf(url: URL): number | null {
  const last = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  if (/^magasin-\d/i.test(last)) return null
  const raw = /(?:^|[-_])(\d{1,9})(?=[-_.]|$)/.exec(last)?.[1]
  return raw === undefined || Number(raw) === 0 ? null : Number(raw)
}

/**
 * La forme d'une adresse de lien : le motif du chemin (`addressShape` : numéros en `N`, ville du chemin du magasin en `V`), ce qui suit un numéro
 * dans un nom de page caché (`rayon-N-….aspx` : le libellé ou la ville qu'il pourrait porter), la ville masquée aussi ailleurs dans un nom de page, et
 * les noms de ses paramètres de requête, sans leurs valeurs.
 */
function shapeOf(url: URL, city: string | null): string {
  let path = addressShape(url.pathname)
    .split('/')
    .map((part) => (part.startsWith('magasin-N') ? part : part.replace(/N-[^/.]+/g, 'N-…')))
    .join('/')
  if (city !== null && city.length >= 3) {
    path = path.replace(new RegExp(city.replace(/[^A-Za-z0-9]/g, '.'), 'gi'), 'V')
  }
  const names = [...new Set([...url.searchParams.keys()].filter((name) => PARAM_NAME.test(name)))]
  return `${path}${names.length === 0 ? '' : ` ?${names.slice(0, 5).join('&')}`}`
}

/**
 * Les liens de rayon de la page : ceux dont l'adresse (chemin ou nom de paramètre) parle de rayon, et ceux du bloc « Rayons » qui portent un numéro ;
 * les liens de famille sont seulement comptés. Seuls les liens de l'hôte de la page sont lus. Une fonction pure.
 */
export function aisleMenuFacts(
  page: PageLinks,
  location: LocationLike,
  pageText = '',
): AisleMenuFacts {
  const host = location.hostname.toLowerCase()
  const city = STORE_CITY.exec(location.pathname)?.[1] ?? null
  const base = `https://${host}${location.pathname.startsWith('/') ? location.pathname : '/'}`
  const aisles: MenuAisle[] = []
  const seen = new Set<string>()
  const aisleIds = new Set<number>()
  const familyIds = new Set<number>()
  const families = new Set<string>()
  const shapes = new Set<string>()
  let menuLinks = 0
  for (const link of page.links) {
    if (link.inMenu) menuLinks++
    let url: URL
    try {
      url = new URL(link.href, base)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    if (url.hostname.toLowerCase() !== host) continue
    const address = `${url.pathname}?${[...url.searchParams.keys()].join('&')}`.toLowerCase()
    const label = safeAisleLabel(link.text, city)
    if (address.includes('famil')) {
      const id = idOf(url, 'famille')
      families.add(`${id ?? '?'}|${label ?? ''}`)
      if (id !== null && familyIds.size < MAX_IDS) familyIds.add(id)
      if (shapes.size < MAX_SHAPES) shapes.add(shapeOf(url, city))
      continue
    }
    const kind = address.includes('rayon') ? 'RAYON' : link.inMenu ? 'MENU' : null
    if (kind === null) continue
    // Un lien du bloc qui ne dit pas sa sorte et parle du compte (une commande, une facture) n'est pas un rayon : son numéro pourrait être une donnée.
    if (kind === 'MENU' && (ACCOUNT.test(address) || ACCOUNT.test(fold(link.text)))) continue
    const id = kind === 'RAYON' ? idOf(url, 'rayon') : menuIdOf(url)
    if (kind === 'MENU' && id === null) continue
    const key = `${kind}|${id ?? '?'}|${label ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    if (id !== null && aisleIds.size < MAX_IDS) aisleIds.add(id)
    if (shapes.size < MAX_SHAPES) shapes.add(shapeOf(url, city))
    aisles.push({ kind, id, label })
  }
  return {
    menu: page.menu,
    links: page.links.length,
    menuLinks,
    aisles: aisles.slice(0, MAX_MENU_AISLES),
    aisleCount: aisles.length,
    families: families.size,
    aisleIds: [...aisleIds],
    familyIds: [...familyIds],
    shapes: [...shapes],
    vocabulary: aisleVocabulary(pageText),
  }
}

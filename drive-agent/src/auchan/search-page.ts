// La page de résultats d'Auchan (DRV-724) : `GET /recherche?text=<terme>` rend une page HTML COMPLÈTE (390 à 700 Ko, DRV-714, mesuré) dont les produits sont dans
// le DOM. Ce fichier la lit dans un document INERT (`DOMParser`), par des SÉLECTEURS : jamais d'expression régulière sur le HTML de la page, jamais de
// code de la page exécuté. Tout ce qui en sort est une donnée non fiable : borné, nettoyé (`cleanText`), `null` plutôt qu'une valeur fausse.
//
// MESURÉ (DRV-714, B-1 et B-2) : une carte porte `data-product-id`, `data-offer-id` (deux UUID), `data-seller-type` (`GROCERY`), `data-offer-type`
// (`DEFAULT`), `data-seller-id` (vide en épicerie) et des microdonnées schema.org `name`, `image`, `brand`, `offers`, `price` (décimal, en euros),
// `priceCurrency` (`EUR`), `availability` (`InStock` vu) ; la carte affiche « 1kg », « 0,91 € / kg » et la mention « Dans mon drive » pour un produit
// disponible au drive choisi ; 200 à 250 balises `data-product-id` par page, PLUSIEURS PAR PRODUIT (donc jamais un nombre de produits).
// MESURÉ le 2026-10-30 (DRV-739, B-9) : un produit peut porter PLUSIEURS offres, d'autres vendeurs que le drive (`data-seller-type="ONLINE"`, livraison) : seules
// les offres `GROCERY` sont celles du drive. Un produit sans offre `GROCERY` n'est pas un produit du drive (écarté, compté à part).
// NON MESURÉ (chaque point est marqué où il sert) : sur QUEL élément chaque attribut et chaque microdonnée se trouvent, la forme de l'élément qui
// porte le contenu net et le prix au kilo, les valeurs « indisponible », les produits d'un autre vendeur, les promotions, la pagination et l'ordre.
import { LIMITS } from '../../protocol'
import { contentFromLabel } from '../retailers/content'
import { cleanText } from '../text'
import { fold } from './page'

/** Un UUID en minuscules (DRV-715 § 2 point 4) : la forme de `productId` et d'`offerId`. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const MARKER = '[data-product-id]'
/** Les microdonnées qui ne sont pas celles du produit lui-même (le nom d'une marque, d'une note, d'un avis n'est pas le nom du produit). */
const FOREIGN_SCOPE =
  '[itemprop~="brand"], [itemprop~="offers"], [itemprop~="aggregateRating"], [itemprop~="review"], [itemprop~="seller"]'

/** Ce que la page dit d'UN produit, avant toute interprétation : le texte brut des microdonnées, les attributs, la mention « Dans mon drive ». */
export interface PageProduct {
  productId: string
  offerId: string
  /** `data-seller-type` (`GROCERY` mesuré) ; `null` quand il manque, est vide, contradictoire ou n'a pas la forme d'un mot de code. */
  sellerType: string | null
  /** `data-offer-type` (`DEFAULT` mesuré), même règle. */
  offerType: string | null
  /** `data-seller-id` quand il n'est pas vide (vide en épicerie, mesuré). */
  sellerId: string | null
  name: string
  brand: string | null
  /** L'adresse de la photo telle que la page la donne (non fiable : `photoUrl` la juge). */
  image: string | null
  /** Le prix en EUROS, lu en décimal ; `null` s'il manque, n'est pas un nombre, est nul, ou si la devise n'est pas `EUR`. */
  price: number | null
  /** Les valeurs d'`availability`, sans l'adresse schema.org, en minuscules (`instock`) ; vide : la page n'en dit rien. */
  availability: string[]
  /** La mention « Dans mon drive » est dans la carte. */
  inDrive: boolean
  /** Le contenu net affiché (« 1kg »), `null` s'il n'est pas lu. */
  pastille: string | null
  /** Le prix au kilo, au litre ou à la pièce affiché (« 0,91 € / kg »), en euros, avec son texte ; `null` s'il n'est pas lu. */
  measure: { price: number; text: string } | null
}

export interface PageReading {
  products: PageProduct[]
  /** Les éléments `data-product-id` de la page : PLUSIEURS PAR PRODUIT, donc jamais le nombre de produits. */
  markers: number
  /** Les produits distincts annoncés (par un identifiant de forme valide). */
  found: number
  /** Ceux qu'on n'a pas su lire (pas d'offre sûre, pas de nom) : écartés, jamais devinés. */
  unreadable: number
  /**
   * Ceux qui ne sont PAS du drive (DRV-739, B-9) : toutes leurs offres sont d'un vendeur autre que `GROCERY` (`ONLINE` mesuré). Ni lus ni « illisibles » : ce
   * ne sont pas des résultats de la recherche du drive, et ils ne disent rien d'une rupture du contrat du site.
   */
  notDrive: number
}

/** Le vendeur du drive (MESURÉ, B-1) : toute offre d'un autre vendeur (`ONLINE`, B-9) n'est pas une offre du drive. */
export const DRIVE_SELLER_TYPE = 'GROCERY'

// —— Les valeurs ————————————————————————————————————————————————————————————————————————————————————————————————————————————

const text = (element: Element): string => cleanText(element.textContent ?? '')

/** Une valeur de microdonnée : l'attribut `content` d'abord (`<meta>`), puis le texte. */
function contentOrText(element: Element): string {
  const content = element.getAttribute('content')
  return content !== null ? cleanText(content) : text(element)
}

/** Une adresse de microdonnée (`<meta content>`, `<img src>`, `<link href>`, `<a href>`), dans l'ordre des attributs donnés, à défaut le texte. */
function addressOf(element: Element, attributes: readonly string[]): string {
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute)
    if (value !== null && value.trim() !== '') return value.trim()
  }
  return text(element)
}

const prop = (root: Element, name: string): Element[] => [
  ...root.querySelectorAll(`[itemprop~="${name}"]`),
]

/** Un prix en euros : un nombre décimal (« 0.91 », « 0,91 »), éventuellement suivi de « € » ou « EUR » ; `null` sinon, ou s'il n'est pas strictement positif. */
export function parseEuros(raw: string): number | null {
  const found = /^(\d{1,6})(?:[.,](\d{1,4}))?\s*(?:€|eur)?$/i.exec(cleanText(raw))
  if (!found?.[1]) return null
  const value = Number(`${found[1]}.${found[2] ?? '0'}`)
  return value > 0 ? value : null
}

/** Un mot de code d'attribut (`GROCERY`, `DEFAULT`) : des lettres, chiffres, tirets, au plus 40 caractères ; sinon `null`. */
const code = (value: string | null): string | null =>
  value !== null && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : null

/** La valeur de l'attribut sur les éléments du produit : celle qu'ils portent tous, `null` s'ils se contredisent ou si aucun n'en porte. */
function agreed(elements: readonly Element[], attribute: string): string | null {
  const values = new Set<string>()
  for (const element of elements) {
    const value = (element.getAttribute(attribute) ?? '').trim()
    if (value !== '') values.add(value)
  }
  const [only] = values
  return values.size === 1 && only !== undefined ? only : null
}

function cut(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('')
}

// —— La carte d'un produit ——————————————————————————————————————————————————————————————————————————————————————————————————

/** Vrai quand `element` contient la balise d'un AUTRE produit que `productId`. */
function holdsAnother(element: Element, productId: string): boolean {
  for (const marker of element.querySelectorAll(MARKER)) {
    if ((marker.getAttribute('data-product-id') ?? '').trim() !== productId) return true
  }
  return false
}

const nameOf = (card: Element): Element | undefined =>
  prop(card, 'name').find((candidate) => !candidate.closest(FOREIGN_SCOPE))

/**
 * La carte d'un produit : le plus petit ancêtre (ou l'élément lui-même) d'un de ses éléments `data-product-id` qui porte son nom ET son prix en microdonnées,
 * à défaut son nom seul ; on ne monte jamais jusqu'à un élément qui contient la balise d'un autre produit (deux produits ne se mélangent pas). NON MESURÉ :
 * l'élément où sont les microdonnées ; si la carte n'a pas de nom lisible, le produit est illisible, pas deviné.
 */
function cardOf(elements: readonly Element[], productId: string): Element | null {
  let withName: Element | null = null
  for (const start of elements) {
    for (let element: Element | null = start; element !== null; element = element.parentElement) {
      if (element.tagName === 'BODY' || element.tagName === 'HTML') break
      if (holdsAnother(element, productId)) break
      if (nameOf(element) === undefined) continue
      withName ??= element
      if (prop(element, 'price').length > 0) return element
    }
  }
  return withName
}

/** Un élément n'est pas la matière d'un contenu net ou d'un prix quand il est dans le nom, la marque ou la description du produit. */
const insideLabel = (element: Element): boolean =>
  element.closest('[itemprop~="name"], [itemprop~="brand"], [itemprop~="description"]') !== null

/** Le contenu net affiché : un élément sans enfant, court, sans prix, que `contentFromLabel` lit (« 1kg », « 6 x 33 cl »). NON MESURÉ : l'élément. */
function pastilleOf(card: Element): string | null {
  for (const element of card.querySelectorAll('*')) {
    if (element.children.length > 0 || insideLabel(element)) continue
    const label = text(element)
    if (label.length < 2 || label.length > 24 || /[€/]/.test(label) || !/\d/.test(label)) continue
    if (contentFromLabel(label) !== null) return label
  }
  return null
}

/** « 0,91 € / kg » : un montant en euros, une barre, une unité de mesure. Le montant est celui qui précède la barre. */
const MEASURE =
  /(\d+(?:[.,]\d{1,3})?)\s*€\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:kg|g|l|ml|cl|dl|pi[eè]ces?|unit[eé]s?|u)(?![a-zà-ÿ])/i

/** Le prix au kilo, au litre ou à la pièce : le premier élément COURT (60 caractères) dont le texte le dit. NON MESURÉ : l'élément qui le porte. */
function measureOf(card: Element): PageProduct['measure'] {
  for (const element of card.querySelectorAll('*')) {
    if (insideLabel(element)) continue
    const label = text(element)
    if (label.length > 60) continue
    const found = MEASURE.exec(label)
    const price = found?.[1] ? parseEuros(found[1]) : null
    if (found && price !== null) return { price, text: found[0] }
  }
  return null
}

/** Les valeurs d'`availability` d'une carte, sans l'adresse schema.org, en minuscules. */
function availabilityOf(card: Element): string[] {
  return prop(card, 'availability')
    .map((element) =>
      addressOf(element, ['href', 'content'])
        .replace(/^https?:\/\/schema\.org\//i, '')
        .toLowerCase(),
    )
    .filter((value) => value !== '')
}

/** Ce que la lecture d'un produit rend : le produit, `NOT_DRIVE` (aucune offre du drive : écarté, DRV-739) ou `UNREADABLE` (jamais deviné). */
type ProductReading = PageProduct | 'NOT_DRIVE' | 'UNREADABLE'

/**
 * Les offres d'un produit, chacune avec les éléments qui la portent. Le vendeur d'une offre est celui que tous ses éléments disent (`data-seller-type`) ;
 * `null` quand aucun n'en dit un, que deux se contredisent ou qu'il n'a pas la forme d'un mot de code. Une balise sans `data-offer-id` (le bouton d'ajout
 * d'une carte, B-1) n'est d'aucune offre.
 */
function offersOf(
  elements: readonly Element[],
): Map<string, { sellerType: string | null; elements: Element[] }> {
  const offers = new Map<string, { sellerType: string | null; elements: Element[] }>()
  for (const element of elements) {
    const offer = (element.getAttribute('data-offer-id') ?? '').trim()
    if (offer === '') continue
    const known = offers.get(offer)
    if (known) known.elements.push(element)
    else offers.set(offer, { sellerType: null, elements: [element] })
  }
  for (const offer of offers.values())
    offer.sellerType = code(agreed(offer.elements, 'data-seller-type'))
  return offers
}

/**
 * Lit un produit. DRV-739 (B-9, MESURÉ le 2026-10-30) : une offre n'est une offre du DRIVE que si son vendeur est `GROCERY` ; un produit peut porter des offres
 * d'autres vendeurs (`ONLINE`, livraison), qui sont écartées AVANT de compter. Il reste :
 *  - une seule offre du drive : le produit est lu avec elle ;
 *  - aucune, parce que toutes sont d'un vendeur connu autre que `GROCERY` : `NOT_DRIVE` ;
 *  - plusieurs : `UNREADABLE`, on ne saurait pas laquelle mettre au panier ; ou aucune offre du tout, pas de carte, pas de nom : `UNREADABLE`.
 * Une offre dont le vendeur n'est pas lisible (absent, contradictoire, mal formé) n'est PAS écartée : elle reste comptée comme avant (jamais écarter ce
 * qu'on ne comprend pas).
 */
function readProduct(productId: string, elements: readonly Element[]): ProductReading {
  const all = offersOf(elements)
  const offers = [...all].filter(
    ([, offer]) => offer.sellerType === null || offer.sellerType === DRIVE_SELLER_TYPE,
  )
  if (all.size > 0 && offers.length === 0) return 'NOT_DRIVE'
  const [only] = offers
  // Un produit = UNE offre du drive sûre : sans elle, ou avec deux, on ne saurait pas laquelle mettre au panier.
  if (offers.length !== 1 || only === undefined || !UUID.test(only[0])) return 'UNREADABLE'
  const offerId = only[0]
  // Les éléments de CETTE offre (et ceux d'aucune offre) : les attributs des autres offres du produit ne se mélangent pas aux siens.
  const own = elements.filter((element) => {
    const offer = (element.getAttribute('data-offer-id') ?? '').trim()
    return offer === '' || offer === offerId
  })
  const card = cardOf(elements, productId)
  if (card === null) return 'UNREADABLE'
  const nameElement = nameOf(card)
  const name = nameElement ? cut(contentOrText(nameElement), LIMITS.label) : ''
  if (name === '') return 'UNREADABLE'
  const brandElement = prop(card, 'brand')[0]
  const brandName = brandElement ? prop(brandElement, 'name')[0] : undefined
  const brand = brandElement ? cut(contentOrText(brandName ?? brandElement), LIMITS.label) : ''
  const priceElement = prop(card, 'price')[0]
  const currency = prop(card, 'priceCurrency')[0]
  // Un prix n'est cru que s'il est dit en euros : sans devise lisible, ou autre qu'EUR, il n'est pas lu (jamais deviné).
  const price =
    priceElement && currency && contentOrText(currency).toUpperCase() === 'EUR'
      ? parseEuros(contentOrText(priceElement))
      : null
  const image = prop(card, 'image')[0]
  return {
    productId,
    offerId,
    sellerType: code(agreed(own, 'data-seller-type')),
    offerType: code(agreed(own, 'data-offer-type')),
    sellerId: code(agreed(own, 'data-seller-id')),
    name,
    brand: brand === '' ? null : brand,
    image: image ? addressOf(image, ['content', 'src', 'href']) : null,
    price,
    availability: availabilityOf(card),
    inDrive: fold(card.textContent ?? '').includes('dans mon drive'),
    pastille: pastilleOf(card),
    measure: measureOf(card),
  }
}

/**
 * Les produits de la page, dans l'ordre où ils apparaissent. Un produit est un identifiant `data-product-id` DISTINCT (les balises répétées d'un même
 * produit sont regroupées). Un identifiant qui n'a pas la forme d'un UUID n'est pas un produit.
 */
export function readProducts(doc: Document): PageReading {
  const groups = new Map<string, Element[]>()
  const markers = [...doc.querySelectorAll(MARKER)]
  for (const marker of markers) {
    const id = (marker.getAttribute('data-product-id') ?? '').trim()
    if (!UUID.test(id)) continue
    const group = groups.get(id)
    if (group) group.push(marker)
    else groups.set(id, [marker])
  }
  const products: PageProduct[] = []
  let notDrive = 0
  for (const [id, elements] of groups) {
    const product = readProduct(id, elements)
    if (product === 'NOT_DRIVE') notDrive += 1
    else if (product !== 'UNREADABLE') products.push(product)
  }
  return {
    products,
    markers: markers.length,
    found: groups.size,
    unreadable: groups.size - products.length - notDrive,
    notDrive,
  }
}

// —— Ce que la page ne contient pas ————————————————————————————————————————————————————————————————————————————————————————

/** Une trace de produit, lisible ou non : une balise de produit ou d'offre, un prix en microdonnées, un produit schema.org, ou un lien de fiche (`/pr-C…`). */
export function hasProductTrace(doc: Document): boolean {
  return (
    doc.querySelector(
      '[data-product-id], [data-offer-id], [itemprop~="price"], [itemtype*="schema.org/Product"], a[href*="/pr-C"]',
    ) !== null
  )
}

/**
 * La phrase (sans accent ni majuscule) par laquelle la page « aucun résultat » d'Auchan le dit. MESURÉ le 2026-10-30 (DRV-734, B-7b) : « Oups, on n'a rien
 * trouvé pour : » (puis le terme). Elle ne suffit pas seule : [isNoResultPage] exige aussi le titre de la page de recherche, son `h1` et (par l'appelant)
 * l'absence de toute carte. Les formes inventées d'avant (« aucun résultat », « aucun produit »…) n'ont jamais été vues : elles ne reconnaissent plus rien.
 */
export const NO_RESULT_PHRASES = ["on n'a rien trouve pour"] as const

/** Les phrases d'une liste FERMÉE que la page dit (rangées dans `facts.phrases` du diagnostic) : jamais un morceau de son texte. */
export const REPORTED_PHRASES = [
  ...NO_RESULT_PHRASES,
  'introuvable',
  'not found',
  'indisponible',
  'maintenance',
  'acces refuse',
  'forbidden',
] as const

/** Ceux de [REPORTED_PHRASES] que le texte visible de la page dit. */
export function phrasesOf(doc: Document): string[] {
  const visible = fold(doc.body?.textContent ?? '')
  return REPORTED_PHRASES.filter((phrase) => visible.includes(phrase))
}

/** Le texte du premier `h1` de la page, comparable (sans accent ni majuscule) ; vide s'il n'y en a pas. */
function headingOf(doc: Document): string {
  return fold(doc.querySelector('h1')?.textContent ?? '')
}

/** Le titre de la page, comparable. */
function titleOf(doc: Document): string {
  return fold(doc.title)
}

/**
 * La page « aucun résultat » de la recherche d'Auchan (MESURÉE le 2026-10-30, DRV-734, B-7b) : statut 200 sans redirection, titre « Votre recherche <terme>
 * sur Auchan.fr », `h1` « Votre recherche : <terme> », la phrase de [NO_RESULT_PHRASES] et AUCUNE carte de produit. Les quatre ensemble : une page qui n'en
 * a qu'un ou deux n'est pas reconnue (`SEARCH_UNKNOWN_PAGE`). L'absence de carte est jugée par l'appelant ([hasProductTrace]).
 */
export function isNoResultPage(doc: Document): boolean {
  const visible = fold(doc.body?.textContent ?? '')
  return (
    titleOf(doc).startsWith('votre recherche') &&
    headingOf(doc).startsWith('votre recherche') &&
    NO_RESULT_PHRASES.some((phrase) => visible.includes(phrase))
  )
}

/**
 * Une page de RAYON par son contenu (MESURÉ le 2026-10-30, DRV-734, B-8) : titre « <Catégorie> pas cher - Auchan.fr », `h1` le nom de la catégorie. Jugée
 * avec l'adresse (`/<rayon>/…/ca-n<chiffres>`, dans `search.ts`) : ni l'une ni l'autre ne suffit. Ce n'est pas la page de recherche (« Votre recherche… »).
 */
export function isAislePage(doc: Document): boolean {
  const title = titleOf(doc)
  const heading = headingOf(doc)
  return (
    title.endsWith(' pas cher - auchan.fr') &&
    !title.startsWith('votre recherche') &&
    heading !== '' &&
    !heading.startsWith('votre recherche')
  )
}

/** Retire de la copie lue ce qui n'est pas du contenu : scripts, styles, gabarits et `noscript` (leur texte n'est pas visible et fausserait les phrases). */
export function stripInert(doc: Document): void {
  for (const element of doc.querySelectorAll('script, style, template, noscript')) element.remove()
}

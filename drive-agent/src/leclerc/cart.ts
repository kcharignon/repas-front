// Le panier du magasin : `POST panier.aspx?op=1`, un champ de formulaire `d` contenant du JSON (recherche.md § 2 et DRV-007 du dépôt
// back, forme relevée sur le site le 2026-10-17). La quantité est **absolue** dans les deux sens : rejouer une requête ne double rien.
import { parseJson as parseJsonStrict, stringifyJson } from '../primitives'
import { RetailerError } from '../retailers/errors'

/** Les en-têtes du site pour le panier : le navigateur ajoute les siens (`Origin`, `Referer`, cookies…). `zcwb` est obligatoire. */
export const CART_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
  zcwb: 'ajax-manager',
}

/** La quantité maximale au panier. */
export const MAX_QUANTITY = 99

export interface CartRequest {
  productId: string
  /** Quantité visée au panier : `0` retire le produit. */
  quantity: number
  /** `sNoPointLivraison`, lu dans la page. */
  deliveryPoint: string
  /** Dernier mot cherché : le site le joint au contexte de l'ajout. */
  searchText: string
}

/**
 * Le champ `d` tel que le site l'envoie : identifiant de produit en TEXTE ; à l'ajout seulement, l'objet
 * `objContexteProvenanceArticle` (origine 4, type de page 3, texte cherché, vue 0, « uni-2 »). Le retrait (`eTypeAction` 2,
 * quantité 0) n'a pas de contexte. L'ordre des clés est celui du site.
 */
export function cartPayload(request: CartRequest): string {
  if (request.quantity === 0) {
    return stringifyJson({
      eTypeAction: 2,
      iIdProduit: request.productId,
      iQuantite: 0,
      sNoPointLivraison: request.deliveryPoint,
    })
  }
  return stringifyJson({
    eTypeAction: 1,
    iIdProduit: request.productId,
    iQuantite: request.quantity,
    sNoPointLivraison: request.deliveryPoint,
    objContexteProvenanceArticle: {
      eOrigine: 4,
      eTypePage: 3,
      sTexteRecherche: request.searchText,
      eVue: 0,
      sInformationsComplementaires: 'uni-2',
    },
  })
}

/** Le corps de la requête : un champ de formulaire `d` contenant le JSON encodé. */
export function cartBody(request: CartRequest): string {
  return `d=${encodeURIComponent(cartPayload(request))}`
}

/**
 * Ce que l'évènement du PRODUIT dit de sa disponibilité dans la réponse du panier (DRV-644) : des nombres lus tels quels (`iQteDisponible`,
 * `eDisponibilite`), `null` quand la réponse ne les donne pas. Ils servent à dire POURQUOI un produit n'est pas au panier, et au diagnostic.
 */
export interface CartProductFacts {
  stock: number | null
  availability: number | null
}

/** Ce que le site dit du panier après une écriture. */
export interface CartReading {
  /** Quantité du produit au panier (`iQtePanier` de `lstProduitsLight`) ; 0 s'il n'y figure plus. */
  obtained: number
  /** Nombre d'articles du panier (`iQuantitePanier`), `null` si la réponse ne le dit pas. */
  items: number | null
  /** Total du panier en centimes (`sTotalAPayer`), `null` si la réponse ne le dit pas ou s'il n'est pas lisible. */
  totalCents: number | null
  /**
   * La quantité de chaque produit du panier que la réponse donne (`lstProduitsLight`), par identifiant de produit (ticket M : l'agent n'écrit
   * jamais une quantité plus basse que celle que le panier a déjà). Une ligne dont l'identifiant ou la quantité sont illisibles est ignorée.
   * Une `Map`, pas un objet : l'identifiant vient de la page.
   */
  quantities: ReadonlyMap<string, number>
  /** La disponibilité que l'évènement du produit donne (DRV-644), `null` si la réponse n'a pas d'évènement pour ce produit. */
  product: CartProductFacts | null
}

/** « 12,34 € » (ou « 1 234,56 € ») donne 1234 ; tout autre texte, `null` (le total ne sert qu'à comparer deux états du panier). */
export function parseTotal(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
  if (typeof value !== 'string') return null
  const found = /^(\d{1,7})(?:[.,](\d{1,2}))?(?:€|eur|euros)?$/i.exec(value.replace(/\s/g, ''))
  return found?.[1] ? Number(found[1]) * 100 + Number((found[2] ?? '').padEnd(2, '0')) : null
}

/**
 * Le total du panier lu dans le texte d'une page du magasin (`sTotalAPayer`, entre guillemets, dans le JSON qu'elle embarque), en
 * centimes ; `null` s'il n'y figure pas ou si ce n'est pas un montant.
 */
export function readPageTotal(pageText: string): number | null {
  const found = /["']?sTotalAPayer["']?\s*[:=]\s*(?:"([^"\\]{1,24})"|'([^'\\]{1,24})')/.exec(
    pageText.replace(/&quot;/g, '"'),
  )
  return parseTotal(found?.[1] ?? found?.[2])
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value))
    return Number(value.replace(',', '.'))
  return null
}

function parseJson(text: string): unknown {
  try {
    return parseJsonStrict(text)
  } catch {
    return undefined
  }
}

/** La liste d'évènements d'une réponse : tableau direct, enveloppe `{d: …}` de .NET (éventuellement en texte), ou premier tableau. */
function eventsOf(parsed: unknown, depth = 0): unknown[] | null {
  if (depth > 3) return null
  if (typeof parsed === 'string') {
    const inner = parseJson(parsed)
    return inner === undefined ? null : eventsOf(inner, depth + 1)
  }
  if (Array.isArray(parsed)) return parsed
  const record = asRecord(parsed)
  if (!record) return null
  if ('d' in record) return eventsOf(record.d, depth + 1)
  return Object.values(record).find(Array.isArray) ?? [parsed]
}

/** La première valeur d'une clé : dans l'objet lui-même d'abord, puis plus profond. */
function findKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || typeof value !== 'object' || value === null) return undefined
  const record = asRecord(value)
  if (record && key in record) return record[key]
  const children = record ? Object.values(record) : (value as unknown[])
  for (const child of children) {
    const found = findKey(child, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/** Un identifiant de produit de l'enseigne : des chiffres, en texte (`iIdProduit` arrive en nombre ou en texte selon la réponse). */
const PRODUCT_ID = /^[0-9]{1,12}$/

/** Les quantités des produits d'une liste `lstProduitsLight` : celles dont l'identifiant et la quantité se lisent. */
function quantitiesOf(list: readonly unknown[]): Map<string, number> {
  const quantities = new Map<string, number>()
  for (const item of list) {
    const record = asRecord(item)
    const quantity = record ? asNumber(record.iQtePanier) : null
    const id = record === null ? '' : String(record.iIdProduit)
    if (quantity !== null && quantity >= 0 && PRODUCT_ID.test(id)) quantities.set(id, quantity)
  }
  return quantities
}

const startsWithPanier = (value: unknown) => typeof value === 'string' && value.startsWith('Panier')

/**
 * L'évènement d'état du panier : `eTypeEvenement` 1 (la réponse d'une écriture du site ordinateur) ou 6 (la lecture du panier de la version mobile, `op=12`, MESURÉE
 * le 2026-11-01), dont l'identifiant (`sIdUnique`) commence par « Panier » ou dont l'objet est un panier (`objElement.sType` « Panier »).
 */
function findCartEvent(events: readonly unknown[]): Record<string, unknown> | null {
  const typed = events
    .map(asRecord)
    .filter((record) => record?.eTypeEvenement === 1 || record?.eTypeEvenement === 6)
  const isCart = (record: Record<string, unknown> | null) => {
    const element = asRecord(record?.objElement)
    return (
      startsWithPanier(record?.sIdUnique) ||
      startsWithPanier(record?.sNomEvenement) ||
      element?.sType === 'Panier' ||
      startsWithPanier(element?.sId)
    )
  }
  return (
    typed.find(isCart) ??
    typed.find((record) => findKey(record, 'lstProduitsLight') !== undefined) ??
    null
  )
}

/** Les évènements du produit : ajout (101), changement (104), retrait (102). */
const PRODUCT_EVENTS: readonly unknown[] = [101, 102, 104]

/** L'évènement du produit écrit (`Produit<id>`, ou portant son `iIdProduit`), et ce qu'il dit de sa disponibilité. */
function productFacts(events: readonly unknown[], productId: string): CartProductFacts | null {
  const found = events.map(asRecord).find((record) => {
    if (!record || !PRODUCT_EVENTS.includes(record.eTypeEvenement)) return false
    return record.sIdUnique === `Produit${productId}` || String(record.iIdProduit) === productId
  })
  if (!found) return null
  const stock = asNumber(found.iQteDisponible)
  const availability = asNumber(found.eDisponibilite)
  return stock === null && availability === null ? null : { stock, availability }
}

/** Ce que la lecture du panier de la version mobile (`panier.aspx?op=12`, DRV-754) donne : le panier courant, sans produit particulier. */
export interface CartListing {
  items: number | null
  totalCents: number | null
  /** La quantité de chaque produit du panier (`lstProduitsLight`), par identifiant. */
  quantities: ReadonlyMap<string, number>
}

/**
 * Lit la réponse de la lecture du panier : un tableau d'évènements dont un (`eTypeEvenement` 6) porte le panier (`objElement.sType` « Panier », `lstProduitsLight`,
 * `iQuantitePanier`, `sTotalAPayer`). Même vérification que l'écriture, sans produit.
 *
 * @throws {RetailerError} `CONTRACT_CHANGED` avec la cause : `CART_NOT_JSON`, `CART_NO_EVENTS`, `CART_NO_CART_EVENT`, `CART_NO_PRODUCT_LIST`.
 */
export function readCartListing(text: string): CartListing {
  const parsed = parseJson(text.trim())
  if (parsed === undefined) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NOT_JSON')
  const events = eventsOf(parsed)
  if (events === null) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_EVENTS')
  const event = findCartEvent(events)
  if (!event) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_CART_EVENT')
  const list = findKey(event, 'lstProduitsLight')
  if (!Array.isArray(list))
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_PRODUCT_LIST')
  return {
    items: asNumber(findKey(event, 'iQuantitePanier')),
    totalCents: parseTotal(findKey(event, 'sTotalAPayer')),
    quantities: quantitiesOf(list),
  }
}

/**
 * Lit la réponse d'une écriture au panier : la quantité obtenue du produit et le nombre d'articles.
 *
 * @throws {RetailerError} `CONTRACT_CHANGED`, avec la cause de l'échec (`CART_NOT_JSON`, `CART_NO_EVENTS`, `CART_NO_CART_EVENT`, `CART_NO_PRODUCT_LIST`,
 *   `CART_QUANTITY_UNREADABLE`) : la réponse n'est pas du JSON, n'a pas d'évènement panier, pas de `lstProduitsLight` ou une quantité illisible.
 */
export function readCartResponse(text: string, productId: string): CartReading {
  const parsed = parseJson(text.trim())
  if (parsed === undefined) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NOT_JSON')
  const events = eventsOf(parsed)
  if (events === null) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_EVENTS')
  const event = findCartEvent(events)
  if (!event) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_CART_EVENT')
  const list = findKey(event, 'lstProduitsLight')
  if (!Array.isArray(list))
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_PRODUCT_LIST')
  const entry = list
    .map(asRecord)
    .find((item) => item !== null && String(item.iIdProduit) === productId)
  const obtained = entry ? asNumber(entry.iQtePanier) : 0
  if (obtained === null) {
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_QUANTITY_UNREADABLE')
  }
  return {
    obtained,
    items: asNumber(findKey(event, 'iQuantitePanier')),
    totalCents: parseTotal(findKey(event, 'sTotalAPayer')),
    quantities: quantitiesOf(list),
    product: productFacts(events, productId),
  }
}

/** Ce que la réponse d'une écriture de la VERSION MOBILE (`panier.aspx?op=1&ng-ajax=1`, DRV-754, mesurée le 2026-11-01) dit du panier. */
export interface MobileCartReading extends CartReading {
  /**
   * Le site a REFUSÉ le produit : une quantité était demandée (`requested` > 0) et l'évènement du produit dit `iQuantitePanier` 0 avec un évènement `106` (mesuré pour un
   * identifiant inconnu : `102` puis `106`, le panier inchangé). « Leclerc n'a pas pris ce produit » : jamais un succès, jamais « le site a changé ».
   */
  refused: boolean
}

/**
 * Lit la réponse d'une écriture de la version mobile : un tableau de 4 évènements (MESURÉ le 2026-11-01), dans l'ordre : le PRODUIT (`eTypeEvenement` 101 première fois,
 * 103 changement de quantité, 102 retrait, 106 refus ; `objElement.sType` « Produit », `iQuantitePanier` = la quantité de CE produit au panier, `iQteDisponible`), le RAYON
 * (503), le PANIER (`eTypeEvenement` 1, `objElement.sType` « Panier » : `iQuantitePanier` total d'articles, `sTotalAPayer`, `lstProduitsLight[]`) et `PaniersComplets` (4).
 * Le succès est l'évènement du produit qui porte la quantité demandée ; le panier donne le total.
 *
 * @throws {RetailerError} `CONTRACT_CHANGED` avec la cause : `CART_NOT_JSON`, `CART_NO_EVENTS`, `CART_NO_PRODUCT_EVENT` (aucun évènement du produit écrit),
 *   `CART_QUANTITY_UNREADABLE` (sa quantité n'est pas un nombre), `CART_NO_CART_EVENT`, `CART_NO_PRODUCT_LIST`.
 */
export function readMobileCartWrite(
  text: string,
  productId: string,
  requested: number,
): MobileCartReading {
  const parsed = parseJson(text.trim())
  if (parsed === undefined) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NOT_JSON')
  const events = eventsOf(parsed)
  if (events === null) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_EVENTS')
  const records = events.map(asRecord)
  const forProduct = records.filter((record) => {
    const element = asRecord(record?.objElement)
    return (
      record?.sIdUnique === `Produit${productId}` ||
      (element?.sType === 'Produit' && String(element.iIdProduit) === productId)
    )
  })
  const last = forProduct.at(-1)
  if (!last) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_PRODUCT_EVENT')
  const element = asRecord(last.objElement)
  const obtained = asNumber(element?.iQuantitePanier)
  if (obtained === null)
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_QUANTITY_UNREADABLE')
  const cart = records.find(
    (record) =>
      record?.eTypeEvenement === 1 &&
      (asRecord(record.objElement)?.sType === 'Panier' || startsWithPanier(record.sIdUnique)),
  )
  if (!cart) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_CART_EVENT')
  const list = findKey(cart, 'lstProduitsLight')
  if (!Array.isArray(list))
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_PRODUCT_LIST')
  const stock = asNumber(element?.iQteDisponible)
  const availability = asNumber(element?.eDisponibilite)
  return {
    obtained,
    items: asNumber(findKey(cart, 'iQuantitePanier')),
    totalCents: parseTotal(findKey(cart, 'sTotalAPayer')),
    quantities: quantitiesOf(list),
    product: stock === null && availability === null ? null : { stock, availability },
    refused:
      requested > 0 && obtained === 0 && forProduct.some((one) => one?.eTypeEvenement === 106),
  }
}

// Le panier d'Auchan (DRV-725) : la lecture de `GET /cart`, le corps de `POST /cart/update` et la lecture de sa réponse. Formes MESURÉES le 2026-10-30
// (DRV-714, hypothèses C-1 à C-6) ; tout ce qui n'est pas mesuré est dit tel quel :
//  - MESURÉ : l'adresse, le JSON du corps, `X-Requested-With`, aucun jeton d'en-tête ; la quantité est un TOTAL ABSOLU (`desiredQuantity`) ; la réponse est le
//    panier complet (`cart.id`, `cart.version`, `cart.items[]`, `cart.prices.totalPrice.amount` en CENTIMES) ; par ligne `cartItem`, `product` (`id`, `eans`),
//    `offer` (`id`), `offering` (`actualQuantity`, `maxQuantity`).
//  - NON MESURÉ (S/I) : dans quel objet de la ligne se trouvent exactement `desiredQuantity` et `actualQuantity` (les rapports nomment les champs, pas leur
//    parent : on les cherche dans `cartItem` puis dans `offering`) ; la valeur de `desiredType` ; le contenu de `eans` ; le message d'un dépassement de
//    `maxQuantity` ; le sens des codes d'erreur (`401`, `99001` à `99007`).
// Aucune valeur lue ici n'est gardée au-delà de l'appel, ni écrite dans un rapport.
import { parseJson as parseJsonStrict } from '../primitives'
import { STORES } from '../../protocol'
import { RetailerError } from '../retailers/errors'

/** En-têtes d'une lecture (C-4). */
export const READ_HEADERS: Readonly<Record<string, string>> = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
}

/** En-têtes d'une écriture (C-1) : JSON, `X-Requested-With`, **aucun jeton d'en-tête**. */
export const WRITE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
}

/** Au-delà, une liste de lignes n'est pas un panier : on ne lit que les premières (borne contre une réponse hostile). */
const MAX_LINES = 500

/** L'identifiant d'un panier ou d'une ligne : des caractères sûrs, 100 au plus (un UUID en pratique). */
const SAFE_ID = /^[A-Za-z0-9._~-]{1,100}$/

/** Un code-barres : 8 à 14 chiffres (la forme que le protocole accepte). */
const EAN = /^[0-9]{8,14}$/

/** Ce que le panier dit d'une ligne (un produit). */
export interface CartLine {
  productId: string
  /** L'identifiant de la ligne (`cartItem.id`), `null` s'il est illisible. */
  lineId: string | null
  /** L'identifiant de l'offre de la ligne (`offer.id`), `null` s'il est illisible. */
  offerId: string | null
  /** La quantité demandée (`desiredQuantity`), `null` si illisible. */
  desired: number | null
  /** La quantité réellement au panier (`actualQuantity`), `null` si illisible. */
  actual: number | null
  /** Le plafond de quantité du produit (`offering.maxQuantity`, C-5), `null` s'il n'est pas lisible. */
  max: number | null
  /** `product.eans[0]` quand c'est un code-barres plausible (B-3 : forme mesurée, contenu inconnu), sinon `null`. */
  ean: string | null
  /** Les valeurs que le site met sur la ligne et que l'écriture reprend, quand elles se lisent (S). */
  sellerType: string | null
  desiredType: string | null
  sellerId: string | null
}

export interface CartReading {
  cartId: string
  /** Les lignes par identifiant de produit. Une `Map` : l'identifiant vient de la réponse. */
  lines: ReadonlyMap<string, CartLine>
  /** Le total du panier EN CENTIMES (`cart.prices.totalPrice.amount`, C-2), `null` s'il n'est pas lisible. */
  totalCents: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Un entier de 0 à 1 000 000 (une quantité), sinon `null`. */
function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : null
}

/** Un mot de la ligne (`GROCERY`) ou une chaîne vide : ce que l'écriture peut reprendre sans risque. */
function asWord(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z_]{1,32}$/.test(value) ? value : null
}

function parseJson(text: string): unknown {
  try {
    return parseJsonStrict(text.trim())
  } catch {
    return undefined
  }
}

function readLine(raw: unknown): CartLine | null {
  const line = asRecord(raw)
  const product = asRecord(line?.product)
  const productId = asText(product?.id)
  if (line === null || productId === null || !STORES.auchan.productId.test(productId)) return null
  const item = asRecord(line.cartItem)
  const offer = asRecord(line.offer)
  const offering = asRecord(line.offering)
  const eans = Array.isArray(product?.eans) ? (product.eans as unknown[]) : []
  const first = eans[0]
  const sellerId = item?.sellerId
  return {
    productId,
    lineId: asText(item?.id),
    offerId: asText(offer?.id),
    // Le parent exact des deux quantités n'est pas relevé (S) : la ligne demandée, puis l'offre servie.
    desired: asCount(item?.desiredQuantity) ?? asCount(offering?.desiredQuantity),
    actual: asCount(offering?.actualQuantity) ?? asCount(item?.actualQuantity),
    max: asCount(offering?.maxQuantity),
    ean: typeof first === 'string' && EAN.test(first) ? first : null,
    sellerType: asWord(item?.sellerType),
    desiredType: asWord(item?.desiredType),
    sellerId: typeof sellerId === 'string' && /^[0-9a-f-]{36}$/.test(sellerId) ? sellerId : null,
  }
}

/**
 * Lit la réponse du panier (lecture ou écriture : la même forme, C-2).
 *
 * @throws {RetailerError} `CONTRACT_CHANGED` avec la cause : `CART_NOT_JSON`, `CART_NO_CART`, `CART_ID_UNREADABLE`, `CART_ITEMS_UNREADABLE`. Une réponse
 *   d'erreur du site (codes `401`, `99001`…, INCONNUS) n'a pas de panier : elle tombe dans `CART_NO_CART`, jamais dans un succès.
 */
export function readCart(text: string): CartReading {
  const parsed = parseJson(text)
  if (parsed === undefined) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NOT_JSON')
  const cart = asRecord(asRecord(parsed)?.cart)
  if (cart === null) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_NO_CART')
  const cartId = asText(cart.id)
  if (cartId === null) throw new RetailerError('CONTRACT_CHANGED', null, 'CART_ID_UNREADABLE')
  if (!Array.isArray(cart.items)) {
    throw new RetailerError('CONTRACT_CHANGED', null, 'CART_ITEMS_UNREADABLE')
  }
  const lines = new Map<string, CartLine>()
  for (const raw of (cart.items as unknown[]).slice(0, MAX_LINES)) {
    const line = readLine(raw)
    if (line !== null && !lines.has(line.productId)) lines.set(line.productId, line)
  }
  const total = asRecord(asRecord(cart.prices)?.totalPrice)?.amount
  return { cartId, lines, totalCents: asCount(total) }
}

/** La valeur d'un cookie lisible de `raw` (`document.cookie`, lu une fois en mémoire), `null` s'il n'y est pas. Le NOM est exact. */
export function cookieValue(raw: string, name: string): string | null {
  for (const part of raw.split(';')) {
    const at = part.indexOf('=')
    if (at < 0 || part.slice(0, at).trim() !== name) continue
    const value = part.slice(at + 1).trim()
    let decoded: string
    try {
      decoded = decodeURIComponent(value)
    } catch {
      return null
    }
    return SAFE_ID.test(decoded) ? decoded : null
  }
  return null
}

/** Ce que l'écriture d'une ligne dit. */
export interface UpdateItem {
  productId: string
  offerId: string
  sellerType: string
  desiredQuantity: number
  desiredType: string
  sellerId: string
  /** L'identifiant de la ligne, TOUJOURS posé quand la ligne existe (un essai sans `id` a laissé la quantité inchangée, C-6). */
  id: string | null
}

/**
 * Le corps de `POST /cart/update` (C-1), dans l'ordre du site. `id` n'y figure que s'il existe (première pose). JAMAIS `desiredQuantity: 0` : le panier
 * n'est jamais réduit (quantité plancher), et la quantité est un total absolu.
 */
export function updateBody(cartId: string, consentId: string, item: UpdateItem): object {
  if (!Number.isInteger(item.desiredQuantity) || item.desiredQuantity < 1) {
    throw new RangeError('Quantité invalide.')
  }
  return {
    cartId,
    items: [
      {
        productId: item.productId,
        offerId: item.offerId,
        sellerType: item.sellerType,
        desiredQuantity: item.desiredQuantity,
        desiredType: item.desiredType,
        sellerId: item.sellerId,
        ...(item.id !== null && { id: item.id }),
      },
    ],
    consentId,
    reservationId: null,
    mbaAvailabilityNeeded: false,
  }
}

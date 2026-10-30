// L'écriture au panier chez Auchan (DRV-725) : quantité ABSOLUE, lire d'abord, relire après, une écriture à la fois (le `Pacer` fait la file).
//
// Pour un produit voulu en `quantity` exemplaires :
//  1. lire le panier (`GET /cart`) : l'identifiant du panier (`cart.id`, jamais supposé : connecté, le cookie `lark-cart` n'existe plus, C-3), l'identifiant de
//     la ligne si elle existe, la quantité déjà là, le plafond ;
//  2. ne JAMAIS réduire : si la ligne a déjà `quantity` ou plus, rien n'est écrit ; sinon la quantité envoyée est `quantity` (total absolu, toujours ≥ ce qui
//     est déjà là), jamais `0` ;
//  3. écrire (`POST /cart/update`) avec l'`id` de la ligne quand elle existe (un essai sans `id` a laissé la quantité inchangée, C-6) ;
//  4. RELIRE la ligne dans la réponse : `desiredQuantity` et `actualQuantity` doivent être celles demandées, sinon c'est un ÉCHEC (`CART_QUANTITY_MISMATCH`),
//     jamais un succès ; seul un plafond du site (`maxQuantity`) explique une quantité plus basse, et la ligne est alors rendue non satisfaite (`ok: false`).
//
// Une écriture refusée par un défi de l'anti-robot (`BLOCKED`, cause `CHALLENGE`) n'est JAMAIS rejouée ici : le passage attend la personne, puis refait la
// ligne en LISANT d'abord le panier, ce qui rend l'écriture sans danger (quantité absolue, plancher).
//
// Cookies : seules deux valeurs sont lues, par leur nom exact, pour bâtir l'adresse et le corps d'une requête vers l'hôte de la page : `lark-consentId`
// (toujours) et `lark-cart` (visiteur seulement). Elles ne sont gardées nulle part, ni rapportées, ni journalisées (exception bornée de
// `consignes-agents.md`, `test/auchan-cart.spec.ts`).
import { stringifyJson } from '../primitives'
import { httpCause } from '../retailers/causes'
import type { CartResult } from '../retailers/contract'
import { RetailerError } from '../retailers/errors'
import type { Reply } from '../retailers/pacer'
import {
  cookieValue,
  READ_HEADERS,
  readCart,
  updateBody,
  WRITE_HEADERS,
  type CartLine,
  type CartReading,
} from './cart'
import { isRecaptchaPage } from './challenge'
import { DEFAULT_OFFER_TYPE, DEFAULT_SELLER_TYPE, OfferBook, type AuchanOffer } from './offers'
import { STORES } from '../../protocol'

/** La quantité maximale par produit que l'agent écrit (la borne du protocole, `LIMITS.packsMax`). */
export const MAX_QUANTITY = 99

/** Une redirection vers une page de connexion (le serveur d'identité du site, ou une adresse de connexion). */
const LOGIN_PATH = /connexion|identif|login|authent|\/auth\//i

export interface CartDeps {
  /** Une requête vers l'hôte de la page, à son tour et à la cadence d'Auchan (le `Pacer` de l'adaptateur). */
  request(url: string, init: RequestInit): Promise<Reply>
  /** `document.cookie`, lu une fois en mémoire pour les deux noms ci-dessus. Absente : le panier ne s'écrit pas (`CART_CONSENT_UNREADABLE`). */
  cookies?: () => string
  /** La connexion de la personne (`readSession` de l'adaptateur) : `true` connecté, `false` visiteur, `null` inconnue. */
  member(): boolean | null
}

function safePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return ''
  }
}

export class AuchanCart {
  private readonly deps: CartDeps
  private readonly offers = new OfferBook()
  /** Les quantités du dernier panier lu, par produit ; `null` avant toute lecture. */
  private quantities: ReadonlyMap<string, number> | null = null
  private total: number | null = null

  constructor(deps: CartDeps) {
    this.deps = deps
  }

  /** Retient l'offre d'un produit lu par la recherche (DRV-724) : `setCartQuantity` n'a que l'identifiant du produit. */
  rememberOffer(productId: string, offer: AuchanOffer): boolean {
    return this.offers.remember(productId, offer)
  }

  /** La quantité du produit dans la dernière lecture du panier, `null` sans lecture (aucune requête). */
  quantityOf(productId: string): number | null {
    return this.quantities === null ? null : (this.quantities.get(productId) ?? 0)
  }

  /** Le total du panier en centimes d'après la dernière lecture, `null` sans lecture (aucune requête). */
  totalCents(): number | null {
    return this.total
  }

  /**
   * Met `quantity` exemplaires du produit au panier, sans jamais en réduire la quantité.
   *
   * @throws {RangeError} produit ou quantité invalides (zéro compris : le panier n'est jamais réduit).
   * @throws {RetailerError} le site n'a pas répondu comme prévu : `CONTRACT_CHANGED` (cause), `NOT_LOGGED_IN`, `NETWORK`, `BLOCKED`.
   */
  async setQuantity(productId: string, quantity: number): Promise<CartResult> {
    if (!STORES.auchan.productId.test(productId) || !Number.isInteger(quantity) || quantity < 1) {
      throw new RangeError('Produit ou quantité invalide.')
    }
    const wanted = Math.min(quantity, MAX_QUANTITY)
    const read = await this.read()
    const line = read.reading.lines.get(productId) ?? null
    if (line !== null && line.actual === null) {
      throw new RetailerError('CONTRACT_CHANGED', read.status, 'CART_LINE_UNREADABLE')
    }
    const present = line?.actual ?? 0
    // Le panier n'est jamais réduit : une ligne qui a déjà la quantité voulue (ou plus) n'est pas touchée.
    if (line !== null && present >= wanted) {
      return this.result(productId, quantity, present, present, read, line)
    }
    // Au-delà du plafond connu de la ligne, le site ne peut pas donner la quantité voulue (message de dépassement NON MESURÉ, C-5) : rien n'est écrit.
    if (line?.max != null && wanted > line.max) {
      return this.result(productId, quantity, present, present, read, line, line.max)
    }
    const item = this.itemFor(productId, wanted, line, read.status)
    const consent = this.consentId(read.status)
    const reply = await this.deps.request('/cart/update', {
      method: 'POST',
      headers: { ...WRITE_HEADERS },
      body: stringifyJson(updateBody(read.reading.cartId, consent, item)),
    })
    const written = this.reading(reply)
    this.remember(written)
    const out = written.lines.get(productId) ?? null
    if (out === null) {
      // Le site a répondu avec un panier sans ce produit : il ne l'a pas pris.
      return this.result(
        productId,
        quantity,
        wanted,
        0,
        { reading: written, status: reply.status },
        null,
      )
    }
    if (out.desired === null || out.actual === null) {
      throw new RetailerError('CONTRACT_CHANGED', reply.status, 'CART_LINE_UNREADABLE')
    }
    if (out.desired === wanted && out.actual === wanted) {
      return this.result(
        productId,
        quantity,
        wanted,
        out.actual,
        { reading: written, status: reply.status },
        out,
      )
    }
    // Un plafond du site explique une quantité plus basse ; tout autre écart est un échec, jamais un succès.
    const capped = out.max !== null && out.actual === out.max && out.actual < wanted
    if (!capped) throw new RetailerError('CONTRACT_CHANGED', reply.status, 'CART_QUANTITY_MISMATCH')
    return this.result(
      productId,
      quantity,
      wanted,
      out.actual,
      { reading: written, status: reply.status },
      out,
      out.max,
    )
  }

  // —— Les lectures et les requêtes ——————————————————————————————————————————————————————————————————————————————————————————

  private consentId(status: number | null): string {
    let raw = ''
    try {
      raw = this.deps.cookies?.() ?? ''
    } catch {
      // La page ne se laisse pas lire.
    }
    const consent = cookieValue(raw, 'lark-consentId')
    if (consent === null)
      throw new RetailerError('CONTRACT_CHANGED', status, 'CART_CONSENT_UNREADABLE')
    return consent
  }

  /**
   * `GET /cart` : avec `cartId` (le cookie `lark-cart`) seulement pour un visiteur ; connecté, jamais (C-3) : le panier du compte se lit par `consentId`
   * seul et rend `cart.id`. Un cookie `lark-cart` resté dans la page d'une personne connectée n'est pas utilisé.
   */
  private async read(): Promise<{ reading: CartReading; status: number }> {
    const consent = this.consentId(null)
    let url = `/cart?consentId=${encodeURIComponent(consent)}`
    if (this.deps.member() !== true) {
      let raw = ''
      try {
        raw = this.deps.cookies?.() ?? ''
      } catch {
        // La page ne se laisse pas lire : pas de cartId, le site dira si cela suffit.
      }
      const cartCookie = cookieValue(raw, 'lark-cart')
      if (cartCookie !== null) url += `&cartId=${encodeURIComponent(cartCookie)}`
    }
    const reply = await this.deps.request(url, { method: 'GET', headers: { ...READ_HEADERS } })
    const reading = this.reading(reply)
    this.remember(reading)
    return { reading, status: reply.status }
  }

  /** Écarte ce qui n'est pas une réponse du site à notre requête, puis lit le panier. Un statut ou un corps inattendu n'est jamais un succès. */
  private reading(reply: Reply): CartReading {
    // 401 : le sens de ce code est INCONNU (C-7) ; on le traite comme le parcours (DRV-717) : la personne n'est pas (ou plus) connectée.
    if (reply.status === 401) throw new RetailerError('NOT_LOGGED_IN', reply.status, 'HTTP_401')
    if (reply.redirected && LOGIN_PATH.test(safePath(reply.url))) {
      throw new RetailerError('NOT_LOGGED_IN', reply.status, 'LOGIN_REDIRECT')
    }
    if (reply.status >= 500)
      throw new RetailerError('NETWORK', reply.status, httpCause(reply.status))
    if (reply.status < 200 || reply.status >= 300) {
      throw new RetailerError('CONTRACT_CHANGED', reply.status, httpCause(reply.status))
    }
    // Une page de reCAPTCHA à la place du JSON de l'API du panier (SUPPOSÉ, non mesuré) : un défi, que la personne passe dans la page.
    if (isRecaptchaPage(reply.text)) throw new RetailerError('BLOCKED', reply.status, 'CHALLENGE')
    try {
      return readCart(reply.text)
    } catch (error) {
      throw error instanceof RetailerError ? error.withStatus(reply.status) : error
    }
  }

  private remember(reading: CartReading): void {
    const quantities = new Map<string, number>()
    for (const [id, line] of reading.lines)
      if (line.actual !== null) quantities.set(id, line.actual)
    this.quantities = quantities
    this.total = reading.totalCents
  }

  /** La ligne à écrire : l'offre lue par la recherche (ou, à défaut, celle de la ligne du panier), jamais devinée ; l'`id` de la ligne s'il existe. */
  private itemFor(productId: string, desired: number, line: CartLine | null, status: number) {
    const offer = this.offers.get(productId)
    const offerId = line?.offerId ?? offer?.offerId ?? null
    if (offerId === null) throw new RetailerError('CONTRACT_CHANGED', status, 'CART_OFFER_UNKNOWN')
    if (line !== null && line.lineId === null) {
      throw new RetailerError('CONTRACT_CHANGED', status, 'CART_LINE_ID_UNREADABLE')
    }
    return {
      productId,
      offerId,
      // Ce que la ligne dit d'elle-même d'abord, puis la page de résultats, puis la valeur vue le 2026-10-30 (S : jamais mesurées dans un corps d'écriture).
      sellerType: line?.sellerType ?? offer?.sellerType ?? DEFAULT_SELLER_TYPE,
      desiredQuantity: desired,
      desiredType: line?.desiredType ?? offer?.offerType ?? DEFAULT_OFFER_TYPE,
      sellerId: line?.sellerId ?? offer?.sellerId ?? '',
      id: line?.lineId ?? null,
    }
  }

  private result(
    productId: string,
    requested: number,
    sent: number,
    obtained: number,
    from: { reading: CartReading; status: number },
    line: CartLine | null,
    limit: number | null = null,
  ): CartResult {
    return {
      productId,
      requested,
      sent,
      obtained,
      ok: obtained === sent && limit === null,
      items: from.reading.lines.size,
      totalCents: from.reading.totalCents,
      // Le plafond du site, quand il a borné la quantité : la phase B le lit comme « le stock » (jamais un message du site).
      ...(limit !== null && { product: { stock: limit, availability: null } }),
      ...(line?.ean != null && { ean: line.ean }),
      status: from.status,
    }
  }
}

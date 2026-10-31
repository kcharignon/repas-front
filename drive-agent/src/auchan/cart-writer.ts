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
import type { CartProbeFacts, CartReplyFacts } from '../retailers/cart-facts'
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
import { describeCartReply, verdictOf } from './cart-reply'
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
  /**
   * Garde la FORME de la dernière réponse du panier qui a échoué (DRV-752, des nombres et des mots d'une liste fermée, jamais une valeur du site) pour que le
   * diagnostic la montre même si la page a été rechargée depuis. Absente : la forme ne vit qu'en mémoire.
   */
  keepFailure?: (facts: CartReplyFacts) => void
  /** Relit ce que `keepFailure` a gardé, `null` s'il n'y a rien (ou rien de lisible). */
  recallFailure?: () => CartReplyFacts | null
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
  /**
   * Les quantités du dernier panier lu (une lecture ou la réponse d'une écriture), par produit ; `null` pour une ligne dont la quantité est illisible ; `null`
   * (la table) avant toute lecture, et de nouveau après une erreur : la lecture suivante est alors refaite (DRV-732).
   */
  private quantities: ReadonlyMap<string, number | null> | null = null
  private total: number | null = null
  /** La forme de la dernière réponse du panier qui a échoué dans cette page (DRV-752) : la mémoire d'abord, ce que `keepFailure` a gardé ensuite. */
  private failure: CartReplyFacts | null = null
  /** La forme de la dernière réponse reçue du panier, bonne ou mauvaise (la sonde la rend quand l'erreur n'en porte pas). */
  private lastReply: CartReplyFacts | null = null
  /** Vrai pendant la sonde du diagnostic : ses échecs ne remplacent pas ceux d'un envoi. */
  private probing = false

  constructor(deps: CartDeps) {
    this.deps = deps
  }

  /**
   * La SONDE de lecture du diagnostic (DRV-752) : une seule requête `GET /cart`, à la cadence, jamais `/cart/update`. Elle rend la forme de la réponse et, si le
   * panier s'est lu, son nombre de lignes ; elle ne lève jamais d'erreur et ne retient RIEN du panier (ni quantités, ni total) : un diagnostic ne change pas
   * ce que le passage sait.
   */
  async probe(): Promise<CartProbeFacts> {
    this.lastReply = null
    // Un échec de la sonde n'écrase pas la forme du dernier échec d'un envoi : c'est elle que le diagnostic montre à côté.
    this.probing = true
    try {
      const { reading } = await this.fetchCart()
      return { outcome: 'READ', reply: this.lastReply, lines: reading.lines.size, fault: null }
    } catch (error) {
      const fault =
        error instanceof RetailerError
          ? { code: error.code, cause: error.cause, status: error.status }
          : { code: 'CONTRACT_CHANGED' as const, cause: 'EXCEPTION' as const, status: null }
      const reply =
        error instanceof RetailerError ? (error.reply ?? this.lastReply) : this.lastReply
      return { outcome: 'FAILED', reply, lines: null, fault }
    } finally {
      this.probing = false
    }
  }

  /** La forme de la dernière réponse du panier qui a échoué (DRV-752), de cette page ou de l'onglet ; `null` s'il n'y en a pas. */
  lastFailure(): CartReplyFacts | null {
    if (this.failure !== null) return this.failure
    try {
      return this.deps.recallFailure?.() ?? null
    } catch {
      return null
    }
  }

  /**
   * La quantité du produit au panier, LUE (DRV-732) : un seul `GET /cart` par passage, partagé entre les produits (la table est rafraîchie par la réponse de
   * chaque écriture, `remember`). `0` quand le panier est lu et ne cite pas le produit, `null` quand il le cite sans quantité lisible : jamais une quantité
   * inventée.
   *
   * @throws {RetailerError} l'échec de la lecture (`NOT_LOGGED_IN`, `BLOCKED`, `NETWORK`, `CONTRACT_CHANGED`…), comme celui d'une écriture.
   */
  async readQuantity(productId: string): Promise<number | null> {
    if (this.quantities === null) await this.read()
    return this.quantityOf(productId)
  }

  /** Retient l'offre d'un produit lu par la recherche (DRV-724) : `setCartQuantity` n'a que l'identifiant du produit. */
  rememberOffer(productId: string, offer: AuchanOffer): boolean {
    return this.offers.remember(productId, offer)
  }

  /** La quantité du produit dans la dernière lecture du panier, `null` sans lecture (aucune requête). */
  quantityOf(productId: string): number | null {
    if (this.quantities === null) return null
    // Une ligne citée sans quantité lisible est « rien », pas zéro ; un produit que le panier ne cite pas en a zéro.
    return this.quantities.has(productId) ? (this.quantities.get(productId) ?? null) : 0
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
    try {
      return await this.write(productId, quantity)
    } catch (error) {
      // Une écriture ratée laisse le panier dans un état qu'on ne connaît plus : la prochaine lecture de quantité redemande le panier au site.
      if (error instanceof RetailerError) this.quantities = null
      throw error
    }
  }

  private async write(productId: string, quantity: number): Promise<CartResult> {
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
    const fetched = await this.fetchCart()
    this.remember(fetched.reading)
    return fetched
  }

  /** La requête de lecture et rien d'autre : le panier lu, sans rien retenir (la sonde du diagnostic s'en sert seule). */
  private async fetchCart(): Promise<{ reading: CartReading; status: number }> {
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
    return { reading, status: reply.status }
  }

  /**
   * Relève la FORME de la réponse (DRV-752), puis la lit : toute erreur qui en sort la porte (`RetailerError.reply`), et la forme d'un échec est gardée pour le
   * diagnostic.
   */
  private reading(reply: Reply): CartReading {
    const facts = describeCartReply(reply)
    this.lastReply = facts
    try {
      return this.readReply(reply, facts)
    } catch (error) {
      if (!(error instanceof RetailerError)) throw error
      if (!this.probing) {
        this.failure = facts
        try {
          this.deps.keepFailure?.(facts)
        } catch {
          // Rien ne se garde : la forme reste en mémoire.
        }
      }
      throw error.withReply(facts)
    }
  }

  /** Écarte ce qui n'est pas une réponse du site à notre requête, puis lit le panier. Un statut ou un corps inattendu n'est jamais un succès. */
  private readReply(reply: Reply, facts: CartReplyFacts): CartReading {
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
    // Une réponse qui n'est pas du JSON se classe d'après sa forme (`cart-reply.ts`) : un défi de l'anti-robot (la personne le passe dans la page), une page de
    // connexion (la personne n'est pas connectée), un corps vide, un JSON vide, une page d'erreur ; sinon `readCart` dit `CART_NOT_JSON`.
    const verdict = verdictOf(facts)
    if (verdict !== null) throw verdict
    try {
      return readCart(reply.text)
    } catch (error) {
      throw error instanceof RetailerError ? error.withStatus(reply.status) : error
    }
  }

  private remember(reading: CartReading): void {
    const quantities = new Map<string, number | null>()
    for (const [id, line] of reading.lines) quantities.set(id, line.actual)
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

// Le panier du faux site d'Auchan (DRV-725) : `GET /cart/config`, `GET /cart` et `POST /cart/update`, avec la FORME mesurée le 2026-10-30 (rapport DRV-714,
// hypothèses C-1 à C-6) et des données entièrement inventées. Son état (les lignes, la version) et ses pannes vivent ici, dans un fichier à part ; le serveur
// (`server.ts`) ne fait que lui passer les requêtes.
//
//   - MESURÉ : JSON, `X-Requested-With`, aucun jeton d'en-tête ; `cartId` accordé au cookie `lark-cart` (visiteur) ou rendu par la lecture (client connecté,
//     qui n'envoie pas de `cartId` à la lecture) ; quantité ABSOLUE ; la réponse est le panier complet ; total en centimes ; plafond `offering.maxQuantity`.
//   - INVENTÉ (non mesuré) : dans quel objet de la ligne `desiredQuantity` et `actualQuantity` se trouvent, le message d'un dépassement du plafond (ici : le site
//     borne sans erreur), le sens des codes d'erreur, la page d'un défi.
//   - Une écriture SANS `id` sur une ligne existante n'est appliquée que si `write` n'est pas `ignore-without-id` (le piège du 2026-10-30, C-6 : un essai
//     appliqué, un autre laissé sans effet en `200`).
import type { IncomingMessage, ServerResponse } from 'node:http'

import { findProduct, PRODUCTS } from './catalog.ts'
import { challengePage, CONSENT_ID, MEMBER_CART_ID, VISITOR_CART_ID } from './pages.ts'
import type { SessionKind } from './pages.ts'
import type { FakeRequest } from './server.ts'

/** Ce que l'écriture (`POST /cart/update`) fait. */
export type WriteForm =
  | 'ok'
  /** `200`, panier inchangé : l'écriture est ignorée sans erreur. */
  | 'ignored'
  /** Comme `ok`, mais une écriture sans `id` sur une ligne qui existe est ignorée (C-6). */
  | 'ignore-without-id'
  /** `200`, une autre quantité que celle demandée est appliquée (la demande + 1). */
  | 'wrong-quantity'
  | 'not-json'
  /** `200`, du JSON sans panier (une forme d'erreur inconnue). */
  | 'no-cart'
  /** La page de vérification de DataDome (SUPPOSÉE : un cadre vers `captcha-delivery.com`), en `200`. */
  | 'challenge'
  /** Une page de vérification reCAPTCHA (SUPPOSÉE, non mesurée), en `403`. */
  | 'recaptcha'
  | 'unauthorized'
  | 'forbidden'
  | 'server-error'
  | 'login-redirect'

/** Ce que la lecture (`GET /cart`) fait. */
export type ReadForm =
  | 'ok'
  | 'not-json'
  | 'no-cart'
  | 'challenge'
  | 'recaptcha'
  | 'unauthorized'
  | 'forbidden'
  | 'server-error'
  | 'login-redirect'
  /** Un panier dont la ligne n'a pas d'`id` lisible. */
  | 'line-without-id'
  /** Un panier dont la ligne n'a pas de quantité lisible. */
  | 'line-without-quantity'

export interface CartBehavior {
  write: WriteForm
  read: ReadForm
}

export const DEFAULT_CART_BEHAVIOR: CartBehavior = { write: 'ok', read: 'ok' }

/** Une ligne du faux panier : la quantité demandée et celle que le site tient. */
interface FakeLine {
  id: string
  desired: number
  actual: number
}

/** Ce que le serveur prête au panier : sa cadence, ses réponses et la connexion que les pages annoncent. */
export interface CartHost {
  paced(entry: FakeRequest, serve: () => Promise<void>): Promise<void>
  send(
    res: ServerResponse,
    status: number,
    body: string,
    headers?: Record<string, string | string[]>,
  ): Promise<void>
  readBody(req: IncomingMessage): Promise<string>
  session(): SessionKind
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-DataDome': 'protected',
}
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'X-DataDome': 'protected' }

/** Une page de vérification reCAPTCHA INVENTÉE : ni une page du site réel, ni une forme mesurée. */
export function recaptchaPage(): string {
  return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>Vérification (faux site de test)</title></head><body><div class="g-recaptcha" data-sitekey="test"></div><script src="https://www.google.com/recaptcha/enterprise.js"></script></body></html>'
}

/** La configuration que le site lit avant d'utiliser son panier (DRV-714) : les adresses, la reprise, le délai et les CLÉS des codes d'erreur (sans leur sens). */
export function cartConfig(): Record<string, unknown> {
  return {
    updateCartEndpoint: '/cart/update',
    getCartEndpoint: '/cart',
    cartRetry: 2,
    timeout: 15_000,
    errors: Object.fromEntries(
      [
        '401',
        '99001',
        '99002',
        '99003',
        '99004',
        '99005',
        '99006',
        '99007',
        'default',
        'mba-notification',
        'use-by-date-notification',
      ].map((code) => [code, '']),
    ),
  }
}

export interface FakeCart {
  /** `true` pour une requête du panier : le serveur la lui passe. */
  handles(method: string, path: string): boolean
  handle(entry: FakeRequest, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>
  behavior(): CartBehavior
  setBehavior(patch: Partial<CartBehavior>): void
  /** Les quantités tenues par le site, par identifiant de produit. */
  contents(): Record<string, number>
  /** Pose une ligne dans le panier (un panier qui n'est pas vide au départ). */
  seed(productId: string, quantity: number): void
  /** Le panier tel qu'il est lu (pour le pilotage). */
  state(): { cart: Record<string, number>; behavior: CartBehavior }
  reset(): void
}

export function createFakeCart(host: CartHost): FakeCart {
  let behavior: CartBehavior = { ...DEFAULT_CART_BEHAVIOR }
  const lines = new Map<string, FakeLine>()
  let version = 1
  let counter = 0

  const sessionCartId = (): string =>
    host.session() === 'member' ? MEMBER_CART_ID : VISITOR_CART_ID

  const newLine = (): string => `l0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

  function reject(entry: FakeRequest, res: ServerResponse, why: string): Promise<void> {
    entry.rejected = why
    entry.status = 400
    return host.send(res, 400, JSON.stringify({ error: 'requête inattendue' }), JSON_HEADERS)
  }

  /** Le panier tel que le site le rend : les lignes, `cart.version`, le total EN CENTIMES (`cart.prices.totalPrice.amount`). */
  function cartDocument(read: ReadForm = 'ok'): Record<string, unknown> {
    const items = [...lines.entries()].flatMap(([productId, line]) => {
      const product = PRODUCTS.find((candidate) => candidate.productId === productId)
      if (product === undefined) return []
      return [
        {
          cartItem: {
            ...(read !== 'line-without-id' && { id: line.id }),
            ...(read !== 'line-without-quantity' && {
              desiredQuantity: line.desired,
              actualQuantity: line.actual,
            }),
          },
          product: { id: product.productId, name: product.label, eans: [product.ean] },
          offer: {
            id: product.offerId,
            price: { amount: product.priceCents, currency: 'EUR' },
            availability: 'AVAILABLE',
            state: 'IMMEDIATE',
          },
          offering: {
            ...(read !== 'line-without-quantity' && { actualQuantity: line.actual }),
            maxQuantity: product.maxQuantity,
          },
          deltaQuantity: 0,
        },
      ]
    })
    const total = [...lines.entries()].reduce((sum, [productId, line]) => {
      const product = PRODUCTS.find((candidate) => candidate.productId === productId)
      return sum + (product?.priceCents ?? 0) * line.actual
    }, 0)
    return {
      revisedItems: [],
      cart: {
        id: sessionCartId(),
        version,
        items,
        prices: { totalPrice: { amount: total, currency: 'EUR' } },
        changes: [],
        contentWarnings: [],
      },
      itemsSortedByMostRecent: [],
    }
  }

  /** Les réponses qui ne sont pas un panier, communes à la lecture et à l'écriture. Rend `true` quand elle a répondu. */
  async function broken(
    form: ReadForm | WriteForm,
    entry: FakeRequest,
    res: ServerResponse,
  ): Promise<boolean> {
    switch (form) {
      case 'not-json':
        entry.status = 200
        await host.send(res, 200, '<html><body>Pas du JSON</body></html>', HTML)
        return true
      case 'no-cart':
        entry.status = 200
        await host.send(res, 200, JSON.stringify({ errors: [{ code: '99001' }] }), JSON_HEADERS)
        return true
      case 'challenge':
        entry.status = 200
        await host.send(res, 200, challengePage(), HTML)
        return true
      case 'recaptcha':
        entry.status = 403
        await host.send(res, 403, recaptchaPage(), HTML)
        return true
      case 'unauthorized':
        entry.status = 401
        await host.send(res, 401, JSON.stringify({ code: '401' }), JSON_HEADERS)
        return true
      case 'forbidden':
        entry.status = 403
        await host.send(res, 403, 'Accès refusé', { 'Content-Type': 'text/plain' })
        return true
      case 'server-error':
        entry.status = 503
        await host.send(res, 503, 'Service indisponible', { 'Content-Type': 'text/plain' })
        return true
      case 'login-redirect':
        entry.status = 302
        await host.send(res, 302, '', {
          Location: '/auth/realms/test/protocol/openid-connect/auth',
        })
        return true
      default:
        return false
    }
  }

  async function read(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    await host.paced(entry, async () => {
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        return reject(entry, res, 'X-Requested-With manquant')
      }
      if (url.searchParams.get('consentId') !== CONSENT_ID)
        return reject(entry, res, 'consentId inconnu')
      const cartId = url.searchParams.get('cartId')
      // Visiteur : le panier se lit avec `cartId` ; client connecté : sans (C-3).
      if (host.session() === 'member' && cartId !== null)
        return reject(entry, res, 'cartId pour un client connecté')
      if (host.session() !== 'member' && cartId !== VISITOR_CART_ID) {
        return reject(entry, res, 'cartId du visiteur inconnu')
      }
      if (await broken(behavior.read, entry, res)) return
      entry.status = 200
      return host.send(res, 200, JSON.stringify(cartDocument(behavior.read)), JSON_HEADERS)
    })
  }

  async function write(
    entry: FakeRequest,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    await host.paced(entry, async () => {
      const text = await host.readBody(req)
      entry.detail = text
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        return reject(entry, res, 'X-Requested-With manquant')
      }
      if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) {
        return reject(entry, res, 'Content-Type attendu : JSON')
      }
      let body: Record<string, unknown>
      try {
        body = JSON.parse(text) as Record<string, unknown>
      } catch {
        return reject(entry, res, 'corps illisible')
      }
      if (body.cartId !== sessionCartId()) return reject(entry, res, 'cartId inconnu')
      if (body.consentId !== CONSENT_ID) return reject(entry, res, 'consentId inconnu')
      const items = body.items
      if (!Array.isArray(items) || items.length !== 1)
        return reject(entry, res, 'items attendus : un seul produit')
      const item = items[0] as Record<string, unknown>
      const product = typeof item.productId === 'string' ? findProduct(item.productId) : undefined
      if (product === undefined || item.offerId !== product.offerId)
        return reject(entry, res, 'produit ou offre inconnus')
      if (
        typeof item.sellerType !== 'string' ||
        typeof item.desiredType !== 'string' ||
        typeof item.sellerId !== 'string'
      ) {
        return reject(entry, res, 'sellerType, desiredType ou sellerId manquant')
      }
      const quantity = item.desiredQuantity
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) {
        return reject(entry, res, 'desiredQuantity invalide')
      }
      const existing = lines.get(product.productId)
      if (item.id !== undefined && item.id !== existing?.id)
        return reject(entry, res, 'id de ligne inconnu')
      if (await broken(behavior.write, entry, res)) return
      const ignored =
        behavior.write === 'ignored' ||
        (behavior.write === 'ignore-without-id' && existing !== undefined && item.id === undefined)
      if (!ignored) {
        // Quantité ABSOLUE (C-2) : le total voulu ; 0 retire la ligne ; au plus `maxQuantity` (C-5, le site borne sans erreur ici : message non mesuré).
        const applied =
          behavior.write === 'wrong-quantity'
            ? quantity + 1
            : Math.min(quantity, product.maxQuantity)
        if (quantity === 0) lines.delete(product.productId)
        else {
          lines.set(product.productId, {
            id: existing?.id ?? newLine(),
            desired: quantity,
            actual: applied,
          })
        }
      }
      version += 1
      entry.status = 200
      return host.send(res, 200, JSON.stringify(cartDocument()), JSON_HEADERS)
    })
  }

  return {
    handles: (method, path) =>
      (method === 'GET' && (path === '/cart' || path === '/cart/config')) ||
      (method === 'POST' && path === '/cart/update'),
    async handle(entry, req, res, url) {
      entry.kind = 'cart'
      if (url.pathname === '/cart/config') {
        return host.paced(entry, () => {
          entry.status = 200
          return host.send(res, 200, JSON.stringify(cartConfig()), JSON_HEADERS)
        })
      }
      return url.pathname === '/cart' ? read(entry, req, res, url) : write(entry, req, res)
    },
    behavior: () => ({ ...behavior }),
    setBehavior(patch) {
      behavior = { ...behavior, ...patch }
    },
    contents: () => Object.fromEntries([...lines].map(([id, line]) => [id, line.actual])),
    seed(productId, quantity) {
      const product = findProduct(productId)
      if (product === undefined) throw new Error('produit de test inconnu')
      lines.set(productId, { id: newLine(), desired: quantity, actual: quantity })
    },
    state: () => ({
      cart: Object.fromEntries([...lines].map(([id, line]) => [id, line.actual])),
      behavior: { ...behavior },
    }),
    reset() {
      behavior = { ...DEFAULT_CART_BEHAVIOR }
      lines.clear()
      version = 1
      counter = 0
    },
  }
}

// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Le panier d'Auchan (DRV-725) : quantité ABSOLUE, lecture avant écriture, relecture après, plancher, plafond, défi, cadence. Un faux `fetch` qui tient un panier
// INVENTÉ (UUID de test) dans la forme mesurée le 2026-10-30 ; aucun contact avec un site d'enseigne. Ce qui n'a pas été mesuré (le parent des deux quantités,
// le message d'un dépassement, le sens des codes d'erreur, les marqueurs d'un défi) est éprouvé comme tel : une forme plausible, jamais un fait.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AuchanAdapter, PACING } from '../src/auchan'
import { cookieValue, readCart, updateBody } from '../src/auchan/cart'
import { isAuchanChallenge } from '../src/auchan/challenge'
import { RetailerError } from '../src/retailers'
import { auchanSite, type AuchanCall, type AuchanReply } from './auchan-helpers'

const PRODUCT = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const OFFER = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'
const OTHER_PRODUCT = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const OTHER_OFFER = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80'
const MEMBER_CART = 'c0000000-0000-4000-8000-0000000000b2'
const VISITOR_CART = 'c0000000-0000-4000-8000-0000000000a1'
const CONSENT = 'd0000000-0000-4000-8000-0000000000c3'
const LINE = 'l0000000-0000-4000-8000-000000000001'

interface Row {
  productId?: string
  offerId?: string
  lineId?: string | null
  desired?: number | null
  actual?: number | null
  max?: number | null
  eans?: unknown
  price?: number
}

/** Une ligne du panier, dans la forme mesurée (les quantités : `cartItem.desiredQuantity`, `offering.actualQuantity` : leur parent est SUPPOSÉ). */
function line(row: Row = {}): Record<string, unknown> {
  const { desired = 1, actual = desired, max = 397, price = 91 } = row
  return {
    cartItem: {
      ...(row.lineId !== null && { id: row.lineId ?? LINE }),
      ...(desired !== null && { desiredQuantity: desired }),
    },
    product: {
      id: row.productId ?? PRODUCT,
      name: 'Farine de test',
      eans: row.eans ?? ['0000000000017'],
    },
    offer: { id: row.offerId ?? OFFER, price: { amount: price, currency: 'EUR' } },
    offering: {
      ...(actual !== null && { actualQuantity: actual }),
      ...(max !== null && { maxQuantity: max }),
    },
    deltaQuantity: 0,
  }
}

function cartJson(
  rows: Record<string, unknown>[],
  { cartId = MEMBER_CART, total = 0 }: { cartId?: string; total?: number } = {},
): string {
  return JSON.stringify({
    revisedItems: [],
    cart: { id: cartId, version: 2, items: rows, prices: { totalPrice: { amount: total } } },
  })
}

/** La ligne que le corps d'une écriture porte (la première de `items`). */
function writtenItem(call: AuchanCall): Record<string, unknown> {
  const items = (JSON.parse(String(call.init.body)) as { items: Record<string, unknown>[] }).items
  return items[0] ?? {}
}

/** Les requêtes de l'adaptateur vers `/cart` et `/cart/update`, avec le corps décodé des écritures. */
interface Seen {
  call: AuchanCall
  body: Record<string, unknown> | null
}
const bodyOf = (call: AuchanCall): Record<string, unknown> | null =>
  typeof call.init.body === 'string'
    ? (JSON.parse(call.init.body) as Record<string, unknown>)
    : null

const reads = (calls: AuchanCall[]) => calls.filter((call) => call.init.method === 'GET')
const writes = (calls: AuchanCall[]): Seen[] =>
  calls.filter((call) => call.init.method === 'POST').map((call) => ({ call, body: bodyOf(call) }))
const item = (seen: Seen): Record<string, unknown> =>
  ((seen.body?.items as Record<string, unknown>[] | undefined) ?? [])[0] ?? {}

/**
 * Un panier tenu en mémoire : `GET /cart` le rend, `POST /cart/update` pose la quantité ABSOLUE demandée (au plus `max`) ; `mode` change ce que l'écriture fait.
 * `rows` est l'état de départ.
 */
function cartSite(
  start: Row[] = [],
  {
    mode = 'ok',
    cartId = MEMBER_CART,
  }: {
    mode?: 'ok' | 'ignore' | 'wrong' | 'cap' | 'gone'
    cartId?: string
  } = {},
) {
  const rows = new Map<string, Row>(start.map((row) => [row.productId ?? PRODUCT, row]))
  const respond = (): AuchanReply => ({
    body: cartJson(
      [...rows.values()].map((row) => line(row)),
      { cartId, total: 273 },
    ),
  })
  let inFlight = 0
  let peak = 0
  const site = auchanSite(
    (call) => {
      if (call.init.method === 'POST') {
        const wanted = writtenItem(call)
        const productId = String(wanted.productId)
        const quantity = Number(wanted.desiredQuantity)
        const existing = rows.get(productId)
        if (mode === 'ignore') return respond()
        if (mode === 'gone') return respond()
        const actual =
          mode === 'wrong' ? quantity + 1 : mode === 'cap' ? Math.min(quantity, 12) : quantity
        rows.set(productId, {
          productId,
          offerId: String(wanted.offerId),
          lineId: existing?.lineId ?? LINE,
          desired: quantity,
          actual,
          max: mode === 'cap' ? 12 : 397,
        })
      }
      return respond()
    },
    {
      cookies: () => `lark-consentId=${CONSENT}; datadome=x; lark-cart=${VISITOR_CART}`,
    },
  )
  // Le nombre de requêtes en vol : jamais plus d'une (aucune écriture en parallèle).
  const fetchOnce = site.deps.fetch
  site.deps.fetch = async (url, init) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    try {
      return await fetchOnce(url, init)
    } finally {
      inFlight -= 1
    }
  }
  return { ...site, rows, peak: () => peak }
}

function adapterOf(site: ReturnType<typeof cartSite>, state: 'true' | 'false' | null = 'true') {
  site.deps.authenticated = () => state
  const adapter = new AuchanAdapter(site.deps)
  adapter.rememberOffer(PRODUCT, {
    offerId: OFFER,
    sellerType: 'GROCERY',
    offerType: 'DEFAULT',
    sellerId: '',
  })
  return adapter
}

async function failureOf(run: () => unknown): Promise<RetailerError> {
  const error = await Promise.resolve()
    .then(run)
    .then(
      () => null,
      (reason: unknown) => reason,
    )
  if (!(error instanceof RetailerError))
    throw new Error('une erreur de l’adaptateur était attendue')
  return error
}

beforeEach(() => {
  document.documentElement.innerHTML = '<body></body>'
})
afterEach(() => {
  document.documentElement.innerHTML = ''
})

describe('une première pose : lire, écrire la quantité absolue, relire', () => {
  it('connecté : lit le panier SANS cartId (le cookie lark-cart est ignoré), prend cart.id, écrit au format mesuré, sans jeton d’en-tête', async () => {
    const site = cartSite([])
    const adapter = adapterOf(site)

    const result = await adapter.setCartQuantity(PRODUCT, 3)

    expect(site.calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `GET /cart?consentId=${CONSENT}`,
      'POST /cart/update',
    ])
    expect(reads(site.calls)[0]?.init.headers).toEqual({
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    })
    const [written] = writes(site.calls)
    expect(written?.call.init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    })
    // Aucun jeton d'en-tête, quoi que la page porte (C-1, mesuré).
    expect(JSON.stringify(written?.call.init.headers).toLowerCase()).not.toMatch(
      /token|xsrf|csrf|authorization/,
    )
    expect(written?.body).toEqual({
      cartId: MEMBER_CART,
      items: [
        {
          productId: PRODUCT,
          offerId: OFFER,
          sellerType: 'GROCERY',
          desiredQuantity: 3,
          desiredType: 'DEFAULT',
          sellerId: '',
        },
      ],
      consentId: CONSENT,
      reservationId: null,
      mbaAvailabilityNeeded: false,
    })
    expect(Object.keys(item(written!))).toEqual([
      'productId',
      'offerId',
      'sellerType',
      'desiredQuantity',
      'desiredType',
      'sellerId',
    ])
    expect(result).toMatchObject({
      productId: PRODUCT,
      requested: 3,
      sent: 3,
      obtained: 3,
      ok: true,
      items: 1,
      totalCents: 273,
      ean: '0000000000017',
      status: 200,
    })
  })

  it('visiteur : la lecture porte cartId (le cookie lark-cart) et consentId', async () => {
    const site = cartSite([], { cartId: VISITOR_CART })

    await adapterOf(site, 'false').setCartQuantity(PRODUCT, 1)

    expect(reads(site.calls)[0]?.url).toBe(`/cart?consentId=${CONSENT}&cartId=${VISITOR_CART}`)
    // L'écriture reprend le cart.id RENDU par la lecture.
    expect(writes(site.calls)[0]?.body?.cartId).toBe(VISITOR_CART)
  })

  it('la lecture suit le panier rendu par le site, jamais un identifiant supposé', async () => {
    const site = cartSite([], { cartId: 'panier-du-compte' })

    await adapterOf(site).setCartQuantity(PRODUCT, 1)

    expect(writes(site.calls)[0]?.body?.cartId).toBe('panier-du-compte')
  })
})

describe('une ligne déjà là : toujours son id, jamais réduite, quantité absolue', () => {
  it('envoie l’id de la ligne et la quantité TOTALE voulue (de 1 à 3 : 3, pas 2)', async () => {
    const site = cartSite([{ desired: 1 }])

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 3)

    expect(item(writes(site.calls)[0]!)).toMatchObject({ id: LINE, desiredQuantity: 3 })
    expect(Object.keys(item(writes(site.calls)[0]!)).at(-1)).toBe('id')
    expect(result).toMatchObject({ requested: 3, sent: 3, obtained: 3, ok: true })
  })

  it('une ligne déjà à une quantité SUPÉRIEURE n’est jamais réduite : aucune écriture, la quantité du panier est rendue', async () => {
    const site = cartSite([{ desired: 5 }])

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 2)

    expect(writes(site.calls)).toEqual([])
    expect(site.rows.get(PRODUCT)?.desired).toBe(5)
    expect(result).toMatchObject({ requested: 2, sent: 5, obtained: 5, ok: true })
  })

  it('une ligne déjà à la quantité voulue n’est pas réécrite', async () => {
    const site = cartSite([{ desired: 2 }])

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 2)

    expect(writes(site.calls)).toEqual([])
    expect(result).toMatchObject({ obtained: 2, ok: true })
  })

  it('jamais desiredQuantity 0 : zéro, un nombre négatif ou décimal est refusé sans une requête', async () => {
    const site = cartSite([{ desired: 4 }])
    const adapter = adapterOf(site)

    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      await expect(adapter.setCartQuantity(PRODUCT, quantity)).rejects.toBeInstanceOf(RangeError)
    }

    expect(site.calls).toEqual([])
    expect(() => updateBody(MEMBER_CART, CONSENT, { ...baseItem(), desiredQuantity: 0 })).toThrow(
      RangeError,
    )
  })

  it('la quantité envoyée ne dépasse jamais 99', async () => {
    const site = cartSite([])

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 250)

    expect(item(writes(site.calls)[0]!).desiredQuantity).toBe(99)
    expect(result).toMatchObject({ requested: 250, sent: 99, obtained: 99 })
  })

  it('une ligne déjà présente SANS id lisible n’est pas écrite : on ne risque pas l’essai du 2026-10-30 (quantité inchangée)', async () => {
    const site = cartSite([{ desired: 1, lineId: null }])

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 3))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_LINE_ID_UNREADABLE' })
    expect(writes(site.calls)).toEqual([])
  })

  it('une ligne sans quantité lisible : CART_LINE_UNREADABLE, rien n’est écrit (on ne peut pas jurer de ne pas réduire)', async () => {
    const site = cartSite([{ desired: 2, actual: null }])

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 3))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_LINE_UNREADABLE' })
    expect(writes(site.calls)).toEqual([])
  })
})

const baseItem = () => ({
  productId: PRODUCT,
  offerId: OFFER,
  sellerType: 'GROCERY',
  desiredQuantity: 1,
  desiredType: 'DEFAULT',
  sellerId: '',
  id: null,
})

describe('relire la ligne : une quantité qui n’est pas celle demandée est un échec, jamais un succès', () => {
  it('le site ignore l’écriture (200, quantité inchangée) : CONTRACT_CHANGED (CART_QUANTITY_MISMATCH)', async () => {
    const site = cartSite([{ desired: 1 }], { mode: 'ignore' })

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 3))

    expect(error).toMatchObject({
      code: 'CONTRACT_CHANGED',
      cause: 'CART_QUANTITY_MISMATCH',
      status: 200,
    })
  })

  it('le site applique une autre quantité que celle demandée : échec, pas de succès', async () => {
    const site = cartSite([], { mode: 'wrong' })

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 3))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_QUANTITY_MISMATCH' })
  })

  it('desiredQuantity et actualQuantity qui divergent sans plafond du site : échec', async () => {
    const answers = [cartJson([]), cartJson([line({ desired: 3, actual: 2, max: 397 })])]
    const site = auchanSite(() => ({ body: answers.shift() ?? '' }), {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 3))

    expect(error).toMatchObject({ cause: 'CART_QUANTITY_MISMATCH' })
  })

  it('le produit n’est plus dans le panier rendu : obtenu 0, pas ok (le passage dira « pas pris par le panier »)', async () => {
    const site = cartSite([], { mode: 'gone' })

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 2)

    expect(result).toMatchObject({ requested: 2, sent: 2, obtained: 0, ok: false })
  })

  it('une réponse d’écriture dont la ligne n’a pas de quantité lisible : CART_LINE_UNREADABLE', async () => {
    const answers = [cartJson([]), cartJson([line({ desired: null, actual: null })])]
    const site = auchanSite(() => ({ body: answers.shift() ?? '' }), {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ cause: 'CART_LINE_UNREADABLE' })
  })
})

describe('le plafond offering.maxQuantity (message de dépassement NON MESURÉ)', () => {
  it('au-delà du plafond d’une ligne connue : rien n’est écrit, la ligne est rendue non satisfaite avec le plafond', async () => {
    const site = cartSite([{ desired: 2, max: 12 }])

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 15)

    expect(writes(site.calls)).toEqual([])
    expect(result).toMatchObject({ requested: 15, obtained: 2, ok: false, product: { stock: 12 } })
  })

  it('un plafond que le site révèle à l’écriture (ligne neuve) : la quantité bornée est rendue, non satisfaite', async () => {
    const site = cartSite([], { mode: 'cap' })

    const result = await adapterOf(site).setCartQuantity(PRODUCT, 15)

    expect(writes(site.calls)).toHaveLength(1)
    expect(result).toMatchObject({
      requested: 15,
      sent: 15,
      obtained: 12,
      ok: false,
      product: { stock: 12 },
    })
  })
})

describe('l’offre du produit (deux identifiants) : lue par la recherche, jamais devinée', () => {
  it('sans offre connue ni ligne dans le panier : CART_OFFER_UNKNOWN, rien n’est écrit', async () => {
    const site = cartSite([])
    const adapter = new AuchanAdapter(site.deps)

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_OFFER_UNKNOWN' })
    expect(writes(site.calls)).toEqual([])
  })

  it('une ligne déjà là donne son offre à défaut de la recherche', async () => {
    const site = cartSite([{ desired: 1, offerId: OTHER_OFFER }])
    const adapter = new AuchanAdapter(site.deps)

    await adapter.setCartQuantity(PRODUCT, 2)

    expect(item(writes(site.calls)[0]!).offerId).toBe(OTHER_OFFER)
  })

  it('une offre qui n’a pas la forme d’Auchan n’est pas retenue', () => {
    const adapter = new AuchanAdapter(cartSite([]).deps)

    expect(adapter.rememberOffer(PRODUCT, { offerId: 'pas-un-uuid' })).toBe(false)
    expect(adapter.rememberOffer('pas-un-uuid', { offerId: OFFER })).toBe(false)
    expect(adapter.rememberOffer(PRODUCT, { offerId: OFFER })).toBe(true)
  })

  it('les valeurs de la page (sellerType…) qui ne sont pas des mots sûrs sont écartées au profit des valeurs par défaut', async () => {
    const site = cartSite([])
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, {
      offerId: OFFER,
      sellerType: '<script>',
      offerType: 'x'.repeat(200),
      sellerId: 'pas-un-vendeur',
    })

    await adapter.setCartQuantity(PRODUCT, 1)

    expect(item(writes(site.calls)[0]!)).toMatchObject({
      sellerType: 'GROCERY',
      desiredType: 'DEFAULT',
      sellerId: '',
    })
  })

  it('un identifiant de produit qui n’a pas la forme d’Auchan est refusé sans une requête', async () => {
    const site = cartSite([])

    await expect(adapterOf(site).setCartQuantity('123456', 1)).rejects.toBeInstanceOf(RangeError)

    expect(site.calls).toEqual([])
  })
})

describe('les cookies : deux noms exacts, jamais gardés ni rapportés', () => {
  it('sans lark-consentId lisible : CART_CONSENT_UNREADABLE, aucune requête', async () => {
    const site = cartSite([])
    site.deps.cookies = () => 'datadome=x; lark-consentid=minuscules'
    const adapter = adapterOf(site)

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ cause: 'CART_CONSENT_UNREADABLE' })
    expect(site.calls).toEqual([])
  })

  it('sans accès aux cookies (la page ne les donne pas) : même refus', async () => {
    const site = cartSite([])
    delete site.deps.cookies

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ cause: 'CART_CONSENT_UNREADABLE' })
  })

  it('un cookie illisible (document.cookie qui lève) : même refus, jamais une exception brute', async () => {
    const site = cartSite([])
    site.deps.cookies = () => {
      throw new Error('cookies bloqués')
    }

    const error = await failureOf(() => adapterOf(site).setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ cause: 'CART_CONSENT_UNREADABLE' })
  })

  it('une valeur hostile (esperluette, retour à la ligne, trop longue) n’est jamais mise dans l’adresse', () => {
    expect(cookieValue(`lark-consentId=${CONSENT}`, 'lark-consentId')).toBe(CONSENT)
    expect(cookieValue('lark-consentId=a&cartId=b', 'lark-consentId')).toBeNull()
    expect(cookieValue('lark-consentId=a%0Ab', 'lark-consentId')).toBeNull()
    expect(cookieValue(`lark-consentId=${'a'.repeat(101)}`, 'lark-consentId')).toBeNull()
    expect(cookieValue('lark-consentId=%E0%A4%A', 'lark-consentId')).toBeNull()
    expect(cookieValue('xlark-consentId=a; lark-consentIdx=b', 'lark-consentId')).toBeNull()
    expect(cookieValue('sans-egal; lark-consentId=ok', 'lark-consentId')).toBe('ok')
  })

  it('aucune valeur de cookie ni identifiant ne sort du résultat, de la cause ou des faits d’arrivée', async () => {
    const site = cartSite([{ desired: 1 }], { mode: 'ignore' })
    const adapter = adapterOf(site)
    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 3))

    const everything = JSON.stringify([
      error.message,
      error.cause,
      error.status,
      adapter.readArrival(),
      adapter.stats(),
    ])

    expect(everything).not.toContain(CONSENT)
    expect(everything).not.toContain(MEMBER_CART)
    expect(everything).not.toContain(VISITOR_CART)
    expect(everything).not.toContain(LINE)
  })
})

describe('lecture : cartQuantity et pageCartTotal', () => {
  it('rien avant la première lecture (aucune requête pour répondre)', () => {
    const site = cartSite([])
    const adapter = adapterOf(site)

    expect(adapter.cartQuantity(PRODUCT)).toBeNull()
    expect(adapter.pageCartTotal()).toBeNull()
    expect(site.calls).toEqual([])
  })

  it('après une lecture : la quantité de chaque produit (0 s’il n’y est pas) et le total en CENTIMES', async () => {
    const site = cartSite([{ desired: 4 }])
    const adapter = adapterOf(site)

    await adapter.setCartQuantity(PRODUCT, 2)

    expect(adapter.cartQuantity(PRODUCT)).toBe(4)
    expect(adapter.cartQuantity(OTHER_PRODUCT)).toBe(0)
    expect(adapter.pageCartTotal()).toBe(273)
  })

  it('un total illisible est « rien » (jamais un total deviné)', async () => {
    const body = cartJson([]).replace('"amount":0', '"amount":"12,50 €"')
    const answers = [
      body,
      body.replace('"items":[]', `"items":[${JSON.stringify(line({ desired: 1 }))}]`),
    ]
    const site = auchanSite(() => ({ body: answers.shift() ?? '' }), {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })

    const result = await adapter.setCartQuantity(PRODUCT, 1)

    expect(result.totalCents).toBeNull()
    expect(adapter.pageCartTotal()).toBeNull()
  })

  it('l’EAN (product.eans[0]) est rendu au résultat seulement s’il a la forme d’un code-barres', async () => {
    for (const [eans, expected] of [
      [['3000000000017'], '3000000000017'],
      [['pas-un-ean'], undefined],
      [[], undefined],
      ['3000000000017', undefined],
      [[30000017], undefined],
    ] as const) {
      const answers = [cartJson([]), cartJson([line({ desired: 1, eans })])]
      const site = auchanSite(() => ({ body: answers.shift() ?? '' }), {
        cookies: () => `lark-consentId=${CONSENT}`,
      })
      const adapter = new AuchanAdapter(site.deps)
      adapter.rememberOffer(PRODUCT, { offerId: OFFER })

      const result = await adapter.setCartQuantity(PRODUCT, 1)

      expect(result.ean).toBe(expected)
      expect('ean' in result).toBe(expected !== undefined)
    }
  })
})

describe('les réponses du site : un statut ou un corps inattendu n’est jamais un succès', () => {
  /** Un site qui répond `reply` à la lecture (la première requête). */
  const failing = (reply: AuchanReply) => {
    const site = auchanSite(() => reply, { cookies: () => `lark-consentId=${CONSENT}` })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })
    return { site, adapter }
  }

  it.each([
    [401, 'NOT_LOGGED_IN', 'HTTP_401'],
    [400, 'CONTRACT_CHANGED', 'HTTP_400'],
    [404, 'CONTRACT_CHANGED', 'HTTP_404'],
    [409, 'CONTRACT_CHANGED', 'HTTP_409'],
    [500, 'NETWORK', 'HTTP_500'],
    [503, 'NETWORK', 'HTTP_503'],
  ])('un %s à la lecture : %s (%s)', async (status, code, cause) => {
    const { adapter, site } = failing({ status, body: '{"code":"99003"}' })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ code, cause, status })
    expect(site.calls).toHaveLength(1)
  })

  it('une redirection vers la connexion : NOT_LOGGED_IN (LOGIN_REDIRECT)', async () => {
    const { adapter } = failing({
      status: 200,
      redirected: true,
      url: 'https://www.auchan.fr/auth/realms/x/protocol/openid-connect/auth',
      body: '<html>connexion</html>',
    })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_REDIRECT' })
  })

  it.each([
    ['du HTML', '<html><body>Bienvenue</body></html>', 'CART_NOT_JSON'],
    ['un texte vide', '', 'CART_NOT_JSON'],
    [
      'du JSON sans panier (une forme d’erreur inconnue)',
      '{"errors":[{"code":"99001"}]}',
      'CART_NO_CART',
    ],
    ['un tableau', '[]', 'CART_NO_CART'],
    ['un panier sans identifiant', '{"cart":{"items":[]}}', 'CART_ID_UNREADABLE'],
    ['un identifiant hostile', '{"cart":{"id":"a b&c","items":[]}}', 'CART_ID_UNREADABLE'],
    ['un panier sans liste de lignes', `{"cart":{"id":"${MEMBER_CART}"}}`, 'CART_ITEMS_UNREADABLE'],
    [
      'des lignes qui ne sont pas une liste',
      `{"cart":{"id":"${MEMBER_CART}","items":{}}}`,
      'CART_ITEMS_UNREADABLE',
    ],
  ])('une lecture en 200 qui rend %s : CONTRACT_CHANGED (%s)', async (_name, body, cause) => {
    const { adapter } = failing({ status: 200, body })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause, status: 200 })
  })

  it('une écriture refusée en 401 : NOT_LOGGED_IN ; en 500 : NETWORK ; jamais un succès', async () => {
    for (const [status, code] of [
      [401, 'NOT_LOGGED_IN'],
      [500, 'NETWORK'],
      [422, 'CONTRACT_CHANGED'],
    ] as const) {
      const answers: AuchanReply[] = [{ body: cartJson([]) }, { status, body: '{"code":"99002"}' }]
      const site = auchanSite(() => answers.shift() ?? {}, {
        cookies: () => `lark-consentId=${CONSENT}`,
      })
      const adapter = new AuchanAdapter(site.deps)
      adapter.rememberOffer(PRODUCT, { offerId: OFFER })

      const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

      expect(error).toMatchObject({ code, status })
    }
  })

  it('des clés hostiles (__proto__, constructor) dans le panier ne cassent rien et ne créent aucune ligne', async () => {
    const hostile = `{"__proto__":{"cart":{}},"constructor":1,"cart":{"id":"${MEMBER_CART}","constructor":{"x":1},"items":[{"product":{"id":"__proto__"}},{"product":{"id":"constructor"}},${JSON.stringify(line({ desired: 2 }))}],"prices":{"__proto__":{"totalPrice":{"amount":1}}}}}`
    const site = auchanSite(() => ({ body: hostile }), {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)

    const read = readCart(hostile)

    expect([...read.lines.keys()]).toEqual([PRODUCT])
    expect(read.totalCents).toBeNull()
    expect(adapter.cartQuantity(PRODUCT)).toBeNull()
  })

  it('plus de 500 lignes : les premières seulement sont lues', () => {
    const rows = Array.from({ length: 600 }, (_, index) =>
      line({ productId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, desired: 1 }),
    )

    expect(readCart(cartJson(rows)).lines.size).toBe(500)
  })
})

describe('le défi de l’anti-robot (AUCUN n’a été vu : marqueurs SUPPOSÉS)', () => {
  const challengePage =
    '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=inventé"></iframe>'
  const recaptchaPage =
    '<div class="g-recaptcha"></div><script src="https://www.google.com/recaptcha/enterprise.js"></script>'

  /** Une lecture normale, puis la réponse `reply` à l'écriture. Rend aussi le panier tel qu'il reste. */
  async function challengedWrite(
    reply: AuchanReply,
  ): Promise<{ error: RetailerError; site: ReturnType<typeof auchanSite> }> {
    const answers: AuchanReply[] = [{ body: cartJson([]) }, reply, reply, reply]
    const site = auchanSite(() => answers.shift() ?? {}, {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })
    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 2))
    return { error, site }
  }

  it.each([
    ['une page de DataDome en 200', { body: challengePage }],
    ['une page de DataDome en 403', { status: 403, body: challengePage }],
    [
      'une réponse JSON de DataDome (403) qui renvoie vers captcha-delivery.com',
      { status: 403, body: '{"url":"https://geo.captcha-delivery.com/captcha/?x=1"}' },
    ],
    ['une page reCAPTCHA en 403', { status: 403, body: recaptchaPage }],
    ['une page reCAPTCHA en 200 à la place du JSON du panier', { body: recaptchaPage }],
  ])('%s : BLOCKED (CHALLENGE), et l’écriture n’est JAMAIS rejouée', async (_name, reply) => {
    const { error, site } = await challengedWrite(reply)

    expect(error).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })
    // Une lecture, UNE seule écriture : pas de reprise automatique après un défi.
    expect(writes(site.calls)).toHaveLength(1)
    expect(site.calls).toHaveLength(2)
  })

  it('un défi à la lecture : BLOCKED (CHALLENGE), aucune écriture', async () => {
    const site = auchanSite(() => ({ body: challengePage }), {
      cookies: () => `lark-consentId=${CONSENT}`,
    })
    const adapter = new AuchanAdapter(site.deps)
    adapter.rememberOffer(PRODUCT, { offerId: OFFER })

    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 1))

    expect(error).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })
    expect(writes(site.calls)).toEqual([])
  })

  it('après le défi, la reprise relit le panier d’abord : si l’écriture avait eu lieu, rien n’est réécrit', async () => {
    // La première écriture est suivie d'un défi alors que le site l'avait appliquée ; la personne passe le défi, le passage refait la ligne.
    const site = cartSite([])
    // Le défi remplace la réponse de la première écriture (que le site a pourtant appliquée) ; il est posé AVANT la création de l'adaptateur (le `fetch` est pris à sa naissance).
    const fetchOnce = site.deps.fetch
    let first = true
    site.deps.fetch = async (url, init) => {
      const response = await fetchOnce(url, init)
      if (init?.method === 'POST' && first) {
        first = false
        return {
          ...response,
          text: () => Promise.resolve(challengePage),
          status: 200,
          headers: new Headers(),
          url: response.url,
          redirected: false,
        } as unknown as Response
      }
      return response
    }
    const adapter = adapterOf(site)
    const error = await failureOf(() => adapter.setCartQuantity(PRODUCT, 2))
    expect(error).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })

    const result = await adapter.setCartQuantity(PRODUCT, 2)

    expect(writes(site.calls)).toHaveLength(1)
    expect(result).toMatchObject({ obtained: 2, ok: true })
    expect(site.rows.get(PRODUCT)?.actual).toBe(2)
  })

  it('un JSON du panier qui parle de recaptcha n’est PAS un défi, ni une page ordinaire en 200', () => {
    expect(isAuchanChallenge('{"recaptcha":"enterprise"}', 403)).toBe(false)
    expect(isAuchanChallenge(recaptchaPage, 200)).toBe(false)
    expect(isAuchanChallenge(recaptchaPage, 403)).toBe(true)
    expect(isAuchanChallenge(challengePage, 200)).toBe(true)
    expect(isAuchanChallenge('', 403)).toBe(false)
  })
})

describe('la cadence (2 000 ms, gigue 1 000 ms, plafond 4 s : NON MESURÉE au-delà de ce qui a été essayé)', () => {
  it('une lecture puis une écriture sont séparées de la pause d’Auchan, jamais en parallèle', async () => {
    const site = cartSite([])
    site.setRandom(0)

    await adapterOf(site).setCartQuantity(PRODUCT, 2)

    const times = site.calls.map((call) => call.at)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(PACING.pauseMs)
    expect(PACING.measured).toBe(false)
    expect(site.peak()).toBe(1)
  })

  it('deux produits lancés ensemble passent l’un après l’autre : une requête à la fois, au moins la pause entre deux', async () => {
    const site = cartSite([])
    site.setRandom(0.5)
    const adapter = adapterOf(site)
    adapter.rememberOffer(OTHER_PRODUCT, { offerId: OTHER_OFFER })

    await Promise.all([
      adapter.setCartQuantity(PRODUCT, 1),
      adapter.setCartQuantity(OTHER_PRODUCT, 2),
    ])

    expect(site.peak()).toBe(1)
    const times = site.calls.map((call) => call.at)
    expect(times.length).toBeGreaterThanOrEqual(4)
    for (let index = 1; index < times.length; index += 1) {
      // Chaque requête dure 50 ms dans le faux site ; la pause se compte depuis la fin de la précédente.
      expect(times[index]! - times[index - 1]! - 50).toBeGreaterThanOrEqual(PACING.pauseMs)
    }
    expect(adapter.stats().peakPauseMs).toBeLessThanOrEqual(PACING.maxPauseMs)
  })
})

describe('l’adresse et le corps ne portent que des chemins relatifs et des valeurs sûres', () => {
  it('toute requête part vers l’hôte de la page (chemin relatif)', async () => {
    const site = cartSite([])

    await adapterOf(site).setCartQuantity(PRODUCT, 1)

    for (const call of site.calls) {
      expect(call.url).toMatch(/^\/(?![/\\])/)
      expect(call.init.credentials).toBe('same-origin')
    }
  })
})

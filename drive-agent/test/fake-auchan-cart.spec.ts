// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Le panier du faux site d'Auchan (`fake-auchan/cart.ts`, DRV-725) lu avec l'adaptateur RÉEL de l'agent, sur de vraies requêtes HTTP vers 127.0.0.1. Le faux
// site juge l'agent (forme de la requête, `id` de la ligne, cadence en parallèle) ; ses pannes (écriture ignorée, quantité fausse, défi, 401…) prouvent que
// l'agent ne réussit jamais à tort. Le temps est faux (`sleep` n'attend pas) : la cadence de 2 000 ms est jugée par les tests à horloge fausse
// (`auchan-cart.spec.ts`) et par les e2e (`e2e/auchan-panier.spec.ts`), pas ici. Aucun contact avec un site d'enseigne.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PRODUCTS } from '../fake-auchan/catalog'
import { CONSENT_ID, MEMBER_CART_ID, VISITOR_CART_ID } from '../fake-auchan/pages'
import { startFakeAuchan, type FakeAuchan } from '../fake-auchan/server'
import { AuchanAdapter } from '../src/auchan'
import { putInCart } from '../src/flow'
import { RetailerError } from '../src/retailers'
import { auchanSite } from './auchan-helpers'
import { bridgeTo } from './auchan-fake-bridge'

const FARINE = PRODUCTS[0]!
const LAIT = PRODUCTS[1]!
const FARINE_COMPLETE = PRODUCTS[2]! // plafond de 12

let fake: FakeAuchan
beforeAll(async () => {
  fake = await startFakeAuchan()
})
afterAll(async () => {
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  document.documentElement.innerHTML = '<body></body>'
})
afterEach(() => {
  document.documentElement.innerHTML = ''
})

/** L'adaptateur réel, branché sur le faux site, comme chez une personne connectée (ou visiteur). */
function adapterFor(session: 'member' | 'visitor' = 'member') {
  fake.setBehavior({ session })
  const site = auchanSite(() => ({}), {
    cookies: () =>
      session === 'member'
        ? `lark-consentId=${CONSENT_ID}; datadome=x`
        : `lark-consentId=${CONSENT_ID}; lark-cart=${VISITOR_CART_ID}`,
    authenticated: () => (session === 'member' ? 'true' : 'false'),
  })
  site.deps.fetch = bridgeTo(fake)
  const adapter = new AuchanAdapter(site.deps)
  for (const product of PRODUCTS) {
    adapter.rememberOffer(product.productId, {
      offerId: product.offerId,
      sellerType: 'GROCERY',
      offerType: 'DEFAULT',
      sellerId: '',
    })
  }
  return adapter
}

const written = () =>
  fake.writes().map(
    (write) =>
      JSON.parse(write.detail ?? '{}') as {
        items: { desiredQuantity: number; id?: string }[]
      },
  )

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

describe('l’agent contre le panier du faux site', () => {
  it('connecté : lit le panier sans cartId, pose la quantité absolue, relit : ok, total en centimes, EAN rendu', async () => {
    const result = await adapterFor('member').setCartQuantity(FARINE.productId, 3)

    expect(fake.cart()).toEqual({ [FARINE.productId]: 3 })
    expect(result).toMatchObject({
      requested: 3,
      sent: 3,
      obtained: 3,
      ok: true,
      items: 1,
      totalCents: 3 * FARINE.priceCents,
      status: 200,
      ean: FARINE.ean,
    })
    expect(fake.paced().map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /cart',
      'POST /cart/update',
    ])
    expect(fake.paced().every((request) => request.rejected === undefined)).toBe(true)
    expect(fake.violations().filter((violation) => violation.kind === 'parallel')).toEqual([])
    expect(MEMBER_CART_ID).toBeTruthy()
  })

  it('visiteur : la lecture porte cartId (cookie lark-cart) et l’écriture est acceptée', async () => {
    const result = await adapterFor('visitor').setCartQuantity(LAIT.productId, 2)

    expect(result).toMatchObject({ obtained: 2, ok: true })
    expect(fake.cart()).toEqual({ [LAIT.productId]: 2 })
    expect(fake.paced().every((request) => request.rejected === undefined)).toBe(true)
  })

  it('une ligne déjà là : l’id de la ligne part avec la quantité TOTALE (1 puis 3, pas 4)', async () => {
    fake.seedCart(FARINE.productId, 1)

    await adapterFor().setCartQuantity(FARINE.productId, 3)

    expect(fake.cart()).toEqual({ [FARINE.productId]: 3 })
    expect(written()[0]?.items[0]).toMatchObject({ desiredQuantity: 3 })
    expect(written()[0]?.items[0]?.id).toMatch(/^l0000000-/)
  })

  it('le faux site qui ignore une écriture SANS id (le piège du 2026-10-30) ne piège pas l’agent, qui envoie toujours l’id', async () => {
    fake.setCartBehavior({ write: 'ignore-without-id' })
    fake.seedCart(FARINE.productId, 1)

    const result = await adapterFor().setCartQuantity(FARINE.productId, 4)

    expect(result).toMatchObject({ obtained: 4, ok: true })
    expect(fake.cart()).toEqual({ [FARINE.productId]: 4 })
  })

  it('le panier n’est jamais réduit : une ligne à 6 reste à 6, sans écriture, quand on en veut 2', async () => {
    fake.seedCart(FARINE.productId, 6)

    const result = await adapterFor().setCartQuantity(FARINE.productId, 2)

    expect(fake.writes()).toEqual([])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 6 })
    expect(result).toMatchObject({ requested: 2, sent: 6, obtained: 6, ok: true })
  })

  it('produits trouvés par la recherche (inCart: null) : la quantité déjà au panier se LIT, un seul GET /cart partagé, rafraîchi par chaque écriture (DRV-732)', async () => {
    // Given : du lait déjà au panier en plus grande quantité que voulu, de la farine à poser, du sel à poser
    fake.seedCart(LAIT.productId, 4)
    const adapter = adapterFor()
    const found = async (term: string, productId: string) => {
      const seen = (await adapter.searchProducts(term)).find((one) => one.id === productId)
      if (!seen) throw new Error('produit attendu dans les résultats')
      return seen
    }
    const SEL = PRODUCTS[3]!

    // When : trois produits, dans l'ordre d'un passage
    const farine = await found('farine de blé', FARINE.productId)
    const lait = await found('lait', LAIT.productId)
    const sel = await found('sel fin', SEL.productId)
    expect([farine.inCart, lait.inCart, sel.inCart]).toEqual([null, null, null])
    const settled = [
      await putInCart(adapter, farine, 2),
      await putInCart(adapter, lait, 1),
      await putInCart(adapter, sel, 3),
    ]

    // Then : jamais « illisible » ; le lait est conservé (4 > 1) sans écriture ; le panier est la somme de ce qu'il avait et de ce qui a été posé
    expect(settled.map((one) => one.note)).toEqual([
      null,
      { kind: 'KEPT', wanted: 1, inCart: 4 },
      null,
    ])
    expect(settled.map((one) => one.obtained)).toEqual([2, 4, 3])
    expect(fake.cart()).toEqual({
      [LAIT.productId]: 4,
      [FARINE.productId]: 2,
      [SEL.productId]: 3,
    })
    // Les requêtes du panier : la lecture du passage + celle d'avant chaque écriture (DRV-725), jamais une par produit ; le lait n'en coûte aucune
    expect(
      fake
        .paced()
        .filter((request) => request.kind === 'cart')
        .map((request) => `${request.method} ${request.path}`),
    ).toEqual(['GET /cart', 'GET /cart', 'POST /cart/update', 'GET /cart', 'POST /cart/update'])
    expect(fake.violations().filter((violation) => violation.kind === 'parallel')).toEqual([])
  })

  it('un panier illisible (ligne sans quantité) : la mention « illisible » reste, la quantité n’est jamais inventée', async () => {
    fake.seedCart(FARINE.productId, 3)
    fake.setCartBehavior({ read: 'line-without-quantity' })
    const adapter = adapterFor()
    const seen = (await adapter.searchProducts('farine de blé')).find(
      (one) => one.id === FARINE.productId,
    )
    if (!seen) throw new Error('produit attendu dans les résultats')

    const error = await failureOf(() => putInCart(adapter, seen, 1))

    // L'écriture refuse aussi de deviner une ligne sans quantité : rien n'est écrit
    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_LINE_UNREADABLE' })
    expect(fake.writes()).toEqual([])
  })

  it('aucune écriture de l’agent ne porte desiredQuantity 0, sur toute une série', async () => {
    const adapter = adapterFor()
    await adapter.setCartQuantity(FARINE.productId, 2)
    await adapter.setCartQuantity(FARINE.productId, 1)
    await adapter.setCartQuantity(FARINE.productId, 5)
    await adapter.setCartQuantity(LAIT.productId, 1)

    const quantities = written().map((body) => body.items[0]?.desiredQuantity)

    expect(quantities).toEqual([2, 5, 1])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 5, [LAIT.productId]: 1 })
  })

  it('le plafond du faux site (maxQuantity 12) : une ligne connue au plafond n’est pas dépassée, une ligne neuve revient bornée et non satisfaite', async () => {
    const adapter = adapterFor()

    const first = await adapter.setCartQuantity(FARINE_COMPLETE.productId, 20)
    const second = await adapter.setCartQuantity(FARINE_COMPLETE.productId, 30)

    expect(first).toMatchObject({ requested: 20, obtained: 12, ok: false, product: { stock: 12 } })
    expect(second).toMatchObject({ requested: 30, obtained: 12, ok: false, product: { stock: 12 } })
    expect(fake.writes()).toHaveLength(1)
    expect(fake.cart()).toEqual({ [FARINE_COMPLETE.productId]: 12 })
  })

  it.each([
    [
      'une quantité fausse appliquée',
      { write: 'wrong-quantity' },
      'CONTRACT_CHANGED',
      'CART_QUANTITY_MISMATCH',
    ],
    [
      'une réponse qui n’est pas du JSON',
      { write: 'not-json' },
      'CONTRACT_CHANGED',
      'CART_NOT_JSON',
    ],
    ['du JSON sans panier', { write: 'no-cart' }, 'CONTRACT_CHANGED', 'CART_NO_CART'],
    ['un 401', { write: 'unauthorized' }, 'NOT_LOGGED_IN', 'HTTP_401'],
    ['un 503', { write: 'server-error' }, 'NETWORK', 'HTTP_503'],
    ['une page de DataDome', { write: 'challenge' }, 'BLOCKED', 'CHALLENGE'],
    ['une page reCAPTCHA (403)', { write: 'recaptcha' }, 'BLOCKED', 'CHALLENGE'],
    ['la page de connexion en 200', { write: 'login-page' }, 'NOT_LOGGED_IN', 'LOGIN_FORM'],
    ['une page de cookies', { write: 'consent-page' }, 'CONTRACT_CHANGED', 'CART_NOT_JSON'],
    ['une page d’erreur en 200', { write: 'error-page' }, 'CONTRACT_CHANGED', 'CART_ERROR_PAGE'],
    ['un corps vide', { write: 'empty-body' }, 'CONTRACT_CHANGED', 'CART_EMPTY'],
    ['un JSON vide', { write: 'json-empty' }, 'CONTRACT_CHANGED', 'CART_JSON_EMPTY'],
  ] as const)(
    '%s : l’agent échoue (%s %s), il ne réussit jamais à tort',
    async (_name, behavior, code, cause) => {
      fake.setCartBehavior(behavior)

      const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

      expect(error).toMatchObject({ code, cause })
      // Jamais une seconde écriture après un défi ; au plus UNE écriture ici dans tous les cas.
      expect(fake.writes().length).toBeLessThanOrEqual(1)
    },
  )

  it.each([
    ['un 401 à la lecture', { read: 'unauthorized' }, 'NOT_LOGGED_IN', 'HTTP_401'],
    [
      'une lecture qui n’est pas du JSON',
      { read: 'not-json' },
      'CONTRACT_CHANGED',
      'CART_NOT_JSON',
    ],
    ['du JSON sans panier à la lecture', { read: 'no-cart' }, 'CONTRACT_CHANGED', 'CART_NO_CART'],
    ['un défi à la lecture', { read: 'challenge' }, 'BLOCKED', 'CHALLENGE'],
    ['un reCAPTCHA à la lecture', { read: 'recaptcha' }, 'BLOCKED', 'CHALLENGE'],
    // DRV-752 : la recette du 2026-10-31 a lu `CART_NOT_JSON` sans savoir pourquoi ; chaque forme a maintenant sa cause, et une connexion ou un blocage ne
    // se disent plus « le site a changé ».
    ['la page de connexion en 200', { read: 'login-page' }, 'NOT_LOGGED_IN', 'LOGIN_FORM'],
    ['une page de cookies', { read: 'consent-page' }, 'CONTRACT_CHANGED', 'CART_NOT_JSON'],
    ['une page ordinaire du site', { read: 'site-page' }, 'CONTRACT_CHANGED', 'CART_NOT_JSON'],
    ['une page d’erreur en 200', { read: 'error-page' }, 'CONTRACT_CHANGED', 'CART_ERROR_PAGE'],
    ['un corps vide', { read: 'empty-body' }, 'CONTRACT_CHANGED', 'CART_EMPTY'],
    ['un JSON vide', { read: 'json-empty' }, 'CONTRACT_CHANGED', 'CART_JSON_EMPTY'],
    [
      'une ligne sans id à la lecture',
      { read: 'line-without-id' },
      'CONTRACT_CHANGED',
      'CART_LINE_ID_UNREADABLE',
    ],
    [
      'une ligne sans quantité à la lecture',
      { read: 'line-without-quantity' },
      'CONTRACT_CHANGED',
      'CART_LINE_UNREADABLE',
    ],
  ] as const)('%s : %s %s, et aucune écriture', async (_name, behavior, code, cause) => {
    fake.seedCart(FARINE.productId, 1)
    fake.setCartBehavior(behavior)

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

    expect(error).toMatchObject({ code, cause })
    expect(fake.writes()).toEqual([])
  })

  it('une écriture ignorée par le site (200, quantité inchangée) sur une ligne qui existe : l’agent échoue (CART_QUANTITY_MISMATCH)', async () => {
    fake.seedCart(FARINE.productId, 1)
    fake.setCartBehavior({ write: 'ignored' })

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 3))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_QUANTITY_MISMATCH' })
    expect(fake.cart()).toEqual({ [FARINE.productId]: 1 })
  })

  it('une écriture ignorée par le site sur une ligne neuve : le produit n’est pas au panier (obtenu 0, pas ok), jamais un succès', async () => {
    fake.setCartBehavior({ write: 'ignored' })

    const result = await adapterFor().setCartQuantity(FARINE.productId, 3)

    expect(result).toMatchObject({ requested: 3, obtained: 0, ok: false })
    expect(fake.cart()).toEqual({})
  })

  it('le défi une fois passé par la personne : la reprise relit le panier et pose la quantité, une seule écriture au total', async () => {
    const adapter = adapterFor()
    fake.setCartBehavior({ write: 'challenge' })
    const blocked = await failureOf(() => adapter.setCartQuantity(FARINE.productId, 2))
    expect(blocked).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })
    expect(fake.writes()).toHaveLength(1)

    // La personne passe le défi dans la page : le site répond de nouveau normalement, le passage refait la ligne.
    fake.setCartBehavior({ write: 'ok' })
    const result = await adapter.setCartQuantity(FARINE.productId, 2)

    expect(result).toMatchObject({ obtained: 2, ok: true })
    expect(fake.writes()).toHaveLength(2)
    expect(fake.cart()).toEqual({ [FARINE.productId]: 2 })
  })

  it('jamais deux requêtes à la fois, même pour des écritures lancées ensemble', async () => {
    const adapter = adapterFor()

    await Promise.all([
      adapter.setCartQuantity(FARINE.productId, 1),
      adapter.setCartQuantity(LAIT.productId, 2),
      adapter.setCartQuantity(FARINE.productId, 3),
    ])

    expect(fake.violations().filter((violation) => violation.kind === 'parallel')).toEqual([])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 3, [LAIT.productId]: 2 })
  })
})

describe('la forme de la réponse du panier dans l’erreur (DRV-752)', () => {
  it('une connexion servie en 200 : la forme dit le code, le type, la taille, les noms d’en-têtes et le mot « page de connexion »', async () => {
    fake.setCartBehavior({ read: 'login-page' })

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

    expect(error.reply).toMatchObject({
      status: 200,
      mime: 'text/html',
      redirected: false,
      address: '/cart',
      body: 'HTML',
      words: ['LOGIN'],
    })
    expect(error.reply?.length).toBeGreaterThan(100)
    expect(error.reply?.headers).toContain('content-type')
    expect(error.reply?.headers).toContain('x-datadome')
  })

  it('une page qui ne dit rien de connu : CART_NOT_JSON, la forme garde le type et la taille et aucun mot', async () => {
    fake.setCartBehavior({ read: 'not-json' })

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_NOT_JSON' })
    expect(error.reply).toMatchObject({ body: 'HTML', words: [] })
  })

  it('une écriture refusée par le site garde aussi la forme de sa réponse', async () => {
    fake.setCartBehavior({ write: 'login-page' })

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

    expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_FORM' })
    expect(error.reply).toMatchObject({ status: 200, body: 'HTML', words: ['LOGIN'] })
    expect(fake.writes()).toHaveLength(1)
  })

  it('aucune valeur du site ni du compte dans la forme : ni identifiant de consentement, ni de panier, ni adresse', async () => {
    fake.setCartBehavior({ read: 'login-page' })

    const error = await failureOf(() => adapterFor().setCartQuantity(FARINE.productId, 2))

    const text = JSON.stringify(error.reply)
    expect(text).not.toContain(CONSENT_ID)
    expect(text).not.toContain(MEMBER_CART_ID)
    expect(text).not.toMatch(/https?:|consentId|127\.0\.0\.1|Se connecter/)
  })
})

describe('la sonde de lecture du panier du diagnostic (DRV-752)', () => {
  it('lit le panier par UNE requête GET, n’écrit jamais, et dit la forme et le nombre de lignes', async () => {
    fake.seedCart(FARINE.productId, 1)
    fake.seedCart(LAIT.productId, 2)

    const facts = await adapterFor().probeCart()

    expect(facts).toMatchObject({
      outcome: 'READ',
      lines: 2,
      fault: null,
      reply: { status: 200, mime: 'application/json', body: 'JSON', words: [], address: '/cart' },
    })
    expect(
      fake.paced().map((request) => `${request.method} ${request.path.split('?')[0]}`),
    ).toEqual(['GET /cart'])
    expect(fake.writes()).toEqual([])
    expect(fake.cart()).toEqual({ [FARINE.productId]: 1, [LAIT.productId]: 2 })
  })

  it('un panier vide se lit : zéro ligne', async () => {
    const facts = await adapterFor().probeCart()

    expect(facts).toMatchObject({ outcome: 'READ', lines: 0 })
  })

  it('ne retient rien du panier : ni quantités, ni total (un diagnostic ne change pas ce que le passage sait)', async () => {
    fake.seedCart(FARINE.productId, 3)
    const adapter = adapterFor()

    await adapter.probeCart()

    expect(adapter.cartQuantity(FARINE.productId)).toBeNull()
    expect(adapter.pageCartTotal()).toBeNull()
  })

  it.each([
    ['la page de connexion', { read: 'login-page' }, 'NOT_LOGGED_IN', 'LOGIN_FORM', ['LOGIN']],
    ['un défi de l’anti-robot', { read: 'challenge' }, 'BLOCKED', 'CHALLENGE', null],
    [
      'une page de cookies',
      { read: 'consent-page' },
      'CONTRACT_CHANGED',
      'CART_NOT_JSON',
      ['CONSENT'],
    ],
    ['une page d’erreur', { read: 'error-page' }, 'CONTRACT_CHANGED', 'CART_ERROR_PAGE', ['ERROR']],
    ['un corps vide', { read: 'empty-body' }, 'CONTRACT_CHANGED', 'CART_EMPTY', []],
    ['un JSON vide', { read: 'json-empty' }, 'CONTRACT_CHANGED', 'CART_JSON_EMPTY', []],
    ['du JSON sans panier', { read: 'no-cart' }, 'CONTRACT_CHANGED', 'CART_NO_CART', []],
    ['un 401', { read: 'unauthorized' }, 'NOT_LOGGED_IN', 'HTTP_401', []],
  ] as const)(
    '%s : la sonde rend l’échec (%s %s) avec la forme, sans lever d’erreur et sans écrire',
    async (_name, behavior, code, cause, words) => {
      fake.setCartBehavior(behavior)

      const facts = await adapterFor().probeCart()

      expect(facts).toMatchObject({ outcome: 'FAILED', lines: null, fault: { code, cause } })
      // Un défi de DataDome est jugé par le `Pacer` avant toute lecture : pas de forme relevée.
      expect(facts.reply === null ? null : facts.reply.words).toEqual(words)
      expect(fake.writes()).toEqual([])
      expect(fake.paced()).toHaveLength(1)
    },
  )

  it('sans identifiant de consentement lisible : aucune requête, CART_CONSENT_UNREADABLE, aucune forme', async () => {
    fake.setBehavior({ session: 'member' })
    const site = auchanSite(() => ({}), { cookies: () => '', authenticated: () => 'true' })
    site.deps.fetch = bridgeTo(fake)

    const facts = await new AuchanAdapter(site.deps).probeCart()

    expect(facts).toMatchObject({
      outcome: 'FAILED',
      reply: null,
      fault: { code: 'CONTRACT_CHANGED', cause: 'CART_CONSENT_UNREADABLE' },
    })
    expect(fake.paced()).toEqual([])
  })
})

describe('la forme du dernier échec du panier, gardée dans l’onglet (DRV-752)', () => {
  const store = () => {
    const values = new Map<string, string>()
    return {
      values,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
      },
    }
  }

  function adapterWith(storage: ReturnType<typeof store>['storage'] | undefined) {
    fake.setBehavior({ session: 'member' })
    const site = auchanSite(() => ({}), {
      cookies: () => `lark-consentId=${CONSENT_ID}`,
      authenticated: () => 'true',
      ...(storage !== undefined && { storage }),
    })
    site.deps.fetch = bridgeTo(fake)
    return new AuchanAdapter(site.deps)
  }

  it('un envoi qui échoue laisse sa forme, qu’une autre page (un autre adaptateur) relit', async () => {
    const { storage, values } = store()
    fake.setCartBehavior({ read: 'login-page' })
    const error = await failureOf(() => adapterWith(storage).setCartQuantity(FARINE.productId, 2))
    expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_FORM' })

    const later = adapterWith(storage)

    expect(later.lastCartFailure()).toMatchObject({ status: 200, body: 'HTML', words: ['LOGIN'] })
    expect([...values.values()].join('')).not.toMatch(/https?:|SECRET|consent/i)
  })

  it('sans stockage, la forme ne vit qu’en mémoire', async () => {
    fake.setCartBehavior({ read: 'error-page' })
    const adapter = adapterWith(undefined)
    expect(adapter.lastCartFailure()).toBeNull()

    await failureOf(() => adapter.setCartQuantity(FARINE.productId, 2))

    expect(adapter.lastCartFailure()).toMatchObject({ words: ['ERROR'] })
    expect(adapterWith(undefined).lastCartFailure()).toBeNull()
  })

  it('un stockage qui refuse l’écriture ne change pas l’erreur de l’envoi', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    fake.setCartBehavior({ read: 'login-page' })

    const error = await failureOf(() => adapterWith(storage).setCartQuantity(FARINE.productId, 2))

    expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_FORM' })
  })

  it('l’échec de la sonde ne remplace pas celui d’un envoi', async () => {
    const { storage } = store()
    fake.setCartBehavior({ read: 'login-page' })
    const adapter = adapterWith(storage)
    await failureOf(() => adapter.setCartQuantity(FARINE.productId, 2))

    fake.setCartBehavior({ read: 'error-page' })
    const probed = await adapter.probeCart()

    expect(probed.reply?.words).toEqual(['ERROR'])
    expect(adapter.lastCartFailure()?.words).toEqual(['LOGIN'])
    expect(adapterWith(storage).lastCartFailure()?.words).toEqual(['LOGIN'])
  })

  it.each([
    ['du texte qui n’est pas du JSON', 'pas du json'],
    ['un tableau', '[]'],
    ['une forme sans corps', '{"status":200}'],
    [
      'un mot qui n’est pas de la liste fermée',
      '{"status":200,"mime":"text/html","length":1,"redirected":false,"address":"/cart","headers":[],"body":"HTML","words":["jean.dupont"]}',
    ],
    [
      'un nom d’en-tête hostile',
      '{"status":200,"mime":"text/html","length":1,"redirected":false,"address":"/cart","headers":["a b"],"body":"HTML","words":[]}',
    ],
    [
      'une adresse entière',
      '{"status":200,"mime":"text/html","length":1,"redirected":false,"address":"https://x.invalid/cart","headers":[],"body":"HTML","words":[]}',
    ],
    ['un texte énorme', `{"status":200,"x":"${'a'.repeat(5000)}"}`],
  ])('un stockage altéré (%s) n’est jamais relu', (_name, raw) => {
    const { storage, values } = store()
    values.set('repas:last-cart-reply', raw)

    expect(adapterWith(storage).lastCartFailure()).toBeNull()
  })
})

describe('le panier du faux site, vu directement', () => {
  it('une écriture avec un id de ligne inconnu est refusée (400), pas ignorée', async () => {
    fake.seedCart(FARINE.productId, 1)
    const adapter = adapterFor()
    fake.seedCart(LAIT.productId, 1)

    // On force un id faux : le faux site le dit, l'agent n'y est pour rien.
    const reply = await bridgeTo(fake)('/cart/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        cartId: MEMBER_CART_ID,
        items: [
          {
            productId: FARINE.productId,
            offerId: FARINE.offerId,
            sellerType: 'GROCERY',
            desiredQuantity: 2,
            desiredType: 'DEFAULT',
            sellerId: '',
            id: 'l-inconnu',
          },
        ],
        consentId: CONSENT_ID,
        reservationId: null,
        mbaAvailabilityNeeded: false,
      }),
    })

    expect(reply.status).toBe(400)
    expect(adapter.cartQuantity(FARINE.productId)).toBeNull()
  })
})

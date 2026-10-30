// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// Le faux site d'Auchan (DRV-717, drive-agent/fake-auchan/) lu avec l'adaptateur RÉEL de l'agent, sur de vraies requêtes HTTP vers 127.0.0.1 : s'il
// s'écartait de la forme mesurée le 2026-10-30, l'adaptateur ou ces tests le diraient. Il garde aussi ses fixtures (`fixtures/auchan/`) égales à ce qu'il
// sert, et vérifie ses garde-fous (accès local seulement, cadence, vrai 404). Aucun contact avec un site d'enseigne.
import { request as httpRequest } from 'node:http'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PRODUCTS } from '../fake-auchan/catalog'
import {
  CONSENT_ID,
  coursesPage,
  cartPage,
  journeyBody,
  MEMBER_CART_ID,
  notFoundPage,
  VISITOR_CART_ID,
} from '../fake-auchan/pages'
import {
  AISLE_PAGE_PATH,
  EMPTY_AISLE_PAGE_PATH,
  landingPage,
  PRODUCT_PAGE_PATH,
  searchReply,
} from '../fake-auchan/search'
import {
  type Behavior,
  DEFAULT_BEHAVIOR,
  MIN_GAP_MS,
  startFakeAuchan,
  STORE,
  type FakeAuchan,
  type JourneyForm,
} from '../fake-auchan/server'
import { PACING } from '../src/auchan'
import { AuchanAdapter } from '../src/auchan'
import { RetailerError } from '../src/retailers'
import { auchanFixture, auchanSite, showPage } from './auchan-helpers'

let fake: FakeAuchan
beforeAll(async () => {
  fake = await startFakeAuchan()
})
afterAll(async () => {
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  document.documentElement.innerHTML = ''
})

/**
 * Un appel direct au faux site, sous un nom d'hôte de la boucle locale (`localhost`) ou sous un nom d'enseigne. `fetch` ne laisse pas choisir l'en-tête
 * `Host` : l'appel passe par `node:http`.
 */
function call(
  path: string,
  {
    host,
    method = 'GET',
    headers = {},
    body,
  }: { host?: string; method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{
  status: number
  text: string
  headers: Headers
  json: () => unknown
  cookies: string[]
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port: fake.port,
        path,
        method,
        headers: { ...(host && { host }), ...headers },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const out = new Headers()
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === 'string') out.set(name, value)
          }
          resolve({
            status: response.statusCode ?? 0,
            text,
            headers: out,
            json: () => JSON.parse(text),
            cookies: response.headers['set-cookie'] ?? [],
          })
        })
      },
    )
    request.on('error', reject)
    request.end(body)
  })
}

const XHR = { 'X-Requested-With': 'XMLHttpRequest' }

describe('les fixtures sont ce que le faux site sert', () => {
  const base = { session: 'member', entry: 'button' } as const

  it.each([
    ['parcours-magasin.json', journeyBody('chosen')],
    ['parcours-sans-magasin.json', journeyBody('none')],
    ['parcours-contexte-vide.json', journeyBody('null-context')],
    ['parcours-identifiant-invalide.json', journeyBody('chosen', 'pas-un-uuid')],
  ])('%s', (name, body) => {
    expect(JSON.parse(auchanFixture(name))).toEqual(body)
  })

  it.each([
    ['accueil-magasin.html', coursesPage({ ...base, bar: 'withdrawal' })],
    ['accueil-sans-magasin.html', coursesPage({ ...base, bar: 'choose' })],
    ['panier-vide-bouton.html', cartPage({ ...base, bar: 'withdrawal', entry: 'button' })],
    ['panier-vide-lien.html', cartPage({ ...base, bar: 'withdrawal', entry: 'link' })],
    ['introuvable.html', notFoundPage()],
    ['recherche-aucun-resultat.html', searchReply('zzqxkw', { ...base, bar: 'withdrawal' }).body],
    ['recherche-inconnue.html', searchReply('inconnu', { ...base, bar: 'withdrawal' }).body],
    ['recherche-illisible.html', searchReply('illisible', { ...base, bar: 'withdrawal' }).body],
    ['recherche-sans-offre.html', searchReply('sansoffre', { ...base, bar: 'withdrawal' }).body],
    ['recherche-lot.html', searchReply('lot', { ...base, bar: 'withdrawal' }).body],
    ['fiche-produit.html', landingPage(PRODUCT_PAGE_PATH, { ...base, bar: 'withdrawal' }) ?? ''],
    ['rayon.html', landingPage(AISLE_PAGE_PATH, { ...base, bar: 'withdrawal' }) ?? ''],
    ['rayon-vide.html', landingPage(EMPTY_AISLE_PAGE_PATH, { ...base, bar: 'withdrawal' }) ?? ''],
  ])('%s', (name, page) => {
    expect(auchanFixture(name).trimEnd()).toBe(page.trimEnd())
  })

  it('aucune valeur du vrai site : des UUID et des libellés de test seulement', () => {
    const all = [
      ...['parcours-magasin.json', 'accueil-magasin.html', 'recherche-farine.html'].map(
        auchanFixture,
      ),
      JSON.stringify(PRODUCTS),
    ].join('\n')

    expect(all).toContain('Ville-Test')
    expect(all).not.toMatch(/\b\d{5}\s+[A-Z][a-z]+/)
    for (const word of ['@', 'Bearer', 'password']) expect(all).not.toContain(word)
  })
})

describe('les garde-fous du faux site', () => {
  it('n’accepte que la boucle locale et ses noms connus : un autre nom d’hôte reçoit 403', async () => {
    const refused = await call('/courses', { host: 'www.autre-site.invalid' })
    const compte = await call('/courses', { host: 'compte.auchan.fr' })

    expect(refused.status).toBe(403)
    expect(compte.status).toBe(403)
  })

  it('le pilotage ne répond que sur les noms de la boucle locale', async () => {
    expect((await call('/__fake/state', { host: 'localhost' })).status).toBe(200)
    expect((await call('/__fake/state', { host: 'www.auchan.fr' })).status).toBe(404)
  })

  it('une adresse inconnue est un VRAI 404 avec la page « Erreur 404 », pas un 200 trompeur', async () => {
    const reply = await call('/une-page-inventee/pr-C0000000', { host: 'www.auchan.fr' })

    expect(reply.status).toBe(404)
    expect(reply.text).toContain('<title>404 Not Found Page</title>')
    expect(reply.text).toContain('Erreur 404')
  })

  it('les cookies : lark-consentId toujours, lark-cart pour un visiteur seulement, datadome si voulu, connect.sid en HttpOnly', async () => {
    const cookies = async (settings: Partial<typeof DEFAULT_BEHAVIOR>) => {
      fake.setBehavior(settings)
      return (await call('/courses', { host: 'www.auchan.fr' })).cookies
    }

    const visitor = await cookies({ session: 'visitor', datadome: true })
    const member = await cookies({ session: 'member', datadome: false })

    expect(visitor.some((c) => c.startsWith(`lark-cart=${VISITOR_CART_ID}`))).toBe(true)
    expect(visitor.some((c) => c.startsWith(`lark-consentId=${CONSENT_ID}`))).toBe(true)
    expect(visitor.some((c) => c.startsWith('datadome='))).toBe(true)
    expect(visitor.find((c) => c.startsWith('connect.sid='))).toContain('HttpOnly')
    expect(member.some((c) => c.startsWith('lark-cart=;') && c.includes('Max-Age=0'))).toBe(true)
    expect(member.some((c) => c.startsWith('datadome='))).toBe(false)
  })

  it('la page d’accueil annonce la connexion dans sessionStorage et la barre du magasin', async () => {
    fake.setBehavior({ session: 'visitor', store: 'none' })
    const visitor = (await call('/courses', { host: 'www.auchan.fr' })).text
    fake.setBehavior({ session: 'member', store: 'chosen' })
    const member = (await call('/courses', { host: 'www.auchan.fr' })).text

    expect(visitor).toContain("setItem('tracking_authenticated', 'false')")
    expect(visitor).toContain('Choisir vos courses')
    expect(member).toContain("setItem('tracking_authenticated', 'true')")
    expect(member).toContain('Retrait : Drive Ville-Test')
  })

  it('GET /journey exige la requête XHR du site : sans X-Requested-With, 400 consigné', async () => {
    const refused = await call('/journey')
    const accepted = await call('/journey', { headers: XHR })

    expect(refused.status).toBe(400)
    expect(accepted.status).toBe(200)
    expect(fake.paced().map((request) => request.rejected)).toEqual([
      'X-Requested-With manquant',
      undefined,
    ])
  })

  it('surveille la cadence : deux requêtes de l’agent trop proches sont une violation', async () => {
    await call('/journey', { headers: XHR })
    await call('/journey', { headers: XHR })

    expect(fake.violations()).toEqual([expect.objectContaining({ kind: 'too-fast', request: 2 })])
    expect(MIN_GAP_MS).toBe(PACING.pauseMs)
  })
})

describe('le panier du faux site (un squelette pour DRV-725), de la forme mesurée', () => {
  const product = PRODUCTS[0]!
  const body = (cartId: string, quantity: number, extra: object = {}) =>
    JSON.stringify({
      cartId,
      items: [
        {
          productId: product.productId,
          offerId: product.offerId,
          sellerType: 'GROCERY',
          desiredQuantity: quantity,
          desiredType: 'DEFAULT',
          sellerId: '',
          ...extra,
        },
      ],
      consentId: CONSENT_ID,
      reservationId: null,
      mbaAvailabilityNeeded: false,
    })
  const write = (text: string, headers: Record<string, string> = {}) =>
    call('/cart/update', {
      method: 'POST',
      body: text,
      headers: { 'Content-Type': 'application/json', ...XHR, ...headers },
    })

  it('un visiteur lit son panier avec cartId, écrit une quantité ABSOLUE (3 puis 5, pas 8), et 0 retire la ligne ; le total est en centimes', async () => {
    fake.setBehavior({ session: 'visitor' })

    const first = (await write(body(VISITOR_CART_ID, 3))).json() as {
      cart: { prices: { totalPrice: { amount: number } }; items: { cartItem: { id: string } }[] }
    }
    const second = (await write(body(VISITOR_CART_ID, 5))).json() as typeof first
    const read = await call(`/cart?consentId=${CONSENT_ID}&cartId=${VISITOR_CART_ID}`, {
      headers: XHR,
    })
    const removed = (await write(body(VISITOR_CART_ID, 0))).json() as typeof first

    expect(fake.writes()).toHaveLength(3)
    expect(first.cart.prices.totalPrice.amount).toBe(3 * product.priceCents)
    expect(second.cart.prices.totalPrice.amount).toBe(5 * product.priceCents)
    expect(second.cart.items[0]?.cartItem.id).toBe(first.cart.items[0]?.cartItem.id)
    expect(read.status).toBe(200)
    expect(removed.cart.items).toEqual([])
    expect(fake.cart()).toEqual({})
  })

  it('un client connecté lit son panier SANS cartId et écrit avec l’identifiant du compte', async () => {
    fake.setBehavior({ session: 'member' })

    const read = await call(`/cart?consentId=${CONSENT_ID}`, { headers: XHR })
    const withCartId = await call(`/cart?consentId=${CONSENT_ID}&cartId=${VISITOR_CART_ID}`, {
      headers: XHR,
    })
    const written = await write(body(MEMBER_CART_ID, 2))
    const wrong = await write(body(VISITOR_CART_ID, 2))

    expect((read.json() as { cart: { id: string } }).cart.id).toBe(MEMBER_CART_ID)
    expect(withCartId.status).toBe(400)
    expect(written.status).toBe(200)
    expect(wrong.status).toBe(400)
    expect(fake.cart()).toEqual({ [product.productId]: 2 })
  })

  it.each([
    [
      'sans X-Requested-With',
      () =>
        call('/cart/update', {
          method: 'POST',
          body: body(MEMBER_CART_ID, 1),
          headers: { 'Content-Type': 'application/json' },
        }),
    ],
    [
      'en formulaire plutôt qu’en JSON',
      () => write(body(MEMBER_CART_ID, 1), { 'Content-Type': 'application/x-www-form-urlencoded' }),
    ],
    [
      'avec un produit inconnu',
      () => write(body(MEMBER_CART_ID, 1, { productId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' })),
    ],
    [
      'avec l’offre d’un autre produit',
      () => write(body(MEMBER_CART_ID, 1, { offerId: PRODUCTS[1]!.offerId })),
    ],
    ['avec une quantité décimale', () => write(body(MEMBER_CART_ID, 1.5))],
    ['avec une quantité négative', () => write(body(MEMBER_CART_ID, -1))],
    ['avec un corps illisible', () => write('pas du json')],
  ])('refuse une écriture %s', async (_name, run) => {
    fake.setBehavior({ session: 'member' })

    const reply = await run()

    expect(reply.status).toBe(400)
    expect(fake.cart()).toEqual({})
  })

  it('plafonne à maxQuantity et rend la configuration du panier', async () => {
    fake.setBehavior({ session: 'member' })

    await write(body(MEMBER_CART_ID, 100_000))
    const config = (await call('/cart/config', { headers: XHR })).json() as {
      updateCartEndpoint: string
      getCartEndpoint: string
    }

    expect(fake.cart()).toEqual({ [product.productId]: product.maxQuantity })
    expect(config).toMatchObject({ updateCartEndpoint: '/cart/update', getCartEndpoint: '/cart' })
  })

  it('la recherche rend des cartes de produits avec les deux identifiants et les microdonnées', async () => {
    const reply = await call('/recherche?text=Farine', { host: 'www.auchan.fr' })

    expect(reply.status).toBe(200)
    expect(reply.text).toContain(`data-product-id="${product.productId}"`)
    expect(reply.text).toContain(`data-offer-id="${product.offerId}"`)
    expect(reply.text).toContain('itemprop="price"')
    expect(reply.text).toBe(
      searchReply('Farine', { session: 'member', entry: 'button', bar: 'withdrawal' }).body,
    )
    expect(auchanFixture('recherche-farine.html').trimEnd()).toBe(reply.text.trimEnd())
  })
})

describe('l’adaptateur réel contre le faux site', () => {
  /** Un adaptateur dont les requêtes partent vraiment vers le faux site, sans attendre (horloge fausse) : la cadence est jugée par les e2e. */
  function adapter(): AuchanAdapter {
    const site = auchanSite(() => ({}), {
      fetch: (url, init) => fetch(`http://127.0.0.1:${fake.port}${url}`, init),
    })
    return new AuchanAdapter(site.deps)
  }

  it('lit le magasin inventé : identifiant, libellé, hôte, adresse de base constante', async () => {
    showPage(coursesPage({ bar: 'withdrawal', session: 'member', entry: 'button' }))

    const store = await adapter().readStore()

    expect(store).toEqual({
      id: STORE.id,
      host: 'www.auchan.fr',
      baseUrl: 'https://www.auchan.fr/',
      label: 'Drive Ville-Test',
    })
    expect(fake.paced()).toHaveLength(1)
    expect(fake.paced()[0]).toMatchObject({ kind: 'journey', path: '/journey', status: 200 })
    expect(fake.paced()[0]?.rejected).toBeUndefined()
  })

  const FORMS: [string, Partial<Behavior>, string, string][] = [
    ['aucun contexte de courses', { store: 'none' }, 'UNSUPPORTED_PAGE', 'STORE_NOT_CHOSEN'],
    [
      'un contexte de courses nul',
      { store: 'null-context' },
      'UNSUPPORTED_PAGE',
      'STORE_NOT_CHOSEN',
    ],
    ...(
      [
        ['not-json', 'CONTRACT_CHANGED', 'JOURNEY_NOT_JSON'],
        ['no-contexts', 'CONTRACT_CHANGED', 'JOURNEY_NO_CONTEXTS'],
        ['no-seller', 'CONTRACT_CHANGED', 'JOURNEY_NO_SELLER'],
        ['bad-id', 'CONTRACT_CHANGED', 'JOURNEY_STORE_ID_INVALID'],
        ['not-found', 'CONTRACT_CHANGED', 'HTTP_404'],
        ['server-error', 'NETWORK', 'HTTP_503'],
        ['challenge', 'BLOCKED', 'CHALLENGE'],
        ['login-redirect', 'NOT_LOGGED_IN', 'LOGIN_REDIRECT'],
      ] satisfies [JourneyForm, string, string][]
    ).map(([journey, code, cause]): [string, Partial<Behavior>, string, string] => [
      `la réponse « ${journey} »`,
      { journey },
      code,
      cause,
    ]),
  ]

  it.each(FORMS)('%s : %s / %s', async (_name, behavior, code, cause) => {
    fake.setBehavior(behavior)

    const error = await adapter()
      .readStore()
      .then(
        () => null,
        (reason: unknown) => reason,
      )

    expect(error).toBeInstanceOf(RetailerError)
    expect(error).toMatchObject({ code, cause })
  })

  it('un autre magasin que celui du plan : l’identifiant lu est celui du site', async () => {
    fake.setBehavior({ storeId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' })

    const store = await adapter().readStore()

    expect(store.id).toBe('9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f')
  })

  it('le sans-magasin ne fait aucune écriture : seule la lecture du parcours part', async () => {
    fake.setBehavior({ store: 'none' })

    await adapter()
      .readStore()
      .catch(() => undefined)

    expect(fake.writes()).toEqual([])
    expect(fake.requests().map((request) => request.path)).toEqual(['/journey'])
  })
})

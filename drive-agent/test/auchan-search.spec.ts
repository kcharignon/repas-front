// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// La recherche et la lecture des produits d'Auchan (DRV-724) : `GET /recherche?text=<terme>`, une page HTML lue par sélecteurs. Les pages sont INVENTÉES (les
// fixtures de `fixtures/auchan/` que produit le faux site, et des cartes construites ici) : jamais une page réelle. Ce qui n'a pas été mesuré sur le vrai site
// (les valeurs « indisponible », les offres d'un autre vendeur, la pagination, la redirection vers une fiche de produit) est éprouvé comme tel : tout ce qui n'est pas
// clairement disponible est indisponible, une forme inconnue est `CONTRACT_CHANGED` avec sa cause, jamais un produit inventé.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AuchanAdapter, PACING } from '../src/auchan'
import { RetailerError } from '../src/retailers'
import { auchanFixture, auchanSite, showPage, type AuchanReply } from './auchan-helpers'

const FARINE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const FARINE_OFFER = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'
const SEIGLE = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const MAIS = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f'
const LOT = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f81'

beforeEach(() => {
  showPage(auchanFixture('accueil-magasin.html'))
})
afterEach(() => {
  document.documentElement.innerHTML = ''
  Reflect.deleteProperty(window, '__pwned')
})

const html = (body: string, extra: AuchanReply = {}): AuchanReply => ({
  body,
  contentType: 'text/html; charset=utf-8',
  ...extra,
})
const fixture = (name: string, extra: AuchanReply = {}): AuchanReply =>
  html(auchanFixture(name), extra)

function shop(reply: AuchanReply | ((url: string) => AuchanReply)) {
  const site = auchanSite((call) => (typeof reply === 'function' ? reply(call.url) : reply))
  return { site, adapter: new AuchanAdapter(site.deps) }
}

/** L'erreur levée par une promesse, pour en lire le code et la cause. */
async function failureOf(run: () => Promise<unknown>): Promise<RetailerError> {
  const error = await run().then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof RetailerError))
    throw new Error('une erreur de l’adaptateur était attendue')
  return error
}

// —— Des cartes construites ici, pour éprouver chaque champ ————————————————————————————————————————————————————————————————

interface CardOptions {
  id?: string
  offer?: string | null
  sellerType?: string
  offerType?: string
  name?: string
  brand?: string | null
  price?: string | null
  currency?: string | null
  availability?: string[]
  inDrive?: boolean
  pastille?: string | null
  measure?: string | null
  image?: string | null
}

function card(options: CardOptions = {}): string {
  const {
    id = FARINE,
    offer = FARINE_OFFER,
    sellerType = 'GROCERY',
    offerType = 'DEFAULT',
    name = 'Farine de test',
    brand = 'Marque Test',
    price = '0.91',
    currency = 'EUR',
    availability = ['https://schema.org/InStock'],
    inDrive = true,
    pastille = '1kg',
    measure = '0,91 € / kg',
    image = 'https://cdn.auchan.fr/media/S00000000001G1GPRIMARY',
  } = options
  const ids = `data-product-id="${id}"${offer === null ? '' : ` data-offer-id="${offer}"`} data-seller-type="${sellerType}" data-offer-type="${offerType}" data-seller-id=""`
  return `<article ${ids} itemscope itemtype="https://schema.org/Product">
${image === null ? '' : `<meta itemprop="image" content="${image}">`}
<h3 itemprop="name">${name}</h3>
${brand === null ? '' : `<span itemprop="brand">${brand}</span>`}
${pastille === null ? '' : `<span class="net">${pastille}</span>`}
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
${price === null ? '' : `<meta itemprop="price" content="${price}">`}
${currency === null ? '' : `<meta itemprop="priceCurrency" content="${currency}">`}
${availability.map((value) => `<link itemprop="availability" href="${value}">`).join('\n')}
${measure === null ? '' : `<span class="unit-price">${measure}</span>`}${inDrive ? ' <em>Dans mon drive</em>' : ''}
</div>
<button type="button" ${ids}>Ajouter</button>
</article>`
}

/** Une page de résultats : la barre du magasin et les cartes données. */
const page = (...cards: string[]): AuchanReply =>
  html(
    `<!doctype html><html><head><title>Recherche</title></head><body><div>Retrait : Drive Ville-Test</div><main>${cards.join('\n')}</main></body></html>`,
  )

/** Une page de rayon (titre « … pas cher - Auchan.fr », h1 la catégorie) avec les cartes données. */
const aislePage = (...cards: string[]): string =>
  `<!doctype html><html><head><title>Farines pas cher - Auchan.fr</title></head><body><div>Retrait : Drive Ville-Test</div><main><h1>Farines</h1>${cards.join('\n')}</main></body></html>`

/** Une page de recherche refaite en page de rayon : le titre et le h1 d'une catégorie, les mêmes cartes. */
const aisleOf = (markup: string): string =>
  markup
    .replace(/<title>.*<\/title>/, '<title>Farines pas cher - Auchan.fr</title>')
    .replace(/<h1>.*<\/h1>/, '<h1>Farines</h1>')

async function oneProduct(options: CardOptions = {}) {
  const { adapter } = shop(page(card(options)))
  const [candidate] = await adapter.searchProducts('farine')
  return candidate
}

describe('la requête : GET /recherche?text=<terme>, une page HTML, à la cadence d’Auchan', () => {
  it('envoie UNE requête GET /recherche?text=… (le terme encodé, sans en-tête de requête XHR) et rend les produits de la page', async () => {
    const { site, adapter } = shop(fixture('recherche-farine.html'))

    const candidates = await adapter.searchProducts('œufs bio & co')

    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe(`/recherche?text=${encodeURIComponent('œufs bio & co')}`)
    expect(site.calls[0]?.init).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: expect.stringContaining('text/html') },
    })
    expect(JSON.stringify(site.calls[0]?.init.headers)).not.toContain('X-Requested-With')
    expect(site.calls[0]?.init.body).toBeUndefined()
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('un terme vide ne fait aucune requête', async () => {
    const { site, adapter } = shop(fixture('recherche-farine.html'))

    expect(await adapter.searchProducts('   ')).toEqual([])
    expect(site.calls).toEqual([])
  })

  it('deux recherches passent par le Pacer : jamais en parallèle, au moins la pause d’Auchan entre les deux', async () => {
    const { site, adapter } = shop(fixture('recherche-farine.html'))

    await Promise.all([adapter.searchProducts('farine'), adapter.searchProducts('lait')])

    expect(site.calls).toHaveLength(2)
    const [first, second] = site.calls
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeGreaterThanOrEqual(PACING.pauseMs)
  })
})

describe('les produits de la page de résultats (la fixture du faux site)', () => {
  it('un produit est un identifiant de produit : PLUSIEURS balises par produit ne font pas plusieurs produits', async () => {
    const markup = auchanFixture('recherche-farine.html')
    const markers = markup.match(/data-product-id=/g)?.length ?? 0
    const { adapter } = shop(html(markup))

    const candidates = await adapter.searchProducts('farine')

    expect(markers).toBe(candidates.length * 3)
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      FARINE,
      '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091',
      SEIGLE,
      MAIS,
    ])
  })

  it('chaque produit a son identifiant d’offre (UUID), sans EAN : il n’est pas sur la page de résultats', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))

    const candidates = await adapter.searchProducts('farine')

    expect(candidates[0]?.offerId).toBe(FARINE_OFFER)
    for (const candidate of candidates) {
      expect(candidate.offerId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
      expect(candidate).not.toHaveProperty('ean')
    }
  })

  it('le premier produit : libellé = marque + nom, prix en centimes, prix au kilo, contenu net 1 kg, photo sûre, stock non lu', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))

    const [first] = await adapter.searchProducts('farine')

    expect(first).toMatchObject({
      id: FARINE,
      label: 'Marque Test Farine de blé T55 de test',
      label2: '1kg',
      price: 91,
      pricePerMeasure: { cents: 91, unit: 'kg' },
      content: { value: 1000, unit: 'g' },
      contentSource: 'label',
      imageUrl: 'https://cdn.auchan.fr/media/S00000000001G1GPRIMARY',
      stock: null,
      inCart: null,
      comingSoon: false,
    })
  })

  it('un produit indisponible (OutOfStock, sans « Dans mon drive ») est UNAVAILABLE : stock 0, avec son prix', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.find((candidate) => candidate.id === SEIGLE)).toMatchObject({
      stock: 0,
      price: 149,
    })
  })

  it('un produit sans prix est lu : prix null, contenu net lu dans la pastille (500 g), disponible', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.find((candidate) => candidate.id === MAIS)).toMatchObject({
      price: null,
      pricePerMeasure: null,
      content: { value: 500, unit: 'g' },
      stock: null,
    })
  })

  it('un lot de six : contenu net 6 x 1 L = 6 000 ml, prix au litre 1,05 €', async () => {
    const { adapter } = shop(fixture('recherche-lot.html'))

    const candidates = await adapter.searchProducts('lot')

    expect(candidates.find((candidate) => candidate.id === LOT)).toMatchObject({
      price: 630,
      label2: '6 x 1L',
      content: { value: 6000, unit: 'ml' },
      pricePerMeasure: { cents: 105, unit: 'l' },
    })
  })

  it('readProductFromSearch rend le produit voulu parmi les résultats, ou null', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))

    const found = await adapter.readProductFromSearch('farine', SEIGLE)
    const missing = await adapter.readProductFromSearch(
      'farine',
      '00000000-0000-4000-8000-000000000000',
    )

    expect(found?.id).toBe(SEIGLE)
    expect(missing).toBeNull()
  })
})

describe('la disponibilité : tout ce qui n’est pas CLAIREMENT disponible est indisponible', () => {
  it('un produit disponible : vendeur GROCERY, offre DEFAULT, InStock, « Dans mon drive »', async () => {
    expect(await oneProduct()).toMatchObject({ stock: null })
  })

  it.each([
    ['OutOfStock', { availability: ['https://schema.org/OutOfStock'] }],
    ['une valeur inconnue (PreOrder)', { availability: ['https://schema.org/PreOrder'] }],
    ['aucune microdonnée de disponibilité', { availability: [] }],
    [
      'InStock mais une autre valeur à côté',
      { availability: ['https://schema.org/InStock', 'https://schema.org/SoldOut'] },
    ],
    ['InStock sans « Dans mon drive »', { inDrive: false }],
    ['un autre type d’offre (non mesuré)', { offerType: 'PROMOTION' }],
  ])('%s : stock 0, jamais disponible', async (_name, options) => {
    expect(await oneProduct(options)).toMatchObject({ stock: 0 })
  })

  it('une disponibilité en texte brut « InStock » (sans l’adresse schema.org) est lue', async () => {
    expect(await oneProduct({ availability: ['InStock'] })).toMatchObject({ stock: null })
  })
})

describe('le prix : des euros décimaux lus en centimes, null plutôt qu’une valeur fausse', () => {
  it.each([
    ['0.91', 91],
    ['0,91', 91],
    ['12.5', 1250],
    ['1.01', 101],
    ['0.91 €', 91],
  ])('« %s » donne %i centimes', async (price, cents) => {
    expect((await oneProduct({ price }))?.price).toBe(cents)
  })

  it.each([
    ['0', { price: '0' }],
    ['un prix négatif', { price: '-1.20' }],
    ['du texte', { price: 'abc' }],
    ['un prix démesuré', { price: '12345678.00' }],
    ['une autre devise', { currency: 'USD' }],
    ['aucune devise', { currency: null }],
    ['aucune microdonnée de prix', { price: null }],
  ])('%s : prix null', async (_name, options) => {
    expect((await oneProduct(options))?.price).toBeNull()
  })

  it('le contenu net illisible reste null (jamais deviné) : ni pastille ni prix au kilo', async () => {
    const candidate = await oneProduct({ pastille: null, measure: null, name: 'Farine' })

    expect(candidate).toMatchObject({ content: null, contentSource: null, pricePerMeasure: null })
  })

  it('un contenu que les prix contredisent ne donne rien (1 kg annoncé, mais 0,91 € à 9,10 € / kg = 100 g)', async () => {
    const candidate = await oneProduct({ pastille: '1kg', measure: '9,10 € / kg' })

    expect(candidate?.content).toBeNull()
  })

  it('à défaut de pastille, le contenu net se lit dans le nom (« Lait 6 x 1L »)', async () => {
    const candidate = await oneProduct({
      name: 'Lait demi-écrémé 6 x 1L',
      pastille: null,
      measure: null,
    })

    expect(candidate?.content).toEqual({ value: 6000, unit: 'ml' })
  })
})

describe('les produits illisibles sont écartés, jamais devinés', () => {
  const OTHER = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
  const OTHER_OFFER = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80'

  it.each([
    ['sans identifiant d’offre', { offer: null }],
    ['avec un identifiant d’offre qui n’est pas un UUID', { offer: 'pas-un-uuid' }],
    ['avec un UUID en majuscules', { offer: FARINE_OFFER.toUpperCase() }],
    ['sans nom', { name: '' }],
  ])('un produit %s est écarté, les autres restent', async (_name, options) => {
    const { adapter } = shop(
      page(card(options), card({ id: OTHER, offer: OTHER_OFFER, name: 'Lait' })),
    )

    const candidates = await adapter.searchProducts('lait')

    expect(candidates.map((candidate) => candidate.id)).toEqual([OTHER])
  })

  it('un produit dont les balises donnent deux offres différentes est écarté (laquelle mettre au panier ?)', async () => {
    const ambiguous = card().replace(
      '<button type="button" data-product-id="' + FARINE + '" data-offer-id="' + FARINE_OFFER + '"',
      '<button type="button" data-product-id="' + FARINE + '" data-offer-id="' + OTHER_OFFER + '"',
    )
    const { adapter } = shop(page(ambiguous, card({ id: OTHER, offer: OTHER_OFFER, name: 'Lait' })))

    const candidates = await adapter.searchProducts('lait')

    expect(candidates.map((candidate) => candidate.id)).toEqual([OTHER])
  })

  it('un identifiant de produit qui n’est pas un UUID n’est pas un produit (clés hostiles comprises)', async () => {
    const { adapter } = shop(
      page(
        card({ id: '__proto__' }),
        card({ id: 'constructor' }),
        card({ id: OTHER, offer: OTHER_OFFER, name: 'Lait' }),
      ),
    )

    const candidates = await adapter.searchProducts('lait')

    expect(candidates.map((candidate) => candidate.id)).toEqual([OTHER])
  })

  it('deux produits ne se mélangent pas : le nom et le prix de chaque carte sont les siens', async () => {
    const { adapter } = shop(
      page(
        card({ name: 'Premier', price: '1.00' }),
        card({ id: OTHER, offer: OTHER_OFFER, name: 'Second', price: '2.00' }),
      ),
    )

    const candidates = await adapter.searchProducts('x')

    expect(candidates.map((candidate) => [candidate.label, candidate.price])).toEqual([
      ['Marque Test Premier', 100],
      ['Marque Test Second', 200],
    ])
  })

  it('la marque n’est pas répétée quand le nom commence déjà par elle', async () => {
    expect((await oneProduct({ name: 'Marque Test Farine', brand: 'Marque Test' }))?.label).toBe(
      'Marque Test Farine',
    )
    expect((await oneProduct({ name: 'Farine', brand: null }))?.label).toBe('Farine')
  })

  it('la marque peut être une portée imbriquée (itemprop brand avec son propre name) : le nom du produit reste le sien', async () => {
    const nested = card().replace(
      '<span itemprop="brand">Marque Test</span>',
      '<span itemprop="brand" itemscope itemtype="https://schema.org/Brand"><meta itemprop="name" content="Marque Imbriquée"></span>',
    )
    const { adapter } = shop(page(nested))

    const [candidate] = await adapter.searchProducts('farine')

    expect(candidate?.label).toBe('Marque Imbriquée Farine de test')
  })
})

describe('les formes inconnues : CONTRACT_CHANGED avec une cause, jamais un produit inventé', () => {
  it('des balises de produit mais plus aucune microdonnée (le site a renommé ses champs) : SEARCH_PRODUCTS_UNREADABLE', async () => {
    const { adapter } = shop(fixture('recherche-illisible.html'))

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_PRODUCTS_UNREADABLE' })
  })

  it('des cartes sans identifiant d’offre : SEARCH_PRODUCTS_UNREADABLE aussi', async () => {
    const { adapter } = shop(fixture('recherche-sans-offre.html'))

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error.cause).toBe('SEARCH_PRODUCTS_UNREADABLE')
  })

  it('une page du site sans produit ni phrase connue : SEARCH_UNKNOWN_PAGE (jamais prise pour « aucun produit »)', async () => {
    const { adapter } = shop(fixture('recherche-inconnue.html'))

    const error = await failureOf(() => adapter.searchProducts('inconnu'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_UNKNOWN_PAGE' })
  })

  it.each([
    [
      'la phrase seule (ni titre ni h1 de recherche)',
      '<html><head><title>Autre</title></head><body><p>Oups, on n’a rien trouvé pour :</p></body></html>',
    ],
    [
      'la phrase et le titre, sans h1 de recherche',
      '<html><head><title>Votre recherche zzqxkw sur Auchan.fr</title></head><body><h1>Autre</h1><p>Oups, on n’a rien trouvé pour :</p></body></html>',
    ],
    [
      'le titre et le h1, sans la phrase',
      '<html><head><title>Votre recherche zzqxkw sur Auchan.fr</title></head><body><div>Retrait : Drive Ville-Test</div><h1>Votre recherche : zzqxkw</h1></body></html>',
    ],
    [
      'une ancienne formule inventée (« Aucun résultat »), jamais vue sur le site',
      '<html><head><title>Votre recherche zzqxkw sur Auchan.fr</title></head><body><div>Retrait : Drive Ville-Test</div><h1>Votre recherche : zzqxkw</h1><p>Aucun résultat pour votre recherche.</p></body></html>',
    ],
  ])('« aucun résultat » incomplet : %s : SEARCH_UNKNOWN_PAGE', async (_name, markup) => {
    const { adapter } = shop(html(markup))

    const error = await failureOf(() => adapter.searchProducts('zzqxkw'))

    expect(error.cause).toBe('SEARCH_UNKNOWN_PAGE')
  })

  it('« aucun résultat » mais des traces de produit (un prix en microdonnées) : SEARCH_PRODUCTS_UNREADABLE', async () => {
    const { adapter } = shop(
      html(
        '<html><head><title>Votre recherche zzqxkw sur Auchan.fr</title></head><body><h1>Votre recherche : zzqxkw</h1><p>Oups, on n’a rien trouvé pour :</p><meta itemprop="price" content="1.00"></body></html>',
      ),
    )

    const error = await failureOf(() => adapter.searchProducts('zzqxkw'))

    expect(error.cause).toBe('SEARCH_PRODUCTS_UNREADABLE')
  })

  it('une réponse vide : SEARCH_PAGE_EMPTY ; une réponse JSON : SEARCH_NOT_HTML', async () => {
    const empty = await failureOf(() => shop(html('  \n')).adapter.searchProducts('farine'))
    const json = await failureOf(() =>
      shop({ body: '{"items":[]}', contentType: 'application/json' }).adapter.searchProducts(
        'farine',
      ),
    )

    expect(empty.cause).toBe('SEARCH_PAGE_EMPTY')
    expect(json.cause).toBe('SEARCH_NOT_HTML')
  })

  it('une page « introuvable » servie en 200 : PAGE_NOT_FOUND', async () => {
    const { adapter } = shop(fixture('introuvable.html'))

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error.cause).toBe('PAGE_NOT_FOUND')
  })
})

describe('« aucun résultat » : le titre, le h1, la phrase ET l’absence de carte (MESURÉ, DRV-734), jamais l’un sans les autres', () => {
  it('la page du faux site, de la forme mesurée : aucun produit, sans erreur, sans redirection', async () => {
    const { adapter } = shop(fixture('recherche-aucun-resultat.html'))

    expect(await adapter.searchProducts('zzqxkw')).toEqual([])
    expect(adapter.lastSearchFacts()).toMatchObject({
      outcome: 'EMPTY',
      products: 0,
      redirected: false,
    })
    expect(adapter.lastSearchFacts()).not.toHaveProperty('landing')
  })

  it('sans barre du magasin non plus (la barre n’est pas un des signes mesurés de cette page)', async () => {
    const { adapter } = shop(
      html(
        '<html><head><title>Votre recherche zzqxkw sur Auchan.fr</title></head><body><h1>Votre recherche : zzqxkw</h1><p>Oups, on n’a rien trouvé pour :</p></body></html>',
      ),
    )

    expect(await adapter.searchProducts('zzqxkw')).toEqual([])
  })
})

const AISLE_URL = 'https://www.auchan.fr/epicerie-de-test/farines-de-test/ca-n0000001'
const PRODUCT_URL = 'https://www.auchan.fr/lait-uht-demi-ecreme-de-test/pr-C0000001'

describe('un terme que le site redirige vers une page de rayon : lue comme une page de résultats (MESURÉ, DRV-734)', () => {
  it('les mêmes cartes, les mêmes champs : les produits de la page de rayon sont rendus, et le fait est consigné sans l’adresse', async () => {
    const { adapter } = shop(fixture('rayon.html', { url: AISLE_URL, redirected: true }))

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      FARINE,
      expect.any(String),
      SEIGLE,
      MAIS,
    ])
    expect(candidates[0]).toMatchObject({ offerId: FARINE_OFFER, price: 91 })
    const facts = adapter.lastSearchFacts()
    expect(facts).toMatchObject({
      outcome: 'PRODUCTS',
      products: 4,
      redirected: true,
      landing: 'AISLE',
      address: '/…/…',
      requested: '/recherche',
    })
    expect(JSON.stringify(facts)).not.toContain('ca-n')
    expect(JSON.stringify(facts)).not.toContain('farines')
  })

  it('chaque produit de la page de rayon retient son offre pour le panier (rememberOffer)', async () => {
    const { adapter } = shop(fixture('rayon.html', { url: AISLE_URL, redirected: true }))
    const remembered: string[] = []
    adapter.rememberOffer = (productId) => {
      remembered.push(productId)
      return true
    }

    await adapter.searchProducts('farine')

    expect(remembered).toHaveLength(4)
    expect(remembered[0]).toBe(FARINE)
  })

  it('une page de résultats ordinaire ne porte pas de « landing »', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))
    await adapter.searchProducts('farine')

    expect(adapter.lastSearchFacts()).not.toHaveProperty('landing')
  })

  it('les mêmes garde-fous : un produit à deux offres différentes est écarté, une devise autre qu’EUR n’a pas de prix', async () => {
    const twoOffers = card({ id: SEIGLE, name: 'Produit à deux offres' }).replace(
      '</article>',
      `<button type="button" data-product-id="${SEIGLE}" data-offer-id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee">Autre offre</button></article>`,
    )
    const { adapter } = shop(
      html(
        aislePage(
          card(),
          twoOffers,
          card({ id: MAIS, offer: LOT, currency: 'USD', name: 'Hors euro' }),
        ),
        {
          url: AISLE_URL,
          redirected: true,
        },
      ),
    )

    const candidates = await adapter.searchProducts('sucre')

    expect(candidates.map((candidate) => candidate.id)).toEqual([FARINE, MAIS])
    expect(candidates[1]?.price).toBeNull()
    expect(adapter.lastSearchFacts()).toMatchObject({ landing: 'AISLE', products: 2 })
  })

  it.each([
    [
      'une adresse de rayon, mais le contenu d’une autre page (titre sans « pas cher - Auchan.fr »)',
      auchanFixture('rayon.html').replace('Farines de test pas cher - Auchan.fr', 'Courses'),
      AISLE_URL,
    ],
    [
      'une adresse de rayon, mais le titre d’une recherche',
      auchanFixture('rayon.html').replace(
        'Farines de test pas cher - Auchan.fr',
        'Votre recherche farine sur Auchan.fr',
      ),
      AISLE_URL,
    ],
    [
      'le contenu d’un rayon à une adresse qui n’en est pas un',
      auchanFixture('rayon.html'),
      'https://www.auchan.fr/courses',
    ],
    [
      'le contenu d’un rayon à une adresse sans le segment de rayon',
      auchanFixture('rayon.html'),
      'https://www.auchan.fr/ca-n0000001',
    ],
    [
      'une adresse de rayon d’une autre forme (ca- sans n)',
      auchanFixture('rayon.html'),
      'https://www.auchan.fr/epicerie-de-test/ca-0000001',
    ],
  ])('%s : SEARCH_REDIRECTED, aucun produit lu', async (_name, markup, url) => {
    const { adapter } = shop(html(markup, { url, redirected: true }))

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_REDIRECTED' })
  })

  it('une page de rayon sans aucune carte : SEARCH_UNKNOWN_PAGE (jamais prise pour « aucun produit »)', async () => {
    const { adapter } = shop(
      fixture('rayon-vide.html', {
        url: 'https://www.auchan.fr/epicerie-de-test/vide-de-test/ca-n0000002',
        redirected: true,
      }),
    )

    const error = await failureOf(() => adapter.searchProducts('rayonvide'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_UNKNOWN_PAGE' })
  })

  it('des balises de produit illisibles sur une page de rayon : SEARCH_PRODUCTS_UNREADABLE', async () => {
    const { adapter } = shop(
      html(aisleOf(auchanFixture('recherche-illisible.html')), {
        url: AISLE_URL,
        redirected: true,
      }),
    )

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error.cause).toBe('SEARCH_PRODUCTS_UNREADABLE')
  })

  it('une page « aucun résultat » atteinte par une redirection de rayon n’est pas reconnue comme telle', async () => {
    const { adapter } = shop(
      fixture('recherche-aucun-resultat.html', { url: AISLE_URL, redirected: true }),
    )

    const error = await failureOf(() => adapter.searchProducts('zzqxkw'))

    expect(error.code).toBe('CONTRACT_CHANGED')
  })
})

describe('un terme que le site redirige vers une fiche de produit : aucun produit (NON MESURÉ : le contenu de la fiche n’est pas lu comme des résultats)', () => {
  it('aucun produit, sans erreur, et le fait est consigné', async () => {
    const { adapter } = shop(fixture('fiche-produit.html', { url: PRODUCT_URL, redirected: true }))

    expect(await adapter.searchProducts('fiche')).toEqual([])
    expect(adapter.lastSearchFacts()).toMatchObject({
      outcome: 'EMPTY',
      products: 0,
      redirected: true,
      landing: 'PRODUCT',
      address: '/…/…',
    })
  })

  it('vers une autre page du site : SEARCH_REDIRECTED', async () => {
    const { adapter } = shop(
      fixture('accueil-magasin.html', { url: 'https://www.auchan.fr/courses', redirected: true }),
    )

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_REDIRECTED' })
  })

  it('vers une page de connexion : NOT_LOGGED_IN', async () => {
    const { adapter } = shop(
      html('<html><body>Connexion</body></html>', {
        url: 'https://www.auchan.fr/auth/realms/test/protocol/openid-connect/auth',
        redirected: true,
      }),
    )

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause: 'LOGIN_REDIRECT' })
  })
})

describe('les réponses du site qui ne sont pas une page', () => {
  it.each([
    [404, 'CONTRACT_CHANGED', 'HTTP_404'],
    [400, 'CONTRACT_CHANGED', 'HTTP_400'],
    [401, 'NOT_LOGGED_IN', 'HTTP_401'],
    [500, 'NETWORK', 'HTTP_500'],
  ])('HTTP %i : %s (%s)', async (status, code, cause) => {
    const { adapter } = shop({ status, body: 'x', contentType: 'text/html' })

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code, cause })
  })

  it('un 404 n’est pas un blocage ; un 403 deux fois de suite l’est (BLOCKED), comme chez Leclerc', async () => {
    const { adapter } = shop({ status: 403, body: 'x', contentType: 'text/html' })

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error.code).toBe('BLOCKED')
  })

  it('une page de défi de l’anti-robot : BLOCKED (CHALLENGE), sans reprise', async () => {
    const { site, adapter } = shop(
      html('<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>'),
    )

    const error = await failureOf(() => adapter.searchProducts('farine'))

    expect(error).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })
    expect(site.calls).toHaveLength(1)
  })
})

describe('la page vient du site : une donnée non fiable', () => {
  it('rien de la page ne s’exécute (script, gestionnaire d’évènement) et un libellé HTML reste du texte', async () => {
    const hostile = card({
      name: '<b>Farine</b> <img src=x onerror="window.__pwned=1">',
    }).replace('<article', '<script>window.__pwned = 1</script><article onclick="window.__pwned=2"')
    const { adapter } = shop(page(hostile))

    const [candidate] = await adapter.searchProducts('farine')

    expect(Reflect.get(window, '__pwned')).toBeUndefined()
    expect(candidate?.label).toBe('Marque Test Farine')
  })

  it('un libellé est nettoyé (invisibles, retours à la ligne) et borné à la limite du protocole', async () => {
    const candidate = await oneProduct({ name: `Fa​ri­ne\n${'é'.repeat(400)}`, brand: null })

    expect(candidate?.label.startsWith('Farine é')).toBe(true)
    expect(Array.from(candidate?.label ?? '').length).toBeLessThanOrEqual(255)
    expect(candidate?.label).not.toMatch(/[​­\n]/)
  })

  it.each([
    ['un autre hôte', 'https://evil.example/media/a.jpg'],
    ['http', 'http://cdn.auchan.fr/media/a.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['un autre chemin', 'https://cdn.auchan.fr/autre/a.jpg'],
    ['un identifiant dans l’adresse', 'https://user:pass@cdn.auchan.fr/media/a.jpg'],
    ['un port', 'https://cdn.auchan.fr:8443/media/a.jpg'],
  ])('une photo avec %s : pas de photo (la fiche reste en texte)', async (_name, image) => {
    expect((await oneProduct({ image }))?.imageUrl).toBeNull()
  })

  it('une photo de cdn.auchan.fr/media/ passe', async () => {
    expect((await oneProduct({ image: 'https://cdn.auchan.fr/media/S1G1' }))?.imageUrl).toBe(
      'https://cdn.auchan.fr/media/S1G1',
    )
  })

  it('une page de 600 Ko et 250 produits se lit sans expression régulière sur le HTML, en un temps raisonnable', async () => {
    const cards = Array.from({ length: 250 }, (_, index) => {
      const hex = index.toString(16).padStart(12, '0')
      return card({
        id: `10000000-0000-4000-8000-${hex}`,
        offer: `20000000-0000-4000-8000-${hex}`,
        name: `Produit ${index} ${'x'.repeat(1500)}`,
      })
    })
    const { adapter } = shop(page(...cards))
    const started = Date.now()

    const candidates = await adapter.searchProducts('produit')

    expect(candidates).toHaveLength(250)
    expect(Date.now() - started).toBeLessThan(20_000)
  }, 30_000)
})

describe('l’offre de chaque produit lu est retenue pour le panier (DRV-725 : rememberOffer)', () => {
  it('chaque produit lu est retenu avec son offre et ce que la page donne (types de vendeur et d’offre, vendeur vide non retenu)', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))
    const remembered: [string, unknown][] = []
    adapter.rememberOffer = (productId, offer) => {
      remembered.push([productId, offer])
      return true
    }

    await adapter.searchProducts('farine')

    expect(remembered).toHaveLength(4)
    expect(remembered[0]).toEqual([
      FARINE,
      { offerId: FARINE_OFFER, sellerType: 'GROCERY', offerType: 'DEFAULT' },
    ])
  })

  it('un champ que la page ne donne pas n’est pas retenu (le panier prend alors sa valeur par défaut, jamais une valeur devinée ici)', async () => {
    const { adapter } = shop(page(card({ sellerType: 'x y' })))
    const remembered: unknown[] = []
    adapter.rememberOffer = (_productId, offer) => {
      remembered.push(offer)
      return true
    }

    await adapter.searchProducts('farine')

    expect(remembered).toEqual([{ offerId: FARINE_OFFER, offerType: 'DEFAULT' }])
  })
})

describe('les faits du diagnostic : des formes et des nombres, jamais une valeur du site', () => {
  it('avant toute recherche : rien', () => {
    expect(shop(page()).adapter.lastSearchFacts()).toBeNull()
  })

  it('une recherche réussie : code, type, longueur, noms d’en-têtes, produits lus, une seule forme de requête', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))
    await adapter.searchProducts('farine')

    const facts = adapter.lastSearchFacts()

    expect(facts).toMatchObject({
      variant: 'a',
      status: 200,
      redirected: false,
      address: '/recherche',
      requested: '/recherche',
      mime: 'text/html',
      products: 4,
      outcome: 'PRODUCTS',
      attempts: [{ variant: 'a', status: 200, mime: 'text/html', address: '/recherche' }],
    })
    expect(facts?.length).toBe(auchanFixture('recherche-farine.html').length)
    expect(facts?.headers).toEqual(['content-type'])
  })

  it('une recherche en échec : FAILED, avec son code et sa cause', async () => {
    const { adapter } = shop(fixture('recherche-inconnue.html'))
    await failureOf(() => adapter.searchProducts('inconnu'))

    expect(adapter.lastSearchFacts()).toMatchObject({
      outcome: 'FAILED',
      fault: { code: 'CONTRACT_CHANGED', cause: 'SEARCH_UNKNOWN_PAGE' },
    })
  })

  it('ni le terme cherché, ni un libellé, ni un identifiant de la page ne sortent dans les faits', async () => {
    const { adapter } = shop(fixture('recherche-farine.html'))
    await adapter.searchProducts('un terme très personnel')

    const facts = JSON.stringify(adapter.lastSearchFacts())

    for (const secret of ['personnel', 'Farine', FARINE, FARINE_OFFER, 'Marque'])
      expect(facts).not.toContain(secret)
  })

  it('une page « aucun résultat » : la phrase reconnue (d’une liste fermée) est rapportée, pas le texte de la page', async () => {
    const { adapter } = shop(fixture('recherche-aucun-resultat.html'))
    await adapter.searchProducts('zzqxkw')

    expect(adapter.lastSearchFacts()?.phrases).toEqual(["on n'a rien trouve pour"])
  })

  it('exploreSearchVariants : une seule forme de requête, donc rien à sonder et aucune requête', async () => {
    const { site, adapter } = shop(fixture('recherche-farine.html'))

    expect(await adapter.exploreSearchVariants()).toEqual([])
    expect(site.calls).toEqual([])
  })
})

// —— DRV-739 : une offre n'est une offre du DRIVE que si son vendeur est GROCERY (B-9) ————————————————————————————————————————————

describe('un produit en vente en ligne seulement n’est pas un produit du drive : écarté, sans arrêter l’envoi (DRV-739)', () => {
  const ONLINE = '3f4a5b6c-7d8e-4f90-8a1b-2c3d4e5f6a7b'
  const OFFERS = [
    '4a5b6c7d-8e9f-4a01-8b2c-3d4e5f6a7b8c',
    '6c7d8e9f-a0b1-4c23-8d4e-5f6a7b8c9d0e',
    '8e9fa0b1-c2d3-4e45-8f6a-7b8c9d0e1f20',
  ]
  const DRIVE_OFFER = 'a0b1c2d3-e4f5-4a67-8b8c-9d0e1f2a3b4c'
  const OTHER = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
  const OTHER_OFFER = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80'

  /** Les balises d'une offre, à la forme mesurée : plusieurs éléments par offre, un vendeur et un type d'offre. */
  const tag = (id: string, offer: string, seller: string, element = 'div'): string =>
    `<${element} data-product-id="${id}" data-offer-id="${offer}" data-seller-type="${seller}" data-offer-type="DEFAULT"></${element}>`

  /** Un produit à la forme mesurée du 2026-10-30 : un nom, un prix, des offres (identifiant et vendeur), des boutons SANS offre. */
  function product(id: string, offers: [string, string][], name = 'Thé glacé de test'): string {
    return `<article itemscope itemtype="https://schema.org/Product"><h3 itemprop="name">${name}</h3>
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="1.89"><meta itemprop="priceCurrency" content="EUR"><link itemprop="availability" href="https://schema.org/InStock"></div>
${offers.map(([offer, seller]) => tag(id, offer, seller) + tag(id, offer, seller, 'footer')).join('\n')}
<button type="button" data-product-id="${id}">Ajouter</button></article>`
  }
  const onlineOnly = (): string =>
    product(
      ONLINE,
      OFFERS.map((offer) => [offer, 'ONLINE']),
    )
  const farine = (): string => card()

  it('une page dont le seul produit n’a que des offres ONLINE (trois offres) : aucun produit, sans erreur, et le fait est rapporté', async () => {
    const { adapter } = shop(page(onlineOnly()))

    const candidates = await adapter.searchProducts('ice tea green')

    expect(candidates).toEqual([])
    expect(adapter.lastSearchFacts()).toMatchObject({ outcome: 'EMPTY', products: 0, notDrive: 1 })
    expect(adapter.lastSearchFacts()).not.toHaveProperty('fault')
  })

  it('une page de produits du drive et d’un produit en ligne seulement : les produits du drive, rien d’autre', async () => {
    const { adapter } = shop(page(onlineOnly(), farine()))

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.map((candidate) => candidate.id)).toEqual([FARINE])
    expect(adapter.lastSearchFacts()).toMatchObject({
      outcome: 'PRODUCTS',
      products: 1,
      notDrive: 1,
    })
  })

  it('un produit en ligne ET au drive : les offres ONLINE sont ignorées avant de compter, le produit est lu avec l’offre du drive', async () => {
    const mixed = product(OTHER, [
      [OFFERS[0] ?? '', 'ONLINE'],
      [OTHER_OFFER, 'GROCERY'],
      [OFFERS[1] ?? '', 'ONLINE'],
    ])
    const { adapter } = shop(page(mixed))
    const remembered: [string, unknown][] = []
    adapter.rememberOffer = (productId, offer) => {
      remembered.push([productId, offer])
      return true
    }

    const [candidate] = await adapter.searchProducts('the')

    expect(candidate).toMatchObject({ id: OTHER, offerId: OTHER_OFFER })
    expect(remembered).toEqual([
      [OTHER, { offerId: OTHER_OFFER, sellerType: 'GROCERY', offerType: 'DEFAULT' }],
    ])
  })

  it('un produit qui a PLUSIEURS offres du drive différentes reste ambigu : illisible, jamais deviné', async () => {
    const { adapter } = shop(
      page(
        product(OTHER, [
          [OTHER_OFFER, 'GROCERY'],
          [DRIVE_OFFER, 'GROCERY'],
          [OFFERS[0] ?? '', 'ONLINE'],
        ]),
        farine(),
      ),
    )

    const candidates = await adapter.searchProducts('x')

    expect(candidates.map((candidate) => candidate.id)).toEqual([FARINE])
    expect(adapter.lastSearchFacts()).toMatchObject({ outcome: 'PRODUCTS', products: 1 })
    expect(adapter.lastSearchFacts()).not.toHaveProperty('notDrive')
  })

  it('une page dont le seul produit a plusieurs offres du drive : CONTRACT_CHANGED (SEARCH_PRODUCTS_UNREADABLE), on ne sait pas laquelle ajouter', async () => {
    const ambiguous = product(OTHER, [
      [OTHER_OFFER, 'GROCERY'],
      [DRIVE_OFFER, 'GROCERY'],
    ])
    const { adapter } = shop(page(ambiguous))

    const error = await failureOf(() => adapter.searchProducts('x'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_PRODUCTS_UNREADABLE' })
  })

  it('un produit du drive illisible à côté d’un produit en ligne seulement : CONTRACT_CHANGED, une vraie rupture du contrat', async () => {
    const { adapter } = shop(page(onlineOnly(), card({ name: '' })))

    const error = await failureOf(() => adapter.searchProducts('x'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_PRODUCTS_UNREADABLE' })
  })

  it('un produit sans aucune offre (balises sans identifiant d’offre) reste illisible, pas « hors drive »', async () => {
    const { adapter } = shop(fixture('recherche-sans-offre.html'))

    const error = await failureOf(() => adapter.searchProducts('sansoffre'))

    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_PRODUCTS_UNREADABLE' })
  })

  it('un vendeur dont le code est illisible (mal formé) n’est pas écarté : l’offre est comptée comme avant', async () => {
    const { adapter } = shop(page(card({ sellerType: 'x y' })))

    const [candidate] = await adapter.searchProducts('farine')

    expect(candidate).toMatchObject({ id: FARINE, stock: 0 })
  })

  it('un autre vendeur connu (MARKETPLACE) est écarté comme ONLINE : seul GROCERY est le drive', async () => {
    const { adapter } = shop(page(card({ sellerType: 'MARKETPLACE' })))

    expect(await adapter.searchProducts('farine')).toEqual([])
    expect(adapter.lastSearchFacts()).toMatchObject({ outcome: 'EMPTY', notDrive: 1 })
  })

  it('readProductFromSearch applique la même règle : un produit en ligne seulement est « introuvable » (null), pas une rupture', async () => {
    const { adapter } = shop(page(onlineOnly()))

    expect(await adapter.readProductFromSearch('ice tea', ONLINE)).toBeNull()
  })

  it('les pages du faux site (fixtures) : « en ligne » est sans produit, « mixte » ne rend que le produit du drive avec son offre', async () => {
    const online = shop(fixture('recherche-en-ligne.html'))
    const mixed = shop(fixture('recherche-mixte.html'))

    expect(await online.adapter.searchProducts('enligne')).toEqual([])
    const candidates = await mixed.adapter.searchProducts('mixte')

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ id: FARINE, offerId: FARINE_OFFER })
    expect(mixed.adapter.lastSearchFacts()).toMatchObject({ products: 1, notDrive: 1 })
  })

  it('les faits rapportent un nombre, jamais un identifiant ni un libellé du produit écarté', async () => {
    const { adapter } = shop(page(onlineOnly()))
    await adapter.searchProducts('ice tea green')

    const facts = JSON.stringify(adapter.lastSearchFacts())

    for (const secret of [ONLINE, ...OFFERS, 'Thé glacé', 'ice tea'])
      expect(facts).not.toContain(secret)
  })
})

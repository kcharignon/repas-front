// L'adaptateur Leclerc de bout en bout (DRV-303), sur les fixtures inventées : faux `fetch`, fausse horloge, aucun appel réseau.
import { describe, expect, it, vi } from 'vitest'

import { browserDeps, LeclercAdapter, LeclercError } from '../src/leclerc'
import { cartPayload } from '../src/leclerc/cart'
import { fakeSite, fixture, PAGE, type Scripted } from './leclerc-helpers'

const SEARCH = '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=farine'
const CART = '/magasin-000123-000123/panier.aspx?op=1'

/** Un faux site qui sert la page de recherche aux GET et la réponse donnée aux POST du panier. */
function shop(
  cart: Scripted = { body: fixture('panier-ajout.json') },
  search: Scripted = { body: fixture('recherche-farine.html') },
) {
  const site = fakeSite((call) => (call.init.method === 'POST' ? cart : search))
  return { site, adapter: new LeclercAdapter(site.deps) }
}

describe('readStore', () => {
  it('lit le magasin de la page : identifiant, hôte, adresse de base sans ville', () => {
    const { adapter } = shop()

    expect(adapter.readStore()).toEqual({
      id: '000123',
      host: PAGE.hostname,
      baseUrl: `https://${PAGE.hostname}/magasin-000123-000123`,
      label: null,
    })
  })

  it('porte le libellé que la page donne', () => {
    const site = fakeSite(() => ({}), { readLabel: () => 'Drive de test' })

    expect(new LeclercAdapter(site.deps).readStore().label).toBe('Drive de test')
  })

  it.each([
    [
      'hors de leclercdrive.fr',
      { hostname: 'courses-test.exemple.invalid', pathname: '/magasin-1-1/x' },
    ],
    ['sans magasin', { hostname: PAGE.hostname, pathname: '/accueil' }],
  ])('refuse une page %s : UNSUPPORTED_PAGE, sans rien envoyer', async (_name, location) => {
    const site = fakeSite(() => ({}), { location })
    const adapter = new LeclercAdapter(site.deps)

    expect(() => adapter.readStore()).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_PAGE' }))
    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE' }),
    )
    await expect(adapter.setCartQuantity('1', 1)).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE' }),
    )
    expect(site.calls).toEqual([])
  })
})

describe('pageCartTotal', () => {
  it('rend le total du panier porté par la page de la dernière recherche, null sinon', async () => {
    const withTotal = `${fixture('recherche-farine.html')}<script>var cart = {"sTotalAPayer":"7,25 €"}</script>`
    const { adapter } = shop(undefined, { body: withTotal })
    expect(adapter.pageCartTotal()).toBeNull()

    await adapter.searchProducts('farine')

    expect(adapter.pageCartTotal()).toBe(725)
    const plain = shop()
    await plain.adapter.searchProducts('farine')
    expect(plain.adapter.pageCartTotal()).toBeNull()
  })
})

describe('searchProducts', () => {
  it('cherche sur l’hôte courant avec la session du navigateur, et rend les 5 candidats attendus', async () => {
    // Given
    const { site, adapter } = shop()

    // When
    const candidates = await adapter.searchProducts('farine')

    // Then : une seule requête, un GET de même origine
    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe(SEARCH)
    expect(site.calls[0]?.init).toMatchObject({ method: 'GET', credentials: 'same-origin' })
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      '1000001',
      '1000002',
      '1000003',
      '1000004',
      '1000005',
    ])
    expect(candidates[0]).toEqual({
      id: '1000001',
      label: 'Farine de blé T55 Moulin Imaginaire',
      label2: '1 kg',
      price: 129,
      pricePerMeasure: { cents: 129, unit: 'kg' },
      promo: null,
      stock: 12,
      inCart: 0,
      thumbnailUrl: 'https://photos-test.leclercdrive.fr/image.ashx?id=11&use=l&cat=p',
      content: { value: 1000, unit: 'g' },
      contentSource: 'label',
    })
  })

  it('lit le stock (un produit indisponible), la promotion, la quantité au panier et le contenu de chaque produit', async () => {
    const { adapter } = shop()

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.map((candidate) => candidate.stock)).toEqual([12, 0, 5, 3, 8])
    expect(candidates[2]).toMatchObject({
      promo: 249,
      price: 280,
      inCart: 2,
      content: { value: 1000, unit: 'g' },
    })
    expect(candidates[3]).toMatchObject({
      price: 199,
      pricePerMeasure: { cents: 398, unit: 'kg' },
      content: { value: 500, unit: 'g' },
    })
    expect(candidates[4]).toMatchObject({
      label2: null,
      content: { value: 1000, unit: 'g' },
      contentSource: 'structured',
    })
  })

  it('encode la requête (accents, espaces) et ignore une requête vide sans rien envoyer', async () => {
    const { site, adapter } = shop()

    await adapter.searchProducts('  crème fraîche ')
    await expect(adapter.searchProducts('   ')).resolves.toEqual([])

    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toContain('TexteRecherche=cr%C3%A8me%20fra%C3%AEche')
  })

  it('rend une liste vide pour une page « aucun résultat »', async () => {
    const { adapter } = shop(undefined, { body: fixture('recherche-vide.html') })

    await expect(adapter.searchProducts('xyz')).resolves.toEqual([])
  })

  it('lève CONTRACT_CHANGED sur une page 200 dont le format a changé', async () => {
    const { adapter } = shop(undefined, { body: fixture('recherche-changee.html') })

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED' }),
    )
  })

  it('lève BLOCKED à la deuxième réponse 403 de suite, après une reprise', async () => {
    const { site, adapter } = shop(undefined, { status: 403, body: 'refusé' })

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED' }),
    )

    expect(site.calls).toHaveLength(2)
    await expect(adapter.searchProducts('sucre')).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED' }),
    )
    expect(site.calls).toHaveLength(2)
  })

  it.each([
    ['un 401', { status: 401, body: 'non' }, 'NOT_LOGGED_IN'],
    [
      'une redirection vers la connexion',
      {
        status: 200,
        body: '<html>Connexion</html>',
        redirected: true,
        url: `https://${PAGE.hostname}/connexion.aspx?retour=1`,
      },
      'NOT_LOGGED_IN',
    ],
    [
      'un 404 (pas un blocage)',
      { status: 404, body: fixture('erreur-404.html') },
      'CONTRACT_CHANGED',
    ],
    ['un 400', { status: 400, body: 'x' }, 'CONTRACT_CHANGED'],
    ['un 500', { status: 500, body: 'x' }, 'NETWORK'],
  ] as const)('classe %s en %s', async (_name, reply, code) => {
    const { adapter } = shop(undefined, reply)

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code }),
    )
  })

  it('lève NETWORK après la reprise sur erreur réseau', async () => {
    const site = fakeSite(() => new Error('réseau coupé'))

    await expect(new LeclercAdapter(site.deps).searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'NETWORK' }),
    )
    expect(site.calls).toHaveLength(2)
  })

  it('ne garde pas une vignette qui n’est pas une adresse https ou un chemin du site', async () => {
    const page =
      '<script>[{"iIdProduit":1,"sLibelleLigne1":"A","sUrlVignetteProduit":"javascript:alert(1)"},{"iIdProduit":2,"sLibelleLigne1":"B","sUrlVignetteProduit":"/images/b.jpg"}]</script>'
    const { adapter } = shop(undefined, { body: page })

    const candidates = await adapter.searchProducts('farine')

    expect(candidates.map((candidate) => candidate.thumbnailUrl)).toEqual([null, '/images/b.jpg'])
  })
})

describe('setCartQuantity', () => {
  it('envoie le corps attendu : champ d, quantité absolue, magasin, contexte de la dernière recherche', async () => {
    // Given : une recherche, puis une écriture
    const { site, adapter } = shop()
    await adapter.searchProducts('farine')

    // When
    const result = await adapter.setCartQuantity('1000001', 3)

    // Then
    const call = site.calls[1]
    expect(call?.url).toBe(CART)
    expect(call?.init.method).toBe('POST')
    expect(call?.init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      zcwb: 'ajax-manager',
    })
    expect(call?.init.body).toBe(
      `d=${encodeURIComponent(cartPayload({ productId: '1000001', quantity: 3, deliveryPoint: '555123', searchText: 'farine' }))}`,
    )
    expect(result).toEqual({
      productId: '1000001',
      requested: 3,
      sent: 3,
      obtained: 3,
      ok: true,
      items: 5,
      totalCents: 947,
      status: 200,
    })
  })

  it('rend le code HTTP de la réponse et le total du panier, pour le rapport du test automatique', async () => {
    const { adapter } = shop({ status: 200, body: fixture('panier-retrait.json') })

    const result = await adapter.setCartQuantity('1000001', 0)

    expect(result).toMatchObject({ status: 200, obtained: 0, items: 0, totalCents: 0 })
  })

  it('garde le code HTTP dans l’erreur d’une réponse inattendue, sans rien d’autre', async () => {
    const { adapter } = shop({ status: 404, body: 'introuvable' })

    const error = await adapter.setCartQuantity('1000001', 1).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LeclercError)
    expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', status: 404 })
    expect((error as LeclercError).message).not.toContain('404')
  })

  it('garde le code HTTP d’un blocage', async () => {
    const { adapter } = shop({ status: 429, body: 'refusé' })

    await expect(adapter.setCartQuantity('1000001', 1)).rejects.toMatchObject({
      code: 'BLOCKED',
      status: 429,
    })
  })

  it('n’adresse le panier qu’à l’adresse sans suffixe de ville, sur l’hôte de la page', async () => {
    const { site, adapter } = shop()

    await adapter.setCartQuantity('1000001', 1)

    expect(site.calls[0]?.url).toBe(CART)
    expect(site.calls[0]?.url).not.toContain('Ville-Test')
    expect(
      JSON.parse(String(new URLSearchParams(String(site.calls[0]?.init.body)).get('d'))),
    ).toMatchObject({
      sNoPointLivraison: '555123',
      objContexteProvenanceArticle: { sTexteRecherche: '' },
    })
  })

  it('retire le produit avec l’action 2 et la quantité 0', async () => {
    const { site, adapter } = shop({ body: fixture('panier-retrait.json') })

    const result = await adapter.setCartQuantity('1000001', 0)

    expect(
      JSON.parse(String(new URLSearchParams(String(site.calls[0]?.init.body)).get('d'))),
    ).toEqual({
      eTypeAction: 2,
      iIdProduit: '1000001',
      iQuantite: 0,
      sNoPointLivraison: '555123',
    })
    expect(result).toMatchObject({ sent: 0, obtained: 0, ok: true })
  })

  it('plafonne la quantité à 99 et au stock connu, mais pas quand le stock connu est nul', async () => {
    const { site, adapter } = shop()
    await adapter.searchProducts('farine')
    const sentOf = (index: number) =>
      (
        JSON.parse(String(new URLSearchParams(String(site.calls[index]?.init.body)).get('d'))) as {
          iQuantite: number
        }
      ).iQuantite

    const capped = await adapter.setCartQuantity('1000001', 40)
    await adapter.setCartQuantity('1000002', 2)
    await adapter.setCartQuantity('9999999', 500)

    expect(capped).toMatchObject({ requested: 40, sent: 12, ok: false })
    expect([sentOf(1), sentOf(2), sentOf(3)]).toEqual([12, 2, 99])
  })

  it('dit que la quantité n’est pas celle demandée quand le site en garde une autre', async () => {
    const { adapter } = shop()

    const result = await adapter.setCartQuantity('1000001', 2)

    expect(result).toMatchObject({ sent: 2, obtained: 3, ok: false })
  })

  it('lit le point de livraison dans la page une seule fois', async () => {
    const pageText = vi.fn<() => string>(() => '{"sNoPointLivraison":"555123"}')
    const site = fakeSite(() => ({ body: fixture('panier-ajout.json') }), { pageText })
    const adapter = new LeclercAdapter(site.deps)

    await adapter.setCartQuantity('1000001', 1)
    await adapter.setCartQuantity('1000001', 2)

    expect(pageText).toHaveBeenCalledOnce()
  })

  it.each([
    ['un 401', { status: 401, body: 'non' }, 'NOT_LOGGED_IN'],
    [
      'une réponse de connexion',
      { body: 'x', redirected: true, url: `https://${PAGE.hostname}/identification.aspx` },
      'NOT_LOGGED_IN',
    ],
    ['un 403 de suite', { status: 403, body: 'refusé' }, 'BLOCKED'],
    ['un 429 de suite', { status: 429, body: 'refusé' }, 'BLOCKED'],
    ['une page de défi', { status: 200, body: fixture('defi.html') }, 'BLOCKED'],
    [
      'un 404 : requête mal formée, pas un blocage',
      { status: 404, body: fixture('erreur-404.html') },
      'CONTRACT_CHANGED',
    ],
    [
      'une réponse sans évènement panier',
      { body: fixture('panier-invalide.json') },
      'CONTRACT_CHANGED',
    ],
    ['une réponse qui n’est pas du JSON', { body: '<html>Page</html>' }, 'CONTRACT_CHANGED'],
    ['un 500', { status: 500, body: 'x' }, 'NETWORK'],
  ] as const)('classe %s en %s', async (_name, reply, code) => {
    const { adapter } = shop(reply)

    await expect(adapter.setCartQuantity('1000001', 1)).rejects.toThrow(
      expect.objectContaining({ code }),
    )
  })

  it.each([
    ['un identifiant vide', '', 1],
    ['un identifiant non numérique', 'abc', 1],
    ['une quantité négative', '1000001', -1],
    ['une quantité décimale', '1000001', 1.5],
  ])('refuse %s sans rien envoyer', async (_name, productId, quantity) => {
    const { site, adapter } = shop()

    await expect(adapter.setCartQuantity(productId, quantity)).rejects.toThrow(RangeError)

    expect(site.calls).toEqual([])
  })
})

describe('readProductFromSearch', () => {
  it('rend le produit voulu parmi les résultats, ou null', async () => {
    const { adapter } = shop()

    await expect(adapter.readProductFromSearch('farine', '1000002')).resolves.toMatchObject({
      id: '1000002',
      stock: 0,
    })
    await expect(adapter.readProductFromSearch('farine', '42')).resolves.toBeNull()
  })
})

describe('la file et la cadence de l’adaptateur', () => {
  it('sérialise une recherche et une écriture lancées en même temps, à la cadence du chantier', async () => {
    // Given
    const { site, adapter } = shop()

    // When
    await Promise.all([
      adapter.searchProducts('farine'),
      adapter.setCartQuantity('1000001', 1),
      adapter.searchProducts('sucre'),
    ])

    // Then
    expect(site.maxInFlight()).toBe(1)
    expect(site.calls).toHaveLength(3)
    expect(site.sleeps).toEqual([800, 800])
  })

  it('n’envoie jamais une requête ailleurs que sur l’hôte de la page', async () => {
    const { site, adapter } = shop()

    await adapter.searchProducts('farine')
    await adapter.setCartQuantity('1000001', 1)

    expect(
      site.calls.every((call) => call.url.startsWith('/magasin-') && !call.url.startsWith('//')),
    ).toBe(true)
  })

  it('ne met dans l’erreur ni cookie ni contenu de page', async () => {
    const { adapter } = shop({ status: 403, body: 'Set-Cookie: datadome=SECRET; contenu privé' })

    const failure = await adapter.setCartQuantity('1000001', 1).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LeclercError)
    expect(String((failure as Error).message)).not.toMatch(/SECRET|datadome|privé/i)
  })
})

const NAV = '<nav><a href="/accueil">Accueil</a> <a href="/panier">Panier</a></nav>'
const VISITOR_NAV =
  '<nav><a href="/connexion">Se connecter</a> <a href="/inscription">Créer un compte</a></nav>'
const MEMBER_NAV =
  '<nav><a href="/compte">Mon compte</a> <a href="/sortie">Se déconnecter</a></nav>'
/** La page de recherche inventée, avec l'en-tête d'un visiteur ou d'un client connecté. */
const farineWith = (nav: string) => fixture('recherche-farine.html').replace(NAV, nav)

describe('la cause de chaque erreur de l’adaptateur (ticket A)', () => {
  it.each([
    ['un 404', { status: 404, body: fixture('erreur-404.html') }, 'CONTRACT_CHANGED', 'HTTP_404'],
    ['un 400', { status: 400, body: 'x' }, 'CONTRACT_CHANGED', 'HTTP_400'],
    ['un 401', { status: 401, body: 'non' }, 'NOT_LOGGED_IN', 'HTTP_401'],
    [
      'une redirection vers la connexion',
      { body: 'x', redirected: true, url: `https://${PAGE.hostname}/connexion.aspx?retour=1` },
      'NOT_LOGGED_IN',
      'LOGIN_REDIRECT',
    ],
    [
      'une page de connexion servie en 200',
      { body: fixture('connexion.html') },
      'NOT_LOGGED_IN',
      'LOGIN_FORM',
    ],
    [
      'une page dont le format a changé',
      { body: fixture('recherche-changee.html') },
      'CONTRACT_CHANGED',
      'SEARCH_NO_STATE',
    ],
    [
      'des produits aux champs renommés',
      { body: fixture('recherche-liste-illisible.html') },
      'CONTRACT_CHANGED',
      'SEARCH_PRODUCTS_UNREADABLE',
    ],
    [
      'une page d’erreur après redirection',
      {
        body: fixture('erreur-404.html'),
        redirected: true,
        url: `https://${PAGE.hostname}/Erreur.aspx`,
      },
      'CONTRACT_CHANGED',
      'SEARCH_REDIRECTED',
    ],
  ] as const)('recherche, %s : %s, cause %s', async (_name, scripted, code, cause) => {
    const { adapter } = shop(undefined, scripted)

    const error = await adapter.searchProducts('farine').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LeclercError)
    expect(error).toMatchObject({ code, cause })
  })

  it.each([
    ['un 404', { status: 404, body: 'introuvable' }, 'CONTRACT_CHANGED', 'HTTP_404', 404],
    ['un 401', { status: 401, body: 'non' }, 'NOT_LOGGED_IN', 'HTTP_401', 401],
    [
      'une réponse qui n’est pas du JSON',
      { body: '<html>Page</html>' },
      'CONTRACT_CHANGED',
      'CART_NOT_JSON',
      200,
    ],
    [
      'une réponse sans évènement panier',
      { body: fixture('panier-invalide.json') },
      'CONTRACT_CHANGED',
      'CART_NO_CART_EVENT',
      200,
    ],
    [
      'une page de connexion à la place de la réponse',
      { body: fixture('connexion.html') },
      'NOT_LOGGED_IN',
      'LOGIN_FORM',
      200,
    ],
  ] as const)(
    'panier, %s : %s, cause %s, HTTP %d',
    async (_name, scripted, code, cause, status) => {
      const { adapter } = shop(scripted)

      const error = await adapter.setCartQuantity('1000001', 1).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(LeclercError)
      expect(error).toMatchObject({ code, cause, status })
    },
  )

  it.each([
    [
      'hors de leclercdrive.fr',
      { hostname: 'courses-test.exemple.invalid', pathname: '/magasin-1-1/x' },
      'PAGE_HOST',
    ],
    ['sans magasin', { hostname: PAGE.hostname, pathname: '/accueil' }, 'PAGE_PATH'],
  ])('une page %s : UNSUPPORTED_PAGE, cause %s', (_name, location, cause) => {
    const site = fakeSite(() => ({}), { location })

    expect(() => new LeclercAdapter(site.deps).readStore()).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause }),
    )
  })

  it('le message de l’erreur reste un texte fixe : la cause est un code, jamais un morceau de page', async () => {
    const { adapter } = shop(undefined, { body: '<p>cookie=SECRET magasin-654321</p>' })

    const error = (await adapter
      .searchProducts('farine')
      .catch((caught: unknown) => caught)) as LeclercError

    expect(error.cause).toBe('SEARCH_NO_STATE')
    expect(error.message).toBe('Le site ne répond plus comme prévu.')
    expect(JSON.stringify([error.cause, error.message])).not.toMatch(/SECRET|654321/)
  })
})

describe('une page « aucun résultat » n’arrête pas le passage (ticket C)', () => {
  it.each([
    'recherche-vide.html',
    'recherche-vide-sans-liste.html',
    'recherche-vide-encodee.html',
    'recherche-vide-panier-garni.html',
  ])('%s : aucun produit, sans erreur, et la recherche suivante est possible', async (name) => {
    const site = fakeSite((call) => ({
      body: call.url.includes('xyz') ? fixture(name) : fixture('recherche-farine.html'),
    }))
    const adapter = new LeclercAdapter(site.deps)

    await expect(adapter.searchProducts('xyz')).resolves.toEqual([])
    await expect(adapter.searchProducts('farine')).resolves.toHaveLength(5)
    await expect(adapter.readProductFromSearch('xyz', '1000001')).resolves.toBeNull()
  })

  it('lit quand même le total du panier porté par une page « aucun résultat »', async () => {
    const site = fakeSite(() => ({ body: fixture('recherche-vide-panier-garni.html') }))
    const adapter = new LeclercAdapter(site.deps)

    await adapter.searchProducts('xyz')

    expect(adapter.pageCartTotal()).toBe(947)
  })
})

describe('le visiteur non connecté (ticket G)', () => {
  it('readSession lit la page courante, sans aucune requête', () => {
    const site = fakeSite(() => ({}), { pageText: () => farineWith(VISITOR_NAV) })
    const adapter = new LeclercAdapter(site.deps)

    expect(adapter.readSession()).toMatchObject({
      state: 'VISITOR',
      signs: ['LOGIN_LINK', 'REGISTER_LINK'],
    })
    expect(site.calls).toEqual([])
  })

  it.each([
    ['d’un client connecté', farineWith(MEMBER_NAV), 'MEMBER'],
    ['sans aucun signe', fixture('recherche-farine.html'), 'UNKNOWN'],
  ])('readSession : page %s, état %s', (_name, text, state) => {
    const site = fakeSite(() => ({}), { pageText: () => text })

    expect(new LeclercAdapter(site.deps).readSession().state).toBe(state)
  })

  it('une recherche qui revient avec la page d’un visiteur lève NOT_LOGGED_IN, même si elle porte des produits', async () => {
    const { adapter } = shop(undefined, { body: farineWith(VISITOR_NAV) })

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_LOGGED_IN', cause: 'SESSION_VISITOR', status: 200 }),
    )
  })

  it('la page d’un client connecté, ou sans aucun signe, passe', async () => {
    const member = shop(undefined, { body: farineWith(MEMBER_NAV) })

    await expect(member.adapter.searchProducts('farine')).resolves.toHaveLength(5)
    await expect(shop().adapter.searchProducts('farine')).resolves.toHaveLength(5)
  })

  it('un visiteur détecté en cours de passage : la recherche suivante lève NOT_LOGGED_IN, sans écriture de plus', async () => {
    let searches = 0
    const site = fakeSite((call) => {
      if (call.init.method === 'POST') return { body: fixture('panier-ajout.json') }
      searches += 1
      return { body: farineWith(searches === 1 ? MEMBER_NAV : VISITOR_NAV) }
    })
    const adapter = new LeclercAdapter(site.deps)

    await adapter.searchProducts('farine')
    await adapter.setCartQuantity('1000001', 1)
    await expect(adapter.searchProducts('sucre')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_LOGGED_IN', cause: 'SESSION_VISITOR' }),
    )

    expect(site.calls.map((call) => call.init.method)).toEqual(['GET', 'POST', 'GET'])
  })
})

describe('browserDeps', () => {
  it('branche la page, son fetch et l’horloge réelle', async () => {
    // Given : une fenêtre factice
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve({} as Response))
    document.body.innerHTML =
      '<script>var page = {"sNoPointLivraison":"555123"}</script><div data-c="{&quot;sNoPointLivraison&quot;:&quot;777888&quot;}"></div>'
    const win = {
      fetch: fetchSpy,
      location: { hostname: PAGE.hostname, pathname: PAGE.pathname },
      document,
      XMLSerializer,
      setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    } as unknown as Window & typeof globalThis

    // When
    const deps = browserDeps(win)
    await deps.fetch('/x', { method: 'GET' })
    await deps.sleep(0)

    // Then
    expect(fetchSpy).toHaveBeenCalledWith('/x', { method: 'GET' })
    expect(deps.pageText()).toContain('sNoPointLivraison')
    expect(deps.location.hostname).toBe(PAGE.hostname)
    expect(deps.random()).toBeGreaterThanOrEqual(0)
    expect(deps.now()).toBeGreaterThan(0)
  })
})

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

// @vitest-environment node
// Ce que l'adaptateur retient de la page d'arrivée et des réponses de recherche pour le diagnostic (ticket B de l'audit du 2026-10-18) : des formes,
// des noms et des nombres, jamais une valeur du site. Faux `fetch`, aucun réseau.
import { describe, expect, it } from 'vitest'

import { LeclercAdapter } from '../src/leclerc'
import { fakeSite, fixture, PAGE, type Call, type Scripted } from './leclerc-helpers'

const GOOD: Scripted = {
  body: fixture('recherche-farine.html'),
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'DENY',
    'Set-Cookie': 'sid=SECRET',
  },
}
const EMPTY: Scripted = { body: fixture('recherche-vide.html') }

function shop(reply: (call: Call) => Scripted, overrides: Parameters<typeof fakeSite>[1] = {}) {
  const site = fakeSite(reply, overrides)
  return { site, adapter: new LeclercAdapter(site.deps) }
}

describe('readArrival : la page d’arrivée, sans aucune requête', () => {
  it('le motif de l’adresse, les redirections et le code HTTP du navigateur, le point de livraison de la page', () => {
    const { adapter, site } = shop(() => GOOD, {
      navigation: () => ({ redirects: 1, status: 200 }),
    })

    expect(adapter.readArrival()).toEqual({
      address: '/magasin-N-N-V/recherche.aspx',
      redirects: 1,
      status: 200,
      delivery: { read: true, sameAsAddress: false },
      cookies: null,
      searchBase: null,
      entry: {
        start: { present: false, shape: null, where: null },
        clickable: false,
      },
    })
    expect(site.calls).toEqual([])
  })

  it('le chemin avec la ville tiré de la page, en motif : le formulaire de recherche, ou à défaut un lien', () => {
    const form = shop(() => GOOD, {
      location: { hostname: PAGE.hostname, pathname: '/magasin-000123-000123/' },
      pageText: () => '<form action="/magasin-000123-000123-Ville-Test/recherche.aspx"></form>',
    })
    const link = shop(() => GOOD, {
      location: { hostname: PAGE.hostname, pathname: '/magasin-000123-000123/' },
      pageText: () => '<a href="/magasin-000123-000123-Ville-Test/x">x</a>',
    })

    expect(form.adapter.readArrival().searchBase).toEqual({
      shape: '/magasin-N-N-V',
      source: 'FORM',
    })
    expect(link.adapter.readArrival().searchBase).toEqual({
      shape: '/magasin-N-N-V',
      source: 'LINK',
    })
  })

  it('les cookies lisibles par la page : un nombre et un oui/non, jamais une valeur', () => {
    const { adapter } = shop(() => GOOD, { cookies: () => ({ count: 3, antiBot: true }) })

    expect(adapter.readArrival().cookies).toEqual({ count: 3, antiBot: true })
  })

  it('le navigateur qui ne dit rien : null', () => {
    const { adapter } = shop(() => GOOD)

    expect(adapter.readArrival()).toMatchObject({ redirects: null, status: null })
  })

  it('une mesure qui lance une erreur : null, sans rien casser', () => {
    const { adapter } = shop(() => GOOD, {
      navigation: () => {
        throw new Error('interdit')
      },
    })

    expect(adapter.readArrival()).toMatchObject({ redirects: null, status: null })
  })

  it('hors d’un magasin : l’adresse est un motif simple, et rien à comparer pour le point de livraison', () => {
    const { adapter } = shop(() => GOOD, {
      location: { hostname: PAGE.hostname, pathname: '/' },
    })

    expect(adapter.readArrival()).toMatchObject({
      address: '/',
      delivery: { read: true, sameAsAddress: null },
    })
  })
})

describe('lastSearchFacts : ce que la dernière recherche a laissé voir', () => {
  it('rien avant la première recherche', () => {
    expect(shop(() => GOOD).adapter.lastSearchFacts()).toBeNull()
  })

  it('une recherche qui rend des produits : code, type, longueur, noms d’en-têtes (sans le cookie), clés connues, point de livraison', async () => {
    const { adapter } = shop(() => GOOD)

    await adapter.searchProducts('farine')
    const facts = adapter.lastSearchFacts()

    expect(facts).toMatchObject({
      variant: 'a',
      status: 200,
      redirected: false,
      address: '/magasin-N-N-V/recherche.aspx',
      requested: '/magasin-N-N-V/recherche.aspx',
      mime: 'text/html',
      products: 5,
      outcome: 'PRODUCTS',
      delivery: { read: true, sameAsAddress: false },
    })
    expect(facts?.length).toBe(fixture('recherche-farine.html').length)
    expect(facts?.headers).toEqual(['content-type', 'x-frame-options'])
    expect(facts?.keys?.present).toEqual(
      expect.arrayContaining(['iIdProduit', 'sNoPointLivraison']),
    )
  })

  it('une page sans résultat reconnue : EMPTY, zéro produit', async () => {
    const { adapter } = shop(() => EMPTY)

    await adapter.searchProducts('zzqxkw')

    expect(adapter.lastSearchFacts()).toMatchObject({ outcome: 'EMPTY', products: 0, status: 200 })
  })

  it('une erreur de l’adaptateur : FAILED, avec son code et sa cause, et ce que la réponse était', async () => {
    const { adapter } = shop(() => ({
      status: 400,
      body: '<h1>Bad Request</h1><p>Request Header Or Cookie Too Large</p>',
      headers: { 'Content-Type': 'text/html' },
    }))

    await expect(adapter.searchProducts('sel')).rejects.toBeInstanceOf(Error)
    const facts = adapter.lastSearchFacts()

    expect(facts).toMatchObject({
      status: 400,
      mime: 'text/html',
      outcome: 'FAILED',
      fault: { code: 'CONTRACT_CHANGED', cause: 'HTTP_400' },
    })
    expect(facts?.phrases).toEqual(['bad request', 'request header', 'too large'])
  })

  it('un refus 403 ou une page de défi n’a pas de faits : la cadence l’a écartée, l’erreur BLOCKED porte le code', async () => {
    const { adapter } = shop(() => ({ status: 200, body: fixture('defi.html') }))

    await expect(adapter.searchProducts('sel')).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED' }),
    )

    expect(adapter.lastSearchFacts()).toBeNull()
  })

  it('une réponse qui vient d’une redirection : le motif de l’adresse finale et celui de l’adresse demandée', async () => {
    const { adapter } = shop(() => ({
      body: fixture('connexion.html'),
      url: `https://${PAGE.hostname}/connexion.aspx`,
      redirected: true,
    }))

    await expect(adapter.searchProducts('sel')).rejects.toBeInstanceOf(Error)

    expect(adapter.lastSearchFacts()).toMatchObject({
      redirected: true,
      address: '/connexion.aspx',
      requested: '/magasin-N-N-V/recherche.aspx',
    })
  })

  it('une recherche sans réponse (réseau coupé) efface les faits de la précédente', async () => {
    let down = false
    const { adapter } = shop(() => (down ? new Error('réseau coupé') : GOOD))
    await adapter.searchProducts('farine')
    expect(adapter.lastSearchFacts()).not.toBeNull()

    down = true
    await expect(adapter.searchProducts('sucre')).rejects.toBeInstanceOf(Error)

    expect(adapter.lastSearchFacts()).toBeNull()
  })
})

describe('exploreSearchVariants : sonder les variantes qui n’ont pas été essayées', () => {
  it('essaie e1, f, h et c quand a a échoué et b a passé, une requête à la fois, et complète les tentatives (e2 redonne la requête de a : pas rejouée)', async () => {
    const { adapter, site } = shop((call) =>
      call.init.headers === undefined ? GOOD : { status: 400 },
    )
    await adapter.searchProducts('sel')
    expect(site.calls).toHaveLength(2)

    const attempts = await adapter.exploreSearchVariants('sel')

    expect(attempts.map((attempt) => [attempt.variant, attempt.status])).toEqual([
      ['a', 400],
      ['b', 200],
      ['e1', 400],
      ['f', 400],
      ['h', 400],
      ['c', 400],
    ])
    expect(adapter.lastSearchFacts()?.attempts).toEqual(attempts)
    expect(site.calls).toHaveLength(6)
    expect(site.maxInFlight()).toBe(1)
    expect(
      site.calls.every((call) => call.init.method === 'GET' && call.init.body === undefined),
    ).toBe(true)
  })

  it('ne retient pas la variante sondée : la forme qui a passé reste celle des recherches suivantes', async () => {
    const { adapter, site } = shop((call) =>
      call.init.headers === undefined ? GOOD : { status: 400 },
    )
    await adapter.searchProducts('sel')
    await adapter.exploreSearchVariants('sel')
    site.calls.length = 0

    await adapter.searchProducts('sucre')

    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.init.headers).toBeUndefined()
  })

  it('rien à sonder quand toutes les variantes ont déjà été essayées', async () => {
    const { adapter, site } = shop(() => ({ status: 400 }))
    await expect(adapter.searchProducts('sel')).rejects.toBeInstanceOf(Error)
    await adapter.exploreSearchVariants('sel')
    const before = site.calls.length

    await adapter.exploreSearchVariants('sel')

    expect(site.calls).toHaveLength(before)
  })

  it('un blocage pendant la sonde l’arrête sans lever d’erreur', async () => {
    let blocked = false
    const { adapter } = shop((call) => {
      if (blocked) return { status: 403 }
      return call.init.headers === undefined ? GOOD : { status: 400 }
    })
    await adapter.searchProducts('sel')
    blocked = true

    await expect(adapter.exploreSearchVariants('sel')).resolves.toBeDefined()
  })

  it('sans recherche préalable : rien à compléter', async () => {
    const { adapter, site } = shop(() => GOOD)

    await expect(adapter.exploreSearchVariants('sel')).resolves.toEqual([])
    expect(site.calls).toEqual([])
  })
})

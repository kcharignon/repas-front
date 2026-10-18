// Le repli d'un HTTP 400 sur la recherche (recette réelle du 2026-10-18) : l'adaptateur retente la même recherche autrement, une requête à la fois
// à la cadence normale, garde la forme qui passe, et dit dans ses faits (`lastSearchFacts`) laquelle a répondu quoi. Faux `fetch`, aucun réseau.
import { describe, expect, it } from 'vitest'

import { LeclercAdapter } from '../src/leclerc'
import { fakeSite, fixture, PAGE, type Call, type Scripted } from './leclerc-helpers'

const GOOD: Scripted = { body: fixture('recherche-farine.html') }
const BAD: Scripted = { status: 400, body: '<html><body>Bad Request</body></html>' }
const WITH_CITY = '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche='
const WITHOUT_CITY = '/magasin-000123-000123/recherche.aspx?TexteRecherche='

const noHeaders = (call: Call) => call.init.headers === undefined
const hasCity = (call: Call) => call.url.startsWith(WITH_CITY)

function shop(handler: (call: Call) => Scripted) {
  const site = fakeSite(handler)
  return { site, adapter: new LeclercAdapter(site.deps) }
}

describe('la requête courante passe : une seule requête, celle du banc d’essai', () => {
  it('GET du chemin de la page avec la ville, Accept html, session du navigateur', async () => {
    const { site, adapter } = shop(() => GOOD)

    const found = await adapter.searchProducts('farine')

    expect(found).toHaveLength(5)
    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe(`${WITH_CITY}farine`)
    expect(site.calls[0]?.init).toEqual({
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      credentials: 'same-origin',
    })
    expect(adapter.lastSearchFacts()?.attempts).toEqual([
      expect.objectContaining({ variant: 'a', status: 200 }),
    ])
  })
})

describe('un 400 sur la requête courante', () => {
  it('sans en-tête personnalisé, la même recherche passe : elle est retentée sans, et cette forme est gardée', async () => {
    // Given : le site refuse (400) toute requête portant un Accept personnalisé
    const { site, adapter } = shop((call) => (noHeaders(call) ? GOOD : BAD))

    // When
    const found = await adapter.searchProducts('farine')
    const next = await adapter.searchProducts('sucre')

    // Then
    expect(found).toHaveLength(5)
    expect(next).toHaveLength(5)
    expect(site.calls.map((call) => [call.url, noHeaders(call)])).toEqual([
      [`${WITH_CITY}farine`, false],
      [`${WITH_CITY}farine`, true],
      [`${WITH_CITY}sucre`, true],
    ])
    const facts = adapter.lastSearchFacts()
    expect(facts?.variant).toBe('b')
    expect(facts?.attempts).toEqual([expect.objectContaining({ variant: 'b', status: 200 })])
  })

  it('le chemin avec la ville est refusé, celui sans ville passe : retenu', async () => {
    const { site, adapter } = shop((call) => (hasCity(call) ? BAD : GOOD))

    const found = await adapter.searchProducts('farine')

    expect(found).toHaveLength(5)
    expect(site.calls.map((call) => call.url)).toEqual([
      `${WITH_CITY}farine`,
      `${WITH_CITY}farine`,
      `${WITHOUT_CITY}farine`,
    ])
    expect(adapter.lastSearchFacts()?.variant).toBe('e1')
    expect(
      adapter.lastSearchFacts()?.attempts.map((attempt) => [attempt.variant, attempt.status]),
    ).toEqual([
      ['a', 400],
      ['b', 400],
      ['e1', 200],
    ])
  })

  it('si rien ne passe, CONTRACT_CHANGED avec la cause HTTP_400, après chaque forme de requête distincte une fois (e2 redonne a quand la page est dans le dossier du magasin), à la cadence normale', async () => {
    const { site, adapter } = shop(() => BAD)

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause: 'HTTP_400', status: 400 }),
    )

    expect(site.calls).toHaveLength(5)
    expect(site.maxInFlight()).toBe(1)
    const gaps = site.calls.slice(1).map((call, index) => call.at - (site.calls[index]?.at ?? 0))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(800)
    expect(adapter.lastSearchFacts()?.attempts.map((attempt) => attempt.variant)).toEqual([
      'a',
      'b',
      'e1',
      'f',
      'h',
    ])
    expect(adapter.lastSearchFacts()?.outcome).toBe('FAILED')
  })

  it('une fois la forme retenue refusée à son tour, le repli reprend depuis la requête courante', async () => {
    let refuse = false
    const { site, adapter } = shop((call) => (noHeaders(call) && !refuse ? GOOD : BAD))
    await adapter.searchProducts('farine')
    expect(adapter.lastSearchFacts()?.variant).toBe('b')

    refuse = true
    await expect(adapter.searchProducts('sucre')).rejects.toThrow(
      expect.objectContaining({ cause: 'HTTP_400' }),
    )

    // b d’abord (la forme retenue), puis a, e1, f, h
    expect(site.calls.slice(2).map((call) => noHeaders(call))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
  })
})

describe('l’adresse de la page n’a pas de ville (cause de la recette réelle du 2026-10-18)', () => {
  const ROOT = { hostname: PAGE.hostname, pathname: '/magasin-000123-000123/' }
  const WITH_LINK = '<a href="/magasin-000123-000123-Ville-Test/accueil.aspx">Accueil</a>'
  const WITH_FORM = '<form action="/magasin-000123-000123-Ville-Test/recherche.aspx"></form>'

  it.each([
    ['un lien de la page', WITH_LINK],
    ['le formulaire de recherche du site', WITH_FORM],
  ])(
    'le chemin avec la ville est tiré de %s et utilisé d’emblée, sans attendre un refus',
    async (_name, html) => {
      // Given : le site refuse (400) le chemin sans ville, sert celui avec la ville
      const site = fakeSite((call) => (hasCity(call) ? GOOD : BAD), {
        location: ROOT,
        pageText: () => html,
      })
      const adapter = new LeclercAdapter(site.deps)

      // When
      const found = await adapter.searchProducts('farine')
      await adapter.searchProducts('sucre')

      // Then : une seule requête par recherche, sur le bon chemin
      expect(found).toHaveLength(5)
      expect(site.calls.map((call) => call.url)).toEqual([
        `${WITH_CITY}farine`,
        `${WITH_CITY}sucre`,
      ])
      expect(adapter.lastSearchFacts()?.variant).toBe('g')
    },
  )

  it('le chemin tiré de la page est refusé à son tour : le chemin de la page est essayé ensuite', async () => {
    const site = fakeSite((call) => (hasCity(call) ? BAD : GOOD), {
      location: ROOT,
      pageText: () => WITH_LINK,
    })
    const adapter = new LeclercAdapter(site.deps)

    const found = await adapter.searchProducts('farine')

    expect(found).toHaveLength(5)
    expect(site.calls.map((call) => call.url)).toEqual([
      `${WITH_CITY}farine`,
      `${WITHOUT_CITY}farine`,
    ])
    expect(adapter.lastSearchFacts()?.variant).toBe('a')
  })

  it('l’adresse de la panier n’est jamais touchée : elle reste sans ville', async () => {
    const site = fakeSite(
      (call) => (call.init.method === 'POST' ? { body: fixture('panier-ajout.json') } : GOOD),
      {
        location: ROOT,
        pageText: () => `${WITH_LINK}<script>var p = {"sNoPointLivraison":"555123"}</script>`,
      },
    )
    const adapter = new LeclercAdapter(site.deps)
    await adapter.searchProducts('farine')

    await adapter.setCartQuantity('1000001', 1)

    expect(site.calls.at(-1)?.url).toBe('/magasin-000123-000123/panier.aspx?op=1')
  })

  it('une page sans lien ni formulaire portant la ville n’essaie pas g', async () => {
    const site = fakeSite(() => BAD, { location: ROOT, pageText: () => '<a href="/autre">x</a>' })
    const adapter = new LeclercAdapter(site.deps)

    await expect(adapter.searchProducts('farine')).rejects.toBeInstanceOf(Error)

    // e1 et e2 donneraient la même requête que a (l’adresse n’a pas de ville) : elles ne sont pas rejouées
    expect(adapter.lastSearchFacts()?.attempts.map((attempt) => attempt.variant)).toEqual([
      'a',
      'b',
      'f',
      'h',
    ])
  })

  it('un lien d’un autre magasin n’est jamais pris pour le chemin de celui-ci', async () => {
    const site = fakeSite(() => BAD, {
      location: ROOT,
      pageText: () => '<a href="/magasin-999000-999000-Ailleurs/accueil.aspx">x</a>',
    })
    const adapter = new LeclercAdapter(site.deps)

    await expect(adapter.searchProducts('farine')).rejects.toBeInstanceOf(Error)

    expect(site.calls.some((call) => call.url.includes('Ailleurs'))).toBe(false)
  })
})

describe('les autres réponses ne déclenchent aucun repli', () => {
  it.each([
    ['404', { status: 404 }, 'CONTRACT_CHANGED'],
    ['500', { status: 500 }, 'NETWORK'],
    ['401', { status: 401 }, 'NOT_LOGGED_IN'],
  ] as const)('HTTP %s : une seule requête', async (_name, reply, code) => {
    const { site, adapter } = shop(() => reply)

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code }),
    )

    expect(site.calls).toHaveLength(1)
  })

  it('un 403 est retenté une fois par la cadence (blocage), jamais par le repli', async () => {
    const { site, adapter } = shop(() => ({ status: 403 }))

    await expect(adapter.searchProducts('farine')).rejects.toThrow(
      expect.objectContaining({ code: 'BLOCKED' }),
    )

    expect(site.calls.length).toBeLessThanOrEqual(2)
    expect(site.calls.every((call) => !noHeaders(call))).toBe(true)
  })
})

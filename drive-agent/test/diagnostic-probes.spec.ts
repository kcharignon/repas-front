// Les sondes du diagnostic (ticket B de l'audit du 2026-10-18) : ce que le rapport dit du site réel, et la garantie qu'il ne contient AUCUNE valeur du
// site (libellé, cookie, numéro de magasin, ville, adresse, point de livraison, valeur d'en-tête). Le site est un faux `fetch` aux pages INVENTÉES.
import { describe, expect, it } from 'vitest'

import {
  NONSENSE_TERM,
  probeLines,
  reportOf,
  runChecks,
  type ChecksDeps,
  type ProbeFacts,
} from '../src/diagnostic'
import { LeclercAdapter } from '../src/leclerc'
import { fakeStorage, fakeWakeLock } from './flow-helpers'
import { fakeSite, fixture, PAGE, type Call, type Scripted } from './leclerc-helpers'

const NOW = Date.UTC(2026, 9, 18, 14, 3, 27)
const GOOD: Scripted = { body: fixture('recherche-farine.html') }
const EMPTY: Scripted = { body: fixture('recherche-vide.html') }

/** Le vrai adaptateur sur un faux site ; `reply` donne la réponse à chaque requête. */
function site(reply: (call: Call) => Scripted, overrides: Parameters<typeof fakeSite>[1] = {}) {
  const fake = fakeSite(reply, overrides)
  return { fake, adapter: new LeclercAdapter(fake.deps) }
}

const asked = (call: Call, word: string) => call.url.endsWith(`TexteRecherche=${word}`)
const normal = (call: Call): Scripted => (asked(call, NONSENSE_TERM) ? EMPTY : GOOD)

const deps = (adapter: LeclercAdapter): ChecksDeps => ({
  adapter,
  agentVersion: '0.10.0',
  storage: fakeStorage(),
  wakeLock: fakeWakeLock().wakeLock,
  originReplaced: null,
})

describe('en fonctionnement normal', () => {
  it('deux recherches seulement (le mot courant, puis le mot absurde), aucune écriture', async () => {
    const { adapter, fake } = site(normal)

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(fake.calls.map((call) => call.url)).toEqual([
      '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=sel',
      '/magasin-000123-000123-Ville-Test/recherche.aspx?TexteRecherche=zzqxkw',
    ])
    expect(fake.calls.every((call) => call.init.method === 'GET')).toBe(true)
    expect(probes?.common?.facts?.outcome).toBe('PRODUCTS')
    expect(probes?.nonsense?.facts).toMatchObject({ outcome: 'EMPTY', products: 0, status: 200 })
  })

  it('rapporte la forme de l’adresse d’arrivée, le point de livraison et les clés connues de la réponse sans résultat', async () => {
    const { adapter } = site(normal)

    const { probes } = await runChecks(deps(adapter), () => undefined)
    const text = probeLines(probes).join('\n')

    expect(text).toContain('Adresse d’arrivée : /magasin-N-N-V/recherche.aspx')
    expect(text).toContain('Chemin demandé : /magasin-N-N-V/recherche.aspx')
    expect(text).toContain('Point de livraison (page) : lu oui, égal au numéro de l’adresse non')
    expect(text).toContain('Suffixe de ville dans l’adresse de la page : oui')
    expect(text).toContain('Recherche « zzqxkw » : HTTP 200')
    expect(text).toContain('aucun produit, liste vide reconnue')
    expect(text).toContain('sNoPointLivraison')
    expect(text).toContain('Connexion dans la réponse « zzqxkw »')
  })

  it('le rapport du diagnostic porte les sondes, et la ligne « Connexion : » de la page est gardée', async () => {
    const { adapter } = site(normal)
    const { results, page, probes } = await runChecks(deps(adapter), () => undefined)

    const report = reportOf('0.10.0', NOW, page, results, probes)

    expect(report).toContain('Sondes du site')
    expect(report).toContain('Connexion : ')
    expect(report.indexOf('Sondes du site')).toBeLessThan(report.indexOf('[OK]'))
  })
})

describe('quand la recherche répond HTTP 400 (blocage de la recette réelle)', () => {
  const refusesAccept = (call: Call): Scripted =>
    call.init.headers === undefined ? normal(call) : { status: 400, body: '<h1>Bad Request</h1>' }

  it('le rapport dit POURQUOI : code HTTP, type, longueur, chemin demandé, une ligne par variante essayée', async () => {
    const { adapter } = site(() => ({
      status: 400,
      body: '<html><body><h1>Bad Request</h1><p>Request Header Or Cookie Too Large</p></body></html>',
      headers: { 'Content-Type': 'text/html; charset=utf-8', Server: 'secret-server-1.0' },
    }))

    const { results, probes } = await runChecks(deps(adapter), () => undefined)
    const text = probeLines(probes).join('\n')
    const search = results.find((result) => result.id === 'search')

    expect(search).toMatchObject({ status: 'KO', code: 'CONTRACT_CHANGED', cause: 'HTTP_400' })
    expect(text).toContain('Recherche « sel » : HTTP 400, contenu text/html')
    expect(text).toContain('Chemin demandé : /magasin-N-N-V/recherche.aspx')
    expect(text).toContain('HTTP : a=400 b=400 e1=400 f=400 h=400 c=400 (recherche « sel »)')
    expect(text).not.toContain('banc d’essai')
    expect(text).toContain('Variante a (requête courante) : HTTP 400, contenu text/html')
    expect(text).toContain('bad request')
    expect(text).toContain('too large')
  })

  it('une variante qui passe est retenue : « recherche » est OK, et le rapport dit laquelle', async () => {
    const { adapter } = site(refusesAccept)

    const { results, probes } = await runChecks(deps(adapter), () => undefined)
    const text = probeLines(probes).join('\n')

    expect(results.find((result) => result.id === 'search')).toMatchObject({ status: 'OK' })
    expect(text).toContain('HTTP : a=400 b=200')
    expect(text).toContain('requête b')
  })

  it('la sonde du mot absurde n’est pas faite quand le site bloque ou refuse la page', async () => {
    const { adapter, fake } = site(() => ({ status: 403 }))

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probes?.nonsense).toMatchObject({ skipped: true })
    expect(fake.calls.every((call) => asked(call, 'sel'))).toBe(true)
    expect(probeLines(probes).join('\n')).toContain('Recherche « zzqxkw » : non faite')
    expect(probes?.common?.fault).toMatchObject({ code: 'BLOCKED', status: 403 })
    expect(probeLines(probes).join('\n')).toContain('BLOCKED, HTTP 403')
  })

  it('quand même la recherche courante échoue en HTTP 400, la sonde du mot absurde n’est pas faite', async () => {
    const { adapter, fake } = site(() => ({ status: 400 }))

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probes?.nonsense).toMatchObject({ skipped: true })
    expect(fake.calls.some((call) => asked(call, NONSENSE_TERM))).toBe(false)
  })
})

describe('la forme de l’adresse de la page et les cookies', () => {
  it('une page dont l’adresse n’a pas de suffixe de ville le dit', async () => {
    const { adapter } = site(normal, {
      location: { hostname: PAGE.hostname, pathname: '/magasin-000123-000123/' },
    })

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probeLines(probes).join('\n')).toContain(
      'Suffixe de ville dans l’adresse de la page : non',
    )
  })

  it('une page hors d’un magasin : sans objet', async () => {
    const { adapter } = site(normal, { location: { hostname: PAGE.hostname, pathname: '/' } })

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probeLines(probes).join('\n')).toContain(
      'Suffixe de ville dans l’adresse de la page : sans objet',
    )
  })

  it('le chemin avec la ville tiré de la page et le chemin retenu pour la recherche sont dits, en motifs', async () => {
    const { adapter } = site(
      (call) => (call.url.includes('-Ville-Test/') ? normal(call) : { status: 400 }),
      {
        location: { hostname: PAGE.hostname, pathname: '/magasin-000123-000123/' },
        pageText: () => '<form action="/magasin-000123-000123-Ville-Test/recherche.aspx"></form>',
      },
    )

    const { probes } = await runChecks(deps(adapter), () => undefined)
    const text = probeLines(probes).join('\n')

    expect(text).toContain('Suffixe de ville dans l’adresse de la page : non')
    expect(text).toContain(
      'Chemin avec ville tiré de la page : /magasin-N-N-V (formulaire de recherche)',
    )
    expect(text).toContain(
      'Chemin demandé : /magasin-N-N-V/recherche.aspx (requête g : ville tirée de la page)',
    )
  })

  it('sans chemin avec ville dans la page : aucun', async () => {
    const { adapter } = site(normal)

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probeLines(probes).join('\n')).toContain('Chemin avec ville tiré de la page : aucun')
  })

  it('les cookies lisibles par la page : un nombre et un oui/non pour l’anti-robot', async () => {
    const { adapter } = site(normal, { cookies: () => ({ count: 4, antiBot: true }) })

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(probeLines(probes).join('\n')).toContain(
      'Cookies lisibles par la page : 4 ; cookie de protection anti-robot : oui (les cookies HttpOnly ne sont pas lisibles)',
    )
  })
})

describe('une page qui n’est pas celle d’un magasin', () => {
  it('rapporte la forme de l’adresse sans interroger le site', async () => {
    const { adapter, fake } = site(normal, {
      location: { hostname: PAGE.hostname, pathname: '/' },
    })

    const { probes } = await runChecks(deps(adapter), () => undefined)

    expect(fake.calls).toEqual([])
    expect(probeLines(probes).join('\n')).toContain('Adresse d’arrivée : /')
    expect(probes?.common).toBeNull()
  })
})

describe('aucune valeur du site n’est rapportée (le test de confidentialité du ticket B)', () => {
  const SECRETS = [
    'SESSIONSECRET424242',
    'jean.dupont@exemple.fr',
    'Zorglub',
    '999111',
    '4242424',
    'PL424242',
    'Barilla-Secret',
    'Rue du Secret',
    'secret-server-1.0',
    'TOPSECRETTOKEN',
    'recentSearchSecret',
    'saintEtienneSecret',
  ]

  /** Une page et des réponses qui portent, partout où le site peut en mettre, des valeurs qui ne doivent jamais sortir. */
  const hostilePage = `<!doctype html><html><head><title>Jean Dupont, Rue du Secret</title></head><body>
    <p>Bonjour jean.dupont@exemple.fr — Zorglub — Rue du Secret</p>
    <a href="/magasin-999111-999111-Zorglub/produit-4242424.aspx">Barilla-Secret 500 g</a>
    <script>var state = {
      "sNoPointLivraison":"PL424242","sTotalAPayer":"12,50 €","lstProduits":[],"lstProduitsLight":[],
      "bClientConnecte":true,"sNomClientSecret":"Jean Dupont","sCookie":"SESSIONSECRET424242",
      "recentSearchSecret":{"saintEtienneSecret":1,"farine":2},"autre":{"x":"TOPSECRETTOKEN"}
    };</script></body></html>`

  const hostile = (): ReturnType<typeof site> =>
    site(
      () => ({
        status: 200,
        body: hostilePage,
        url: `https://${PAGE.hostname}/magasin-999111-999111-Zorglub/recherche.aspx?TexteRecherche=sel`,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': 'sid=SESSIONSECRET424242; HttpOnly',
          Server: 'secret-server-1.0',
          'X-Token': 'TOPSECRETTOKEN',
        },
      }),
      {
        location: {
          hostname: PAGE.hostname,
          pathname: '/magasin-999111-999111-Zorglub/produit-4242424.aspx',
        },
        pageText: () => hostilePage,
      },
    )

  it('le rapport du diagnostic n’en contient aucune', async () => {
    const { adapter } = hostile()

    const { results, page, probes } = await runChecks(deps(adapter), () => undefined)
    const report = reportOf('0.10.0', NOW, page, results, probes)

    for (const secret of SECRETS) expect(report).not.toContain(secret)
    expect(report).toContain('Adresse d’arrivée : /magasin-N-N-V/produit-N.aspx')
    expect(report).toContain('sNoPointLivraison')
    expect(report).toContain('bClientConnecte')
    expect(report).toContain('x-token')
    expect(JSON.stringify(probes)).not.toContain('TOPSECRETTOKEN')
  })

  it('ni le relevé brut des sondes : des formes, des noms et des nombres', async () => {
    const { adapter } = hostile()

    const { probes } = await runChecks(deps(adapter), () => undefined)
    const raw = JSON.stringify(probes as ProbeFacts)

    for (const secret of SECRETS) expect(raw).not.toContain(secret)
  })
})

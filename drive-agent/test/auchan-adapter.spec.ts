// @vitest-environment-options {"url": "https://www.auchan.fr/courses"}
// L'adaptateur d'Auchan (DRV-717), première moitié : le magasin (lu par `GET /journey`, jamais dans l'adresse), la connexion, l'entrée, les faits du
// diagnostic. Tout est inventé (fixtures synthétiques de `fixtures/auchan/`) ; aucun contact avec un site d'enseigne. Ce qui n'a pas été mesuré sur le vrai
// site est éprouvé comme tel : une forme plausible, jamais une valeur devinée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuchanAdapter, ENTRY_WAIT_MS } from '../src/auchan'
import { RetailerError } from '../src/retailers'
import {
  AUCHAN_PAGE,
  auchanFixture,
  auchanSite,
  showPage,
  type AuchanReply,
} from './auchan-helpers'

const STORE_ID = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'
const journey = (name = 'parcours-magasin.json'): AuchanReply => ({ body: auchanFixture(name) })

beforeEach(() => {
  showPage(auchanFixture('accueil-magasin.html'))
})
afterEach(() => {
  document.documentElement.innerHTML = ''
})

/** L'erreur levée par une promesse ou une fonction, pour en lire le code et la cause. */
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

describe('readStore : le magasin vient du parcours du site, pas de l’adresse', () => {
  it('rend l’identifiant (seller.id) et le libellé (pointOfService.name) du contexte de courses, avec une seule requête GET /journey', async () => {
    const site = auchanSite(() => journey())

    const store = await new AuchanAdapter(site.deps).readStore()

    expect(store).toEqual({
      id: STORE_ID,
      host: 'www.auchan.fr',
      baseUrl: 'https://www.auchan.fr/',
      label: 'Drive Ville-Test',
    })
    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe('/journey')
    expect(site.calls[0]?.init).toMatchObject({
      method: 'GET',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
    expect(site.calls[0]?.init.body).toBeUndefined()
  })

  it('ne lit JAMAIS le magasin dans l’adresse de la page, même si elle ressemble à une adresse de magasin', async () => {
    const site = auchanSite(() => journey(), {
      location: { ...AUCHAN_PAGE, pathname: '/magasin-000002-000002-Autre-Ville/courses' },
    })

    const store = await new AuchanAdapter(site.deps).readStore()

    expect(store.id).toBe(STORE_ID)
    expect(JSON.stringify(store)).not.toContain('000002')
    expect(JSON.stringify(store)).not.toContain('Autre-Ville')
  })

  it('un libellé de magasin absent est `null`, un libellé hostile est nettoyé et borné', async () => {
    const body = JSON.parse(auchanFixture('parcours-magasin.json')) as {
      activeContexts: { context: { pointOfService: { name?: string } } }[]
    }
    const grocery = body.activeContexts[0]
    if (grocery === undefined) throw new Error('fixture')
    grocery.context.pointOfService.name = `Dri​ve­ <b>x</b>${'é'.repeat(400)}\n`
    const hostile = await new AuchanAdapter(
      auchanSite(() => ({ body: JSON.stringify(body) })).deps,
    ).readStore()
    delete grocery.context.pointOfService.name
    const nameless = await new AuchanAdapter(
      auchanSite(() => ({ body: JSON.stringify(body) })).deps,
    ).readStore()

    expect(hostile.label?.startsWith('Drive <b>x</b>')).toBe(true)
    expect(Array.from(hostile.label ?? '').length).toBeLessThanOrEqual(255)
    expect(hostile.label).not.toMatch(/[​­\n]/)
    expect(nameless.label).toBeNull()
  })

  it('des clés hostiles (__proto__, constructor) dans le parcours ne cassent rien', async () => {
    const body =
      '{"__proto__":{"activeContexts":[]},"constructor":{"x":1},"activeContexts":[{"type":"GROCERY","context":{"__proto__":{"seller":{"id":"x"}},"seller":{"id":"' +
      STORE_ID +
      '"},"constructor":null}}]}'

    const store = await new AuchanAdapter(auchanSite(() => ({ body })).deps).readStore()

    expect(store.id).toBe(STORE_ID)
  })

  it.each([
    ['aucun contexte de courses (la déconnexion l’efface)', 'parcours-sans-magasin.json'],
    ['un contexte de courses nul', 'parcours-contexte-vide.json'],
  ])('%s : aucun magasin choisi (UNSUPPORTED_PAGE, STORE_NOT_CHOSEN)', async (_name, fixture) => {
    const site = auchanSite(() => journey(fixture))

    const error = await failureOf(() => new AuchanAdapter(site.deps).readStore())

    expect(error).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'STORE_NOT_CHOSEN' })
    expect(site.calls).toHaveLength(1)
  })

  it('la barre « Choisir vos courses » : aucun magasin choisi, SANS même demander le parcours', async () => {
    showPage(auchanFixture('accueil-sans-magasin.html'))
    const site = auchanSite(() => journey())

    const error = await failureOf(() => new AuchanAdapter(site.deps).readStore())

    expect(error).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'STORE_NOT_CHOSEN' })
    expect(site.calls).toEqual([])
  })

  it('une page sans barre du magasin se fie au parcours', async () => {
    document.documentElement.innerHTML = '<body><main><h1>Courses</h1></main></body>'

    const store = await new AuchanAdapter(auchanSite(() => journey()).deps).readStore()

    expect(store.id).toBe(STORE_ID)
  })

  it('la phrase « Choisir vos courses » dans un paragraphe ou un texte long n’est pas la barre', async () => {
    document.documentElement.innerHTML = `<body>
      <div class="store-bar"><span>Retrait : Drive Ville-Test</span></div>
      <p>Vous pouvez Choisir vos courses quand vous voulez, ${'très '.repeat(40)}facilement.</p>
      <div>${'Un texte de page. '.repeat(60)} Choisir vos courses</div></body>`

    const store = await new AuchanAdapter(auchanSite(() => journey()).deps).readStore()

    expect(store.id).toBe(STORE_ID)
  })

  it.each([
    ['un hôte qui n’est pas www.auchan.fr', 'compte.auchan.fr'],
    ['un site d’une autre enseigne', 'fd0-courses.leclercdrive.fr'],
  ])('%s : UNSUPPORTED_PAGE (PAGE_HOST), sans requête', async (_name, hostname) => {
    const site = auchanSite(() => journey(), { location: { ...AUCHAN_PAGE, hostname } })

    const error = await failureOf(() => new AuchanAdapter(site.deps).readStore())

    expect(error).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_HOST' })
    expect(site.calls).toEqual([])
  })

  describe('une page « introuvable » (un vrai 404)', () => {
    it('le code HTTP du document la dit : UNSUPPORTED_PAGE (PAGE_NOT_FOUND), sans requête', async () => {
      showPage(auchanFixture('introuvable.html'))
      const site = auchanSite(() => journey(), {
        navigation: () => ({ redirects: 0, status: 404 }),
      })

      const error = await failureOf(() => new AuchanAdapter(site.deps).readStore())

      expect(error).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_NOT_FOUND' })
      expect(site.calls).toEqual([])
    })

    it('sans code HTTP connu, le titre « 404 … » la dit', async () => {
      showPage(auchanFixture('introuvable.html'))

      const error = await failureOf(() =>
        new AuchanAdapter(auchanSite(() => journey()).deps).readStore(),
      )

      expect(error).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_NOT_FOUND' })
    })

    it('un code HTTP 200 fait foi : une page de 200 dont le titre parle de « 404 » n’est pas un 404', async () => {
      document.title = '404 Not Found Page'
      const site = auchanSite(() => journey(), {
        navigation: () => ({ redirects: 0, status: 200 }),
      })

      const store = await new AuchanAdapter(site.deps).readStore()

      expect(store.id).toBe(STORE_ID)
    })
  })

  describe('le site a changé : une cause, jamais une valeur devinée', () => {
    it.each([
      [
        'une réponse qui n’est pas du JSON',
        { body: '<html>autre chose</html>' },
        'JOURNEY_NOT_JSON',
      ],
      [
        'un parcours sans liste de contextes',
        journey('parcours-sans-liste.json'),
        'JOURNEY_NO_CONTEXTS',
      ],
      ['un JSON qui n’est pas un objet', { body: '[1, 2]' }, 'JOURNEY_NO_CONTEXTS'],
      [
        'un contexte de courses sans vendeur',
        journey('parcours-sans-vendeur.json'),
        'JOURNEY_NO_SELLER',
      ],
      [
        'un identifiant de magasin qui n’est pas un UUID',
        journey('parcours-identifiant-invalide.json'),
        'JOURNEY_STORE_ID_INVALID',
      ],
      [
        'un identifiant en majuscules',
        { body: auchanFixture('parcours-magasin.json').replace(STORE_ID, STORE_ID.toUpperCase()) },
        'JOURNEY_STORE_ID_INVALID',
      ],
      ['une route disparue (404)', { status: 404, body: 'x' }, 'HTTP_404'],
      ['un refus du serveur (400)', { status: 400, body: 'x' }, 'HTTP_400'],
    ] satisfies [string, AuchanReply, string][])(
      '%s : CONTRACT_CHANGED',
      async (_name, reply, cause) => {
        const error = await failureOf(() =>
          new AuchanAdapter(auchanSite(() => reply).deps).readStore(),
        )

        expect(error).toMatchObject({ code: 'CONTRACT_CHANGED', cause })
      },
    )

    it('une panne du serveur (503) est NETWORK, pas un blocage', async () => {
      const error = await failureOf(() =>
        new AuchanAdapter(auchanSite(() => ({ status: 503 })).deps).readStore(),
      )

      expect(error).toMatchObject({ code: 'NETWORK', cause: 'HTTP_503' })
    })

    it.each([
      ['un 401', { status: 401 }, 'HTTP_401'],
      [
        'une redirection vers le serveur d’identité',
        {
          redirected: true,
          url: 'https://www.auchan.fr/auth/realms/x/protocol/openid-connect/auth',
        },
        'LOGIN_REDIRECT',
      ],
    ] satisfies [string, AuchanReply, string][])(
      '%s : NOT_LOGGED_IN',
      async (_name, reply, cause) => {
        const error = await failureOf(() =>
          new AuchanAdapter(auchanSite(() => reply).deps).readStore(),
        )

        expect(error).toMatchObject({ code: 'NOT_LOGGED_IN', cause })
      },
    )

    it('une page de défi de l’anti-robot : BLOCKED (CHALLENGE), et deux 403 de suite arrêtent tout', async () => {
      const challenge = await failureOf(() =>
        new AuchanAdapter(
          auchanSite(() => ({ body: '<iframe src="https://geo.captcha-delivery.com/x"></iframe>' }))
            .deps,
        ).readStore(),
      )
      const site = auchanSite(() => ({ status: 403 }))
      const adapter = new AuchanAdapter(site.deps)
      const refused = await failureOf(() => adapter.readStore())
      const after = await failureOf(() => adapter.readStore())

      expect(challenge).toMatchObject({ code: 'BLOCKED', cause: 'CHALLENGE' })
      expect(refused).toMatchObject({ code: 'BLOCKED' })
      expect(after).toMatchObject({ code: 'BLOCKED' })
      expect(site.calls).toHaveLength(2)
      expect(adapter.stats()).toMatchObject({ requests: 2, blocks: 2 })
    })

    it('un site muet : NETWORK après une reprise', async () => {
      const site = auchanSite(() => new Error('réseau coupé'))
      const adapter = new AuchanAdapter(site.deps)

      const error = await failureOf(() => adapter.readStore())

      expect(error).toMatchObject({ code: 'NETWORK', cause: null })
      expect(site.calls).toHaveLength(2)
      expect(adapter.stats()).toMatchObject({ requests: 2, errors: 2 })
    })
  })

  it('respecte la cadence d’Auchan : au moins 2 s entre deux requêtes, plus une gigue jusqu’à 1 s, plafonnée à 4 s', async () => {
    const site = auchanSite(() => journey())
    const adapter = new AuchanAdapter(site.deps)

    await adapter.readStore()
    site.setRandom(0)
    await adapter.readStore()
    site.setRandom(1)
    await adapter.readStore()

    expect(site.sleeps).toHaveLength(2)
    expect(site.calls[1]!.at - site.calls[0]!.at).toBeGreaterThanOrEqual(2_000)
    // Pas de pause avant la première requête ; ensuite 2 000 ms + 0 à 1 000 ms de gigue.
    const gap = (index: number) => site.calls[index]!.at - (site.calls[index - 1]!.at + 50)
    expect(gap(1)).toBeGreaterThanOrEqual(1_950)
    expect(gap(2)).toBeGreaterThanOrEqual(2_950)
    expect(gap(2)).toBeLessThanOrEqual(4_000)
  })
})

describe('readSession : un seul signe, sessionStorage.tracking_authenticated', () => {
  const stateOf = (flag: string | null) =>
    new AuchanAdapter(auchanSite(() => ({}), { authenticated: () => flag }).deps).readSession()

  it('« false » est un visiteur, « true » un client connecté, le reste est inconnu', () => {
    expect(stateOf('false')).toEqual({ state: 'VISITOR', signs: ['STATE_FLAG_OFF'] })
    expect(stateOf('true')).toEqual({ state: 'MEMBER', signs: ['STATE_FLAG_ON'] })
    expect(stateOf(null)).toEqual({ state: 'UNKNOWN', signs: [] })
    expect(stateOf('TRUE')).toEqual({ state: 'UNKNOWN', signs: [] })
    expect(stateOf('1')).toEqual({ state: 'UNKNOWN', signs: [] })
    expect(stateOf('<script>')).toEqual({ state: 'UNKNOWN', signs: [] })
  })

  it('un stockage de la page qui lève une exception : inconnu, sans erreur ni requête', () => {
    const site = auchanSite(() => ({}), {
      authenticated: () => {
        throw new Error('stockage interdit')
      },
    })

    expect(new AuchanAdapter(site.deps).readSession().state).toBe('UNKNOWN')
    expect(site.calls).toEqual([])
  })
})

describe('readArrival : des formes et des nombres, jamais une valeur du site', () => {
  it('l’adresse est rapportée en motif : un nom de page connu, sinon « … »', () => {
    const shape = (pathname: string) =>
      new AuchanAdapter(
        auchanSite(() => ({}), { location: { ...AUCHAN_PAGE, pathname } }).deps,
      ).readArrival().address

    expect(shape('/courses')).toBe('/courses')
    expect(shape('/')).toBe('/')
    expect(shape('/checkout/cart')).toBe('/checkout/…')
    expect(shape('/recherche?text=farine')).toBe('/recherche')
    // La page d'un produit porte son libellé dans l'adresse : il ne sort pas.
    expect(shape('/farine-de-ble-de-test/pr-C0000001')).toBe('/…/…')
    expect(shape('/magasins/drive-ville-test')).toBe('/…/…')
  })

  it('les cookies : un nombre et la présence de « datadome », jamais un nom ni une valeur', () => {
    const arrival = new AuchanAdapter(
      auchanSite(() => ({}), {
        cookies: () =>
          'lark-cart=SECRET-CART; datadome=SECRET-DD; lark-consentId=SECRET-CONSENT; autre=1',
      }).deps,
    ).readArrival()

    expect(arrival.cookies).toEqual({ count: 4, antiBot: true })
    const text = JSON.stringify(arrival)
    for (const secret of ['SECRET', 'lark', 'consent', 'autre']) expect(text).not.toContain(secret)
  })

  it('sans cookie « datadome » lisible : antiBot « non » ; sans lecture de cookies : null', () => {
    const none = (cookies: (() => string) | undefined) =>
      new AuchanAdapter(auchanSite(() => ({}), { ...(cookies && { cookies }) }).deps).readArrival()
        .cookies

    expect(none(() => 'a=1; b=2')).toEqual({ count: 2, antiBot: false })
    expect(none(() => '')).toEqual({ count: 0, antiBot: false })
    expect(none(undefined)).toBeNull()
    expect(
      none(() => {
        throw new Error('cookies interdits')
      }),
    ).toBeNull()
  })

  it('la navigation du document : redirections et code HTTP, en nombres', () => {
    const arrival = new AuchanAdapter(
      auchanSite(() => ({}), { navigation: () => ({ redirects: 1, status: 200 }) }).deps,
    ).readArrival()

    expect(arrival).toMatchObject({ redirects: 1, status: 200, searchBase: null })
    expect(arrival.delivery).toBeUndefined()
  })

  it('après la lecture du magasin : comment le site l’a dit, en formes (contextes, UUID oui/non, retrait), sans l’identifiant ni le libellé', async () => {
    const adapter = new AuchanAdapter(auchanSite(() => journey()).deps)
    const before = adapter.readArrival()
    await adapter.readStore()

    const arrival = adapter.readArrival()

    expect(before.storeRead).toBeUndefined()
    expect(arrival.storeRead).toEqual({
      status: 200,
      contexts: ['GROCERY', 'ONLINE', 'STORE'],
      otherContexts: 0,
      store: 'READ',
      idForm: 'UUID',
      pickUp: true,
      label: true,
    })
    const text = JSON.stringify(arrival)
    for (const secret of [STORE_ID, 'Ville-Test', '123456789abc'])
      expect(text).not.toContain(secret)
  })

  it('des types de contexte inconnus ne sont que comptés, jamais nommés', async () => {
    const body = JSON.stringify({
      activeContexts: [
        { type: 'SECRET-TYPE-ONE', context: null },
        { type: 'SECRET-TYPE-TWO', context: null },
        { type: 'ONLINE', context: null },
      ],
    })
    const adapter = new AuchanAdapter(auchanSite(() => ({ body })).deps)
    await failureOf(() => adapter.readStore())

    const arrival = adapter.readArrival()

    expect(arrival.storeRead).toMatchObject({
      contexts: ['ONLINE'],
      otherContexts: 2,
      store: 'ABSENT',
      idForm: null,
    })
    expect(JSON.stringify(arrival)).not.toContain('SECRET')
  })

  it('aucun magasin choisi : « NONE » ; pas de canal de retrait connu : null', async () => {
    const adapter = new AuchanAdapter(auchanSite(() => journey('parcours-contexte-vide.json')).deps)
    await failureOf(() => adapter.readStore())

    expect(adapter.readArrival().storeRead).toMatchObject({
      store: 'NONE',
      pickUp: null,
      label: false,
    })
  })
})

describe('readEntry et followEntry : « Commencer mes achats », sans geste inventé', () => {
  it('une page qui n’a pas ce libellé : rien à faire (NONE), et suivre ne fait rien', async () => {
    const site = auchanSite(() => ({}))
    const adapter = new AuchanAdapter(site.deps)

    expect(adapter.readEntry()).toEqual({ kind: 'NONE' })
    await adapter.followEntry()

    expect(site.calls).toEqual([])
    expect(site.sleeps).toEqual([])
  })

  it('un bouton sans adresse : BUTTON, et followEntry le clique une fois, à la cadence (une pause entière), puis attend la navigation', async () => {
    showPage(auchanFixture('panier-vide-bouton.html'))
    const clicked = vi.fn<() => void>()
    document.getElementById('start-shopping')?.addEventListener('click', clicked)
    const site = auchanSite(() => ({}))
    const adapter = new AuchanAdapter(site.deps)

    expect(adapter.readEntry()).toEqual({ kind: 'BUTTON' })
    await adapter.followEntry()
    await adapter.followEntry()

    expect(clicked).toHaveBeenCalledOnce()
    expect(site.sleeps[0]).toBeGreaterThanOrEqual(2_000)
    expect(site.sleeps).toContain(ENTRY_WAIT_MS)
    expect(site.calls).toEqual([])
  })

  it('un lien qui reste sur le site : LINK avec l’adresse complète, suivi une fois par la page', async () => {
    showPage(auchanFixture('panier-vide-lien.html'))
    const navigate = vi.fn<(url: string) => void>()
    const adapter = new AuchanAdapter(auchanSite(() => ({}), { navigate }).deps)

    expect(adapter.readEntry()).toEqual({ kind: 'LINK', url: 'https://www.auchan.fr/courses' })
    await adapter.followEntry()
    await adapter.followEntry()

    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://www.auchan.fr/courses')
  })

  it.each([
    ['un lien vers un autre site', 'https://autre-site.invalid/courses'],
    ['un lien vers la page du mot de passe', 'https://compte.auchan.fr/auth/realms/x/login'],
    ['un lien avec identifiant', 'https://utilisateur:secret@www.auchan.fr/courses'],
    ['un lien vers un autre port', 'https://www.auchan.fr:8443/courses'],
    ['un lien en http', 'http://www.auchan.fr/courses'],
  ])('%s : REFUSED, jamais suivi', async (_name, href) => {
    document.body.innerHTML = `<a href="${href}">Commencer mes achats</a>`
    const navigate = vi.fn<(url: string) => void>()
    const adapter = new AuchanAdapter(auchanSite(() => ({}), { navigate }).deps)

    expect(adapter.readEntry()).toEqual({ kind: 'REFUSED' })
    await adapter.followEntry()

    expect(navigate).not.toHaveBeenCalled()
  })

  it('le libellé doit être exactement celui-là : une phrase plus longue ou un bouton désactivé ne sont pas touchés', () => {
    document.body.innerHTML = `
      <button>Commencer mes achats maintenant et profiter de nos offres de la semaine</button>
      <button disabled>Commencer mes achats</button>
      <button aria-disabled="true">Commencer mes achats</button>
      <button>Commencer mes courses</button>`

    expect(new AuchanAdapter(auchanSite(() => ({})).deps).readEntry()).toEqual({ kind: 'NONE' })
  })

  it('le libellé se lit aussi dans aria-label, sans accent ni casse', () => {
    document.body.innerHTML = '<button aria-label="COMMENCER MES ACHATS !"><svg></svg></button>'

    expect(new AuchanAdapter(auchanSite(() => ({})).deps).readEntry()).toEqual({ kind: 'BUTTON' })
  })

  it('un défi de l’anti-robot dans la page : CHALLENGE, rien n’est touché', async () => {
    document.body.innerHTML =
      '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe><button>Commencer mes achats</button>'
    const clicked = vi.fn<() => void>()
    document.querySelector('button')?.addEventListener('click', clicked)
    const adapter = new AuchanAdapter(auchanSite(() => ({})).deps)

    expect(adapter.readEntry()).toEqual({ kind: 'CHALLENGE' })
    await adapter.followEntry()

    expect(clicked).not.toHaveBeenCalled()
  })
})

describe('ce qui n’est pas écrit : ce que le diagnostic de Leclerc seul connaît', () => {
  const NOT_WRITTEN = [
    'aisleChoices',
    'aisleSamples',
    'describeLastReply',
    'describeProductLists',
    'exploreFacets',
    'readAisleMenu',
    'searchFiltered',
    'siteAisles',
    'validateSiteFilter',
  ]

  it.each(NOT_WRITTEN)(
    '%s lève CONTRACT_CHANGED (ADAPTER_NOT_WRITTEN), sans une requête',
    async (method) => {
      const site = auchanSite(() => journey())
      const adapter = new AuchanAdapter(site.deps) as unknown as Record<string, () => unknown>
      const call = async () => {
        await adapter[method]?.()
      }

      await expect(call()).rejects.toMatchObject({
        name: 'RetailerError',
        code: 'CONTRACT_CHANGED',
        cause: 'ADAPTER_NOT_WRITTEN',
      })
      expect(site.calls).toEqual([])
    },
  )

  it('n’a que les méthodes de l’interface', () => {
    const own = Object.getOwnPropertyNames(AuchanAdapter.prototype).filter(
      (name) => name !== 'constructor',
    )

    expect(own.sort()).toEqual(
      [
        ...NOT_WRITTEN,
        // Les deux méthodes privées de l'adaptateur sont sur son prototype aussi.
        'assertUsable',
        'navigationStatus',
        'cartQuantity',
        'exploreSearchVariants',
        'followEntry',
        'lastSearchFacts',
        'pageCartTotal',
        'readArrival',
        'readEntry',
        'readProductFromSearch',
        'readSession',
        'readStore',
        'rememberOffer',
        'searchProducts',
        'setCartQuantity',
        'stats',
      ].sort(),
    )
  })

  it('les accesseurs sans requête rendent « rien » : ni total de panier, ni quantité, ni recherche', () => {
    const adapter = new AuchanAdapter(auchanSite(() => ({})).deps)

    expect(adapter.pageCartTotal()).toBeNull()
    expect(adapter.cartQuantity('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBeNull()
    expect(adapter.lastSearchFacts()).toBeNull()
    expect(adapter.stats()).toEqual({
      requests: 0,
      errors: 0,
      blocks: 0,
      timeouts: 0,
      slow: 0,
      peakPauseMs: 0,
    })
  })
})

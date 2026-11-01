// La version mobile de Leclerc (DRV-754) : les faits MESURÉS le 2026-11-01 (recherche en JSON, lecture du panier `op=12`, hôte du serveur lu dans les liens du
// pied de page, question de l'ancien panier) et la façon dont l'adaptateur s'y prend sans jamais rien deviner. Aucun réseau, données inventées.
import { describe, expect, it } from 'vitest'

import { LeclercAdapter } from '../src/leclerc'
import { readCartListing, readMobileCartWrite } from '../src/leclerc/cart'
import {
  asksOldBasketChoice,
  cartReadRequest,
  cartWriteRequest,
  describeSearchForm,
  originOf,
  readMobileSearch,
  readServerHost,
  searchRequest,
  showsLastLogin,
  usesMobileProtocol,
} from '../src/leclerc/mobile'
import { describeCartReply } from '../src/leclerc/mobile-reply'
import { readSession } from '../src/leclerc/session'
import { RetailerError } from '../src/retailers'
import { fakeSite, type Call, type Scripted } from './leclerc-helpers'

const M_PAGE = {
  hostname: 'm-courses.leclercdrive.fr',
  pathname: '/magasin-000123-000123-ville-test',
  protocol: 'https:',
  port: '',
}
const SERVER = 'fd8-courses.leclercdrive.fr'
const STORE = { first: '000123', second: '000123' }
const FOOTER = `<footer><a href="https://${SERVER}/magasin-000123-000123-Ville-Test/plan-du-site">Plan du site</a></footer>`
const BODY = (...parts: string[]) => `<html><body>${parts.join('')}</body></html>`
const MEMBER_BAR = '<div class="bar">Dernière connexion le 01/11 à 12:00</div>'

/** Un produit de la réponse de recherche : les champs mesurés, libellés avec des entités HTML. */
function element(id: number, extra: Record<string, unknown> = {}) {
  return {
    objElement: {
      iIdProduit: id,
      sNoPointLivraison: '000123',
      iIdRayon: 4,
      iIdFamille: 41,
      sLibelleLigne1: 'Poireaux coup&#233;s',
      sLibelleLigne2: '500g',
      iQteDisponible: 12,
      sPrixUnitaire: '3,99 €',
      nrPVUnitaireTTC: 3.99,
      sPrixParUniteDeMesure: '7,98 € / kg',
      nrPVParUniteDeMesureTTC: 7.98,
      iQuantitePanier: 0,
      eDisponibilite: 0,
      ...extra,
    },
  }
}
const searchBody = (elements: unknown[], total = elements.length) =>
  JSON.stringify({
    sTexteRecherche: 'Poireau',
    iNbTotalProduits: total,
    lstFiltreBlocs: [],
    lstProduits: { lstElements: elements },
  })

/**
 * La réponse d'une écriture du panier de la version mobile (M13, M14), la forme MESURÉE le 2026-11-01 : produit (101 première fois, 103 changement, 102 retrait ; un refus :
 * 102 puis 106, quantité 0), rayon (503), panier (1), paniers complets (4).
 */
const writeBody = (quantity: number, types: number[] = [quantity === 0 ? 102 : 101]) =>
  JSON.stringify([
    ...types.map((type) => ({
      eTypeEvenement: type,
      sIdUnique: 'Produit1000001',
      objElement: {
        sType: 'Produit',
        iIdProduit: 1000001,
        sLibelleLigne1: 'Poireaux',
        iQuantitePanier: quantity,
        sTotalAPayer: '3,99 €',
        iQteDisponible: 12,
      },
    })),
    {
      eTypeEvenement: 503,
      sIdUnique: 'Rayon4',
      objElement: { sType: 'Rayon', iQuantitePanier: quantity },
    },
    {
      eTypeEvenement: 1,
      sIdUnique: 'Panier123',
      objElement: {
        sType: 'Panier',
        fEstVide: false,
        iQuantitePanier: quantity,
        sTotalAPayer: '9,47 €',
        lstProduitsLight: [{ iIdProduit: 1000001, iQtePanier: quantity }],
      },
    },
    {
      eTypeEvenement: 4,
      sIdUnique: 'pPaniers',
      sType: 'PaniersComplets',
      iQuantitePanier: quantity,
    },
  ])

/** La réponse de la lecture du panier (M5) : un évènement 6 dont l'objet est le panier. */
const listingBody = JSON.stringify([
  {
    eTypeEvenement: 6,
    sIdUnique: 'Panier123',
    objElement: {
      fEstPanierCourant: true,
      fEstVide: false,
      sNoPointLivraison: '000123',
      sType: 'Panier',
      sId: 'Panier123',
      iQuantitePanier: 5,
      sTotalAPayer: '9,47 €',
      lstProduitsLight: [
        { iIdProduit: 1000001, iQtePanier: 3 },
        { iIdProduit: 1000003, iQtePanier: 2 },
      ],
    },
  },
])

function shop(
  scripted: (call: Call, index: number) => Scripted,
  page: { text?: string; location?: typeof M_PAGE } = {},
) {
  const site = fakeSite(scripted, {
    location: page.location ?? M_PAGE,
    pageText: () => page.text ?? BODY(FOOTER, MEMBER_BAR),
  })
  return { site, adapter: new LeclercAdapter(site.deps) }
}

describe('l’hôte du serveur : lu dans les liens du pied de page, jamais deviné (M3)', () => {
  it('un lien du magasin vers fd<N>-courses : l’hôte, en minuscules', () => {
    expect(readServerHost(FOOTER, M_PAGE, STORE)).toEqual({ kind: 'FOUND', host: SERVER, links: 1 })
  })

  it('plusieurs liens du même hôte : un seul hôte', () => {
    const page = BODY(FOOTER, FOOTER.replace('plan-du-site', 'mentions'))

    expect(readServerHost(page, M_PAGE, STORE)).toMatchObject({ kind: 'FOUND', links: 2 })
  })

  it.each([
    ['aucun lien', BODY('<a href="/rayons">Rayons</a>')],
    ['un lien d’un autre magasin', BODY(FOOTER.replace('000123-000123', '000999-000999'))],
    [
      'un hôte qui n’est pas fd<N>-courses',
      BODY(FOOTER.replace(SERVER, 'exemple.leclercdrive.fr')),
    ],
    ['un hôte d’un autre domaine', BODY(FOOTER.replace(SERVER, 'fd8-courses.exemple.invalid'))],
    ['un lien avec identifiant', BODY(FOOTER.replace('https://', 'https://moi:secret@'))],
    ['un lien en http', BODY(FOOTER.replace('https://', 'http://'))],
    [
      'un lien dans un script',
      BODY(`<script>var a = '<a href="https://${SERVER}/magasin-000123-000123">'</script>`),
    ],
  ])('%s : rien n’est lu', (_name, page) => {
    expect(readServerHost(page, M_PAGE, STORE).kind).toBe('MISSING')
  })

  it('deux hôtes différents : ambigu, on ne choisit pas', () => {
    const page = BODY(FOOTER, FOOTER.replace('fd8-', 'fd9-'))

    expect(readServerHost(page, M_PAGE, STORE)).toMatchObject({ kind: 'AMBIGUOUS', links: 2 })
  })

  it('le schéma et le port de la page sont ceux du lien (un faux site de test)', () => {
    const local = { protocol: 'http:', port: '8099' }
    const page = BODY(
      FOOTER.replace(
        'https://fd8-courses.leclercdrive.fr',
        'http://fd8-courses.leclercdrive.fr:8099',
      ),
    )

    expect(readServerHost(page, local, STORE).kind).toBe('FOUND')
    expect(readServerHost(page, M_PAGE, STORE).kind).toBe('MISSING')
    expect(originOf(SERVER, local)).toBe('http://fd8-courses.leclercdrive.fr:8099')
    expect(originOf(SERVER, M_PAGE)).toBe(`https://${SERVER}`)
  })
})

describe('les requêtes de la version mobile (M1, M4, M5)', () => {
  it('la recherche : un POST sans corps ni en-tête, ng-ajax=1, idsupport=10, au chemin du magasin sans ville', () => {
    expect(searchRequest(`https://${SERVER}`, '/magasin-000123-000123', 'œuf frais')).toEqual({
      url: `https://${SERVER}/magasin-000123-000123/recherche-ajax.aspx?TexteRecherche=%C5%93uf%20frais&idsupport=10&ng-ajax=1`,
      init: { method: 'POST' },
    })
  })

  it('l’écriture : un champ de formulaire d EXACTEMENT celui de l’application mobile, le contenu des formulaires pour seul en-tête (M11)', () => {
    const { url, init } = cartWriteRequest(`https://${SERVER}`, '/magasin-000123-000123', {
      productId: '1000001',
      quantity: 2,
      deliveryPoint: '000123',
      searchText: 'poireau',
    })

    expect(url).toBe(`https://${SERVER}/magasin-000123-000123/panier.aspx?op=1&ng-ajax=1`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    // Relevé le 2026-11-01 : l'ordre des clés, l'identifiant en NOMBRE, eOrigine 9, eTypePage 3, niIdElement et lIdDemande nuls
    expect(decodeURIComponent(String(init.body))).toBe(
      'd={"eTypeAction":1,"iIdProduit":1000001,"iQuantite":2,"sNoPointLivraison":"000123","objContexteProvenanceArticle":{"eOrigine":9,"eTypePage":3,"niIdElement":null,"eVue":0,"sTexteRecherche":"poireau","lIdDemande":null}}',
    )
  })

  it('la lecture : op=12, d={"sNoPointLivraison":"…"}', () => {
    const { url, init } = cartReadRequest(`https://${SERVER}`, '/magasin-000123-000123', '000123')

    expect(url).toBe(`https://${SERVER}/magasin-000123-000123/panier.aspx?op=12&ng-ajax=1`)
    expect(decodeURIComponent(String(init.body))).toBe('d={"sNoPointLivraison":"000123"}')
  })
})

describe('la réponse de recherche (M1)', () => {
  it('lit les produits : entités HTML décodées, contenu, prix, prix au kilo, stock, quantité au panier', () => {
    const [first] = readMobileSearch(searchBody([element(17313, { iQuantitePanier: 2 })]))

    expect(first).toMatchObject({
      id: '17313',
      label1: 'Poireaux coupés',
      label2: '500g',
      unitPrice: 3.99,
      measureText: '7,98 € / kg',
      measurePrice: 7.98,
      stock: 12,
      inCart: 2,
      availability: 0,
    })
  })

  it('garde l’ordre de la liste', () => {
    const ids = readMobileSearch(searchBody([element(3), element(1), element(2)])).map((p) => p.id)

    expect(ids).toEqual(['3', '1', '2'])
  })

  it('aucun résultat n’est pas une erreur : une liste vide', () => {
    expect(readMobileSearch(searchBody([], 0))).toEqual([])
  })

  it.each([
    ['du texte', 'ce n’est pas du JSON', 'SEARCH_NOT_JSON'],
    ['une page HTML', '<html><body>Bonjour</body></html>', 'SEARCH_NOT_JSON'],
    ['un objet sans liste', JSON.stringify({ iNbTotalProduits: 3 }), 'SEARCH_NO_LIST'],
    [
      'une liste de produits qui n’est pas une liste',
      JSON.stringify({ lstProduits: [] }),
      'SEARCH_NO_LIST',
    ],
    ['des produits annoncés sans élément', searchBody([], 4), 'SEARCH_PRODUCTS_UNREADABLE'],
    [
      'des éléments sans produit lisible',
      searchBody([{ objElement: { x: 1 } }, { y: 2 }]),
      'SEARCH_PRODUCTS_UNREADABLE',
    ],
  ])('%s : CONTRACT_CHANGED avec sa cause %s', (_name, body, cause) => {
    expect(() => readMobileSearch(body, 200)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause, status: 200 }),
    )
  })

  it('la forme dit les NOMS de clés et jamais une valeur', () => {
    const form = describeSearchForm(
      JSON.stringify({
        sTexteRecherche: 'secret perso',
        lstProduits: { lstElements: [{}, {}], 'Marie Dupont': 1 },
        'adresse de livraison': 'rue X',
      }),
    )

    expect(form).toContain('sTexteRecherche')
    expect(form).toContain('lstElements : liste de 2')
    expect(form).not.toMatch(/secret|Marie|Dupont|rue X|adresse/)
    expect(form).toContain('?')
  })

  it.each([
    ['', 'corps vide'],
    ['<p>x</p>', 'page HTML'],
    ['bonjour', 'texte, pas du JSON'],
    ['[1,2]', 'JSON : liste de 2'],
    ['{"lstProduits":[1]}', 'lstProduits : liste de 1'],
    ['{"iNbTotalProduits":1}', 'lstProduits : absent'],
  ])('la forme de « %s »', (body, expected) => {
    expect(describeSearchForm(body)).toContain(expected)
  })
})

describe('la lecture du panier (M5)', () => {
  it('le panier : nombre d’articles, total en centimes, quantité de chaque produit', () => {
    const listing = readCartListing(listingBody)

    expect(listing.items).toBe(5)
    expect(listing.totalCents).toBe(947)
    expect([...listing.quantities]).toEqual([
      ['1000001', 3],
      ['1000003', 2],
    ])
  })

  it.each([
    ['du texte', 'oups', 'CART_NOT_JSON'],
    ['un tableau sans panier', JSON.stringify([{ eTypeEvenement: 7 }]), 'CART_NO_CART_EVENT'],
    [
      'un panier sans liste de produits',
      JSON.stringify([{ eTypeEvenement: 6, objElement: { sType: 'Panier' } }]),
      'CART_NO_PRODUCT_LIST',
    ],
  ])('%s : CONTRACT_CHANGED, cause %s', (_name, body, cause) => {
    expect(() => readCartListing(body)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause }),
    )
  })
})

describe('la page : question de l’ancien panier et connexion (M6)', () => {
  const QUESTION = BODY(
    '<h1>Information</h1><p>Vous aviez commencé un panier le 30/10. Souhaitez-vous compléter le panier en cours avec les articles du panier du 30/10 ?</p>',
    '<button>Oui je souhaite compléter mon panier</button><button>Non je ne souhaite pas compléter mon panier</button>',
  )

  it('les DEUX boutons dans la page : la question est posée', () => {
    expect(asksOldBasketChoice(QUESTION)).toBe(true)
  })

  it.each([
    [
      'un seul bouton',
      QUESTION.replace('<button>Non je ne souhaite pas compléter mon panier</button>', ''),
    ],
    [
      'les boutons dans un script',
      BODY(
        '<script>var a = "Oui je souhaite compléter mon panier Non je ne souhaite pas compléter mon panier"</script>',
      ),
    ],
    ['une page ordinaire', BODY(FOOTER)],
  ])('%s : pas de question', (_name, page) => {
    expect(asksOldBasketChoice(page)).toBe(false)
  })

  it('la barre « Dernière connexion le … » est un signe de connexion, jamais seul : un visiteur reconnu l’emporte', () => {
    const member = readSession(BODY(MEMBER_BAR))
    const contradicted = readSession(BODY(MEMBER_BAR, '<a href="/c">Connexion / Inscription</a>'))

    expect(showsLastLogin(BODY(MEMBER_BAR))).toBe(true)
    expect(member).toEqual({ state: 'MEMBER', signs: ['LAST_LOGIN_BAR'] })
    // « Connexion / Inscription » : connexion (signe faible) et inscription (fort) : pas de « connecté »
    expect(contradicted.state).not.toBe('MEMBER')
  })

  it('« Connexion / Inscription » sans barre : un visiteur', () => {
    expect(readSession(BODY('<a href="/c">Connexion / Inscription</a>')).state).toBe('VISITOR')
  })
})

describe('la forme d’une réponse du panier : jamais une valeur', () => {
  it('une page de connexion : HTML, le mot LOGIN, jamais le texte', () => {
    const facts = describeCartReply({
      status: 200,
      text: '<html><form><input type="password"> secret-de-marie</form></html>',
      url: `https://${SERVER}/magasin-000123-000123/panier.aspx?op=1`,
      redirected: false,
      headers: ['content-type', 'set-cookie'],
      contentType: 'text/html; charset=utf-8',
    })

    expect(facts).toMatchObject({ status: 200, mime: 'text/html', body: 'HTML', words: ['LOGIN'] })
    expect(facts.headers).toEqual(['content-type'])
    expect(JSON.stringify(facts)).not.toMatch(/marie|000123/i)
  })
})

describe('l’adaptateur sur m-courses', () => {
  it('prend la version mobile pour les pages m-courses et mobile-….aspx du serveur, pas pour les pages du site ordinateur', () => {
    expect(usesMobileProtocol(M_PAGE)).toBe(true)
    expect(
      usesMobileProtocol({
        hostname: SERVER,
        pathname: '/magasin-1-1-Ville/mobile-detail-panier.aspx',
      }),
    ).toBe(true)
    expect(
      usesMobileProtocol({ hostname: SERVER, pathname: '/magasin-1-1-Ville/accueil.aspx' }),
    ).toBe(false)
  })

  it('le magasin : les numéros de l’adresse, l’hôte du serveur lu dans le pied de page', async () => {
    const { adapter } = shop(() => ({}))

    await expect(adapter.readStore()).resolves.toEqual({
      id: '000123',
      host: SERVER,
      baseUrl: `https://${SERVER}/magasin-000123-000123`,
      label: null,
    })
  })

  it('le pied de page se dessine après l’arrivée : l’agent l’attend (lectures de la page, aucune requête)', async () => {
    let reads = 0
    const site = fakeSite(() => ({}), {
      location: M_PAGE,
      pageText: () => (++reads < 5 ? BODY() : BODY(FOOTER)),
    })
    const adapter = new LeclercAdapter(site.deps)

    await expect(adapter.readStore()).resolves.toMatchObject({ host: SERVER })
    expect(site.calls).toEqual([])
    expect(site.sleeps.length).toBeGreaterThan(0)
  })

  it('aucun lien après 10 s : UNSUPPORTED_PAGE, cause PAGE_SERVER_HOST ; aucune requête', async () => {
    const { site, adapter } = shop(() => ({}), { text: BODY() })

    await expect(adapter.readStore()).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause: 'PAGE_SERVER_HOST' }),
    )
    await expect(adapter.searchProducts('poireau')).rejects.toThrow(
      expect.objectContaining({ cause: 'PAGE_SERVER_HOST' }),
    )
    expect(site.calls).toEqual([])
    expect(site.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(10_000)
  })

  it('deux hôtes différents dans les liens : on ne choisit pas', async () => {
    const { adapter } = shop(() => ({}), { text: BODY(FOOTER, FOOTER.replace('fd8-', 'fd9-')) })

    await expect(adapter.readStore()).rejects.toThrow(
      expect.objectContaining({ cause: 'PAGE_SERVER_HOST' }),
    )
  })

  it('la question de l’ancien panier posée : BASKET_MERGE_ASKED, l’agent n’écrit ni ne clique rien', async () => {
    const question = BODY(
      FOOTER,
      '<button>Oui je souhaite compléter mon panier</button><button>Non je ne souhaite pas compléter mon panier</button>',
    )
    const { site, adapter } = shop(() => ({ body: writeBody(1) }), { text: question })

    await expect(adapter.readStore()).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause: 'BASKET_MERGE_ASKED' }),
    )
    expect(adapter.basketChoiceAsked?.()).toBe(true)
    await expect(adapter.setCartQuantity('1000001', 1)).rejects.toThrow(
      expect.objectContaining({ cause: 'BASKET_MERGE_ASKED' }),
    )
    expect(site.calls).toEqual([])
  })

  it('exige la preuve de la connexion, garde les cartes hors du mur de cookies, et lit la connexion de la page', () => {
    const { adapter } = shop(() => ({}))

    expect(adapter.requiresConfirmedLogin).toBe(true)
    expect(adapter.keepClearOfConsent).toBe(true)
    expect(adapter.readSession().state).toBe('MEMBER')
    expect(adapter.basketChoiceAsked?.()).toBe(false)
  })

  it('un adaptateur sur une page du site ordinateur n’a rien de tout cela (comportement d’avant)', () => {
    const site = fakeSite(() => ({}))
    const adapter = new LeclercAdapter(site.deps)

    expect(adapter.requiresConfirmedLogin).toBeUndefined()
    expect(adapter.basketChoiceAsked).toBeUndefined()
    expect(adapter.probeCart).toBeUndefined()
    expect(adapter.lastCartFailure).toBeUndefined()
  })

  it('la page de connexion mobile et la création de compte se reconnaissent à leur adresse seulement', () => {
    const on = (pathname: string, hostname = 'fd8-espace-client.leclercdrive.fr') =>
      new LeclercAdapter(
        fakeSite(() => ({}), { location: { hostname, pathname } }).deps,
      ).onLoginPage?.()

    expect(on('/drive/magasin-000123-000123-Ville-Test/authentification.aspx')).toBe(true)
    expect(on('/drive/magasin-000123-000123-ville-test/creation-compte-ccc.aspx')).toBe(true)
    expect(on('/connexion.aspx', 'fd0-courses.leclercdrive.fr')).toBe(true)
    // Le compte, après la connexion, n'est pas une page de connexion
    expect(on('/drive/magasin-000123-000123-Ville-Test/home-espace-client-ccc.aspx')).toBe(false)
  })
})

describe('la recherche sur m-courses (M1, M2)', () => {
  it('un POST au serveur du magasin, session envoyée, rien d’autre ; les produits lus, le stock noté', async () => {
    const { site, adapter } = shop(() => ({ body: searchBody([element(1000001)]) }))

    const found = await adapter.searchProducts('poireau')

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      id: '1000001',
      label: 'Poireaux coupés',
      price: 399,
      stock: 12,
    })
    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe(
      `https://${SERVER}/magasin-000123-000123/recherche-ajax.aspx?TexteRecherche=poireau&idsupport=10&ng-ajax=1`,
    )
    expect(site.calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(site.calls[0]?.init.headers).toBeUndefined()
    expect(site.calls[0]?.init.body).toBeUndefined()
    // Les formes du diagnostic : la variante « m », la forme de la réponse, la connexion de la PAGE, jamais le contenu
    const facts = adapter.lastSearchFacts()
    expect(facts).toMatchObject({ variant: 'm', outcome: 'PRODUCTS', products: 1, status: 200 })
    expect(facts?.form).toContain('lstElements : liste de 1')
    expect(facts?.session).toContain('connecté')
    expect(JSON.stringify(facts)).not.toContain('Poireaux')
  })

  it('aucun résultat : une liste vide, issue EMPTY', async () => {
    const { adapter } = shop(() => ({ body: searchBody([], 0) }))

    await expect(adapter.searchProducts('xyz')).resolves.toEqual([])
    expect(adapter.lastSearchFacts()).toMatchObject({ outcome: 'EMPTY', products: 0 })
  })

  it('une réponse qui n’est pas la bonne : CONTRACT_CHANGED avec la cause ET la forme de la réponse', async () => {
    const { adapter } = shop(() => ({ body: JSON.stringify({ iNbTotalProduits: 2, liste: [] }) }))

    await expect(adapter.searchProducts('poireau')).rejects.toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause: 'SEARCH_NO_LIST' }),
    )
    const facts = adapter.lastSearchFacts()
    expect(facts).toMatchObject({ outcome: 'FAILED', fault: { cause: 'SEARCH_NO_LIST' } })
    expect(facts?.form).toBe('JSON : iNbTotalProduits, ? ; lstProduits : absent')
  })

  it('un refus du site (404) : CONTRACT_CHANGED avec le code, comme avant', async () => {
    const { adapter } = shop(() => ({ status: 404, body: '<html>Page introuvable</html>' }))

    await expect(adapter.searchProducts('poireau')).rejects.toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause: 'HTTP_404' }),
    )
  })

  it('aucune sonde de variante, aucun filtre par rayon (jamais mesuré sur la version mobile)', async () => {
    const { site, adapter } = shop(() => ({ body: searchBody([element(1000001)]) }))
    await adapter.searchProducts('poireau')

    await expect(adapter.exploreSearchVariants('poireau')).resolves.toHaveLength(1)
    await expect(adapter.exploreFacets('poireau', [])).resolves.toBeNull()
    await expect(adapter.validateSiteFilter('poireau')).resolves.toBe(false)
    expect(adapter.siteAisles()).toEqual([])
    expect(site.calls).toHaveLength(1)
  })
})

describe('l’écriture du panier sur m-courses (M4, M11 à M15)', () => {
  const answer = (scripted: Scripted) => (call: Call) =>
    call.url.includes('recherche-ajax') ? { body: searchBody([element(1000001)]) } : scripted

  it('un POST de formulaire au serveur : la quantité au panier est lue dans la réponse', async () => {
    const { site, adapter } = shop(answer({ body: writeBody(2) }))
    await adapter.searchProducts('poireau')

    const result = await adapter.setCartQuantity('1000001', 2)

    expect(result).toMatchObject({ ok: true, sent: 2, obtained: 2, items: 2, totalCents: 947 })
    const write = site.calls[1]
    expect(write?.url).toBe(`https://${SERVER}/magasin-000123-000123/panier.aspx?op=1&ng-ajax=1`)
    expect(write?.init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(write?.init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    // Le point de livraison vient de la réponse de recherche, le texte cherché est joint
    const d = JSON.parse(decodeURIComponent(String(write?.init.body).slice(2))) as Record<
      string,
      unknown
    >
    expect(d).toMatchObject({
      eTypeAction: 1,
      iIdProduit: 1000001,
      iQuantite: 2,
      sNoPointLivraison: '000123',
      objContexteProvenanceArticle: { eOrigine: 9, eTypePage: 3, sTexteRecherche: 'poireau' },
    })
  })

  it('M12 : la quantité est ABSOLUE, un second envoi demande le total voulu (103 : changement)', async () => {
    const { site, adapter } = shop(answer({ body: writeBody(3, [103]) }))
    await adapter.searchProducts('poireau')

    const result = await adapter.setCartQuantity('1000001', 3)

    expect(result).toMatchObject({ ok: true, obtained: 3 })
    const d = JSON.parse(decodeURIComponent(String(site.calls[1]?.init.body).slice(2))) as {
      iQuantite: number
    }
    expect(d.iQuantite).toBe(3)
  })

  it('M14 : un produit que Leclerc ne prend pas (102 puis 106, quantité 0) : pas ok, aucune erreur, jamais « le site a changé »', async () => {
    const { adapter } = shop(answer({ body: writeBody(0, [102, 106]) }))
    await adapter.searchProducts('poireau')

    await expect(adapter.setCartQuantity('1000001', 1)).resolves.toMatchObject({
      ok: false,
      obtained: 0,
      sent: 1,
    })
    expect(adapter.lastCartFailure?.()).toBeNull()
  })

  it('une quantité qui n’est pas celle demandée sans question dans la page : pas ok (le refus se juge comme avant), aucune erreur', async () => {
    const { adapter } = shop(answer({ body: writeBody(0) }))
    await adapter.searchProducts('poireau')

    await expect(adapter.setCartQuantity('1000001', 2)).resolves.toMatchObject({
      ok: false,
      obtained: 0,
    })
  })

  it('une réponse illisible : CONTRACT_CHANGED avec la cause et la FORME de la réponse, gardée pour le diagnostic', async () => {
    const { adapter } = shop(answer({ body: '<html>Erreur</html>', status: 200 }))
    await adapter.searchProducts('poireau')

    const failure = await adapter.setCartQuantity('1000001', 1).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RetailerError)
    expect(failure).toMatchObject({ code: 'CONTRACT_CHANGED', cause: 'CART_NOT_JSON', status: 200 })
    expect((failure as RetailerError).reply).toMatchObject({ status: 200, body: 'HTML' })
    expect(adapter.lastCartFailure?.()).toMatchObject({ status: 200, body: 'HTML' })
  })

  it('H4 : une écriture sans effet PENDANT la question de l’ancien panier : BASKET_MERGE_ASKED, pas « le site a changé »', async () => {
    // Given : la page ne pose pas la question au départ ; elle la pose après l'envoi de l'ajout (la réponse est ignorée)
    let asked = false
    const site = fakeSite(
      (call) => {
        if (call.url.includes('recherche-ajax')) return { body: searchBody([element(1000001)]) }
        asked = true
        return { body: writeBody(0) }
      },
      {
        location: M_PAGE,
        pageText: () =>
          asked
            ? BODY(
                FOOTER,
                '<button>Oui je souhaite compléter mon panier</button><button>Non je ne souhaite pas compléter mon panier</button>',
              )
            : BODY(FOOTER, MEMBER_BAR),
      },
    )
    const adapter = new LeclercAdapter(site.deps)
    await adapter.searchProducts('poireau')

    await expect(adapter.setCartQuantity('1000001', 2)).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_PAGE', cause: 'BASKET_MERGE_ASKED' }),
    )
  })

  it('H4 : une réponse illisible pendant la question : BASKET_MERGE_ASKED aussi, avec la forme de la réponse', async () => {
    let asked = false
    const site = fakeSite(
      (call) => {
        if (call.url.includes('recherche-ajax')) return { body: searchBody([element(1000001)]) }
        asked = true
        return { status: 500, body: 'oups' }
      },
      {
        location: M_PAGE,
        pageText: () =>
          asked
            ? BODY(
                FOOTER,
                '<button>Oui je souhaite compléter mon panier</button><button>Non je ne souhaite pas compléter mon panier</button>',
              )
            : BODY(FOOTER),
      },
    )
    const adapter = new LeclercAdapter(site.deps)
    await adapter.searchProducts('poireau')

    const failure = (await adapter
      .setCartQuantity('1000001', 1)
      .catch((error: unknown) => error)) as RetailerError

    expect(failure).toMatchObject({ code: 'UNSUPPORTED_PAGE', cause: 'BASKET_MERGE_ASKED' })
    expect(failure.reply).toMatchObject({ status: 500, body: 'TEXT' })
  })

  it('refuse une quantité ou un produit invalide avant toute requête', async () => {
    const { site, adapter } = shop(() => ({}))

    await expect(adapter.setCartQuantity('abc', 1)).rejects.toThrow(RangeError)
    await expect(adapter.setCartQuantity('1', -1)).rejects.toThrow(RangeError)
    expect(site.calls).toEqual([])
  })
})

describe('readMobileCartWrite : la forme MESURÉE d’une écriture (M13, M14)', () => {
  it.each([
    ['la première fois (101)', [101]],
    ['un changement de quantité (103)', [103]],
  ])('%s : la quantité du produit au panier, le total d’articles et le total', (_name, types) => {
    const reading = readMobileCartWrite(writeBody(2, types), '1000001', 2)

    expect(reading).toMatchObject({
      obtained: 2,
      items: 2,
      totalCents: 947,
      refused: false,
      product: { stock: 12, availability: null },
    })
    expect([...reading.quantities]).toEqual([['1000001', 2]])
  })

  it('un retrait (102, quantité 0) n’est pas un refus', () => {
    expect(readMobileCartWrite(writeBody(0, [102]), '1000001', 0)).toMatchObject({
      obtained: 0,
      refused: false,
    })
  })

  it('un refus : 102 puis 106, quantité 0 alors qu’une quantité est demandée', () => {
    expect(readMobileCartWrite(writeBody(0, [102, 106]), '1000001', 1)).toMatchObject({
      obtained: 0,
      refused: true,
    })
  })

  it.each([
    ['du texte', 'oups', 'CART_NOT_JSON'],
    ['un objet seul', '{"a":1}', 'CART_NO_PRODUCT_EVENT'],
    [
      'un autre produit',
      writeBody(1).replaceAll('Produit1000001', 'Produit9').replaceAll('1000001', '9'),
      'CART_NO_PRODUCT_EVENT',
    ],
    [
      'une quantité illisible',
      writeBody(1).replace(
        '"iQuantitePanier":1,"sTotalAPayer":"3,99 €"',
        '"iQuantitePanier":"x","sTotalAPayer":"3,99 €"',
      ),
      'CART_QUANTITY_UNREADABLE',
    ],
    ['pas d’évènement panier', JSON.stringify([JSON.parse(writeBody(1))[0]]), 'CART_NO_CART_EVENT'],
  ])('%s : CONTRACT_CHANGED, cause %s', (_name, body, cause) => {
    expect(() => readMobileCartWrite(body, '1000001', 1)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause }),
    )
  })
})

describe('la sonde de lecture du panier du diagnostic (M5)', () => {
  it('UNE lecture (POST op=12), le nombre de lignes, la forme de la réponse ; rien n’est retenu ni écrit', async () => {
    const { site, adapter } = shop(() => ({ body: listingBody }))

    const facts = await adapter.probeCart?.()

    expect(facts).toMatchObject({ outcome: 'READ', lines: 2, fault: null })
    expect(facts?.reply).toMatchObject({ status: 200, body: 'JSON' })
    expect(site.calls).toHaveLength(1)
    expect(site.calls[0]?.url).toBe(
      `https://${SERVER}/magasin-000123-000123/panier.aspx?op=12&ng-ajax=1`,
    )
    expect(decodeURIComponent(String(site.calls[0]?.init.body))).toBe(
      'd={"sNoPointLivraison":"000123"}',
    )
    expect(adapter.cartQuantity('1000001')).toBeNull()
  })

  it('une réponse qui n’est pas un panier : FAILED avec la cause, la forme et le code, jamais une exception', async () => {
    const { adapter } = shop(() => ({ body: '{}' }))

    const facts = await adapter.probeCart?.()

    expect(facts).toMatchObject({
      outcome: 'FAILED',
      lines: null,
      fault: { code: 'CONTRACT_CHANGED', status: 200 },
    })
    expect(facts?.reply).toMatchObject({ body: 'JSON_EMPTY' })
  })

  it('une page sans serveur lisible : FAILED, aucune requête', async () => {
    const { site, adapter } = shop(() => ({}), { text: BODY() })

    const facts = await adapter.probeCart?.()

    expect(facts).toMatchObject({
      outcome: 'FAILED',
      reply: null,
      fault: { cause: 'PAGE_SERVER_HOST' },
    })
    expect(site.calls).toEqual([])
  })
})

describe('le diagnostic de la page de la version mobile : des formes, jamais une valeur', () => {
  it('d’où vient l’hôte, combien de liens, la question de l’ancien panier, la connexion', async () => {
    const { adapter } = shop(() => ({}))

    const before = adapter.readArrival().mobile
    await adapter.readStore()
    const after = adapter.readArrival().mobile

    expect(before).toMatchObject({ serverHost: 'FOOTER', links: 1, oldBasketQuestion: false })
    expect(after).toMatchObject({ serverHost: 'FOOTER', links: 1 })
    expect(after?.session).toContain('connecté')
    expect(JSON.stringify(after)).not.toContain('fd8')
  })

  it('une page du site ordinateur n’en dit rien', () => {
    const site = fakeSite(() => ({}))

    expect(new LeclercAdapter(site.deps).readArrival().mobile).toBeUndefined()
  })
})

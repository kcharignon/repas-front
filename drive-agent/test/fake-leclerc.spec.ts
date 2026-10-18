// @vitest-environment node
// Le faux site Leclerc (DRV-309, drive-agent/fake-leclerc/) lu avec les analyseurs RÉELS de l'agent : s'il s'écartait de la forme relevée
// sur le vrai site, l'agent ne le comprendrait plus. On prouve aussi ses garde-fous : accès local seulement, requête du panier vérifiée
// à la lettre, détection d'une cadence trop rapide ou en parallèle.
import { request } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cartBody, CART_HEADERS, readCartResponse } from '../src/leclerc/cart'
import { extractProducts } from '../src/leclerc/embedded'
import { toCandidate } from '../src/leclerc/candidate'
import { readSearchPage } from '../src/leclerc/search-page'
import { readSession } from '../src/leclerc/session'
import {
  CART_PATH,
  HOME_HOST,
  isLoopback,
  OTHER_STORE_PATH,
  PAGE_PATH,
  STORE,
  startFakeLeclerc,
  type FakeLeclerc,
} from '../fake-leclerc/server'
import { BACK_FORBIDDEN, backAcceptsLabel } from './back-label-rules'

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  text: string
}

let fake: FakeLeclerc

beforeEach(async () => {
  fake = await startFakeLeclerc()
})
afterEach(async () => {
  await fake.close()
})

/** Une requête HTTP brute vers le faux site (le nom d'hôte est un en-tête : rien ne résout `courses-test.leclercdrive.fr` ici). */
function call(
  path: string,
  {
    method = 'GET',
    host = STORE.host,
    headers = {},
    body,
  }: { method?: string; host?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: fake.port,
        path,
        method,
        headers: { Host: `${host}:${fake.port}`, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

const search = (word: string) =>
  call(`${PAGE_PATH}/recherche.aspx?TexteRecherche=${encodeURIComponent(word)}`)

/** La requête du panier telle que l'agent l'envoie, avec ce qu'un test veut casser. */
function cartCall(
  productId: string,
  quantity: number,
  {
    path = `${CART_PATH}/panier.aspx?op=1`,
    headers = CART_HEADERS,
    searchText = 'farine',
  }: { path?: string; headers?: Record<string, string>; searchText?: string } = {},
): Promise<Reply> {
  const body = cartBody({ productId, quantity, deliveryPoint: '123456', searchText })
  return call(path, { method: 'POST', headers, body })
}

describe('la page de recherche', () => {
  it('est lue par l’analyseur de l’agent : produits, stock, promotion, contenu structuré, prix à la mesure', async () => {
    // When
    const reply = await search('farine')
    const { products } = extractProducts(reply.text)
    const candidates = products.map(toCandidate)

    // Then
    expect(reply.status).toBe(200)
    expect(reply.headers['x-frame-options']).toBe('DENY')
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      '1000001',
      '1000002',
      '1000003',
      '1000004',
      '1000005',
    ])
    expect(candidates.map((candidate) => candidate.stock)).toEqual([12, 0, 5, 3, 8])
    expect(candidates[2]).toMatchObject({
      price: 280,
      promo: 249,
      content: { value: 1000, unit: 'g' },
    })
    expect(candidates[0]).toMatchObject({
      price: 129,
      pricePerMeasure: { cents: 129, unit: 'kg' },
      content: { value: 1000, unit: 'g' },
    })
    expect(candidates[4]?.contentSource).toBe('structured')
  })

  it('trouve par tous les mots cherchés, sans tenir compte des accents ni des majuscules', async () => {
    // When
    const milk = extractProducts((await search('LAIT demi-écrémé')).text).products
    const eggs = extractProducts((await search('œufs')).text).products

    // Then
    expect(milk.map((product) => product.id)).toEqual(['1000011'])
    expect(eggs.map((product) => product.id)).toEqual(['1000014', '1000015'])
  })

  it('sert un produit aux libellés marqués de caractères invisibles, que l’analyseur de l’agent nettoie (le back les refuserait)', async () => {
    // When
    const reply = await search('vinaigre')
    const [product] = extractProducts(reply.text).products
    const raw = /"sLibelleLigne1": "([^"]*)"/.exec(reply.text)?.[1] ?? ''

    // Then : la page porte bien des caractères que le back refuse, l'agent n'en garde aucun
    expect(BACK_FORBIDDEN.test(raw)).toBe(true)
    expect(product?.id).toBe('1000032')
    expect(product?.label1).toBe('Vinaigre de cidre Verger Imaginaire')
    expect(product?.label2).toBe('75 cl')
    expect(backAcceptsLabel(product?.label1 ?? '')).toBe(true)
    expect(toCandidate(product as never).content).toEqual({ value: 750, unit: 'ml' })
  })

  it('dit « aucun résultat » quand rien ne correspond', async () => {
    // When
    const reply = await search('zzzz')

    // Then
    expect(reply.text).toContain('Aucun résultat pour votre recherche')
    expect(extractProducts(reply.text).products).toEqual([])
  })

  it('porte le point de livraison, distinct de l’identifiant du magasin, et la quantité déjà au panier', async () => {
    // Given
    fake.seedCart({ 1000001: 2 })

    // When
    const reply = await search('farine')

    // Then
    expect(reply.text).toContain('"sNoPointLivraison": "123456"')
    expect(extractProducts(reply.text).products[0]).toMatchObject({ id: '1000001', inCart: 2 })
  })
})

describe('le panier', () => {
  it('fixe une quantité ABSOLUE, dans les deux sens, et répond comme le site (lstProduitsLight)', async () => {
    // When
    const added = await cartCall('1000001', 3)
    const lowered = await cartCall('1000001', 2)
    const removed = await cartCall('1000001', 0)

    // Then
    expect(added.headers['x-datadome']).toBe('protected')
    expect(readCartResponse(added.text, '1000001')).toMatchObject({
      obtained: 3,
      items: 3,
      totalCents: 387,
    })
    expect(readCartResponse(lowered.text, '1000001').obtained).toBe(2)
    expect(readCartResponse(removed.text, '1000001').obtained).toBe(0)
    expect(fake.cart()).toEqual({})
  })

  it('plafonne au stock et ne met pas au panier un produit en rupture', async () => {
    // When
    const capped = await cartCall('1000001', 50)
    const out = await cartCall('1000002', 1)

    // Then
    expect(readCartResponse(capped.text, '1000001').obtained).toBe(12)
    expect(readCartResponse(out.text, '1000002').obtained).toBe(0)
    expect(fake.cart()).toEqual({ 1000001: 12 })
  })

  it('compte le prix promotionnel dans le total', async () => {
    // When
    const reply = await cartCall('1000003', 2)

    // Then
    expect(readCartResponse(reply.text, '1000003')).toMatchObject({ obtained: 2, totalCents: 498 })
  })

  it.each([
    ['sans l’en-tête zcwb', { headers: { ...CART_HEADERS, zcwb: '' } }, 'zcwb'],
    [
      'sans X-Requested-With',
      { headers: { ...CART_HEADERS, 'X-Requested-With': '' } },
      'X-Requested-With',
    ],
    ['à l’adresse avec le suffixe de ville', { path: `${PAGE_PATH}/panier.aspx?op=1` }, 'suffixe'],
  ])('répond par la page d’erreur 404 à une requête %s', async (_name, options, why) => {
    // When
    const reply = await cartCall('1000001', 1, options)

    // Then
    expect(reply.status).toBe(404)
    expect(reply.text).toContain('momentanément indisponible')
    expect(fake.paced().at(-1)?.rejected).toContain(why)
    expect(fake.cart()).toEqual({})
  })

  it.each([
    [
      'un identifiant en nombre',
      {
        eTypeAction: 1,
        iIdProduit: 1000001,
        iQuantite: 1,
        sNoPointLivraison: '123456',
        objContexteProvenanceArticle: {
          eOrigine: 4,
          eTypePage: 3,
          sTexteRecherche: 'x',
          eVue: 0,
          sInformationsComplementaires: 'uni-2',
        },
      },
    ],
    [
      'un ajout sans objet de contexte',
      { eTypeAction: 1, iIdProduit: '1000001', iQuantite: 1, sNoPointLivraison: '123456' },
    ],
    [
      'un retrait avec un objet de contexte',
      {
        eTypeAction: 2,
        iIdProduit: '1000001',
        iQuantite: 0,
        sNoPointLivraison: '123456',
        objContexteProvenanceArticle: {},
      },
    ],
    [
      'un autre point de livraison',
      { eTypeAction: 2, iIdProduit: '1000001', iQuantite: 0, sNoPointLivraison: '000001' },
    ],
  ])('refuse %s', async (_name, payload) => {
    // When
    const reply = await call(`${CART_PATH}/panier.aspx?op=1`, {
      method: 'POST',
      headers: CART_HEADERS,
      body: `d=${encodeURIComponent(JSON.stringify(payload))}`,
    })

    // Then
    expect(reply.status).toBe(404)
    expect(fake.paced().at(-1)?.rejected).toBeTruthy()
  })
})

describe('l’accès local seulement', () => {
  it('reconnaît la boucle locale et rien d’autre', () => {
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].map(isLoopback)).toEqual([true, true, true])
    expect(
      ['10.0.0.5', '192.168.1.20', '::ffff:10.0.0.5', '2001:db8::1', undefined].map(isLoopback),
    ).toEqual([false, false, false, false, false])
  })

  it('refuse un nom d’hôte qui n’est pas dans sa liste, même par la boucle locale', async () => {
    // When
    const replies = await Promise.all(
      ['example.com', 'www.leclercdrive.fr', 'fd9-courses.leclercdrive.fr'].map((host) =>
        call('/', { host }),
      ),
    )

    // Then
    expect(replies.map((reply) => reply.status)).toEqual([403, 403, 403])
    expect(fake.requests()).toEqual([])
  })

  it('n’écoute que sur 127.0.0.1', () => {
    expect(fake.leclerc).toBe(`http://courses-test.leclercdrive.fr:${fake.port}`)
    expect(fake.repas).toBe(`http://localhost:${fake.port}`)
  })

  it('n’offre son pilotage qu’aux noms de la boucle locale, pas sous le nom du faux magasin', async () => {
    // When
    const local = await call('/__fake/state', { host: 'localhost' })
    const store = await call('/__fake/state')

    // Then
    expect(local.status).toBe(200)
    expect(JSON.parse(local.text)).toMatchObject({ cart: {}, violations: [] })
    expect(store.status).toBe(404)
  })

  it('accepte un nom de faux magasin ajouté à la demande', async () => {
    // Given
    await fake.close()
    fake = await startFakeLeclerc({ hosts: ['fd0-courses.leclercdrive.fr'] })

    // When
    const reply = await call(`${PAGE_PATH}/`, { host: 'fd0-courses.leclercdrive.fr' })

    // Then
    expect(reply.status).toBe(200)
  })
})

describe('la cadence', () => {
  it('note deux requêtes en parallèle', async () => {
    // Given
    fake.setBehavior({ latencyMs: 100 })

    // When
    await Promise.all([search('farine'), search('sucre')])

    // Then
    expect(fake.violations().map((violation) => violation.kind)).toContain('parallel')
  })

  it('note une requête qui suit la précédente de trop près', async () => {
    // When
    await search('farine')
    await search('sucre')

    // Then
    expect(fake.violations()).toMatchObject([{ kind: 'too-fast', request: 2 }])
  })

  it('ne note rien pour une première requête', async () => {
    // When
    await search('farine')

    // Then
    expect(fake.violations()).toEqual([])
  })
})

describe('les défauts simulés', () => {
  it('répond 403, puis 429, après le nombre de requêtes demandé', async () => {
    // Given
    fake.setBehavior({ fault: { kind: 'forbidden', after: 1 } })

    // When
    const first = await search('farine')
    const second = await search('farine')
    fake.setBehavior({ fault: { kind: 'too-many-requests' } })
    const third = await search('farine')

    // Then
    expect([first.status, second.status, third.status]).toEqual([200, 403, 429])
    expect(fake.paced().map((entry) => entry.fault)).toEqual([
      undefined,
      'forbidden',
      'too-many-requests',
    ])
  })

  it('sert une page de défi qui renvoie vers captcha-delivery.com', async () => {
    // Given
    fake.setBehavior({ fault: { kind: 'challenge' } })

    // When
    const reply = await search('farine')

    // Then
    expect(reply.text).toContain('captcha-delivery.com')
  })

  it('change de contrat : des champs que l’agent ne connaît plus, et un panier sans évènement Panier', async () => {
    // Given
    fake.setBehavior({ fault: { kind: 'contract-changed' } })

    // When
    const page = await search('farine')
    const cart = await cartCall('1000001', 1)

    // Then
    expect(extractProducts(page.text).ids).toBe(0)
    expect(() => readCartResponse(cart.text, '1000001')).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED' }),
    )
  })

  it('redirige vers la connexion quand on n’est pas connecté, et applique le défaut au panier seul sur demande', async () => {
    // Given
    fake.setBehavior({ fault: { kind: 'logged-out', on: 'cart' } })

    // When
    const searched = await search('farine')
    const cart = await cartCall('1000001', 1)

    // Then
    expect(searched.status).toBe(200)
    expect(cart.status).toBe(302)
    expect(cart.headers.location).toBe(`${PAGE_PATH}/connexion.aspx`)
    expect((await call(`${PAGE_PATH}/connexion.aspx`)).text).toContain('Connexion')
  })
})

describe('la racine du magasin et la remise à neuf (DRV-319, émulateur Android)', () => {
  // L’accueil de l’enseigne est servi sous son nom : le faux site ne l’accepte que sur demande (`hosts`), comme tout autre nom.
  beforeEach(async () => {
    await fake.close()
    fake = await startFakeLeclerc({ hosts: [HOME_HOST] })
  })

  /** Le lien « Commencer mes courses » ou « Changer de magasin » de l’accueil : son adresse, lue dans la page comme le fait un navigateur. */
  const linkOf = (page: string, id: string): URL => {
    const href = new RegExp(`id="${id}" href="([^"]+)"`).exec(page)?.[1]
    if (href === undefined) throw new Error(`lien ${id} absent de la page`)
    return new URL(`http:${href}`)
  }

  it('sert à la racine de l’hôte du magasin une PAGE 404, comme le vrai site (recette réelle du 2026-10-18, application 0.1.3)', async () => {
    // When
    const root = await call('/')
    const withoutCity = await call(`${CART_PATH}/`)

    // Then : « la page demandée n’a pas pu être trouvée » ; ni accueil, ni bouton « Commencer mes courses », ni page de magasin
    expect(root.status).toBe(404)
    expect(root.text).toContain('momentanément indisponible')
    expect(root.text).not.toContain('Commencer mes courses')
    expect(withoutCity.status).toBe(404)
    expect(fake.requests()[0]).toMatchObject({
      kind: 'page',
      host: STORE.host,
      path: '/',
      status: 404,
    })
  })

  it('sert à la racine de l’enseigne l’accueil du magasin et son bouton « Commencer mes courses », qui n’est pas une page de magasin pour l’agent (recette réelle du 2026-10-18)', async () => {
    // When
    const reply = await call('/', { host: HOME_HOST })

    // Then : session ouverte, l’accueil affiche le magasin ; le bouton mène aux vraies pages (avec ville, sur l’hôte du magasin), et l’on peut changer de magasin
    expect(reply.status).toBe(200)
    expect(reply.text).toContain('Commencer mes courses')
    expect(reply.text).toContain('Je peux retirer ma commande')
    expect(reply.text).toContain('id="other-store"')
    const start = linkOf(reply.text, 'start-shopping')
    expect(start.hostname).toBe(STORE.host)
    expect(start.pathname).toBe(`${PAGE_PATH}/`)
    expect(linkOf(reply.text, 'other-store').pathname).toBe(`${OTHER_STORE_PATH}/`)
    expect(reply.text.replaceAll(PAGE_PATH, '').replaceAll(OTHER_STORE_PATH, '')).not.toContain(
      '/magasin-',
    )
    expect(fake.requests().at(-1)).toMatchObject({
      kind: 'page',
      host: HOME_HOST,
      path: '/',
      status: 200,
    })
  })

  it('mène « Commencer mes courses » à une vraie page de magasin, avec sa ville, sur l’hôte du magasin', async () => {
    // Given
    const home = await call('/', { host: HOME_HOST })
    const start = linkOf(home.text, 'start-shopping')

    // When : on touche le bouton, comme le ferait la WebView (même port, autre nom d’hôte)
    const store = await call(start.pathname, { host: start.hostname })

    // Then
    expect(store.status).toBe(200)
    expect(store.text).toContain('Accueil du magasin')
    expect(start.pathname).toMatch(/^\/magasin-\d{1,12}-\d{1,12}-[^/]+\/$/)
  })

  it('mène « Commencer mes courses » où « startPath » le demande (une page 404 sur le chemin de l’utilisateur), et ignore un chemin douteux', async () => {
    // Given : le bouton mène à la racine de l’hôte du magasin, qui est une page 404
    fake.setBehavior({ startPath: '/' })

    // When
    const toRoot = linkOf((await call('/', { host: HOME_HOST })).text, 'start-shopping')
    const target = await call(toRoot.pathname, { host: toRoot.hostname })

    // Then
    expect(toRoot.hostname).toBe(STORE.host)
    expect(toRoot.pathname).toBe('/')
    expect(target.status).toBe(404)

    // When : un chemin qui sortirait de l’attribut est ignoré, le bouton retrouve la page du magasin
    fake.setBehavior({ startPath: '/"><script>x</script>' })
    const safe = linkOf((await call('/', { host: HOME_HOST })).text, 'start-shopping')
    fake.setBehavior({ startPath: null })
    const normal = linkOf((await call('/', { host: HOME_HOST })).text, 'start-shopping')

    // Then
    expect(safe.pathname).toBe(`${PAGE_PATH}/`)
    expect(normal.pathname).toBe(`${PAGE_PATH}/`)
  })

  it('ne sert à l’enseigne que son accueil : toute autre page y est une 404', async () => {
    // When
    const replies = await Promise.all(
      [`${PAGE_PATH}/`, `${PAGE_PATH}/recherche.aspx?TexteRecherche=farine`, '/connexion.aspx'].map(
        (path) => call(path, { host: HOME_HOST }),
      ),
    )

    // Then
    expect(replies.map((reply) => reply.status)).toEqual([404, 404, 404])
    expect(fake.paced()).toEqual([])
  })

  it('refuse, comme le vrai site, l’accueil du magasin sans suffixe de ville : l’adresse que l’application ouvrait avant est une page 404', async () => {
    // When
    const withoutCity = await call(`${CART_PATH}/`)
    const bare = await call(CART_PATH)
    const withCity = await call(`${PAGE_PATH}/`)
    const withCityAndPage = await call(`${PAGE_PATH}/accueil.aspx`)

    // Then : seule l’adresse avec la ville est une page de magasin
    expect(withoutCity.status).toBe(404)
    expect(withoutCity.text).toContain('momentanément indisponible')
    expect(bare.status).toBe(404)
    expect(withCity.status).toBe(200)
    expect(withCity.text).toContain('Accueil du magasin')
    expect(withCityAndPage.status).toBe(200)
    // L’adresse du panier, elle, reste sans ville (DRV-007) : la page 404 n’est que l’accueil.
    expect((await cartCall('1000001', 1)).status).toBe(200)
  })

  it('sert un autre magasin que celui du plan (pour le message « Ce n’est pas le bon magasin »)', async () => {
    expect(OTHER_STORE_PATH).not.toContain(STORE.id)
    expect((await call(`${OTHER_STORE_PATH}/`)).text).toContain('Accueil du magasin')
  })

  it('refuse la page d’ouverture par une erreur HTTP quand « homeStatus » le demande (page d’erreur ou défi, ticket E)', async () => {
    // Given
    fake.setBehavior({ homeStatus: 404 })

    // When
    const home = await call('/', { host: HOME_HOST })

    // Then : la page d’erreur générique, avec le code demandé ; le reste du site répond normalement
    expect(home.status).toBe(404)
    expect(home.text).toContain('momentanément indisponible')
    expect((await call(`${PAGE_PATH}/connexion.aspx`)).status).toBe(200)
    expect((await call(`${PAGE_PATH}/`)).status).toBe(200)
    expect((await search('farine')).status).toBe(200)

    // When : un autre code, puis le défaut retiré par le pilotage (null), puis la remise à neuf
    fake.setBehavior({ homeStatus: 403 })
    expect((await call('/', { host: HOME_HOST })).status).toBe(403)
    fake.setBehavior({ homeStatus: null })
    expect((await call('/', { host: HOME_HOST })).status).toBe(200)
    fake.setBehavior({ homeStatus: 503 })
    fake.reset()

    // Then
    expect((await call('/', { host: HOME_HOST })).status).toBe(200)
  })

  it('fait attendre la page d’ouverture quand « homeDelayMs » le demande (page trop lente, ticket E)', async () => {
    // Given
    fake.setBehavior({ homeDelayMs: 150 })

    // When
    const begun = Date.now()
    const home = await call('/', { host: HOME_HOST })
    const waited = Date.now() - begun

    // Then : la page finit par arriver, mais après le délai ; les pages du magasin n’attendent pas
    expect(home.status).toBe(200)
    expect(waited).toBeGreaterThanOrEqual(140)
    const storeBegun = Date.now()
    await call(`${PAGE_PATH}/`)
    expect(Date.now() - storeBegun).toBeLessThan(140)
  })

  it('remet à neuf le panier, le journal, les violations, la cadence et les défauts, par le pilotage HTTP', async () => {
    // Given : un panier garni, deux recherches trop rapprochées, un défaut simulé
    await cartCall('1000001', 2)
    await search('farine')
    await search('sucre')
    await call('/__fake/behavior', {
      method: 'POST',
      host: 'localhost',
      body: JSON.stringify({ latencyMs: 50, fault: { kind: 'forbidden', after: 5 } }),
    })
    expect(fake.violations()).not.toEqual([])

    // When
    const reply = await call('/__fake/reset', { method: 'POST', host: 'localhost' })
    const state = JSON.parse((await call('/__fake/state', { host: 'localhost' })).text)
    await search('farine')

    // Then : rien ne reste, et la première requête d’après n’est ni « trop rapide » ni touchée par l’ancien défaut
    expect(reply.status).toBe(200)
    expect(state).toMatchObject({
      cart: {},
      requests: [],
      violations: [],
      behavior: { latencyMs: 0, fault: null },
    })
    expect(fake.violations()).toEqual([])
    expect(fake.paced()).toHaveLength(1)
    expect(fake.paced()[0]?.fault).toBeUndefined()
  })

  it('n’offre pas la remise à neuf sous le nom du faux magasin', async () => {
    // When
    const reply = await call('/__fake/reset', { method: 'POST' })

    // Then
    expect(reply.status).toBe(404)
  })
})

describe('le faux Repas', () => {
  it('sert la page de retour qui affiche le fragment reçu', async () => {
    // When
    const reply = await call('/drive/retour', { host: 'localhost' })

    // Then
    expect(reply.status).toBe(200)
    expect(reply.text).toContain('id="resultat"')
  })
})

describe('le durcissement face au vrai site : visiteur, « aucun résultat », causes (tickets A, C et G)', () => {
  it('par défaut, les pages sont celles d’un client connecté (aucun signe de visiteur)', async () => {
    const page = await search('farine')
    const home = await call(`${PAGE_PATH}/`)

    expect(readSession(page.text)).toEqual({ state: 'MEMBER', signs: ['LOGOUT_LINK'] })
    expect(readSession(home.text).state).toBe('MEMBER')
  })

  it('visitorAfter: 0 sert la page d’un visiteur dès la première page, accueil compris, avec les mêmes produits (le catalogue est public)', async () => {
    fake.setBehavior({ visitorAfter: 0 })

    const page = await search('farine')
    const home = await call(`${PAGE_PATH}/`)

    expect(readSession(page.text)).toEqual({
      state: 'VISITOR',
      signs: ['LOGIN_LINK', 'REGISTER_LINK'],
    })
    expect(readSession(home.text).state).toBe('VISITOR')
    expect(extractProducts(page.text).products).toHaveLength(5)
  })

  it('visitorAfter: 2 laisse passer deux requêtes du panier ou de recherche, puis sert un visiteur', async () => {
    fake.setBehavior({ visitorAfter: 2 })

    const first = await search('farine')
    await cartCall('1000001', 1)
    const third = await search('sucre')

    expect(readSession(first.text).state).toBe('MEMBER')
    expect(readSession(third.text).state).toBe('VISITOR')
    expect(readSession((await call(`${PAGE_PATH}/`)).text).state).toBe('VISITOR')
  })

  it('un visiteur peut écrire dans un panier anonyme : le faux site l’accepte, c’est le danger à détecter', async () => {
    fake.setBehavior({ visitorAfter: 0 })

    const written = await cartCall('1000001', 2)

    expect(written.status).toBe(200)
    expect(fake.cart()).toEqual({ 1000001: 2 })
  })

  it.each(['list', 'no-list', 'encoded'] as const)(
    'la page sans résultat de forme « %s » est lue comme une liste vide par l’analyseur de l’agent',
    async (form) => {
      fake.setBehavior({ emptySearch: form })

      const page = await search('gnocchis')

      expect(readSearchPage({ text: page.text, status: page.status, redirected: false })).toEqual(
        [],
      )
    },
  )

  it('les trois formes sont bien différentes (liste vide et message, squelette seul, état encodé)', async () => {
    const texts: string[] = []
    for (const form of ['list', 'no-list', 'encoded'] as const) {
      fake.setBehavior({ emptySearch: form })
      texts.push((await search('gnocchis')).text)
    }

    expect(texts[0]).toContain('"lstProduits": []')
    expect(texts[0]).toContain('Aucun résultat')
    expect(texts[1]).not.toContain('lstProduits"')
    expect(texts[1]).not.toContain('Aucun résultat')
    expect(texts[2]).toContain('&quot;lstProduits&quot;:[]')
    expect(texts[2]).not.toContain('var widgets')
  })

  it.each([
    ['contract-changed', 'SEARCH_NO_STATE'],
    ['products-renamed', 'SEARCH_PRODUCTS_UNREADABLE'],
  ] as const)('le défaut « %s » est lu avec la cause %s', async (kind, cause) => {
    fake.setBehavior({ fault: { kind, on: 'search' } })

    const page = await search('farine')

    expect(() =>
      readSearchPage({ text: page.text, status: page.status, redirected: false }),
    ).toThrow(expect.objectContaining({ code: 'CONTRACT_CHANGED', cause }))
  })

  it('une réponse du panier qui a changé est lue avec la cause CART_NO_CART_EVENT', async () => {
    fake.setBehavior({ fault: { kind: 'contract-changed', on: 'cart' } })

    const cart = await cartCall('1000001', 1)

    expect(() => readCartResponse(cart.text, '1000001')).toThrow(
      expect.objectContaining({ code: 'CONTRACT_CHANGED', cause: 'CART_NO_CART_EVENT' }),
    )
  })

  it('la remise à neuf efface les nouveaux comportements', async () => {
    fake.setBehavior({ visitorAfter: 0, emptySearch: 'no-list' })

    fake.reset()

    expect(fake.behavior()).toEqual({ latencyMs: 0, fault: null })
  })
})

describe('le moteur strict (ticket D de l’audit du 2026-10-18) : sensible aux accents, à la ligature et au pluriel', () => {
  const idsOf = async (word: string) =>
    extractProducts((await search(word)).text).products.map((product) => product.id)

  it('par défaut, le moteur est tolérant : « œuf » trouve les « Oeufs » du catalogue', async () => {
    expect(fake.behavior().strictSearch).toBeUndefined()
    expect(await idsOf('œuf')).toEqual(['1000014', '1000015'])
  })

  it('« œuf » ne répond rien, « oeuf » répond : la ligature n’est pas repliée', async () => {
    fake.setBehavior({ strictSearch: true })

    expect(await idsOf('œuf')).toEqual([])
    expect(await idsOf('oeuf')).toEqual(['1000014', '1000015'])
  })

  it('les accents comptent : « crème » répond, « creme » ne répond rien', async () => {
    fake.setBehavior({ strictSearch: true })

    expect(await idsOf('crème')).toEqual(['1000029'])
    expect(await idsOf('creme')).toEqual([])
  })

  it('le pluriel compte : « spaghetti » répond, « spaghettis » ne répond rien', async () => {
    fake.setBehavior({ strictSearch: true })

    expect(await idsOf('spaghetti')).toEqual(['1000025'])
    expect(await idsOf('spaghettis')).toEqual([])
  })

  it('les majuscules ne comptent pas, ni l’ordre des mots, et tous les mots doivent figurer', async () => {
    fake.setBehavior({ strictSearch: true })

    expect(await idsOf('FARINE sarrasin')).toEqual(['1000004'])
    expect(await idsOf('sarrasin farine')).toEqual(['1000004'])
    expect(await idsOf('farine zzzz')).toEqual([])
  })

  it('la remise à neuf rend le moteur tolérant', async () => {
    fake.setBehavior({ strictSearch: true })
    fake.reset()

    expect(await idsOf('œuf')).toEqual(['1000014', '1000015'])
  })
})

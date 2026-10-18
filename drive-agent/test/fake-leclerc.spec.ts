// @vitest-environment node
// Le faux site Leclerc (DRV-309, drive-agent/fake-leclerc/) lu avec les analyseurs RÉELS de l'agent : s'il s'écartait de la forme relevée
// sur le vrai site, l'agent ne le comprendrait plus. On prouve aussi ses garde-fous : accès local seulement, requête du panier vérifiée
// à la lettre, détection d'une cadence trop rapide ou en parallèle.
import { request } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cartBody, CART_HEADERS, readCartResponse } from '../src/leclerc/cart'
import { extractProducts } from '../src/leclerc/embedded'
import { toCandidate } from '../src/leclerc/candidate'
import {
  CART_PATH,
  isLoopback,
  PAGE_PATH,
  STORE,
  startFakeLeclerc,
  type FakeLeclerc,
} from '../fake-leclerc/server'

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
  it('mène la racine de l’hôte du magasin à son accueil, l’adresse que l’application ouvre pour un plan', async () => {
    // When
    const reply = await call('/')
    const home = await call(reply.headers.location as string)

    // Then
    expect(reply.status).toBe(302)
    expect(reply.headers.location).toBe(`${PAGE_PATH}/`)
    expect(home.status).toBe(200)
    expect(home.text).toContain('Accueil du magasin')
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

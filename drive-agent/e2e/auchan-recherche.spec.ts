// La recherche d'Auchan de bout en bout (DRV-724) : l'agent construit, injecté comme l'application le fait, dans une page du faux site d'Auchan
// (`drive-agent/fake-auchan/`, pages de résultats SYNTHÉTIQUES, `www.auchan.fr` résolu vers 127.0.0.1). La phase A (un produit connu, retrouvé par sa
// recherche) et le début de la phase B (un nouveau produit : la liste que l'agent montre) rendent les mêmes TYPES de résultats que contre le faux Leclerc, avec
// un identifiant d'offre pour chaque produit. Les tests de la phase B ne choisissent aucun produit : aucun n'écrit ; celui de la phase A écrit au panier (DRV-725) l'offre lue par la recherche.
import { openWithBridge, trackInteractions, type FakeApp } from './support/agent'
import { expect, test } from './support/fixtures'
import { RUN_ID } from './support/plans'
import { STORE, type FakeAuchan } from '../fake-auchan/server'

const FARINE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const FARINE_OFFER = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'

const plan = (lines: unknown[]) => ({
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines,
})
/** Un nouveau produit à chercher (phase B) : l'agent cherche `query`, puis le nom de l'ingrédient s'il ne trouve rien (repli commun du passage). */
const fresh = (query: string, name = 'Farine') => ({
  ingredientSlug: 'farine',
  name,
  status: 'NEW',
  products: [],
  rejected: [],
  searchQuery: query,
})
/** Un produit connu (phase A) : il se retrouve par sa recherche, puis se met au panier. */
const known = {
  ingredientSlug: 'farine',
  name: 'Farine',
  status: 'KNOWN',
  products: [
    {
      id: FARINE,
      label: 'Farine de blé T55 de test',
      packs: 1,
      packsStatus: 'COMPUTED',
      offerId: FARINE_OFFER,
    },
  ],
  rejected: [],
  searchQuery: 'farine',
}

async function open(
  page: Parameters<typeof openWithBridge>[0],
  fakeAuchan: FakeAuchan,
  agentCode: string,
): Promise<FakeApp> {
  return openWithBridge(page, {}, agentCode, { origin: fakeAuchan.site, path: '/courses' })
}

const searches = (fakeAuchan: FakeAuchan) =>
  fakeAuchan.paced().filter((request) => request.kind === 'search')

test.describe('phase B : la liste des produits que la recherche a trouvés', () => {
  test('montre les produits de la page de résultats (une seule requête de recherche), disponibles ou non, sans rien choisir ni écrire', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : une farine jamais achetée
    const gestures = await trackInteractions(page)
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([fresh('farine')]))

    // When : l'agent cherche et affiche la liste
    const blé = page.getByRole('listitem').filter({ hasText: 'Farine de blé T55 de test' })
    await expect(blé).toBeVisible()

    // Then : les quatre produits de la page (et non les douze balises de produit), chacun avec son prix lu
    await expect(page.getByRole('listitem').filter({ hasText: 'Farine' })).toHaveCount(4)
    await expect(blé).toContainText('0,91')
    await expect(page.getByRole('listitem').filter({ hasText: 'Farine complète' })).toContainText(
      '1,29',
    )
    // Le produit indisponible est dit « Plus en stock », celui qui n'a pas de prix est quand même proposé
    await expect(page.getByRole('listitem').filter({ hasText: 'Farine de seigle' })).toContainText(
      'Plus en stock',
    )
    await expect(page.getByRole('listitem').filter({ hasText: 'Farine de maïs' })).toBeVisible()
    // Une seule recherche, les bons en-têtes, aucune écriture, aucun choix de l'agent, la cadence respectée
    expect(searches(fakeAuchan).map((request) => request.detail)).toEqual(['farine'])
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey', '/recherche'])
    expect(fakeAuchan.paced().every((request) => request.rejected === undefined)).toBe(true)
    expect(fakeAuchan.writes()).toEqual([])
    expect(fakeAuchan.cart()).toEqual({})
    expect(fakeAuchan.violations()).toEqual([])
    expect(gestures.count()).toBe(0)
  })

  test('un terme qui ne trouve rien : « Aucun produit trouvé », sans erreur', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([fresh('zzqxkw', 'Zzqxkw')]))

    await expect(page.getByText('Aucun produit trouvé pour « zzqxkw ».')).toBeVisible()

    expect(fakeAuchan.writes()).toEqual([])
  })

  test('un terme que le site redirige vers une page de rayon (MESURÉ) : les produits du rayon sont proposés, comme une page de résultats', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : un terme que le faux site redirige (302) vers une page de rayon à plusieurs produits
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([fresh('rayon', 'Rayon')]))

    // Then : les quatre produits de la page de rayon sont listés, une seule recherche, rien d'écrit
    const blé = page.getByRole('listitem').filter({ hasText: 'Farine de blé T55 de test' })
    await expect(blé).toBeVisible()
    await expect(blé).toContainText('0,91')
    await expect(page.getByRole('listitem').filter({ hasText: 'Farine' })).toHaveCount(4)
    expect(searches(fakeAuchan).map((request) => request.detail)).toEqual(['rayon'])
    expect(fakeAuchan.writes()).toEqual([])
    expect(fakeAuchan.violations()).toEqual([])
  })

  test('un terme que le site redirige vers une fiche de produit n’est pas une page de résultats : aucun produit', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([fresh('fiche', 'Fiche')]))

    await expect(page.getByText('Aucun produit trouvé pour « fiche ».')).toBeVisible()
    // La fiche porte les balises du produit : elles n'ont pas été prises pour des résultats
    await expect(page.getByRole('listitem').filter({ hasText: 'Lait' })).toHaveCount(0)
    expect(fakeAuchan.writes()).toEqual([])
  })
})

test.describe('phase A : un produit connu est retrouvé par sa recherche', () => {
  test('le produit est retrouvé (une recherche) et son offre, lue par la recherche, part au panier : une seule écriture, la bonne offre', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([known]))

    // Le panier est rempli et la quantité déjà au panier a été LUE (DRV-732) : le résultat part, sans écran de fin
    const result = await app.received('result')

    expect(result).toMatchObject({ outcome: 'completed', lines: [{ outcome: 'ADDED' }] })
    await expect(page.getByText('Quantité au panier illisible')).toHaveCount(0)
    expect(searches(fakeAuchan).map((request) => request.detail)).toEqual([
      'Farine de blé T55 de test',
    ])
    expect(fakeAuchan.cart()).toEqual({ [FARINE]: 1 })
    const writes = fakeAuchan.writes().map((write) => JSON.parse(write.detail ?? '{}'))
    expect(writes).toHaveLength(1)
    expect(writes[0].items[0]).toMatchObject({
      productId: FARINE,
      offerId: FARINE_OFFER,
      sellerType: 'GROCERY',
      desiredQuantity: 1,
    })
    expect(fakeAuchan.violations()).toEqual([])
  })
})

test.describe('phase A : la quantité déjà au panier se lit (DRV-732)', () => {
  const LAIT = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
  const LAIT_OFFER = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80'
  const knownLait = {
    ingredientSlug: 'lait',
    name: 'Lait',
    status: 'KNOWN',
    products: [
      {
        id: LAIT,
        label: 'Lait UHT demi-écrémé de test',
        packs: 1,
        packsStatus: 'COMPUTED',
        offerId: LAIT_OFFER,
      },
    ],
    rejected: [],
    searchQuery: 'lait',
  }
  const cartRequests = (fakeAuchan: FakeAuchan) =>
    fakeAuchan
      .paced()
      .filter((request) => request.kind === 'cart')
      .map((request) => `${request.method} ${request.path}`)

  test('deux produits connus, l’un déjà au panier en plus grande quantité : « Déjà 4 au panier : conservé », jamais « Quantité au panier illisible », et un seul GET /cart de départ', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : 4 laits déjà au panier, 1 voulu ; une farine à poser
    fakeAuchan.seedCart(LAIT, 4)
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([known, knownLait]))

    // Then : l'écran de fin dit ce qui est conservé, et rien d'illisible
    await expect(page.getByText('Quantités déjà au panier')).toBeVisible()
    await expect(page.getByText('Déjà 4 au panier : conservé')).toBeVisible()
    await expect(page.getByText('Quantité au panier illisible')).toHaveCount(0)
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()
    const result = await app.received('result')
    expect(result).toMatchObject({
      outcome: 'completed',
      lines: [{ outcome: 'ADDED' }, { outcome: 'ADDED', quantity: 4 }],
    })
    // Le panier n'est jamais réduit, le lait n'a coûté aucune écriture
    expect(fakeAuchan.cart()).toEqual({ [FARINE]: 1, [LAIT]: 4 })
    expect(fakeAuchan.writes()).toHaveLength(1)
    // Les requêtes du panier : la lecture du passage, celle d'avant l'écriture de la farine, l'écriture ; le lait se lit depuis la réponse de l'écriture
    expect(cartRequests(fakeAuchan)).toEqual(['GET /cart', 'GET /cart', 'POST /cart/update'])
    expect(fakeAuchan.violations()).toEqual([])
  })

  test('un seul produit connu, panier vide : deux GET /cart (un par passage, un avant l’écriture) et une écriture, aucune mention', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([known]))

    const result = await app.received('result')

    expect(result).toMatchObject({ outcome: 'completed' })
    await expect(page.getByText('Quantité au panier illisible')).toHaveCount(0)
    expect(cartRequests(fakeAuchan)).toEqual(['GET /cart', 'GET /cart', 'POST /cart/update'])
    expect(fakeAuchan.cart()).toEqual({ [FARINE]: 1 })
  })
})

test.describe('un produit en vente en ligne seulement n’arrête pas l’envoi (DRV-739)', () => {
  /** Une ligne nouvelle de son propre ingrédient (un identifiant d'ingrédient par ligne). */
  const line = (slug: string, query: string, name: string) => ({
    ...fresh(query, name),
    ingredientSlug: slug,
  })

  test('« enligne » (trois offres ONLINE, aucune du drive) : la ligne est sans produit, la farine connue est écrite, la ligne suivante est cherchée, l’envoi se termine sans erreur', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : une farine connue (écrite), un produit que le site ne vend qu'en ligne, puis du sel
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan([known, line('the', 'enligne', 'Enligne'), line('sel', 'sel', 'Sel')]))

    // When : la ligne en ligne seulement est sans produit, comme une page « aucun résultat » (pas un arrêt)
    await expect(page.getByText('Aucun produit trouvé pour « enligne ».')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'L’envoi s’est arrêté' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin de test' })).toBeVisible()
    await page.getByRole('button', { name: 'J’en ai toujours' }).click()

    // Then : l'envoi s'est terminé, une seule écriture (la farine), jamais le produit en ligne
    const result = await app.received('result')
    expect(result).toMatchObject({
      outcome: 'completed',
      lines: [
        { ingredientSlug: 'farine', outcome: 'ADDED' },
        { ingredientSlug: 'the', outcome: 'SKIPPED' },
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      ],
    })
    expect(result).not.toHaveProperty('error')
    expect(fakeAuchan.cart()).toEqual({ [FARINE]: 1 })
    expect(fakeAuchan.writes()).toHaveLength(1)
    expect(fakeAuchan.violations()).toEqual([])
  })
})

test.describe('une page de résultats d’une forme inconnue : le site a changé, avec sa cause', () => {
  for (const [term, cause] of [
    ['inconnu', 'SEARCH_UNKNOWN_PAGE'],
    ['illisible', 'SEARCH_PRODUCTS_UNREADABLE'],
    ['sansoffre', 'SEARCH_PRODUCTS_UNREADABLE'],
  ] as const) {
    test(`« ${term} » : CONTRACT_CHANGED (${cause}), jamais un produit inventé`, async ({
      page,
      fakeAuchan,
      agentCode,
    }) => {
      const app = await open(page, fakeAuchan, agentCode)
      app.answerHello(plan([fresh(term, term)]))

      await expect(page.getByRole('heading', { name: 'L’envoi s’est arrêté' })).toBeVisible()
      await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()

      const result = await app.received('result')
      expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
      expect(JSON.stringify(result)).toContain(cause)
      expect(fakeAuchan.writes()).toEqual([])
    })
  }
})

test.describe('le diagnostic lit la recherche', () => {
  test('la recherche d’un mot courant est OK, rien du site ne reste dans le rapport', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    await app.received('hello')

    await app.send({ v: 1, type: 'command', command: 'diagnostic' })

    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(/Aucune écriture au panier\./)
    const text = await report.inputValue()
    expect(text).toMatch(/\[OK\] Recherche d’un mot courant/)
    for (const secret of ['Marque Test', 'Farine', FARINE, FARINE_OFFER, 'cdn.auchan.fr']) {
      expect(text, secret).not.toContain(secret)
    }
    expect(fakeAuchan.writes()).toEqual([])
  })
})

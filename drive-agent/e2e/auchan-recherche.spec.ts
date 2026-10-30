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

  test('un terme que le site redirige vers une fiche de produit ou un rayon n’est pas une page de résultats : aucun produit', async ({
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

    // L'écran de fin (le panier est rempli) : la personne retourne dans Repas
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    const result = await app.received('result')

    expect(result).toMatchObject({ outcome: 'completed', lines: [{ outcome: 'ADDED' }] })
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
      await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

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

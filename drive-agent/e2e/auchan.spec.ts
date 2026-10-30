// L'agent chez Auchan (DRV-717), de bout en bout : l'agent construit, injecté comme l'application le fait (le vrai `injection.js` et un faux canal natif),
// dans une page du faux site d'Auchan (`drive-agent/fake-auchan/`, données inventées, `www.auchan.fr` résolu vers 127.0.0.1). Le magasin n'est PAS dans
// l'adresse : l'agent le lit par `GET /journey`. Ce qui est prouvé : la lecture du magasin et de la connexion, la configuration du magasin (setup), les arrêts
// sans magasin, visiteur, autre magasin et page introuvable SANS AUCUNE écriture, le refus d'un plan de Leclerc sans une requête, la cadence d'Auchan, et un
// diagnostic qui ne laisse rien du site. La recherche est écrite (DRV-724, `auchan-recherche.spec.ts`) ; le panier ne l'est pas (DRV-725).
import { openWithBridge, trackInteractions, type FakeApp } from './support/agent'
import { expect, test } from './support/fixtures'
import { RUN_ID } from './support/plans'
import { MIN_GAP_MS, STORE, type FakeAuchan } from '../fake-auchan/server'

/** Un plan d'Auchan dont les articles sont tous « déjà à la maison » : il ne demande aucune recherche. */
const plan = (extra: Record<string, unknown> = {}) => ({
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
  ...extra,
})
/** Le même plan avec un produit à chercher : retrouvé par la recherche, puis le panier, non écrit, arrête le passage. */
const planToSearch = () =>
  plan({
    lines: [
      {
        ingredientSlug: 'farine',
        name: 'Farine',
        status: 'KNOWN',
        products: [
          {
            id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
            label: 'Farine de blé T55 de test',
            packs: 1,
            packsStatus: 'COMPUTED',
            offerId: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
          },
        ],
        rejected: [],
        searchQuery: 'farine',
      },
    ],
  })
const SETUP = {
  v: 1,
  type: 'setup',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
}
const DIAGNOSTIC = { v: 1, type: 'command', command: 'diagnostic' } as const

/** Ouvre l'accueil des courses du faux site avec l'agent, comme l'application ouvre un plan (`https://www.auchan.fr/courses`). */
async function open(
  page: Parameters<typeof openWithBridge>[0],
  fakeAuchan: FakeAuchan,
  agentCode: string,
  path = '/courses',
): Promise<FakeApp> {
  return openWithBridge(page, {}, agentCode, { origin: fakeAuchan.site, path })
}

test.describe('un parcours qui va jusqu’au bout de ce qui est écrit', () => {
  test('connecté, magasin choisi : l’agent lit le magasin (une requête), la connexion, ne touche à rien et rend la main, sans aucun geste', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : la page est l'accueil des courses, un drive est choisi et la personne est connectée
    const gestures = await trackInteractions(page)
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    // When
    const result = await app.received('result')

    // Then : un plan sans produit à chercher se termine ; le magasin n'a coûté qu'une lecture du parcours, et rien n'a été écrit
    expect(result).toMatchObject({ outcome: 'completed', runId: RUN_ID })
    expect(fakeAuchan.paced().map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /journey',
    ])
    expect(fakeAuchan.paced()[0]).toMatchObject({ status: 200 })
    expect(fakeAuchan.paced()[0]?.rejected).toBeUndefined()
    expect(fakeAuchan.writes()).toEqual([])
    expect(fakeAuchan.cart()).toEqual({})
    expect(gestures.count()).toBe(0)
    expect(new URL(page.url()).pathname).toBe('/courses')
  })

  test('le panier n’est pas écrit : un produit à mettre au panier arrête le passage proprement (CONTRACT_CHANGED, ADAPTER_NOT_WRITTEN), sans écrire au panier', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(planToSearch())

    // Le passage s'arrête sur la première ligne : l'écran de fin dit que l'envoi s'est arrêté, rien n'est au panier
    await expect(page.getByRole('heading', { name: 'L’envoi s’est arrêté' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    const result = await app.received('result')

    expect(result).toMatchObject({ outcome: 'error', error: { code: 'CONTRACT_CHANGED' } })
    expect(JSON.stringify(result)).toContain('ADAPTER_NOT_WRITTEN')
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey', '/recherche'])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('la politesse : deux lectures du parcours sont séparées d’au moins la pause d’Auchan, jamais en parallèle', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : un premier plan est passé
    const app = await open(page, fakeAuchan, agentCode)
    await app.received('hello')
    await app.send(plan())
    await app.received('result')

    // When : un second plan arrive sur la même page (un autre envoi)
    await app.send(plan({ runId: '9a1f4e0b-3c2d-4e5f-8a6b-7c8d9e0f1a2b' }))
    await expect
      .poll(() => app.messages.filter((message) => message.type === 'result').length)
      .toBe(2)

    // Then : deux requêtes, la seconde après la pause (2 s au moins), aucune violation
    const calls = fakeAuchan.paced()
    expect(calls).toHaveLength(2)
    expect((calls[1]?.startedAt ?? 0) - (calls[0]?.endedAt ?? 0)).toBeGreaterThanOrEqual(
      MIN_GAP_MS - 5,
    )
    expect(fakeAuchan.violations()).toEqual([])
  })
})

test.describe('les arrêts, tous sans écriture', () => {
  test('aucun magasin choisi (la barre dit « Choisir vos courses ») : « Choisis ton magasin », et pas même une requête', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    await expect(page.getByText('Aucun magasin n’est choisi sur Auchan.')).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE' },
    })
    expect(fakeAuchan.paced()).toEqual([])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('le parcours ne donne aucun contexte de courses alors que la page n’en dit rien : même arrêt, après une seule lecture', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none', bar: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'error' })
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey'])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('un visiteur (tracking_authenticated « false ») : « Tu n’es pas connecté », après la lecture du magasin', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ session: 'visitor' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Tu n’es pas connecté' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN' },
    })
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey'])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('un autre magasin que celui du plan : STORE_MISMATCH', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ storeId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('une page introuvable (un vrai 404) : « Cette page n’existe pas », sans demander le parcours', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode, '/une-page-inventee/pr-C0000000')
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Cette page n’existe pas' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE' },
    })
    expect(fakeAuchan.paced()).toEqual([])
  })

  test('un plan de Leclerc sur une page d’Auchan : STORE_MISMATCH, sans une seule requête', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(
      plan({ retailer: 'leclerc', store: { id: '000001', host: 'courses-test.leclercdrive.fr' } }),
    )

    await expect(page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({
      outcome: 'error',
      error: { code: 'STORE_MISMATCH' },
    })
    expect(fakeAuchan.paced()).toEqual([])
  })

  test('le site change de forme (un parcours qui n’est plus du JSON) : le site a changé, avec sa cause', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ journey: 'not-json' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Le site a changé' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    const result = await app.received('result')
    expect(JSON.stringify(result)).toContain('JOURNEY_NOT_JSON')
    expect(fakeAuchan.writes()).toEqual([])
  })
})

test.describe('la configuration du magasin (setup)', () => {
  test('lit le magasin par le parcours, demande « Utiliser ce magasin ? » avec le libellé, puis rend le magasin à l’application', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(SETUP)

    await expect(page.getByRole('heading', { name: 'Utiliser ce magasin ?' })).toBeVisible()
    await expect(page.locator('p.shop')).toHaveText('Drive Ville-Test')
    await page.getByRole('button', { name: 'Utiliser ce magasin' }).click()

    expect(await app.received('setup-result')).toMatchObject({
      runId: RUN_ID,
      store: {
        id: STORE.id,
        host: 'www.auchan.fr',
        baseUrl: 'https://www.auchan.fr/',
        label: 'Drive Ville-Test',
      },
    })
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey'])
  })

  test('sans magasin choisi : « Choisis ton magasin », rien n’est enregistré', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(SETUP)

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'error' })
    expect(app.messages.some((message) => message.type === 'setup-result')).toBe(false)
  })
})

test.describe('le diagnostic', () => {
  test('lit le magasin, la connexion et l’arrivée sans rien écrire ni laisser de valeur du site ; la recherche y est dite OK', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    await app.received('hello')

    await app.send(DIAGNOSTIC)

    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(/Aucune écriture au panier\./)
    const text = await report.inputValue()
    // La page est lue (host « www », magasin réduit à ses trois derniers caractères), la connexion aussi
    expect(text).toMatch(/\[OK\] Page prise en charge : hôte www, magasin …abc/)
    expect(text).toContain('connecté (signes : STATE_FLAG_ON)')
    // Les formes du magasin dit par le site, et le cookie de l'anti-robot en oui/non
    expect(text).toMatch(
      /Magasin dit par le site : réponse 200 ; contextes de courses : GROCERY, ONLINE, STORE/,
    )
    expect(text).toMatch(/forme de l’identifiant : UUID/)
    expect(text).toMatch(/cookie de protection anti-robot : oui/)
    // La recherche est lue (DRV-724) : le rapport le dit, sans un libellé du site
    expect(text).toMatch(/\[OK\] Recherche d’un mot courant/)
    // Aucune valeur du site : ni l'identifiant du magasin, ni son libellé, ni un cookie, ni une localité
    for (const secret of [
      STORE.id,
      'Ville-Test',
      'fake-datadome-value',
      'test-session',
      '123456789abc',
    ]) {
      expect(text, secret).not.toContain(secret)
    }
    expect(fakeAuchan.writes()).toEqual([])
    expect(fakeAuchan.cart()).toEqual({})
  })
})

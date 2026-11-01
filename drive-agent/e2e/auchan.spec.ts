// L'agent chez Auchan (DRV-717), de bout en bout : l'agent construit, injecté comme l'application le fait (le vrai `injection.js` et un faux canal natif),
// dans une page du faux site d'Auchan (`drive-agent/fake-auchan/`, données inventées, `www.auchan.fr` résolu vers 127.0.0.1). Le magasin n'est PAS dans
// l'adresse : l'agent le lit par `GET /journey`. Ce qui est prouvé : la lecture du magasin et de la connexion, la configuration du magasin (setup), les arrêts
// sans magasin, visiteur, autre magasin et page introuvable SANS AUCUNE écriture, le refus d'un plan de Leclerc sans une requête, la cadence d'Auchan, et un
// diagnostic qui ne laisse rien du site. La recherche (DRV-724, `auchan-recherche.spec.ts`) et le panier (DRV-725) sont écrits.
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
/** Le même plan avec un produit connu : retrouvé par la recherche, puis mis au panier. */
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

  test('un produit connu : retrouvé par la recherche (DRV-724), puis mis au panier (DRV-725), le passage se termine', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(planToSearch())

    // Le panier est rempli et la quantité déjà au panier a été LUE (DRV-732) : rien à faire relire, le résultat part sans écran de fin
    // (avant, « Quantité au panier illisible » en imposait un).
    const result = await app.received('result')

    expect(result).toMatchObject({
      outcome: 'completed',
      lines: [{ outcome: 'ADDED', quantity: 1 }],
    })
    await expect(page.getByText('Quantité au panier illisible')).toHaveCount(0)
    expect(fakeAuchan.paced().map((request) => request.path)).toContain('/recherche')
    expect(fakeAuchan.cart()).toEqual({ '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d': 1 })
    expect(fakeAuchan.violations()).toEqual([])
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
  test('aucun magasin choisi (la barre dit « Choisir vos courses ») : une étape guidée, pas une erreur (DRV-751) ; la barre est désignée, la page reste touchable, pas même une requête', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    await expect(
      page.getByText('Touche « Choisir vos courses », en haut de la page.'),
    ).toBeVisible()
    await expect(page.getByText('Je continue dès que c’est fait.')).toBeVisible()
    await expect(page.getByText('Touche ici')).toBeVisible()
    // Aucun écran d'incident, aucun gros bouton « Fermer » : une seule action, qui rassure
    await expect(page.getByText('Aucun magasin n’est choisi sur Auchan.')).toHaveCount(0)
    // « Réduire » (la carte devient une barre fine, DRV-757) et l'unique sortie qui rassure ; jamais « Fermer »
    await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /fermer/i })).toHaveCount(0)
    await expect(
      page.getByRole('button', {
        name: 'Arrêter pour l’instant Ta liste est gardée, tu pourras reprendre.',
      }),
    ).toBeVisible()
    // La barre à toucher n'est pas cachée : elle reçoit le toucher
    await page.getByRole('button', { name: 'Choisir vos courses' }).click({ trial: true })
    await page.getByRole('button', { name: 'Arrêter pour l’instant' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'aborted' })
    expect(fakeAuchan.paced()).toEqual([])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('le magasin se choisit dans la page : l’agent le voit, dit « Ton magasin est choisi » et remplit le panier TOUT SEUL, sans retour dans Repas', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : aucun magasin choisi, la carte guide
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())
    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    expect(fakeAuchan.paced()).toEqual([])

    // When : la personne choisit son magasin (la barre et le parcours changent, la page n'est pas rechargée)
    fakeAuchan.setBehavior({ store: 'chosen' })
    await page.evaluate(() => {
      const bar = document.querySelector('.store-bar')
      if (bar)
        bar.outerHTML = '<div class="store-bar"><span>Retrait : Drive Ville-Test</span></div>'
    })

    // Then : « C'est bon », puis le passage, jusqu'au résultat, sans que la personne touche quoi que ce soit
    await expect(page.getByRole('heading', { name: 'Ton magasin est choisi' })).toBeVisible()
    await expect(page.getByText('Je remplis ton panier. Tu n’as rien à faire.')).toBeVisible()
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(app.messages.filter((message) => message.type === 'result')).toHaveLength(1)
    // Une seule lecture du parcours, faite quand la page a dit que le magasin était choisi
    expect(fakeAuchan.paced().filter((request) => request.path === '/journey')).toHaveLength(1)
    expect(fakeAuchan.violations()).toEqual([])
  })

  test('le parcours ne donne aucun contexte de courses et la page n’a pas de barre : la même carte, sans libellé cité, après une seule lecture', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none', bar: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
    await expect(
      page.getByText('Touche la barre du magasin en haut de la page, puis ton magasin.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Arrêter pour l’instant' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'aborted' })
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey'])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('un visiteur (tracking_authenticated « false ») : l’étape « Connecte-toi », après la lecture du magasin, sans écran d’incident', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ session: 'visitor' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(plan())

    await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
    await expect(page.getByText('Tu tapes toi-même ton mot de passe.')).toBeVisible()
    await expect(page.getByText('Tu n’es pas connecté')).toHaveCount(0)
    await page.getByRole('button', { name: 'Arrêter pour l’instant' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'aborted' })
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
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()

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
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()

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
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()

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
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()

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

  test('première configuration, sans magasin choisi (DRV-740) : pas d’écran bloquant, la page reste utilisable, aucune requête ; le magasin choisi, « Utiliser ce magasin ? »', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    // Given : la barre dit « Choisir vos courses » et le setup arrive dès l'ouverture
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(SETUP)

    // Then : la carte du guide, pas d'écran d'erreur ; la page du site reste visible et touchable derrière
    await expect(
      page.getByText('Touche « Choisir vos courses », en haut de la page.'),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Choisis ton magasin', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Courses' }).first()).toBeVisible()
    await page.getByRole('link', { name: 'Courses' }).first().click({ trial: true })
    await page.waitForTimeout(2_500)
    expect(fakeAuchan.paced()).toEqual([])

    // When : la personne choisit son magasin sur le site (la barre change, le parcours aussi)
    fakeAuchan.setBehavior({ store: 'chosen' })
    await page.evaluate(() => {
      const bar = document.querySelector('.store-bar')
      if (bar)
        bar.outerHTML = '<div class="store-bar"><span>Retrait : Drive Ville-Test</span></div>'
    })

    // Then : un seul GET /journey, puis l'écran habituel
    await expect(page.getByRole('heading', { name: 'Utiliser ce magasin ?' })).toBeVisible()
    await page.getByRole('button', { name: 'Utiliser ce magasin' }).click()
    expect(await app.received('setup-result')).toMatchObject({
      runId: RUN_ID,
      store: { id: STORE.id, host: 'www.auchan.fr' },
    })
    expect(fakeAuchan.paced().map((request) => request.path)).toEqual(['/journey'])
    expect(fakeAuchan.writes()).toEqual([])
  })

  test('sans magasin choisi, « Arrêter pour l’instant » rend la main : rien n’est enregistré, aucune requête', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await open(page, fakeAuchan, agentCode)
    app.answerHello(SETUP)

    await page.getByRole('button', { name: 'Arrêter pour l’instant' }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'error' })
    expect(app.messages.some((message) => message.type === 'setup-result')).toBe(false)
    expect(fakeAuchan.paced()).toEqual([])
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
    // Le panier est lu par UNE requête de lecture (DRV-752) : sa forme est dite, jamais une valeur du site
    expect(text).toMatch(
      /\[OK\] Lecture du panier : panier lu par une seule requête de lecture, rien écrit : 0 ligne/,
    )
    expect(text).toContain('corps JSON, mots reconnus : aucun')
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

  test('un panier qui répond la page de connexion en 200 : « Lecture du panier » est KO NOT_LOGGED_IN, avec la forme de la réponse, rien n’est écrit (DRV-752)', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setCartBehavior({ read: 'login-page' })
    const app = await open(page, fakeAuchan, agentCode)
    await app.received('hello')

    await app.send(DIAGNOSTIC)

    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(/Aucune écriture au panier\./)
    const text = await report.inputValue()
    expect(text).toMatch(/\[KO NOT_LOGGED_IN\] Lecture du panier : HTTP 200, type text\/html, /)
    expect(text).toContain('mots reconnus : page de connexion')
    expect(text).toContain('cause LOGIN_FORM')
    expect(text).not.toMatch(/consentId|https?:\/\/127/)
    expect(fakeAuchan.writes()).toEqual([])
  })
})

// Parcours complet du drive, simulé de bout en bout (DRV-501), sur Pixel 7 : réglages, liste envoyée, écran d'envoi, passage dans
// l'application, retour, enregistrement des choix, récapitulatif. Ni back ni application : l'API est simulée par `page.route` avec les
// EXEMPLES DE CONTRAT du back (`drive-agent/fixtures/contract/`, les vraies réponses figées), le pont `repasNative` par un faux dont le
// résultat est construit avec les types et le validateur du protocole. Données inventées (magasin `123456`, `Ville-Test`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './support/test'
import type { Page, Route } from '@playwright/test'

import { validatePlan, validateResult } from '../drive-agent/protocol'
import type { PlanMessage, ResultMessage } from '../drive-agent/protocol'
import { fakeApp, scan, trackTaps } from './support/drive'

const sample = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../drive-agent/fixtures/contract/${name}.sample.json`, import.meta.url),
      ),
      'utf8',
    ),
  ) as Record<string, unknown>

const plan = sample('plan') as { shoppingListId: string; lines: unknown[] }
const LIST = plan.shoppingListId

// Ce que l'agent aurait fait de la liste du plan : farine et sel mis au panier (prix lus), lait indisponible, œufs choisis sur le site
// (le produit rejeté ne sera plus proposé), sucre « déjà à la maison ». Le `runId` est celui du plan reçu, mis par le faux pont.
const result: Omit<ResultMessage, 'runId'> = {
  v: 1,
  type: 'result',
  agentVersion: '1.0.0',
  outcome: 'completed',
  store: { id: '123456' },
  lines: [
    {
      ingredientSlug: 'farine',
      outcome: 'ADDED',
      productId: '555101',
      quantity: 1,
      usedRank: 1,
      price: { cents: 199, perMeasure: { cents: 199, unit: 'kg' } },
    },
    { ingredientSlug: 'lait', outcome: 'UNAVAILABLE', unavailableIds: ['555201'] },
    {
      ingredientSlug: 'oeuf',
      outcome: 'CHOSEN',
      quantity: 1,
      placement: 'PRIMARY',
      product: {
        id: '555301',
        label: 'Œufs plein air x6',
        content: { value: 6, unit: 'piece' },
        price: { cents: 289 },
      },
      rejected: [{ id: '555399', label: 'Œufs cage x6' }],
    },
    {
      ingredientSlug: 'sel',
      outcome: 'ADDED',
      productId: '555401',
      quantity: 1,
      usedRank: 1,
      price: { cents: 45 },
    },
    { ingredientSlug: 'sucre', outcome: 'HAVE_AT_HOME' },
  ],
}

const sentList = {
  id: LIST,
  name: 'Courses du week-end',
  displayName: 'Courses du week-end',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status: 'SENT',
  version: 2,
  isActive: false,
  isPaused: false,
  isCompleted: false,
  isSent: true,
  sentAt: '2026-10-18T12:30:00+02:00',
  rowCount: 1,
  recipeCount: 0,
  departments: [
    {
      slug: 'divers',
      name: 'Divers',
      image: 'images/department/divers.png',
      rows: [{ id: 'r1', ingredientName: 'Sel', quantity: 5, unitSymbol: 'g', checked: false }],
    },
  ],
  recipeTypes: [],
}

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Le faux back : les exemples du back en réponse, les appels reçus et les corps de `PUT /drive/choices` gardés. */
async function fakeBackFromSamples(page: Page) {
  const received = { calls: [] as string[], choices: [] as unknown[] }
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.calls.push(key)
      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
          })
        case 'GET /api/v1/drive/settings':
          return reply(route, sample('settings'))
        case 'GET /api/v1/drive/choices':
          return reply(route, sample('choices'))
        case `GET /api/v1/drive/plans/${LIST}`:
          return reply(route, plan)
        case `GET /api/v1/drive/estimates/${LIST}`:
          return reply(route, sample('estimate'))
        case `GET /api/v1/shopping-lists/${LIST}`:
          return reply(route, sentList)
        case 'PUT /api/v1/drive/choices':
          received.choices.push(request.postDataJSON())
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return received
}

test.describe('parcours complet, pont et API simulés', () => {
  // Joué sur le téléphone seulement : le drive se pilote du téléphone (c'est le projet de tout test sans étiquette)
  test('réglages, liste envoyée, envoi, retour de l’application, choix enregistrés, récapitulatif', async ({
    page,
  }) => {
    const back = await fakeBackFromSamples(page)
    // Le résultat de l'agent est valide pour le protocole avant même d'être envoyé à la page
    expect(() =>
      validateResult({ ...result, runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c' }),
    ).not.toThrow()
    await fakeApp(page, result)
    const taps = await trackTaps(page)

    // 1. Les réglages : magasin du back, résumé des produits mémorisés
    await page.goto('/drive/reglages')
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages du drive' })).toBeVisible()
    // « Ton magasin » est le premier bloc, sans note au-dessus et visible sans défiler (DRV-628)
    await expect(page.getByRole('heading', { level: 2, name: 'Ton magasin' })).toBeInViewport()
    await expect(page.getByRole('heading', { name: 'Ta vie privée' })).toHaveCount(0)
    await expect(page.getByText('Ville-Test', { exact: true })).toBeVisible()
    await expect(page.getByText('Magasin …456')).toBeVisible()
    await page.getByRole('link', { name: 'Gérer mes produits' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mes produits' })).toBeVisible()
    await expect(page.getByText('Farine de blé T55 1 kg')).toBeVisible()

    // 2. La liste envoyée : lecture seule, avec son estimation, d'où l'on reprend l'envoi
    await page.goto(`/listes/${LIST}`)
    await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
    const estimation = page.getByRole('region', { name: 'Estimation du coût' })
    await expect(estimation).toContainText('1,99')
    await expect(estimation).toContainText('1 article sur 4 estimé')
    // 3. L'écran d'envoi, ouvert à la main : le plan du back, tel quel (c'est l'écran qui reste pour une décision ou une explication)
    await page.goto(`/drive/envoi/${LIST}`)
    await expect(
      page.getByText(
        '5 articles : 3 sont déjà choisis, 1 est à choisir sur Leclerc, 1 ne sera pas mis au panier.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Tes articles' })).toBeVisible()
    await expect(page.getByText('À acheter : 6 unité')).toBeVisible()
    expect((await scan(page)).violations).toEqual([])

    // 4. « Reprendre l'envoi » est l'intention : un seul geste, et le drive s'ouvre tout seul. Le plan envoyé à l'application est valide pour
    // l'agent, nom, identifiants et quantités compris
    await page.goto(`/listes/${LIST}`)
    const before = await taps.total()
    await page.getByRole('link', { name: 'Reprendre l’envoi' }).click()
    await expect
      .poll(() => page.evaluate(() => window.__sent.some((m) => m.type === 'drive.start')))
      .toBe(true)
    expect(await taps.total()).toBe(before + 1)
    await expect(page.getByRole('button', { name: 'Ouvrir le drive', exact: true })).toHaveCount(0)
    const start = await page.evaluate(() => window.__sent.find((m) => m.type === 'drive.start'))
    const sent = start?.plan as unknown as PlanMessage
    expect(() => validatePlan(sent)).not.toThrow()
    expect(sent.lines.map((line) => `${line.ingredientSlug}:${line.status}`)).toEqual([
      'farine:KNOWN',
      'lait:KNOWN',
      'oeuf:NEW',
      'sel:KNOWN',
      'sucre:HAVE_AT_HOME',
    ])
    expect(sent.lines.find((line) => line.ingredientSlug === 'oeuf')?.needed).toMatchObject({
      quantity: 6,
      unitSymbol: 'unité',
    })

    // 5. L'application répond : l'écran du retour s'ouvre, les choix sont enregistrés en un seul appel
    await expect(page).toHaveURL(/\/drive\/retour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Le panier est rempli' }),
    ).toBeVisible()
    await expect(
      page.getByText('Tes choix sont enregistrés pour les prochains envois.'),
    ).toBeVisible()

    // 6. Les choix enregistrés, dans l'ordre du résultat : prix, produit refusé puis choisi, « déjà à la maison »
    expect(back.calls.filter((call) => call === 'PUT /api/v1/drive/choices')).toHaveLength(1)
    const [body] = back.choices as {
      storeId: string
      choices: {
        ingredientSlug: string
        action: string
        placement: string | null
        product: { retailerProductId: string; price?: { cents: number } | null } | null
      }[]
    }[]
    expect(body?.storeId).toBe('123456')
    expect(
      body?.choices.map(({ ingredientSlug, action, placement, product }) => [
        ingredientSlug,
        action,
        placement,
        product?.retailerProductId ?? null,
        product?.price?.cents ?? null,
      ]),
    ).toEqual([
      ['farine', 'REFRESH_PRICE', null, '555101', 199],
      ['oeuf', 'REJECT_PRODUCT', null, '555399', null],
      ['oeuf', 'ADD_PRODUCT', 'PRIMARY', '555301', 289],
      ['sel', 'REFRESH_PRICE', null, '555401', 45],
      ['sucre', 'HAVE_AT_HOME', null, null, null],
    ])

    // 7. Le récapitulatif : les compteurs, puis chaque ligne
    const counts = page.getByLabel('Récapitulatif de l’envoi')
    await expect(counts).toContainText('Ajoutés au panier2')
    await expect(counts).toContainText('Choisis sur Leclerc1')
    await expect(counts).toContainText('J’en ai toujours1')
    await expect(counts).toContainText('Indisponibles1')
    // Les prix lus sont mémorisés (REFRESH_PRICE ci-dessus) mais ne s'affichent plus comme compteur
    await expect(counts).not.toContainText('Prix lus')
    await page.getByText('Détails', { exact: true }).click()
    const line = (name: string) => page.locator('details li').filter({ hasText: name })
    await expect(line('Farine')).toContainText('1,99')
    await expect(line('Lait')).toContainText(
      'Aucun produit disponible : rien n’a été mis au panier.',
    )
    await expect(line('Œufs')).toContainText(
      'Choisi sur Leclerc, produit habituel : Repas s’en souvient.',
    )
    await expect(line('Œufs')).toContainText('Ne sera plus proposé : Œufs cage x6')
    await expect(line('Sucre')).toContainText('J’en ai toujours : Repas s’en souvient.')
    await expect(page.getByText(/vidé/)).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('repas.drive.run'))).toBeNull()
    expect((await scan(page)).violations).toEqual([])
  })

  test('une application à jour : le plan porte l’unité de chaque ligne, et la contenance donnée comme la recherche d’un « Pas mon habituel » reviennent au back (DRV-652, DRV-653)', async ({
    page,
  }) => {
    // Ce que l'agent 0.42.0 aurait rendu : le sel (produit connu, compté en cuillères) avec sa contenance, les œufs pris « Pas mon habituel » avec la
    // recherche tapée, la farine mise au panier sans rien demander
    const sized: Omit<ResultMessage, 'runId'> = {
      v: 1,
      type: 'result',
      agentVersion: '0.42.0',
      outcome: 'completed',
      store: { id: '123456' },
      lines: [
        {
          ingredientSlug: 'farine',
          outcome: 'ADDED',
          productId: '555101',
          quantity: 1,
          usedRank: 1,
        },
        {
          ingredientSlug: 'oeuf',
          outcome: 'CHOSEN',
          quantity: 1,
          placement: 'ONCE',
          product: { id: '555301', label: 'Œufs plein air x6' },
          searchQuery: 'oeufs plein air',
        },
        {
          ingredientSlug: 'sel',
          outcome: 'ADDED',
          productId: '555401',
          quantity: 1,
          usedRank: 1,
          packSize: { value: 12.5, unitSlug: 'cuillere-a-soupe' },
        },
      ],
    }
    expect(() =>
      validateResult({ ...sized, runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c' }),
    ).not.toThrow()
    const back = await fakeBackFromSamples(page)
    await fakeApp(page, sized, '0.1.25')

    await page.goto(`/listes/${LIST}`)
    await page.getByRole('link', { name: 'Reprendre l’envoi' }).click()
    await expect(page).toHaveURL(/\/drive\/retour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Le panier est rempli' }),
    ).toBeVisible()

    // Le plan envoyé à l'agent : valide, avec l'unité de chaque ligne et la contenance des produits (null sans réponse)
    const start = await page.evaluate(() => window.__sent.find((m) => m.type === 'drive.start'))
    const sent = start?.plan as unknown as PlanMessage
    expect(() => validatePlan(sent)).not.toThrow()
    const sel = sent.lines.find((line) => line.ingredientSlug === 'sel')
    expect(sel?.needed).toMatchObject({
      unitSlug: 'cuillere-a-soupe',
      unitName: 'cuillère à soupe',
    })
    expect(sel?.products?.map((product) => product.packSize)).toEqual([
      null,
      { value: 14, unitSlug: 'cuillere-a-soupe' },
    ])

    // Les intentions : la contenance dans le produit du sel (« de secours » : son rang ne bouge pas), la recherche seule pour les œufs, jamais null
    expect(back.choices).toHaveLength(1)
    const [body] = back.choices as { choices: Record<string, unknown>[] }[]
    expect(body?.choices).toEqual([
      {
        ingredientSlug: 'oeuf',
        action: 'NOTE_SEARCH',
        placement: null,
        product: null,
        searchQuery: 'oeufs plein air',
      },
      {
        ingredientSlug: 'sel',
        action: 'ADD_PRODUCT',
        placement: 'FALLBACK',
        product: {
          retailerProductId: '555401',
          label: expect.any(String) as unknown,
          ean: null,
          content: expect.anything() as unknown,
          price: null,
          packSize: { value: 12.5, unitSlug: 'cuillere-a-soupe' },
        },
      },
    ])
    expect(JSON.stringify(body)).not.toContain('"packSize":null')
  })
})

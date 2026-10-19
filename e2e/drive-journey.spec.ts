// Parcours complet du drive, simulé de bout en bout (DRV-501), sur Pixel 7 : réglages, liste envoyée, écran d'envoi, passage dans
// l'application, retour, enregistrement des choix, récapitulatif. Ni back ni application : l'API est simulée par `page.route` avec les
// EXEMPLES DE CONTRAT du back (`drive-agent/fixtures/contract/`, les vraies réponses figées), le pont `repasNative` par un faux dont le
// résultat est construit avec les types et le validateur du protocole. Données inventées (magasin `123456`, `Ville-Test`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

import { validatePlan, validateResult } from '../drive-agent/protocol'
import type { PlanMessage, ResultMessage } from '../drive-agent/protocol'
import { fakeApp, scan } from './support/drive'

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
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    ({ isMobile }) => !isMobile,
    'Parcours joué sur Pixel 7 (le drive se pilote du téléphone)',
  )

  test('réglages, liste envoyée, envoi, retour de l’application, choix enregistrés, récapitulatif', async ({
    page,
  }) => {
    const back = await fakeBackFromSamples(page)
    // Le résultat de l'agent est valide pour le protocole avant même d'être envoyé à la page
    expect(() =>
      validateResult({ ...result, runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c' }),
    ).not.toThrow()
    await fakeApp(page, result)

    // 1. Les réglages : note de vie privée, magasin du back, résumé des produits mémorisés
    await page.goto('/drive/reglages')
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages du drive' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Votre vie privée' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lisez la note complète' })).toHaveAttribute(
      'href',
      '/drive/aide#vie-privee',
    )
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
    await page.getByRole('link', { name: 'Reprendre l’envoi' }).click()

    // 3. L'écran d'envoi : le plan du back, tel quel
    await expect(page).toHaveURL(new RegExp(`/drive/envoi/${LIST}$`))
    await expect(page.getByRole('heading', { level: 2, name: 'Votre liste (5)' })).toBeVisible()
    await expect(page.getByText('À acheter : 6 unité')).toBeVisible()
    expect((await scan(page)).violations).toEqual([])

    // 4. Le drive : le plan envoyé à l'application est valide pour l'agent, nom, identifiants et quantités compris
    await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
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
      page.getByRole('heading', { level: 2, name: 'Le panier est rempli' }),
    ).toBeVisible()
    await expect(
      page.getByText('Vos choix sont enregistrés pour les prochains envois.'),
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
    await expect(counts).toContainText('Prix lus3')
    const line = (name: string) =>
      page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) })
    await expect(line('Farine')).toContainText('1,99')
    await expect(line('Lait')).toContainText(
      'Aucun produit disponible : rien n’a été mis au panier.',
    )
    await expect(line('Œufs')).toContainText(
      'Choisi sur Leclerc, produit habituel : Repas s’en souvient.',
    )
    await expect(line('Œufs')).toContainText('Ne sera plus proposé : Œufs cage x6')
    await expect(line('Sucre')).toContainText('J’en ai toujours : Repas s’en souvient.')
    await expect(page.getByText('Le panier Leclerc n’est pas vidé par Repas.')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('repas.drive.run'))).toBeNull()
    expect((await scan(page)).violations).toEqual([])
  })
})

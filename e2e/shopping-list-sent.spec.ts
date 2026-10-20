// Liste envoyée au drive (DRV-401), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les envois.
// Jouée sur bureau et sur Pixel 7 : envoyer, lire en lecture seule, rouvrir.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

import { fakeApp, plan, trackTaps } from './support/drive'
import { fakeAppForSetup } from './support/setupApp'

type Status = 'ACTIVE' | 'SENT'

const list = (status: Status) => ({
  id: 'l1',
  name: 'Courses du week-end',
  displayName: 'Courses du week-end',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status,
  version: 3,
  isActive: status === 'ACTIVE',
  isPaused: false,
  isCompleted: false,
  isSent: status === 'SENT',
  sentAt: status === 'SENT' ? '2026-10-15T18:30:00+02:00' : null,
  rowCount: 2,
  recipeCount: 1,
  departments: [
    {
      slug: 'divers',
      name: 'Divers',
      image: 'images/department/divers.png',
      rows: [
        { id: 'r1', ingredientName: 'Sel', quantity: 5, unitSymbol: 'g', checked: false },
        { id: 'r2', ingredientName: 'Farine', quantity: 1, unitSymbol: 'kg', checked: true },
      ],
    },
  ],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: 'images/type/plat.png',
      meals: [{ id: 'm1', recipeId: 'rec1', recipeName: 'Gratin', serving: 4 }],
    },
  ],
})

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Un faux back : une liste dont le statut change avec `send` et `reopen`. Rend les appels reçus. `withStore` faux : pas de magasin enregistré. */
async function fakeBack(page: Page, initial: Status = 'ACTIVE', enabled = true, withStore = true) {
  let status = initial
  let hasStore = withStore
  const received: string[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.push(key)
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
        case 'GET /api/v1/shopping-lists/active/summary':
          return reply(route, {
            shoppingListId: status === 'ACTIVE' ? 'l1' : null,
            quantityByIngredientSlug: {},
            plannedRecipeIds: [],
          })
        case 'GET /api/v1/shopping-lists/l1':
          return reply(route, list(status))
        case 'GET /api/v1/drive/settings':
          return reply(route, {
            enabled,
            retailer: 'leclerc',
            store: hasStore
              ? {
                  id: '123456',
                  label: null,
                  baseUrl: 'https://courses-test.leclercdrive.fr/magasin-123456-123456',
                }
              : null,
          })
        case 'PUT /api/v1/drive/settings':
          hasStore = true
          return reply(route)
        case 'GET /api/v1/drive/plans/l1':
          // Interrupteur coupé : toutes les routes du drive répondent 404 DRIVE_DISABLED (hors réouverture d'une liste)
          return enabled
            ? reply(route, plan)
            : reply(route, { error: { message: 'DRIVE_DISABLED' } }, 404)
        case 'POST /api/v1/shopping-lists/l1/send':
          status = 'SENT'
          return reply(route)
        case 'POST /api/v1/shopping-lists/l1/reopen':
          status = 'ACTIVE'
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return received
}

test('envoyer une liste au drive, la lire sans pouvoir la modifier, puis la rouvrir', async ({
  page,
}) => {
  const received = await fakeBack(page)
  // Le drive s'ouvre et l'utilisateur n'est pas encore revenu : l'application ne rend aucun résultat
  await fakeApp(page, 'silent')
  const taps = await trackTaps(page)
  await page.goto('/liste')
  await expect(page.getByRole('heading', { level: 1, name: 'Courses du week-end' })).toBeVisible()

  // Envoi : « Envoyer au drive », sa confirmation (les deux seuls gestes), puis le drive s'ouvre TOUT SEUL
  await page.getByRole('button', { name: 'Envoyer au drive' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('La liste ne sera plus modifiable. Tu pourras la rouvrir.')
  await confirm.getByRole('button', { name: 'Envoyer au drive' }).click()
  await expect(page).toHaveURL(/\/drive\/envoi\/l1$/)
  expect(received).toContain('POST /api/v1/shopping-lists/l1/send')
  await expect
    .poll(() => page.evaluate(() => window.__sent.filter((m) => m.type === 'drive.start').length))
    .toBe(1)
  await expect(page.getByText('En attente du récapitulatif…')).toBeVisible()
  // Pas de « Ouvrir le drive » à toucher : deux gestes en tout, et aucun de plus après la confirmation
  await expect(page.getByRole('button', { name: 'Ouvrir le drive', exact: true })).toHaveCount(0)
  expect(await taps.total()).toBe(2)

  // La liste envoyée : lecture seule
  await page.getByRole('link', { name: 'Retour à la liste' }).click()
  await expect(page.getByText('Envoyée au drive le 15 octobre 2026')).toBeVisible()
  await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
  // Cocher en magasin n'a pas de sens sur une liste envoyée : pas de « 0 sur 2 articles dans le panier » (DRV-626)
  await expect(page.getByText(/articles dans le panier/)).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Reprendre l’envoi' })).toBeVisible()
  // « ⋮ » ne range que la réouverture et la suppression : ni renommer ni mettre en pause
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Rouvrir la liste', 'Supprimer'])

  // Réouverture : confirmation, puis la liste redevient modifiable
  await page.getByRole('menuitem', { name: 'Rouvrir la liste' }).click()
  await expect(page.getByRole('dialog')).toContainText('La liste redevient modifiable.')
  await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir la liste' }).click()
  await expect(page.getByText('En cours')).toBeVisible()
  for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeEnabled()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/reopen')
})

test('fonction coupée (retour arrière) : une liste envoyée se rouvre, sans proposer l’envoi', async ({
  page,
}) => {
  const received = await fakeBack(page, 'SENT', false)
  await page.goto('/listes/l1')
  await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('menuitem', { name: 'Rouvrir la liste' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir la liste' }).click()

  await expect(page.getByText('En cours')).toBeVisible()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/reopen')
  // La liste est de nouveau modifiable ; tant que la fonction est coupée, l'envoi reste masqué
  for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)
})

test('fonction coupée : « Reprendre l’envoi » dit que l’envoi n’est pas disponible, sans l’ouvrir, et laisse rouvrir la liste', async ({
  page,
}) => {
  const received = await fakeBack(page, 'SENT', false)
  await page.goto('/listes/l1')
  await page.getByRole('link', { name: 'Reprendre l’envoi' }).click()
  await expect(page).toHaveURL(/\/drive\/envoi\/l1$/)

  // L'écran répond « pas disponible » ; ni « Ouvrir le drive » ni « Envoyer au drive », mais « Rouvrir la liste »
  await expect(page.getByRole('alert')).toContainText(
    'L’envoi au drive n’est pas disponible pour le moment. Ta liste n’a pas changé. Réessaie plus tard.',
  )
  await expect(page.getByRole('button', { name: 'Rouvrir la liste' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ouvrir le drive', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)
  expect(received).not.toContain('POST /api/v1/shopping-lists/l1/reopen')

  // Même confirmation que sur l'écran de la liste, puis retour à la liste, de nouveau modifiable
  await page.getByRole('button', { name: 'Rouvrir la liste' }).click()
  await expect(page.getByRole('dialog')).toContainText('La liste redevient modifiable.')
  await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir la liste' }).click()
  await expect(page).toHaveURL(/\/listes\/l1$/)
  await expect(page.getByText('En cours')).toBeVisible()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/reopen')
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`« Reprendre l’envoi » interrupteur coupé et sa confirmation sont accessibles, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page, 'SENT', false)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/envoi/l1')
    await expect(page.getByRole('button', { name: 'Rouvrir la liste' })).toBeVisible()
    const scan = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

    expect((await scan()).violations).toEqual([])

    await page.getByRole('button', { name: 'Rouvrir la liste' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await scan()).violations).toEqual([])
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`la liste envoyée et sa confirmation sont accessibles, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page, 'SENT')
    await page.emulateMedia({ colorScheme })
    await page.goto('/listes/l1')
    await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
    const scan = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

    expect((await scan()).violations).toEqual([])

    await page.getByRole('button', { name: 'Plus d’actions' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect((await scan()).violations).toEqual([])
    await page.getByRole('menuitem', { name: 'Rouvrir la liste' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await scan()).violations).toEqual([])
  })
}

test('sans magasin : « Choisir mon magasin » le lit, l’enregistre, et l’envoi reprend à sa confirmation (DRV-622, DRV-623)', async ({
  page,
}) => {
  const received = await fakeBack(page, 'ACTIVE', true, false)
  await fakeAppForSetup(page, 'found')
  await page.goto('/liste')

  // Un geste : l'écran dit ce qu'il attend et porte le bouton qui fait le travail
  await page.getByRole('button', { name: 'Envoyer au drive' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Choisis ton magasin' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Retour à la liste' })).toBeVisible()
  expect(received).not.toContain('POST /api/v1/shopping-lists/l1/send')

  // Un geste : le magasin est lu dans l'application puis enregistré tout seul, et la liste nous attend à sa confirmation
  await page.getByRole('button', { name: 'Choisir mon magasin' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('La liste ne sera plus modifiable. Tu pourras la rouvrir.')
  await expect(page).toHaveURL(/\/liste$/)
  expect(received.filter((call) => call === 'PUT /api/v1/drive/settings')).toHaveLength(1)
  expect(received).not.toContain('POST /api/v1/shopping-lists/l1/send')

  // Un geste : la confirmation envoie la liste
  await confirm.getByRole('button', { name: 'Envoyer au drive' }).click()
  await expect(page).toHaveURL(/\/drive\/envoi\/l1$/)
  expect(received).toContain('POST /api/v1/shopping-lists/l1/send')
})

test('dans un navigateur, « Envoyer au drive » n’est pas proposé : rien à verrouiller pour rien (DRV-641)', async ({
  page,
}) => {
  const received = await fakeBack(page)
  await page.goto('/liste')
  await expect(page.getByRole('heading', { level: 1, name: 'Courses du week-end' })).toBeVisible()
  await expect.poll(() => received).toContain('GET /api/v1/drive/settings')

  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible()
  expect(received).not.toContain('POST /api/v1/shopping-lists/l1/send')
})

for (const [label, version] of [
  ['trop ancienne', '0.1.9'],
  ['qui ne dit pas sa version', null],
] as const) {
  test(`application ${label} : la phrase de mise à jour, aucun verrou (DRV-641)`, async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await fakeApp(page, 'completed', version)
    await page.goto('/liste')

    await page.getByRole('button', { name: 'Envoyer au drive' }).click()
    const update = page.getByRole('dialog')
    await expect(update).toContainText('Mets à jour l’application pour envoyer ta liste.', {
      timeout: 6000,
    })
    await expect(update).not.toContainText('La liste ne sera plus modifiable')
    await expect(update.getByRole('link', { name: 'Mettre à jour' })).toHaveAttribute(
      'href',
      '/drive/aide',
    )
    expect(received).not.toContain('POST /api/v1/shopping-lists/l1/send')

    // La liste reste modifiable
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible()
    await expect(page.getByText('Cette liste est envoyée au drive')).toHaveCount(0)
  })
}

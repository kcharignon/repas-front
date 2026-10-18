// Liste envoyée au drive (DRV-401), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les envois.
// Jouée sur bureau et sur Pixel 7 : envoyer, lire en lecture seule, rouvrir.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

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

/** Un faux back : une liste dont le statut change avec `send` et `reopen`. Rend les appels reçus. */
async function fakeBack(page: Page, initial: Status = 'ACTIVE') {
  let status = initial
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
          return reply(route, { enabled: true, retailer: 'leclerc' })
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
  await page.goto('/liste')
  await expect(page.getByRole('heading', { level: 1, name: 'Courses du week-end' })).toBeVisible()

  // Envoi : confirmation, puis l'écran d'envoi
  await page.getByRole('button', { name: 'Envoyer au drive' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('La liste ne sera plus modifiable. Vous pourrez la rouvrir.')
  await confirm.getByRole('button', { name: 'Envoyer au drive' }).click()
  await expect(page).toHaveURL(/\/drive\/envoi\/l1$/)
  expect(received).toContain('POST /api/v1/shopping-lists/l1/send')

  // La liste envoyée : lecture seule
  await page.getByRole('link', { name: 'Retour à la liste' }).click()
  await expect(page.getByText('Envoyée au drive le 15 octobre 2026')).toBeVisible()
  await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Renommer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Reprendre l’envoi' })).toBeVisible()

  // Réouverture : confirmation, puis la liste redevient modifiable
  await page.getByRole('button', { name: 'Rouvrir la liste' }).click()
  await expect(page.getByRole('dialog')).toContainText('Le panier Leclerc ne sera pas vidé.')
  await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir la liste' }).click()
  await expect(page.getByText('En cours')).toBeVisible()
  for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeEnabled()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/reopen')
})

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

    await page.getByRole('button', { name: 'Rouvrir la liste' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await scan()).violations).toEqual([])
  })
}

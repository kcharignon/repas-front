// Liste envoyée au drive (DRV-401), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les envois.
// Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour l'axe du thème clair (playwright.config.ts) : envoyer, lire en lecture seule, rouvrir.
// Le détail (fonction coupée, navigateur, application trop ancienne ou muette, refus du back, lecture seule) est dans `ShoppingListSent.spec.ts`
// et `DriveSendView.spec.ts` (jsdom) : ici, le parcours qui compte les gestes, le contraste des deux thèmes et le raccord avec les réglages.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route, BUREAU } from './support/test'

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

/**
 * Un faux back : une liste dont le statut change avec `send` et `reopen`. Rend les appels reçus, et `switchOff()` qui coupe la fonction (le retour
 * arrière : toutes les routes du drive répondent 404 DRIVE_DISABLED). `withStore` faux : pas de magasin enregistré.
 */
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
            // Le verdict du back (DRV-737) : aucun drive configuré tant que le magasin n'est pas enregistré
            selection: hasStore
              ? { mode: 'AUTO', retailer: 'leclerc', candidates: ['leclerc'] }
              : { mode: 'NONE', retailer: null, candidates: [] },
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

  return Object.assign(received, { switchOff: () => (enabled = false) })
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
  // Pas de « Remplir mon panier » à toucher : deux gestes en tout, et aucun de plus après la confirmation
  await expect(page.getByRole('button', { name: 'Remplir mon panier', exact: true })).toHaveCount(0)
  expect(await taps.total()).toBe(2)

  // La liste envoyée : lecture seule
  await page.getByRole('link', { name: 'Retour à la liste' }).click()
  await expect(page.getByText('Envoyée au drive le 15 octobre 2026')).toBeVisible()
  await expect(page.getByText('Cette liste est envoyée au drive')).toBeVisible()
  // Le passage coche ce qu'il a mis au panier (DRV-747) : la barre montre ce qui manque au drive, un article sur deux ici
  await expect(page.getByText('1 sur 2 articles dans le panier')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(1)
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

// Le contraste ne dépend que du thème, la mise en page que de la largeur : le bureau ne rejoue que le thème clair. Une visite, deux états : la
// liste envoyée (menu, confirmation), puis le retour arrière (fonction coupée : « Reprendre l'envoi » dit « pas disponible » et laisse rouvrir).
for (const colorScheme of ['light', 'dark'] as const) {
  test(
    `la liste envoyée, son menu, sa confirmation et le retour arrière sont accessibles, thème ${colorScheme}`,
    { tag: colorScheme === 'light' ? BUREAU : [] },
    async ({ page }) => {
      const back = await fakeBack(page, 'SENT')
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

      // Le retour arrière : la fonction est coupée, l'écran d'envoi répond « pas disponible » et laisse rouvrir la liste
      back.switchOff()
      await page.goto('/drive/envoi/l1')
      await expect(page.getByRole('alert')).toContainText('n’est pas disponible pour le moment')
      await expect(page.getByRole('button', { name: 'Rouvrir la liste' })).toBeVisible()
      expect((await scan()).violations).toEqual([])
      await page.getByRole('button', { name: 'Rouvrir la liste' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect((await scan()).violations).toEqual([])
    },
  )
}

test('sans magasin : « Choisir mon magasin » le lit, l’enregistre, et l’envoi reprend à sa confirmation (DRV-622, DRV-623)', async ({
  page,
}) => {
  const received = await fakeBack(page, 'ACTIVE', true, false)
  await fakeAppForSetup(page, 'found')
  await page.goto('/liste')

  // Aucun drive configuré (DRV-737) : pas de « Envoyer au drive » ; « ⋮ » propose « Configurer un drive »
  await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  // Un geste : l'écran dit ce qu'il attend et porte le bouton qui fait le travail
  await page.getByRole('menuitem', { name: 'Configurer un drive' }).click()
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

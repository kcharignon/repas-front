// La version de l'application connue du serveur (DRV-637), sans back ni compte : l'API est simulée par `page.route`, l'application par un
// faux pont `repasNative` posé avant le chargement. Envoi de la version une fois par session, bandeau de « Moi », administration des comptes.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const BANNER = 'Une nouvelle version de l’application est prête.'

type AppUpdate = { latest: string | null; minimum: string | null; outdated: boolean }

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

const users = {
  member: [
    {
      id: 'u1',
      email: 'alexiane@example.com',
      defaultServing: 4,
      recipeCount: 3,
      ingredientCount: 0,
      shoppingListCount: 2,
      createdAt: '2026-10-01T10:00:00+02:00',
      isDisabled: false,
      status: 'ACTIVE',
      isAdmin: true,
      appVersion: '0.1.18',
      appOutdated: false,
    },
    {
      id: 'u2',
      email: 'camille@example.com',
      defaultServing: 2,
      recipeCount: 1,
      ingredientCount: 0,
      shoppingListCount: 1,
      createdAt: '2026-10-05T10:00:00+02:00',
      isDisabled: false,
      status: 'ACTIVE',
      isAdmin: false,
      appVersion: '0.1.8',
      appOutdated: true,
    },
    {
      id: 'u3',
      email: 'dominique@example.com',
      defaultServing: 4,
      recipeCount: 0,
      ingredientCount: 0,
      shoppingListCount: 0,
      createdAt: '2026-10-10T10:00:00+02:00',
      isDisabled: false,
      status: 'ACTIVE',
      isAdmin: false,
      appVersion: null,
      appOutdated: false,
    },
  ],
  totalItems: 3,
}

/** Un faux back : rend les appels reçus et le corps de chaque `PUT …/app-version`. */
async function fakeBack(page: Page, appUpdate: AppUpdate, isAdmin = false) {
  const received: string[] = []
  const versions: unknown[] = []
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
            roles: isAdmin ? ['ROLE_USER', 'ROLE_ADMIN'] : ['ROLE_USER'],
            isAdmin,
            defaultServing: 4,
            appUpdate,
          })
        case 'PUT /api/v1/users/me/app-version':
          versions.push(request.postDataJSON())
          return reply(route)
        case 'GET /api/v1/drive/settings':
          return reply(route, { enabled: false, retailer: 'leclerc', store: null })
        case 'GET /api/v1/users':
          return reply(route, users)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return { received, versions }
}

/** L'application Repas, version `version` : le faux pont ne répond qu'à `app.info`. */
async function fakeApp(page: Page, version: string) {
  await page.addInitScript((version) => {
    const listeners: ((event: { data: unknown }) => void)[] = []
    Object.assign(window, {
      repasNative: {
        postMessage: (text: string) => {
          const message = JSON.parse(text) as { type: string }
          if (message.type !== 'app.info') return
          setTimeout(() => {
            const data = JSON.stringify({
              v: 1,
              type: 'app.info',
              version,
              versionCode: 108,
              drive: true,
            })
            listeners.forEach((listener) => listener({ data }))
          }, 0)
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.push(listener),
      },
    })
  }, version)
}

const accessibility = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()
  expect(violations).toEqual([])
}

test.describe('version de l’application connue du serveur (DRV-637)', () => {
  test('dans l’application : la version part une fois au démarrage, et « Moi » invite à mettre à jour', async ({
    page,
  }) => {
    await fakeApp(page, '0.1.8')
    const back = await fakeBack(page, { latest: '0.1.10', minimum: null, outdated: false })

    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText(BANNER)).toBeVisible()
    await expect.poll(() => back.versions).toEqual([{ platform: 'android', version: '0.1.8' }])

    // Changer d'écran dans la même session ne renvoie rien
    await page.getByRole('link', { name: 'Mettre à jour', exact: true }).click()
    await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    expect(back.versions).toHaveLength(1)
  })

  test('dans l’application à jour : la version part, aucun bandeau, même si le serveur croit l’ancienne', async ({
    page,
  }) => {
    await fakeApp(page, '0.1.10')
    const back = await fakeBack(page, { latest: '0.1.10', minimum: '0.1.9', outdated: true })

    await page.goto('/moi')
    await expect.poll(() => back.versions).toEqual([{ platform: 'android', version: '0.1.10' }])
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText(BANNER)).toHaveCount(0)
  })

  test('une construction de développement : rien n’est envoyé, aucun bandeau', async ({ page }) => {
    await fakeApp(page, '0.0.0-dev')
    const back = await fakeBack(page, { latest: '0.1.10', minimum: null, outdated: true })

    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText('Mettre à jour l’application')).toBeVisible()
    expect(back.received).not.toContain('PUT /api/v1/users/me/app-version')
    await expect(page.getByText(BANNER)).toHaveCount(0)
  })

  test('dans un navigateur : rien n’est envoyé, aucun bandeau', async ({ page }) => {
    const back = await fakeBack(page, { latest: '0.1.10', minimum: '0.1.9', outdated: true })

    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText('Installer l’application Android')).toBeVisible()
    expect(back.received).not.toContain('PUT /api/v1/users/me/app-version')
    await expect(page.getByText(BANNER)).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`« Moi » à 360 px, avec et sans bandeau, accessible (WCAG AA), thème ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 360, height: 640 })
      await page.emulateMedia({ colorScheme })
      await fakeApp(page, '0.1.8')
      const update: AppUpdate = { latest: '0.1.10', minimum: null, outdated: true }
      await fakeBack(page, update)

      await page.goto('/moi')
      const banner = page.getByText(BANNER)
      await expect(banner).toBeVisible()
      const action = page.getByRole('link', { name: 'Mettre à jour', exact: true })
      const box = await action.boundingBox()
      expect(box, 'le bouton se voit sans défiler').not.toBeNull()
      expect(box!.y + box!.height).toBeLessThanOrEqual(640)
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
      await accessibility(page)
      await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-moi-bandeau.png`) })

      // Le serveur ne connaît aucune version publiée : plus de bandeau
      update.latest = null
      update.minimum = null
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
      await expect(page.getByText('Mettre à jour l’application')).toBeVisible()
      await expect(banner).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-moi-sans-bandeau.png`) })
    })

    test(`l’administration montre la version de chacun, à 360 px, thème ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 360, height: 640 })
      await page.emulateMedia({ colorScheme })
      await fakeBack(page, { latest: '0.1.10', minimum: null, outdated: false }, true)

      await page.goto('/admin/utilisateurs')
      const row = (email: string) => page.getByRole('listitem').filter({ hasText: email })
      await expect(row('alexiane@example.com')).toContainText('Application 0.1.18')
      await expect(row('alexiane@example.com').getByText('À mettre à jour')).toHaveCount(0)
      await expect(row('camille@example.com')).toContainText('Application 0.1.8')
      await expect(row('camille@example.com').getByText('À mettre à jour')).toBeVisible()
      await expect(row('dominique@example.com')).toContainText('Application inconnue')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
      await accessibility(page)
      await page.screenshot({
        path: testInfo.outputPath(`${colorScheme}-administration.png`),
        fullPage: true,
      })
    })
  }
})

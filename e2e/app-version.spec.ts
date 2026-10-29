// La version de l'application connue du serveur (DRV-637), sans back ni compte : l'API est simulée par `page.route`, l'application par un
// faux pont `repasNative` posé avant le chargement. Un seul parcours reste ici : `App.vue` envoie la version une fois par session et « Moi »
// invite à mettre à jour (le branchement de `useAppVersionReport` dans l'application, que seul un navigateur monte en entier), avec la mise en page
// à 360 × 640 et l'accessibilité du bandeau dans les deux thèmes. Le reste est en jsdom : l'envoi (une fois, jamais en développement ni dans un
// navigateur, silence sur un refus) dans `useAppVersionReport.spec.ts`, le bandeau dans `AppUpdateBanner.spec.ts`, la comparaison des versions dans
// `appVersion.spec.ts`, la colonne « Application » de l'administration dans `Admin.spec.ts` (mise en page et axe : `admin-users.spec.ts`).
import { expect, test, type Page, type Route } from './support/test'
import { axeBothThemes } from './support/screen'

const BANNER = 'Une nouvelle version de l’application est prête.'

type AppUpdate = { latest: string | null; minimum: string | null; outdated: boolean }

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Un faux back : rend les appels reçus et le corps de chaque `PUT …/app-version`. */
async function fakeBack(page: Page, appUpdate: AppUpdate) {
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
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
            appUpdate,
          })
        case 'PUT /api/v1/users/me/app-version':
          versions.push(request.postDataJSON())
          return reply(route)
        case 'GET /api/v1/drive/settings':
          return reply(route, { enabled: false, retailer: 'leclerc', store: null })
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

test.describe('version de l’application connue du serveur (DRV-637)', () => {
  test('dans l’application : la version part une fois au démarrage, et « Moi » invite à mettre à jour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.emulateMedia({ colorScheme: 'light' })
    await fakeApp(page, '0.1.8')
    const back = await fakeBack(page, { latest: '0.1.10', minimum: null, outdated: false })

    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText(BANNER)).toBeVisible()
    await expect.poll(() => back.versions).toEqual([{ platform: 'android', version: '0.1.8' }])
    // Le bandeau (ici sa variante « lien vers l'aide » : l'application ne sait pas se mettre à jour seule) se voit sans défiler, se touche du pouce
    // et ne fait pas déborder la page
    const box = await page.getByRole('link', { name: 'Mettre à jour', exact: true }).boundingBox()
    expect(box, 'le bouton se voit sans défiler').not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
    await axeBothThemes(page, 'moi-bandeau-lien')

    // Changer d'écran dans la même session ne renvoie rien
    await page.getByRole('link', { name: 'Mettre à jour', exact: true }).click()
    await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    expect(back.versions).toHaveLength(1)
  })
})

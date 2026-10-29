// La mise à jour de l'application par elle-même (DRV-639), sans back ni compte : l'API est simulée par `page.route`, l'application par un faux
// pont `repasNative` qui joue la machine à états de la vraie (recherche, téléchargement avec progression, vérification, installateur
// d'Android). Ni GitHub, ni installation : la page ne fait que demander et afficher. Deux parcours à 360 × 640 (le bandeau de « Moi », la page
// d'aide), chacun accessible dans les deux thèmes de la même visite. Ce que le navigateur ne prouve pas est en jsdom : les états et les phrases du
// bandeau (`AppUpdateBanner.spec.ts`, `appUpdateStore.spec.ts`) et de la page d'aide (`DriveHelpView.spec.ts`).
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'
import type { Page, Route } from '@playwright/test'

const BANNER = 'Une nouvelle version de l’application est prête.'

type Remote = 'newer' | 'same' | 'offline'
type Download = 'ok' | 'mismatch' | 'hold'

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

async function fakeBack(page: Page, latest: string | null = '0.1.30') {
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
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
            appUpdate: { latest, minimum: null, outdated: latest !== null },
          })
        case 'PUT /api/v1/users/me/app-version':
          return reply(route)
        case 'GET /api/v1/drive/settings':
          return reply(route, { enabled: false, retailer: 'leclerc', store: null })
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )
}

/**
 * Une application Repas qui sait se mettre à jour toute seule : elle joue la machine à états de la vraie. `remote` : ce que la recherche trouve ;
 * `download` : `ok` va jusqu'à « prêt à installer », `mismatch` finit par une empreinte fausse, `hold` s'arrête à 40 % (`window.__finish()` termine).
 * Tout ce que la page envoie est gardé dans `window.__sent`.
 */
async function fakeUpdatingApp(
  page: Page,
  options: { remote?: Remote; download?: Download; selfUpdate?: boolean } = {},
) {
  await page.addInitScript(
    ({ remote, download, selfUpdate }) => {
      const win = window as unknown as {
        __sent: { type: string }[]
        __finish: () => void
        repasNative: unknown
      }
      win.__sent = []
      const listeners = new Set<(event: { data: unknown }) => void>()
      let state: Record<string, unknown> = { state: 'inconnu' }
      const emit = (data: unknown) =>
        listeners.forEach((listener) => listener({ data: JSON.stringify(data) }))
      const say = (next: Record<string, unknown>) => {
        state = next
        emit({ v: 1, type: 'update.state', ...next })
      }
      const later = (delay: number, action: () => void) => setTimeout(action, delay)
      const finish = () => {
        if (download === 'mismatch') {
          say({ state: 'erreur', code: 'DIGEST_MISMATCH', version: '0.1.30' })
        } else {
          say({ state: 'telechargement', version: '0.1.30', progress: 90 })
          later(60, () => say({ state: 'pretAInstaller', version: '0.1.30' }))
        }
      }
      win.__finish = finish
      win.repasNative = {
        postMessage(text: string) {
          const message = JSON.parse(text) as { type: string }
          win.__sent.push(message)
          if (message.type === 'app.info') {
            later(0, () =>
              emit({
                v: 1,
                type: 'app.info',
                version: '0.1.26',
                versionCode: 1026,
                drive: true,
                ...(selfUpdate ? { selfUpdate: true } : {}),
              }),
            )
            return
          }
          if (!message.type.startsWith('update.')) return
          if (!selfUpdate)
            return later(0, () => emit({ v: 1, type: 'error', code: 'UNKNOWN_TYPE' }))
          if (message.type === 'update.status') return later(0, () => say(state))
          if (message.type === 'update.check') {
            say({ state: 'verification' })
            later(80, () =>
              say(
                remote === 'newer'
                  ? { state: 'miseAJourDisponible', version: '0.1.30' }
                  : remote === 'same'
                    ? { state: 'aJour' }
                    : { state: 'erreur', code: 'OFFLINE' },
              ),
            )
          }
          if (message.type === 'update.start') {
            say({ state: 'telechargement', version: '0.1.30', progress: 0 })
            later(80, () => say({ state: 'telechargement', version: '0.1.30', progress: 40 }))
            if (download !== 'hold') later(200, finish)
          }
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.add(listener),
      }
    },
    { remote: 'newer', download: 'ok', selfUpdate: true, ...options },
  )
}

const sent = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sent: { type: string }[] }).__sent.map((m) => m.type),
  )

/** Le bouton se voit sans défiler et se touche du pouce. */
async function expectReachable(button: ReturnType<Page['getByRole']>, height: number) {
  const box = await button.boundingBox()
  expect(box, 'le bouton se voit sans défiler').not.toBeNull()
  expect(box!.y + box!.height).toBeLessThanOrEqual(height)
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

const phone = { width: 360, height: 640 }

test.describe('mise à jour de l’application, à 360 × 640', () => {
  test.use({ viewport: phone })

  test('le bandeau de « Moi » : un seul bouton fait tout, de la recherche à l’écran d’installation d’Android', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'newer', download: 'hold' })

    await page.goto('/moi')
    const banner = page.getByTestId('app-update-banner')
    await expect(banner).toContainText(BANNER)
    await expect(banner.getByRole('link'), 'ni lien vers GitHub ni vers l’aide').toHaveCount(0)
    const action = banner.getByRole('button', { name: 'Mettre à jour' })
    await expectReachable(action, phone.height)
    await axeBothThemes(page, 'moi-bandeau-propose')

    await action.click()
    await expect(banner.getByRole('progressbar')).toBeVisible()
    await expect(banner).toContainText('Téléchargement de la mise à jour… 40 %')
    await axeBothThemes(page, 'moi-bandeau-progression')

    await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish())
    await expect(banner).toContainText('Touche « Installer » dans l’écran d’Android.')
    // Tout est resté dans l'application : la page n'a pas bougé, et n'a envoyé que des demandes sans adresse
    await expect(page).toHaveURL(/\/moi$/)
    expect(await sent(page)).toEqual(['app.info', 'update.status', 'update.check', 'update.start'])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
  })

  test('la page d’aide, dans l’application : la version installée et un seul bouton, qui fait tout', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'newer', download: 'ok' })

    await page.goto('/drive/aide#mise-a-jour')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    await expect(page.getByText('Version installée : 0.1.26')).toBeVisible()
    const button = page.getByRole('button', { name: 'Mettre à jour' })
    await expect(button).toBeVisible()
    await expectReachable(button, phone.height)
    await expect(page.locator('main a')).toHaveCount(0)
    await axeBothThemes(page, 'aide-mise-a-jour')

    await button.click()
    await expect(page.getByText('Touche « Installer » dans l’écran d’Android.')).toBeVisible()
    await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
  })
})

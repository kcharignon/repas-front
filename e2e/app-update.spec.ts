// La mise à jour de l'application par elle-même (DRV-639), sans back ni compte : l'API est simulée par `page.route`, l'application par un faux
// pont `repasNative` qui joue la machine à états de la vraie (recherche, téléchargement avec progression, vérification, installateur
// d'Android). Ni GitHub, ni installation : la page ne fait que demander et afficher. Captures à 412 et 360 px, thèmes clair et sombre.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
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

const accessibility = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()
  expect(violations).toEqual([])
}

test.describe('le bandeau de « Moi » : un seul bouton fait tout', () => {
  test('Mettre à jour : recherche, téléchargement avec progression, puis l’écran d’installation d’Android', async ({
    page,
  }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'newer', download: 'ok' })

    await page.goto('/moi')
    const banner = page.getByTestId('app-update-banner')
    await expect(banner).toContainText(BANNER)
    await expect(banner.getByRole('link'), 'ni lien vers GitHub ni vers l’aide').toHaveCount(0)

    await banner.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(banner.getByRole('progressbar')).toBeVisible()
    await expect(banner).toContainText('Touche « Installer » dans l’écran d’Android.')

    // Tout est resté dans l'application : la page n'a pas bougé, et n'a envoyé que des demandes sans adresse
    await expect(page).toHaveURL(/\/moi$/)
    expect(await sent(page)).toEqual(['app.info', 'update.status', 'update.check', 'update.start'])
  })

  test('l’application est déjà à jour : aucun bandeau, même si le serveur croit l’ancienne version', async ({
    page,
  }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'same' })

    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect.poll(() => sent(page)).toContain('update.check')
    await expect(page.getByText(BANNER)).toHaveCount(0)
  })

  test('une empreinte fausse : une phrase, rien d’installé, « Réessayer »', async ({ page }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'newer', download: 'mismatch' })

    await page.goto('/moi')
    await page
      .getByTestId('app-update-banner')
      .getByRole('button', { name: 'Mettre à jour' })
      .click()

    const banner = page.getByTestId('app-update-banner')
    await expect(banner.getByRole('alert')).toHaveText(
      'Le fichier téléchargé n’est pas le bon : rien n’a été installé.',
    )
    await expect(banner.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })

  test('une ancienne application garde le bouton vers l’aide', async ({ page }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { selfUpdate: false })

    await page.goto('/moi')
    const banner = page.getByTestId('app-update-banner')
    await expect(banner).toContainText(BANNER)
    await expect(banner.getByRole('link', { name: 'Mettre à jour' })).toHaveAttribute(
      'href',
      '/drive/aide#mise-a-jour',
    )
    expect(await sent(page)).toEqual(['app.info'])
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [412, 360]) {
      test(`captures et accessibilité à ${width} px, thème ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 640 })
        await page.emulateMedia({ colorScheme })
        await fakeBack(page)
        await fakeUpdatingApp(page, { remote: 'newer', download: 'hold' })

        await page.goto('/moi')
        const banner = page.getByTestId('app-update-banner')
        await expect(banner).toContainText(BANNER)
        const action = banner.getByRole('button', { name: 'Mettre à jour' })
        const box = await action.boundingBox()
        expect(box, 'le bouton se voit sans défiler').not.toBeNull()
        expect(box!.y + box!.height).toBeLessThanOrEqual(640)
        expect(box!.height).toBeGreaterThanOrEqual(44)
        await accessibility(page)
        await page.screenshot({
          path: testInfo.outputPath(`${colorScheme}-${width}-1-propose.png`),
        })

        await action.click()
        await expect(banner).toContainText('Téléchargement de la mise à jour… 40 %')
        await accessibility(page)
        await page.screenshot({
          path: testInfo.outputPath(`${colorScheme}-${width}-2-progression.png`),
        })

        await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish())
        await expect(banner).toContainText('Touche « Installer »')
        await page.screenshot({
          path: testInfo.outputPath(`${colorScheme}-${width}-3-installer.png`),
        })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(0)
      })
    }
  }
})

test.describe('la page d’aide, dans l’application', () => {
  test('la version installée et un seul bouton, qui fait tout', async ({ page }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'newer', download: 'ok' })

    await page.goto('/drive/aide#mise-a-jour')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    await expect(page.getByText('Version installée : 0.1.26')).toBeVisible()
    const button = page.getByRole('button', { name: 'Mettre à jour' })
    await expect(button).toBeVisible()
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('main a')).toHaveCount(0)
    await accessibility(page)

    await button.click()
    await expect(page.getByText('Touche « Installer » dans l’écran d’Android.')).toBeVisible()
    await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
  })

  test('à jour : une phrase, plus de bouton', async ({ page }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { remote: 'same' })

    await page.goto('/drive/aide#mise-a-jour')
    await expect(page.getByText('Tu as la dernière version.')).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
  })

  test('une ancienne application : le téléchargement à la main, vers la page de la dernière version', async ({
    page,
  }) => {
    await fakeBack(page)
    await fakeUpdatingApp(page, { selfUpdate: false })

    await page.goto('/drive/aide#mise-a-jour')
    await expect(page.getByRole('link', { name: 'Télécharger l’application' })).toHaveAttribute(
      'href',
      'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk',
    )
    await expect(page.getByRole('listitem')).toHaveCount(3)
  })
})

// La page publique d'installation de l'application Android, `/installer` (DRV-639), sans back ni compte : un gros bouton qui télécharge
// l'APK de la dernière version, puis quatre étapes. Un seul test, à 360 × 640 (le plus étroit), accessible dans les deux thèmes de la même
// visite. Le contenu (bouton, href, quatre étapes, un seul lien) et la redirection de la page d'aide vers `/installer` hors de l'application
// sont en jsdom : `DriveHelpView.spec.ts`.
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'
import type { Page } from '@playwright/test'

const APK =
  'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk'

/** Aucun appel au back : la page est publique et ne dépend d'aucune donnée. */
async function noBack(page: Page) {
  const calls: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      calls.push(route.request().url())
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    },
  )

  return calls
}

test.describe('/installer, à 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('le bouton se voit sans défiler, un seul lien sans nouvel onglet, quatre étapes, accessible dans les deux thèmes', async ({
    page,
  }) => {
    const calls = await noBack(page)
    await page.emulateMedia({ colorScheme: 'light' })

    await page.goto('/installer')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Installer l’application Repas' }),
    ).toBeVisible()
    const download = page.getByRole('link', { name: 'Télécharger l’application' })
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('href', APK)
    const box = await download.boundingBox()
    expect(box, 'le bouton se voit').not.toBeNull()
    expect(box!.y + box!.height, 'sans défiler').toBeLessThanOrEqual(640)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThan(360 / 2)
    // Un seul lien dans la partie principale, et il ne s'ouvre pas dans un nouvel onglet
    await expect(page.locator('main a')).toHaveCount(1)
    await expect(download).not.toHaveAttribute('target', /.+/)
    // Trois courtes étapes, dans l'ordre
    await expect(page.getByRole('listitem')).toHaveText([
      'Ouvre le fichier quand Android le propose.',
      'Autorise l’installation (une seule fois).',
      'Touche « Installer ».',
      'Si Play Protect s’affiche, touche « Installer sans analyser », puis confirme avec ton empreinte ou ton code.',
    ])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
    await axeBothThemes(page, 'installer')
    // La page n'a besoin de rien du back ni d'aucune connexion
    expect(calls).toEqual([])
  })
})

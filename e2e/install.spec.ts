// La page publique d'installation de l'application Android, `/installer` (DRV-639), sans back ni compte : un gros bouton qui télécharge
// l'APK de la dernière version, puis trois étapes. Joué sur bureau et sur Pixel 7 ; captures à 412 et 360 px, thèmes clair et sombre.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { fakeBack } from './support/drive'

const APK =
  'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk'

const accessibility = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()
  expect(violations).toEqual([])
}

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

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [412, 360]) {
    test(`/installer à ${width} px : le bouton se voit sans défiler, thème ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const calls = await noBack(page)
      await page.setViewportSize({ width, height: 640 })
      await page.emulateMedia({ colorScheme })

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
      expect(box!.width).toBeGreaterThan(width / 2)
      // Trois courtes étapes, dans l'ordre
      const steps = page.getByRole('listitem')
      await expect(steps).toHaveText([
        'Ouvre le fichier quand Android le propose.',
        'Autorise l’installation (une seule fois).',
        'Touche « Installer ».',
      ])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
      // La page n'a besoin de rien du back ni d'aucune connexion
      expect(calls).toEqual([])
      await accessibility(page)
      await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-installer-${width}.png`) })
    })
  }
}

test('le bouton télécharge le fichier de la release roulante : un seul lien, sans nouvel onglet', async ({
  page,
}) => {
  await noBack(page)
  await page.goto('/installer')

  const links = page.locator('main a')
  await expect(links).toHaveCount(1)
  await expect(links.first()).toHaveAttribute('href', APK)
  await expect(links.first()).not.toHaveAttribute('target', /.+/)
})

test('dans un navigateur, une personne connectée qui ouvre la page d’aide arrive sur /installer', async ({
  page,
}) => {
  await fakeBack(page)

  await page.goto('/drive/aide')

  await expect(page).toHaveURL(/\/installer$/)
  await expect(page.getByRole('link', { name: 'Télécharger l’application' })).toHaveAttribute(
    'href',
    APK,
  )
})

// Aide et installation de l'application (DRV-316, DRV-639), sans back ni compte : l'API est simulée par `page.route`, et le pont natif
// `repasNative` de l'application par un faux installé avant la page. Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour les tests étiquetés (playwright.config.ts). La mise à jour faite par l'application
// elle-même est dans `app-update.spec.ts`, la page publique `/installer` dans `install.spec.ts`.
import { expect, test } from './support/test'

import { fakeApp, fakeBack, scan } from './support/drive'
import { fakeDriveBack } from './support/driveBack'

const APK =
  'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`dans un navigateur : la page d’aide mène à /installer, un bouton et quatre étapes, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/aide')

    await expect(page).toHaveURL(/\/installer$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Installer l’application Repas' }),
    ).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(4)
    await expect(page.getByRole('link', { name: 'Télécharger l’application' })).toHaveAttribute(
      'href',
      APK,
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
    expect((await scan(page)).violations).toEqual([])
  })

  test(`dans une application qui ne se met pas encore à jour seule : la version installée et le téléchargement, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await fakeApp(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/aide')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    await expect(page.getByText('Version installée : 1.0.0')).toBeVisible()
    const button = page.getByRole('link', { name: 'Télécharger l’application' })
    await expect(button).toHaveAttribute('href', APK)
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('listitem')).toHaveCount(4)
    expect((await scan(page)).violations).toEqual([])
  })
}

// L'entrée « Application » de « Moi » : installer dans un navigateur, mettre à jour dans l'application (qu'on n'a pas à installer)
test('« Moi », dans un navigateur : propose d’installer l’application', async ({ page }) => {
  await fakeDriveBack(page)
  await page.goto('/moi')

  const entry = page.getByRole('link', { name: /Installer l’application Android/ })
  await expect(entry).toBeVisible()
  await expect(page.getByRole('link', { name: /Mettre à jour l’application/ })).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])

  await entry.click()
  await expect(page).toHaveURL(/\/installer$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Installer l’application Repas' }),
  ).toBeVisible()
})

test('« Moi », dans l’application : propose de la mettre à jour et mène à cette rubrique', async ({
  page,
}) => {
  await fakeDriveBack(page)
  await fakeApp(page)
  await page.goto('/moi')

  const entry = page.getByRole('link', { name: /Mettre à jour l’application/ })
  await expect(entry).toBeVisible()
  await expect(page.getByText('Ouvrir la dernière version.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Installer l’application Android/ })).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])

  await entry.click()
  await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
  ).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

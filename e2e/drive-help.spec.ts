// Aide et installation de l'application (DRV-316), sans back ni compte : l'API est simulée par `page.route`, et le pont natif
// `repasNative` de l'application par un faux installé avant la page. Joué sur bureau et sur Pixel 7.
import { expect, test } from '@playwright/test'

import { fakeApp, fakeBack, scan } from './support/drive'
import { fakeDriveBack } from './support/driveBack'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`dans un navigateur : l’installation, le dépannage au clavier et le mode assisté, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/aide')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Installer l’application Repas' }),
    ).toBeVisible()
    await expect(page.getByText('Tu es dans un navigateur.')).toBeVisible()
    await expect(
      page.getByRole('link', { name: /^Télécharger la dernière version/ }),
    ).toHaveAttribute('href', 'https://github.com/kcharignon/repas-front/releases')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sans l’application : chercher à la main' }),
    ).toBeVisible()

    // Le dépannage se déplie au clavier
    const question = page.getByText('Play Protect affiche un avertissement', { exact: true })
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Installer quand même', { exact: false }).last()).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
  })
}

test('le sommaire mène à la rubrique, et un lien discret mène aux conditions d’utilisation du drive', async ({
  page,
}) => {
  await fakeBack(page)
  await page.goto('/drive/aide')

  await page.getByRole('link', { name: 'En cas de problème' }).first().click()
  await expect(page).toHaveURL(/\/drive\/aide#depannage$/)
  await expect(page.getByRole('heading', { level: 2, name: 'En cas de problème' })).toBeInViewport()

  // Les conditions ne sont pas dans l'aide : un lien au pied de la page y mène, sans fenêtre ni case à cocher
  await expect(page.getByText('suspendre un compte E.Leclerc')).toHaveCount(0)
  await page.getByRole('link', { name: 'Conditions d’utilisation' }).click()
  await expect(page).toHaveURL(/\/drive\/conditions$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Conditions d’utilisation du drive' }),
  ).toBeVisible()
  await expect(page.getByText('suspendre un compte E.Leclerc')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('dans l’application : annonce la version et ne propose pas le mode assisté', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/aide')

  await expect(page.getByText('Tu es dans l’application Repas, version 1.0.0.')).toBeVisible()
  // Déjà installée : le titre ne propose pas de l'installer
  await expect(page.getByRole('heading', { level: 1, name: 'L’application Repas' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: /^Installer/ })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Sans l’application : chercher à la main' }),
  ).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])
})

// L'entrée « Application » de « Moi » : installer dans un navigateur, mettre à jour dans l'application (qu'on n'a pas à installer)
test('« Moi », dans un navigateur : propose d’installer l’application', async ({ page }) => {
  await fakeDriveBack(page)
  await page.goto('/moi')

  const entry = page.getByRole('link', { name: /Installer l’application Android/ })
  await expect(entry).toBeVisible()
  await expect(page.getByRole('link', { name: /Mettre à jour l’application/ })).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])

  await entry.click()
  await expect(page).toHaveURL(/\/drive\/aide$/)
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
  await expect(page.getByText('Mode d’emploi pour mettre à jour l’application.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Installer l’application Android/ })).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])

  await entry.click()
  await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
  await expect(page.getByRole('heading', { level: 1, name: 'L’application Repas' })).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Mettre à jour l’application' }),
  ).toBeInViewport()
  expect((await scan(page)).violations).toEqual([])
})

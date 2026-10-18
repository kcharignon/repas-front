// Aide et installation de l'application (DRV-316), sans back ni compte : l'API est simulée par `page.route`, et le pont natif
// `repasNative` de l'application par un faux installé avant la page. Joué sur bureau et sur Pixel 7.
import { expect, test } from '@playwright/test'

import { fakeApp, fakeBack, scan } from './support/drive'

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
    await expect(page.getByText('Vous êtes dans un navigateur.')).toBeVisible()
    await expect(
      page.getByRole('link', { name: /^Télécharger la dernière version/ }),
    ).toHaveAttribute('href', 'https://github.com/kcharignon/repas-front/releases')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sans l’application : le mode assisté' }),
    ).toBeVisible()

    // Le dépannage se déplie au clavier
    const question = page.getByText('Play Protect affiche un avertissement', { exact: true })
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Installer quand même', { exact: false }).last()).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
  })
}

test('le sommaire mène à la rubrique et l’adresse #vie-privee ouvre la note de vie privée', async ({
  page,
}) => {
  await fakeBack(page)
  await page.goto('/drive/aide')

  await page.getByRole('link', { name: 'En cas de problème' }).first().click()
  await expect(page).toHaveURL(/\/drive\/aide#depannage$/)
  await expect(page.getByRole('heading', { level: 2, name: 'En cas de problème' })).toBeInViewport()

  await page.goto('/drive/aide#vie-privee')
  await expect(
    page.getByRole('heading', { level: 2, name: 'Votre vie privée avec le drive' }),
  ).toBeInViewport()
  await expect(page.getByText('suspendre un compte E.Leclerc')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('dans l’application : annonce la version et ne propose pas le mode assisté', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/aide')

  await expect(page.getByText('Vous êtes dans l’application Repas, version 1.0.0.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Sans l’application : le mode assisté' }),
  ).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])
})

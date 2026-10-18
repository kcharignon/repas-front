// « Mes produits » (DRV-410), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`).
// Jouée sur bureau et sur Pixel 7 : parcours du compte à l'enregistrement d'un nouvel ordre, accessibilité en clair et en sombre.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { farineA, farineB, fakeDriveBack } from './support/driveBack'

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

test('classer les produits d’une farine, refuser l’un, accepter l’autre de nouveau, puis enregistrer', async ({
  page,
}) => {
  const back = await fakeDriveBack(page)

  // Du compte à la liste des ingrédients
  await page.goto('/moi')
  await page.getByRole('link', { name: /Mes produits du drive/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mes produits' })).toBeVisible()
  await expect(page.getByText('Vous en avez toujours')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher un ingrédient' }).fill('oeuf')
  await expect(page.getByRole('link', { name: /Farine/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Œufs/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher un ingrédient' }).fill('')
  await page.getByRole('link', { name: /Farine/ }).click()

  // Le préféré descend, le suivant devient préféré
  await expect(page.getByRole('heading', { level: 1, name: 'Farine' })).toBeVisible()
  const items = page.getByRole('list', { name: 'Produits acceptés' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText(farineA.label)
  await items
    .first()
    .getByRole('button', { name: /Descendre/ })
    .click()
  await expect(items.first()).toContainText(farineB.label)
  await expect(items.first()).toContainText('Préféré')
  // Le focus suit le produit déplacé
  await expect(items.nth(1).getByRole('button', { name: /Monter/ })).toBeFocused()

  // Refuser le second, accepter de nouveau le produit déjà refusé
  await items
    .nth(1)
    .getByRole('button', { name: /Ne plus jamais prendre/ })
    .click()
  await expect(items).toHaveCount(1)
  await page.getByRole('button', { name: /Accepter de nouveau Farine complète/ }).click()
  await expect(items).toHaveCount(2)
  await expect(page.getByText('Modifications non enregistrées.')).toBeVisible()

  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Produits enregistrés.')).toBeVisible()
  expect(back.bodies).toEqual([
    {
      retailer: 'leclerc',
      storeId: '123456',
      haveAtHome: false,
      accepted: ['p-2', 'p-3'],
      rejected: ['p-1'],
    },
  ])
  await expect(page.getByText('Modifications non enregistrées.')).toHaveCount(0)
})

test('oublier un ingrédient demande confirmation, puis revient à la liste', async ({ page }) => {
  const back = await fakeDriveBack(page)
  await page.goto('/drive/produits/farine')

  await page.getByRole('button', { name: 'Oublier cet ingrédient' }).click()
  await expect(page.getByRole('dialog')).toContainText('Oublier Farine ?')
  expect(back.received).not.toContain('DELETE /api/v1/drive/choices/farine')
  await page.getByRole('dialog').getByRole('button', { name: 'Oublier' }).click()

  await expect(page).toHaveURL(/\/drive\/produits$/)
  await expect(page.getByRole('link', { name: /Farine/ })).toHaveCount(0)
  expect(back.received).toContain('DELETE /api/v1/drive/choices/farine')
})

test('le drive coupé : pas d’entrée dans le compte, message sur l’écran', async ({ page }) => {
  await fakeDriveBack(page, { enabled: false })
  await page.goto('/moi')
  await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mes produits du drive/ })).toHaveCount(0)

  await page.goto('/drive/produits')
  await expect(
    page.getByText('L’envoi au drive n’est pas disponible pour le moment.'),
  ).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`les écrans « Mes produits » sont accessibles, sans défilement horizontal, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeDriveBack(page)
    await page.emulateMedia({ colorScheme })

    await page.goto('/moi')
    await expect(page.getByRole('link', { name: /Mes produits du drive/ })).toBeVisible()
    expect((await scan(page)).violations).toEqual([])

    await page.goto('/drive/produits')
    await expect(page.getByRole('link', { name: /Farine/ })).toBeVisible()
    expect((await scan(page)).violations).toEqual([])

    await page.getByRole('link', { name: /Farine/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Produits refusés' })).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Oublier cet ingrédient' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
  })
}

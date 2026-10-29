// « Mes produits » (DRV-410), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`).
// Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour les tests étiquetés (playwright.config.ts) : parcours du compte à l'enregistrement d'un nouvel ordre, accessibilité en clair et en sombre.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, BUREAU } from './support/test'

import { cheddar, cheddarChoice, farineA, farineB, fakeDriveBack } from './support/driveBack'

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
  await expect(page.getByText('J’en ai toujours')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill('oeuf')
  await expect(page.getByRole('link', { name: /Farine/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Œufs/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill('')
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
  await expect(items.first()).toContainText('Habituel')
  // Le focus suit le produit déplacé
  await expect(items.nth(1).getByRole('button', { name: /Monter/ })).toBeFocused()

  // Refuser le second, accepter de nouveau le produit déjà refusé
  await items
    .nth(1)
    .getByRole('button', { name: /Ne plus proposer/ })
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

  await page.getByRole('button', { name: 'Oublier cet article' }).click()
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
  await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mes produits du drive/ })).toHaveCount(0)

  await page.goto('/drive/produits')
  await expect(
    page.getByText('L’envoi au drive n’est pas disponible pour le moment.'),
  ).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(
    `les écrans « Mes produits » sont accessibles, sans défilement horizontal, thème ${colorScheme}`,
    { tag: BUREAU },
    async ({ page }) => {
      await fakeDriveBack(page)
      await page.emulateMedia({ colorScheme })

      await page.goto('/moi')
      await expect(page.getByRole('link', { name: /Mes produits du drive/ })).toBeVisible()
      expect((await scan(page)).violations).toEqual([])

      await page.goto('/drive/produits')
      await expect(page.getByRole('link', { name: /Farine/ })).toBeVisible()
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('link', { name: /Farine/ }).click()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Produits à ne plus proposer' }),
      ).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)

      await page.getByRole('button', { name: 'Oublier cet article' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
    },
  )
}

test('la contenance d’un produit dans l’unité de la liste s’affiche, et se corrige sur place (DRV-652)', async ({
  page,
}) => {
  const back = await fakeDriveBack(page, { choices: [cheddarChoice] })

  // La liste le dit sous l'article, la fiche aussi
  await page.goto('/drive/produits')
  await expect(page.getByRole('link', { name: /Cheddar en tranche/ })).toContainText(
    'Contenu : 20 tranches',
  )
  await page.getByRole('link', { name: /Cheddar en tranche/ }).click()
  await expect(page.getByText('Contenu : 20 tranches')).toBeVisible()

  // « Corriger » : un champ prérempli, une question, « Enregistrer » inactif tant que rien n'a changé ou que le nombre est faux
  await page.getByRole('button', { name: /Corriger/ }).click()
  const field = page.getByLabel('Combien de tranches y a-t-il dans ce produit ?')
  await expect(field).toHaveValue('20')
  await expect(field).toBeFocused()
  const save = page.locator('[data-testid="pack-size"] form').getByRole('button', {
    name: 'Enregistrer',
  })
  await expect(save).toBeDisabled()
  await field.fill('vingt')
  await expect(page.getByText('Entre un nombre, par exemple 20 ou 12,5.')).toBeVisible()
  await expect(save).toBeDisabled()
  expect((await scan(page)).violations).toEqual([])

  // La virgule française se comprend ; un seul appel part, qui remplace la contenance sans rien changer d'autre
  await field.fill('8,5')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('Contenu enregistré.')).toBeVisible()
  await expect(page.getByText('Contenu : 8,5 tranches')).toBeVisible()
  expect(back.bodies).toEqual([
    {
      retailer: 'leclerc',
      storeId: '123456',
      choices: [
        {
          ingredientSlug: 'cheddar',
          action: 'ADD_PRODUCT',
          placement: 'FALLBACK',
          product: {
            retailerProductId: '500000',
            label: cheddar.label,
            ean: null,
            content: { value: 340, unit: 'g' },
            price: null,
            packSize: { value: 8.5, unitSlug: 'tranche' },
          },
        },
      ],
    },
  ])
  expect(back.received.filter((call) => call.startsWith('PUT /api/v1/drive/choices/'))).toEqual([])
})

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [412, 360]) {
    test(`la contenance d’un produit tient à ${width} px, thème ${colorScheme} (captures)`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 780 })
      await fakeDriveBack(page, { choices: [cheddarChoice] })

      await page.goto('/drive/produits')
      await expect(page.getByText('Contenu : 20 tranches')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`liste-${width}-${colorScheme}.png`) })
      await page.getByRole('link', { name: /Cheddar en tranche/ }).click()
      await page.getByRole('button', { name: /Corriger/ }).click()
      await page.getByLabel('Combien de tranches y a-t-il dans ce produit ?').fill('8,5')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
      expect((await scan(page)).violations).toEqual([])
      await page.screenshot({ path: info.outputPath(`fiche-${width}-${colorScheme}.png`) })
    })
  }
}

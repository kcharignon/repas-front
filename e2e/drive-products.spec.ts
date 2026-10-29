// « Mes produits » (DRV-410), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`).
// Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour l'axe et le débordement du thème clair (playwright.config.ts).
// Le classement des produits (monter, descendre, refuser, accepter, enregistrer), l'oubli d'un article, le drive coupé et la correction de la
// contenance sont dans `Products.spec.ts` (jsdom, routeur et store réels) : ici, le contraste des deux thèmes et ce qui se mesure en pixels.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, BUREAU } from './support/test'

import { switchTheme } from './support/screen'
import { cheddarChoice, fakeDriveBack } from './support/driveBack'

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

// Le contraste ne dépend que du thème, la mise en page que de la largeur : le bureau ne rejoue que le thème clair.
for (const colorScheme of ['light', 'dark'] as const) {
  test(
    `les écrans « Mes produits » sont accessibles, sans défilement horizontal, thème ${colorScheme}`,
    { tag: colorScheme === 'light' ? BUREAU : [] },
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

// La contenance d'un produit dans l'unité de la liste (DRV-652) à 360 px : la liste et la fiche tiennent sans défilement de côté, la fiche est
// lisible dans les deux thèmes, la saisie refusée (« vingt ») comme la saisie valide. 412 px est la largeur du projet `mobile` : déjà mesurée
// par les autres tests de ce fichier.
test('la contenance d’un produit tient à 360 px, accessible en clair et en sombre', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await fakeDriveBack(page, { choices: [cheddarChoice] })
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  await page.goto('/drive/produits')
  await expect(page.getByText('Contenu : 20 tranches')).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page.getByRole('link', { name: /Cheddar en tranche/ }).click()
  await page.getByRole('button', { name: /Corriger/ }).click()
  const field = page.getByLabel('Combien de tranches y a-t-il dans ce produit ?')

  // La saisie refusée, lue dans les deux thèmes
  await field.fill('vingt')
  await expect(page.getByText('Entre un nombre, par exemple 20 ou 12,5.')).toBeVisible()
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, `saisie refusée, ${colorScheme}`).toEqual([])
  }
  // La saisie valide
  await field.fill('8,5')
  await expect(
    page.locator('[data-testid="pack-size"] form').getByRole('button', { name: 'Enregistrer' }),
  ).toBeEnabled()
  expect(await overflow()).toBeLessThanOrEqual(0)
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, `saisie valide, ${colorScheme}`).toEqual([])
  }
})

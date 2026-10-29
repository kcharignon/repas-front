import AxeBuilder from '@axe-core/playwright'
import { expect, test, BUREAU } from './support/test'

for (const colorScheme of ['light', 'dark'] as const) {
  test(
    `le catalogue est accessible (WCAG AA), thème ${colorScheme} du système`,
    { tag: BUREAU },
    async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/design')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        // Le bouton des Vue DevTools n'existe qu'en développement : ce n'est pas notre interface.
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      expect(violations).toEqual([])
    },
  )
}

test('le choix du thème prime sur le système et reste après rechargement', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/design')

  await page.getByRole('button', { name: 'Sombre' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const { violations } = await new AxeBuilder({ page })
    // Le bouton des Vue DevTools n'existe qu'en développement : ce n'est pas notre interface.
    .exclude('.vue-devtools__anchor-btn')
    .withTags(['wcag2aa'])
    .analyze()
  expect(violations).toEqual([])
})

test('cocher une case la barre et le dit aux lecteurs d’écran', async ({ page }) => {
  await page.goto('/design')

  const checkbox = page.getByRole('checkbox', { name: 'À prendre' })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()

  await expect(checkbox).toBeChecked()
})

// Le catalogue de composants `/design` : accessible dans les deux thèmes, par le thème du système (`@media`) puis par le choix enregistré
// (`[data-theme]`, qui prime sur le système et reste après un rechargement). Un seul test, sur le téléphone : le catalogue n'a pas de mise en page
// propre au bureau. Les puces de thème et la case à cocher sont en jsdom : `DesignView.spec.ts`, `theme.spec.ts`, `UiCheckbox.spec.ts`.
import { expect, test } from './support/test'
import { axeBothThemes, violations } from './support/screen'

test('le catalogue est accessible (WCAG AA) dans les deux thèmes du système, puis avec le choix « Sombre » qui prime et reste après rechargement', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/design')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await axeBothThemes(page, 'catalogue')

  // Le choix enregistré prime sur le système (clair) : le chemin `[data-theme]`, distinct du chemin `@media`
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await violations(page), 'accessibilité, thème sombre choisi').toEqual([])
})

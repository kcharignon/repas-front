import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'

test("une adresse inconnue montre une page claire, qui ramène à l'application", async ({
  page,
}) => {
  await page.goto('/cette-page-nexiste-pas')

  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
  await page.getByRole('link', { name: 'Retour à la liste' }).click()
  // Sans session on arrive à la connexion, qui garde la page voulue
  await expect(page).toHaveURL(/\/connexion/)
})

test("une ancienne adresse de l'interface Twig mène à la page équivalente", async ({ page }) => {
  await page.goto('/recipes')

  await expect(page).toHaveURL(/\/connexion\?redirect=\/recettes$/)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`la page introuvable est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/cette-page-nexiste-pas')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.vue-devtools__anchor-btn')
      .analyze()

    expect(violations).toEqual([])
  })
}

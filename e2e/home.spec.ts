import { expect, test } from '@playwright/test'

test("l'accueil s'affiche", async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Repas')
})

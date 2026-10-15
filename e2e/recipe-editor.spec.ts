import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Créer, modifier et supprimer une recette par l'éditeur, contre le VRAI back.
test.describe('éditeur de recette', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  const prefix = 'Recette e2e'
  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
  })

  // Les recettes créées par le test sont supprimées quelle que soit l'issue.
  test.afterEach(async ({ request }) => {
    const types = (
      (await (await request.get('/api/v1/recipe-types', { headers: bearer() })).json()) as {
        member: { slug: string }[]
      }
    ).member
    for (const type of types) {
      const mine = (
        (await (
          await request.get(`/api/v1/recipe-types/${type.slug}/recipes`, { headers: bearer() })
        ).json()) as {
          member: { id: string; name: string }[]
        }
      ).member
      for (const recipe of mine.filter((candidate) => candidate.name.startsWith(prefix))) {
        await request.delete(`/api/v1/recipes/${recipe.id}`, { headers: bearer() })
      }
    }
  })

  test('créer, modifier puis supprimer une recette', async ({ page }) => {
    await signIn(page, '/recettes/nouvelle')
    await page.getByLabel('Nom de la recette').fill(prefix)
    await page.getByLabel('Nombre de personnes').fill('2')

    // Ingrédient : on cherche « sel », on le choisit dans la liste ; l'unité propose celles de l'ingrédient
    await page.getByRole('combobox', { name: 'Ingrédient 1', exact: true }).fill('sel')
    await page.getByRole('option', { name: 'sel', exact: true }).click()
    await page.getByLabel("Quantité de l'ingrédient 1").fill('5')
    await expect(page.getByLabel("Unité de l'ingrédient 1")).not.toHaveValue('')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByRole('heading', { level: 1, name: prefix })).toBeVisible()
    await expect(page.getByText('Pour 2 personnes')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'sel' })).toBeVisible()

    await page.getByRole('link', { name: 'Modifier' }).click()
    await page.getByLabel('Nom de la recette').fill(`${prefix} modifiée`)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `${prefix} modifiée` })).toBeVisible()

    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page).toHaveURL(/\/recettes\?type=/)
    await expect(page.getByRole('link', { name: `${prefix} modifiée` })).toHaveCount(0)
  })

  test('un formulaire incomplet dit quoi corriger', async ({ page }) => {
    await signIn(page, '/recettes/nouvelle')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByText('Donnez un nom à la recette.')).toBeVisible()
    await expect(page.getByText('Choisissez un ingrédient.')).toBeVisible()
    await expect(page).toHaveURL(/\/recettes\/nouvelle$/)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`l'éditeur est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/recettes/nouvelle')
      await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle recette' })).toBeVisible()
      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(page.getByText('Donnez un nom à la recette.')).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

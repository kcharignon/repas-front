import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Parcours des recettes (parcourir, planifier, ouvrir, copier) contre le VRAI back, avec les données de `make fixtures`.
test.describe('recettes', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  const mineOfType = async (request: APIRequestContext, type: string) =>
    (
      (await (
        await request.get(`/api/v1/recipe-types/${type}/recipes`, { headers: bearer() })
      ).json()) as {
        member: { id: string; name: string }[]
      }
    ).member

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    expect(
      (await request.put('/api/v1/shopping-lists/active', { headers: bearer() })).status(),
    ).toBe(204)
  })

  // Le test planifie et copie : on remet l'état de départ, quelle que soit l'issue.
  test.afterEach(async ({ request }) => {
    for (const recipe of await mineOfType(request, 'plat')) {
      await request.delete(`/api/v1/shopping-lists/active/recipes/${recipe.id}`, {
        headers: bearer(),
      })
      if (recipe.name === 'Pâtes carbonara')
        await request.delete(`/api/v1/recipes/${recipe.id}`, { headers: bearer() })
    }
  })

  test('chercher une recette, la planifier dans la liste, la retirer', async ({ page }) => {
    await signIn(page, '/recettes?type=plat')
    await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('omelette')

    await expect(page.getByRole('link', { name: 'Omelette au fromage' })).toBeVisible()
    await page
      .getByRole('button', { name: 'Ajouter Omelette au fromage à la liste de courses' })
      .click()
    await expect(
      page.getByRole('button', { name: 'Retirer Omelette au fromage de la liste de courses' }),
    ).toBeVisible()

    // Le back a bien planifié la recette : elle est dans la liste en cours
    await page.goto('/liste')
    await page.getByRole('tab', { name: /Recettes · 1/ }).click()
    await expect(page.getByText('Omelette au fromage')).toBeVisible()

    await page.goto('/recettes?type=plat')
    await page
      .getByRole('button', { name: 'Retirer Omelette au fromage de la liste de courses' })
      .click()
    await expect(
      page.getByRole('button', { name: 'Ajouter Omelette au fromage à la liste de courses' }),
    ).toBeVisible()
  })

  test('ouvrir une recette montre ses ingrédients', async ({ page }) => {
    await signIn(page, '/recettes?type=plat')
    await page.getByRole('link', { name: 'Omelette au fromage' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Omelette au fromage' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Ingrédients' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: /œuf|oeuf/i })).toBeVisible()
  })

  test("copier la recette d'un autre l'ajoute à ses recettes", async ({ page }) => {
    await signIn(page, '/recettes/autres')
    await page.getByRole('button', { name: 'Copier Pâtes carbonara dans mes recettes' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Pâtes carbonara' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Supprimer' })).toBeVisible()
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`les recettes et le détail sont accessibles, thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/recettes?type=plat')
      await expect(page.getByRole('link', { name: 'Omelette au fromage' })).toBeVisible()
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      expect((await scan()).violations).toEqual([])

      await page.getByRole('link', { name: 'Omelette au fromage' }).click()
      await expect(
        page.getByRole('heading', { level: 1, name: 'Omelette au fromage' }),
      ).toBeVisible()
      expect((await scan()).violations).toEqual([])
    })
  }
})

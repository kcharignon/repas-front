import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'

import { apiToken, hasSession, signIn } from './support/session'

// Gestion des listes (créer, renommer, mettre en pause, reprendre, supprimer) contre le VRAI back.
test.describe('mes listes', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  const name = 'Liste e2e'
  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
  })

  // Le test crée des listes : on supprime celles qu'il a nommées, quelle que soit l'issue.
  test.afterEach(async ({ request }) => {
    const lists = (await (
      await request.get('/api/v1/shopping-lists', { headers: bearer() })
    ).json()) as {
      member: { id: string; displayName: string }[]
    }
    for (const list of lists.member.filter((candidate) => candidate.displayName === name)) {
      await request.delete(`/api/v1/shopping-lists/${list.id}`, { headers: bearer() })
    }
  })

  test('créer, renommer, mettre en pause, reprendre puis supprimer une liste', async ({ page }) => {
    await signIn(page, '/listes')
    await page.getByRole('button', { name: 'Nouvelle liste' }).click()
    await expect(page).toHaveURL(/\/liste$/)

    // Renommer, mettre en pause et supprimer sont rangés dans « ⋮ » (« Plus d'actions »)
    const more = page.getByRole('button', { name: 'Plus d’actions' })
    await more.click()
    await page.getByRole('menuitem', { name: 'Renommer' }).click()
    await page.getByLabel('Nom de la liste').fill(name)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

    await more.click()
    await page.getByRole('menuitem', { name: 'Mettre en pause' }).click()
    await page.goto('/listes')
    await expect(page.getByRole('link', { name: new RegExp(`${name}.*En pause`) })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(name) }).click()
    await page.getByRole('button', { name: 'Reprendre cette liste' }).click()
    await expect(page.getByText('En cours')).toBeVisible()

    await more.click()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page).toHaveURL(/\/listes$/)
    await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`la page des listes et la fenêtre de renommage sont accessibles, thème ${colorScheme}`, async ({
      page,
      request,
    }) => {
      // Une liste active à renommer (le test précédent a pu ne laisser aucune liste en cours)
      expect(
        (await request.put('/api/v1/shopping-lists/active', { headers: bearer() })).status(),
      ).toBe(204)
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/listes')
      await expect(page.getByRole('heading', { level: 1, name: 'Mes listes' })).toBeVisible()
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      expect((await scan()).violations).toEqual([])

      await page.goto('/liste')
      await page.getByRole('button', { name: 'Plus d’actions' }).click()
      await page.getByRole('menuitem', { name: 'Renommer' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect((await scan()).violations).toEqual([])
    })
  }
})

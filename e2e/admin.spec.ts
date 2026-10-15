import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Administration (réservée aux administrateurs) contre le VRAI back. Les unités, rayons et types ne se suppriment pas :
// le test modifie une unité existante puis la remet dans son état de départ, il n'en crée pas.
test.describe('administration', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  let token = ''
  let unit = { slug: '', name: '', symbol: '' }
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    const units = (
      (await (await request.get('/api/v1/units', { headers: bearer() })).json()) as {
        member: (typeof unit)[]
      }
    ).member
    unit = units.find((candidate) => candidate.symbol !== '') ?? units[0] ?? unit
  })

  test.afterEach(async ({ request }) => {
    await request.put(`/api/v1/units/${unit.slug}`, {
      headers: bearer(),
      data: { name: unit.name, symbol: unit.symbol },
    })
  })

  test("l'administrateur ouvre l'administration depuis son compte et modifie une unité", async ({
    page,
  }) => {
    await signIn(page, '/moi')
    await page.getByRole('link', { name: 'Administration' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
    for (const section of ['Unités', 'Rayons', 'Types de recette', 'Conversions', 'Utilisateurs']) {
      await expect(
        page.getByRole('main').getByRole('link', { name: section, exact: true }),
      ).toBeVisible()
    }

    await page.getByRole('main').getByRole('link', { name: 'Unités', exact: true }).click()
    await page.getByRole('button', { name: `Modifier ${unit.name}`, exact: true }).click()
    await page.getByLabel('Symbole').fill('zz')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(
      page.getByRole('listitem').filter({ hasText: unit.name }).getByText('zz'),
    ).toBeVisible()
  })

  test('la liste des utilisateurs montre les comptes de démonstration', async ({ page }) => {
    await signIn(page, '/admin/utilisateurs')

    await expect(page.getByText('admin@repas.fr', { exact: true })).toBeVisible()
    await expect(page.getByText('user@repas.fr', { exact: true })).toBeVisible()
  })

  test("un utilisateur ordinaire n'accède pas à l'administration", async ({ page }) => {
    // Compte de démonstration ordinaire (`make fixtures`)
    await page.goto('/connexion')
    await page.getByLabel('Adresse e-mail').fill(process.env.E2E_USER_EMAIL ?? 'user@repas.fr')
    await page.getByLabel('Mot de passe').fill(process.env.E2E_USER_PASSWORD ?? 'M0t 2 p@sse')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/liste$/)

    await page.goto('/admin/unites')

    await expect(page).toHaveURL(/\/liste$/)
    await page.goto('/moi')
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`l'administration est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/admin')
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
      expect((await scan()).violations).toEqual([])

      await page.goto('/admin/conversions')
      await page.getByRole('button', { name: 'Nouvelle conversion' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect((await scan()).violations).toEqual([])
    })
  }
})

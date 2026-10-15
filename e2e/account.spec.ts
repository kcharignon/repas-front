import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Réglages du compte contre le VRAI back (le changement de mot de passe, qui déconnecte, est couvert par les tests unitaires).
test.describe('mon compte', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  let token = ''
  let initialServing = 4

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    const me = (await (
      await request.get('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as { defaultServing: number }
    initialServing = me.defaultServing
  })

  // Le nombre de personnes revient à sa valeur de départ quelle que soit l'issue.
  test.afterEach(async ({ request }) => {
    await request.put('/api/v1/me/settings', {
      headers: { Authorization: `Bearer ${token}` },
      data: { defaultServing: initialServing, newPassword: null, actualPassword: null },
    })
  })

  test('changer le nombre de personnes par défaut', async ({ page }) => {
    await signIn(page, '/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible()

    await page.getByLabel('Nombre de personnes par défaut').fill(String(initialServing + 1))
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Réglages enregistrés.' }),
    ).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Nombre de personnes par défaut')).toHaveValue(
      String(initialServing + 1),
    )
  })

  test('un mot de passe actuel incorrect est refusé sans déconnecter', async ({
    page,
  }, testInfo) => {
    // Le back plafonne les refus de mot de passe : un seul projet joue ce refus
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'jouer le refus une fois suffit')
    await signIn(page, '/moi')
    await page.getByLabel('Mot de passe actuel').fill('pas-le-bon')
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('un-autre-mdp-123')
    await page.getByLabel('Confirmer le nouveau mot de passe').fill('un-autre-mdp-123')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: 'Le mot de passe actuel est incorrect.' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/moi$/)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`la page du compte est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/moi')
      await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

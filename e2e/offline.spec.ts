import { expect, test } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Lecture hors-ligne de la liste en cours (PWA) : jouée par `make e2e-offline` contre l'IMAGE DE PRODUCTION, où le service
// worker existe, et le vrai back. Le réseau est coupé pour de bon (`context.setOffline`) après une première visite en ligne.
test.describe('liste de courses hors-ligne', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  const ingredients = ['sel', 'aubergine']
  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    expect(
      (await request.put('/api/v1/shopping-lists/active', { headers: bearer() })).status(),
    ).toBe(204)
    for (const slug of ingredients) {
      const response = await request.post(
        `/api/v1/shopping-lists/active/ingredients/${slug}/increase`,
        { headers: bearer() },
      )
      expect(response.status()).toBe(204)
    }
  })

  test.afterEach(async ({ request }) => {
    for (const slug of ingredients) {
      await request.post(`/api/v1/shopping-lists/active/ingredients/${slug}/decrease`, {
        headers: bearer(),
      })
    }
  })

  test('la liste se lit sans réseau, ne se modifie pas, et disparaît avec la session', async ({
    page,
    context,
  }) => {
    await signIn(page, '/liste')
    await expect(page.getByRole('checkbox', { name: /sel/i })).toBeVisible()

    // Le service worker prend la main au rechargement, et la copie de la liste est enregistrée (écriture différée d'une seconde)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload()
    await expect(page.getByRole('checkbox', { name: /sel/i })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('repas.cache') !== null))
      .toBe(true)

    // Réseau coupé : la page se recharge depuis le service worker, la liste vient de la copie
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: 'Hors connexion' })).toBeVisible()
    await expect(page.getByText(/Liste enregistrée le/)).toBeVisible()
    const salt = page.getByRole('checkbox', { name: /sel/i })
    await expect(salt).toBeVisible()

    // Une modification échoue clairement et la case revient à son état
    const before = await salt.getAttribute('aria-checked')
    await salt.click()
    await expect(page.getByRole('alert').filter({ hasText: 'injoignable' })).toBeVisible()
    await expect(salt).toHaveAttribute('aria-checked', before ?? 'false')

    // Retour du réseau : le bandeau disparaît
    await context.setOffline(false)
    await expect(page.getByRole('status').filter({ hasText: 'Hors connexion' })).toBeHidden()

    // Déconnexion : plus rien de la liste dans le navigateur
    await page.getByRole('link', { name: 'Moi' }).first().click()
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/connexion/)
    expect(
      await page.evaluate(() => [
        localStorage.getItem('repas.cache'),
        localStorage.getItem('repas.user'),
      ]),
    ).toEqual([null, null])
  })
})

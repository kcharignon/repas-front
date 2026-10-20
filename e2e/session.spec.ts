import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of [
  '/connexion',
  '/inscription',
  '/verification-email?email=a%40example.com',
  '/confirmation-email',
  '/mot-de-passe-oublie',
  '/mot-de-passe-oublie/confirmation?token=le-secret',
  '/mot-de-passe-oublie/confirmation',
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${path} est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

      expect(violations).toEqual([])
    })
  }
}

test('une page protégée renvoie à la connexion en gardant la destination', async ({ page }) => {
  await page.goto('/moi')

  await expect(page).toHaveURL(/\/connexion\?redirect=(%2F|\/)moi$/)
})

// La suite parle au VRAI back (`make e2e`) avec les identifiants de l'environnement (jamais ceux du dépôt).
const withBack = Boolean(process.env.E2E_WITH_BACK)
const email = process.env.E2E_EMAIL ?? ''
const password = process.env.E2E_PASSWORD ?? ''

test.describe('avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    !withBack || !email || !password,
    'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires',
  )

  test('connexion, session retrouvée au rechargement, déconnexion', async ({ page }) => {
    await page.goto('/moi')
    await expect(page).toHaveURL(/\/connexion/)

    await page.getByLabel('Adresse e-mail').fill(email)
    await page.getByLabel('Mot de passe').fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // Retour à la page demandée avant la connexion
    await expect(page).toHaveURL(/\/moi$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()

    // Le jeton n'est qu'en mémoire : après rechargement, le cookie de rafraîchissement rouvre la session.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
    ).not.toContain('eyJ')

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/connexion/)
    await page.goto('/moi')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('un mauvais mot de passe est expliqué sans rien révéler', async ({ page }, testInfo) => {
    // Le back plafonne les échecs de connexion (5 par 15 minutes) : un seul projet joue ce refus.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'jouer le refus une fois suffit')
    await page.goto('/connexion')

    await page.getByLabel('Adresse e-mail').fill(email)
    await page.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page.getByRole('alert')).toHaveText('Identifiants invalides.')
    await expect(page).toHaveURL(/\/connexion/)
  })
})

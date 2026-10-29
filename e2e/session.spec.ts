// La session de bout en bout. L'accessibilité des neuf pages publiques d'authentification (clair et sombre) est jugée écran par écran dans
// `registration.spec.ts`, `password-reset.spec.ts` et `alexa-link.spec.ts` (`e2e/support/screen.ts`) : `/connexion`, `/inscription`,
// `/verification-email`, `/confirmation-email` (avec et sans secret), `/mot-de-passe-oublie`, `/mot-de-passe-oublie/confirmation`
// (la page est la même avec ou sans `bienvenue=1`, seuls les textes changent) et `/connexion?compte=pret`.
import { expect, test } from './support/test'

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

  test('un mauvais mot de passe est expliqué sans rien révéler', async ({ page }) => {
    // Le back plafonne les échecs de connexion (5 par 15 minutes) : ce refus n’est joué qu’une fois (sur le téléphone).
    await page.goto('/connexion')

    await page.getByLabel('Adresse e-mail').fill(email)
    await page.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page.getByRole('alert')).toHaveText('Identifiants invalides.')
    await expect(page).toHaveURL(/\/connexion/)
  })
})

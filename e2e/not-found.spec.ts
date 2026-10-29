// La page introuvable et les anciennes adresses de l'interface Twig, sans back ni compte. Un seul test, sur le téléphone : la page n'a qu'une colonne,
// son contraste ne dépend pas du viewport. Le titre, le lien de retour et la route publique sont en jsdom : `NotFoundView.spec.ts`, `legacy.spec.ts`.
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'

test("une adresse inconnue montre une page claire, accessible, qui ramène à l'application", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/cette-page-nexiste-pas')

  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
  await axeBothThemes(page, 'page-introuvable')
  await page.getByRole('link', { name: 'Retour à la liste' }).click()
  // Sans session on arrive à la connexion, qui garde la page voulue
  await expect(page).toHaveURL(/\/connexion/)

  // Une ancienne adresse de l'interface Twig mène à la page équivalente (la redirection, puis la garde de session)
  await page.goto('/recipes')
  await expect(page).toHaveURL(/\/connexion\?redirect=\/recettes$/)
})

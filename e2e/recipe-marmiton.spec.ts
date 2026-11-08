// Copier une recette de Marmiton (MAR-004, ADR 0037 du back) : le seul parcours de bout en bout, sans back ni compte (l'API est simulée par
// `page.route`). « Nouvelle recette » ne fait que choisir ; on choisit Marmiton, on colle un lien que Marmiton refuse (la phrase reste sous le
// champ, le lien aussi), on réessaie, et l'on arrive sur SA recette avec « Voir sur Marmiton ». Au téléphone (Pixel 7), les trois écrans dans les
// DEUX thèmes de la même visite (axe WCAG AA, contraste compris). Le texte, les refus et le détail sont dans `MarmitonImport.spec.ts` (jsdom).
// `E2E_SHOTS=<dossier>` garde une capture de chaque écran et de chaque thème.
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'

const LINK = 'https://www.marmiton.org/recettes/recette_the-tarte-au-citron-meringuee_22082.aspx'

test('copier une recette de Marmiton : le choix, un refus, puis sa recette avec le lien d’origine', async ({
  page,
}) => {
  let imports = 0
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      const reply = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

      if (key === 'POST /api/auth/refresh') return reply({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply({
          id: 'u1',
          email: 'moi@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'POST /api/v1/recipes/import/marmiton') {
        expect(request.postDataJSON()).toEqual({ url: LINK })

        return ++imports === 1
          ? reply({ error: { message: 'MARMITON_UNAVAILABLE' } }, 502)
          : route.fulfill({ status: 201, headers: { Location: '/api/v1/recipes/r9' } })
      }
      if (key === 'GET /api/v1/recipes/r9')
        return reply({
          id: 'r9',
          name: 'Tarte au citron meringuée',
          serving: 6,
          typeSlug: 'dessert',
          typeName: 'Dessert',
          version: 1,
          secret: false,
          favorite: false,
          sourceUrl: LINK,
          rows: [],
        })
      if (key === 'GET /api/v1/recipe-types/dessert/recipes')
        return reply({ member: [{ id: 'r9', name: 'Tarte au citron meringuée' }], totalItems: 1 })

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  await page.goto('/recettes/nouvelle')
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle recette' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Écrire ma recette/ })).toBeVisible()
  await axeBothThemes(page, 'marmiton-choix')

  await page.getByRole('link', { name: /Copier depuis Marmiton/ }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Copier depuis Marmiton' }),
  ).toBeVisible()
  await page.getByLabel('Lien de la recette').fill(LINK)
  await page.getByRole('button', { name: 'Copier la recette' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Marmiton ne répond pas pour le moment.')
  await expect(page.getByLabel('Lien de la recette')).toHaveValue(LINK)
  await expect(page.getByRole('button', { name: 'Copier la recette' })).toBeEnabled()
  await axeBothThemes(page, 'marmiton-refus')

  await page.getByRole('button', { name: 'Copier la recette' }).click()

  await expect(page).toHaveURL(/\/recettes\/r9$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tarte au citron meringuée' }),
  ).toBeVisible()
  const origin = page.getByRole('link', { name: 'Voir sur Marmiton' })
  await expect(origin).toHaveAttribute('href', LINK)
  await expect(origin).toHaveAttribute('target', '_blank')
  await expect(origin).toHaveAttribute('rel', 'noopener noreferrer')
  expect((await origin.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await axeBothThemes(page, 'marmiton-fiche')
})

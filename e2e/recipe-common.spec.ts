// La version commune d'une recette Marmiton, corrigée ou supprimée par l'administrateur (MAR-005, ADR 0037 du back) : le seul parcours de bout
// en bout, sans back ni compte (l'API est simulée par `page.route`). « Recettes des autres » (phrase d'aide, « Ma copie »), la fiche, l'éditeur
// (le nom des lignes dont l'ingrédient n'est dans la liste de personne) et le refus d'une suppression (409). Au téléphone (Pixel 7), chaque écran
// dans les DEUX thèmes de la même visite (axe WCAG AA, contraste compris). Le détail est dans `RecipeCommon.spec.ts` (jsdom).
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'

const LINK = 'https://www.marmiton.org/recettes/recette_the-tarte-au-citron-meringuee_22082.aspx'
const row = (slug: string, name: string, quantity: number) => ({
  ingredientSlug: slug,
  ingredientName: name,
  ingredientImage: '',
  quantity,
  unitSlug: 'gramme',
  unitSymbol: 'g',
  unitName: 'Gramme',
  purchaseUnitSlug: 'gramme',
  purchaseUnitName: 'Gramme',
  convertible: true,
  departmentSlug: 'divers',
  departmentName: 'Divers',
})
const common = {
  id: 'c1',
  name: 'Tarte au citron meringuée',
  serving: 6,
  typeSlug: 'dessert',
  typeName: 'Dessert',
  version: 3,
  secret: false,
  favorite: false,
  sourceUrl: LINK,
  originalId: null,
  ownerless: true,
  copyId: 'm1',
  canEdit: true,
  rows: [row('farine-reservee', 'Farine', 250), row('sucre-reserve', 'Sucre semoule', 70)],
}

test('la version commune : « Ma copie », la fiche, l’éditeur et une suppression refusée', async ({
  page,
}) => {
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
          id: 'a1',
          email: 'admin@example.com',
          roles: ['ROLE_USER', 'ROLE_ADMIN'],
          isAdmin: true,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/recipe-types')
        return reply({ member: [{ slug: 'dessert', name: 'Dessert', image: '', order: 1 }] })
      if (key === 'GET /api/v1/recipes/other-people')
        return reply({
          member: [
            {
              id: 'c1',
              name: common.name,
              typeName: 'Dessert',
              typeSlug: 'dessert',
              fromMarmiton: true,
              alreadyCopied: true,
              copyId: 'm1',
            },
          ],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/recipes/c1') return reply(common)
      if (key === 'GET /api/v1/recipes/m1')
        return reply({
          ...common,
          id: 'm1',
          originalId: 'c1',
          ownerless: false,
          copyId: null,
          version: 1,
        })
      if (key === 'GET /api/v1/recipe-types/dessert/recipes')
        return reply({ member: [{ id: 'm1', name: common.name, secret: false }], totalItems: 1 })
      if (key === 'GET /api/v1/ingredients') return reply({ member: [], totalItems: 0 })
      if (key.startsWith('GET /api/v1/ingredients/') && key.endsWith('/units'))
        return reply({ member: [{ slug: 'gramme', name: 'Gramme' }], totalItems: 1 })
      if (key === 'DELETE /api/v1/recipes/c1')
        return reply({ error: { message: 'RECIPE_USED_IN_SHOPPING_LIST' } }, 409)

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  await page.goto('/recettes/autres')
  await expect(page.getByText('Les recettes Marmiton sont communes.')).toBeVisible()
  await expect(page.getByText('Tu as déjà ta copie')).toBeVisible()
  const mine = page.getByRole('button', { name: /Ouvrir ma copie/ })
  expect((await mine.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await axeBothThemes(page, 'commune-liste')

  await page.getByRole('link', { name: /Tarte au citron meringuée/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Version commune' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Modifier' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ta copie' })).toBeVisible()
  const remove = page.getByRole('button', { name: 'Supprimer cette recette' })
  await expect(remove).toBeVisible()
  expect((await remove.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await axeBothThemes(page, 'commune-fiche')

  await remove.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Suppression impossible' })).toBeVisible()
  await axeBothThemes(page, 'commune-impossible')
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).last().click()

  await page.getByRole('link', { name: 'Modifier' }).click()
  await expect(page.getByText('Tu modifies la version commune.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Ingrédient 1', exact: true })).toHaveValue(
    'Farine',
  )
  await expect(page.getByRole('combobox', { name: 'Ingrédient 2', exact: true })).toHaveValue(
    'Sucre semoule',
  )
  await expect(page.getByText('Recette secrète')).toHaveCount(0)
  await axeBothThemes(page, 'commune-editeur')
})

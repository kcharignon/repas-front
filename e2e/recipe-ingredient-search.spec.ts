// Chercher un ingrédient dans l'éditeur de recette, sans back ni compte : l'API est simulée par `page.route`.
// « Boeuf » doit trouver « Bœuf » (la ligature), une faute de frappe est rattrapée, et quand rien ne porte exactement le nom tapé, « Créer »
// est la dernière ligne de la liste (jamais imposée). Un seul test, à 360 px (le pire cas du téléphone) : c'est le navigateur qui prouve que la
// ligne « Créer » se touche, se choisit au clavier et que le focus ne quitte pas le champ. Le détail (classement, exact, rien ne ressemble) est dans
// `RecipeEditorCreateIngredient.spec.ts`.
import { expect, test, type Route } from './support/test'

const ingredients = [
  { slug: 'boeuf', name: 'Bœuf', departmentSlug: 'viande', departmentName: 'Viande' },
  { slug: 'boeuf-hache', name: 'Bœuf haché', departmentSlug: 'viande', departmentName: 'Viande' },
  { slug: 'tomate', name: 'Tomate', departmentSlug: 'legumes', departmentName: 'Légumes' },
]

test('« Boeuf » trouve « Bœuf » et « Créer » est la dernière ligne, au clavier comme au doigt', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  const reply = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === '/api/auth/refresh') return reply(route, { token: 'jeton' })
      if (pathname === '/api/v1/me')
        return reply(route, {
          id: 'u1',
          email: 'alexiane@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (pathname === '/api/v1/ingredients')
        return reply(route, { member: ingredients, totalItems: ingredients.length })
      if (pathname === '/api/v1/departments')
        return reply(route, {
          member: [
            { slug: 'viande', name: 'Viande', image: '', icon: null },
            { slug: 'legumes', name: 'Légumes', image: '', icon: null },
          ],
          totalItems: 2,
        })
      if (pathname === '/api/v1/units')
        return reply(route, {
          member: [
            { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
          ],
          totalItems: 1,
        })
      if (pathname === '/api/v1/recipe-types')
        return reply(route, {
          member: [{ slug: 'plat', name: 'Plat', image: '', order: 1 }],
          totalItems: 1,
        })

      return reply(route, { member: [], totalItems: 0 })
    },
  )
  await page.goto('/recettes/nouvelle/ecrire')

  const field = page.getByRole('combobox', { name: 'Ingrédient 1', exact: true })
  const createRow = page.getByTestId('create-ingredient-option')

  // Le nom exact, ligature comprise : on le trouve, rien à créer
  await field.fill('Boeuf')
  await expect(page.getByRole('option', { name: 'Bœuf', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Bœuf haché' })).toBeVisible()
  await expect(createRow).toHaveCount(0)

  // Une faute de frappe : « Bœuf » est proposé, et « Créer » ferme la liste, sous les propositions
  await field.fill('boeff')
  await expect(page.getByRole('option', { name: 'Bœuf', exact: true })).toBeVisible()
  await expect(createRow).toHaveText('Créer « boeff »')
  const row = await createRow.boundingBox()
  expect(row?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  // Au clavier : les flèches descendent jusqu'à la ligne « Créer », Entrée ouvre la feuille, le champ garde son texte
  await field.press('End')
  for (let i = 0; i < 3; i++) await field.press('ArrowDown')
  await expect(createRow).toHaveAttribute('data-highlighted', '')
  await field.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Nouvel ingrédient' })).toBeVisible()
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Boeff')
})

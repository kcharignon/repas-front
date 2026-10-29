// L'équation d'une conversion, sans back ni compte : l'API est simulée par `page.route`. Deux écrans la portent : « Nouvelle conversion »
// de l'administration et la fiche d'un nouvel ingrédient dont les deux unités diffèrent. Un seul test, au téléphone (Pixel 7) : on écrit
// « 8 tasses = 1 kilo », la phrase se lit en direct, et l'accessibilité (WCAG AA, contraste compris) de la feuille remplie, de son
// erreur (deux unités identiques) et de la fiche se juge dans les DEUX thèmes de la même visite. La phrase, l'inversion, le coefficient
// envoyé et la réouverture d'une conversion enregistrée dans l'un ou l'autre sens sont des tests de composant (`ConversionEquation.spec.ts`,
// `equationMath.spec.ts`, `Admin.spec.ts`, `Ingredients.spec.ts`, `IngredientConversions.spec.ts`).
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page } from './support/test'
import { axeBothThemes } from './support/screen'

const units = [
  { slug: 'cuillere-a-soupe', name: 'cuillère à soupe', symbol: 'c. à s.', dimension: null },
  { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  { slug: 'tasse', name: 'tasse', symbol: 'tasse', dimension: null },
  { slug: 'bouteille', name: 'bouteille', symbol: 'bouteille', dimension: null },
  { slug: 'centilitre', name: 'centilitre', symbol: 'cl', dimension: null },
]

async function fakeBack(page: Page) {
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
          email: 'admin@example.com',
          roles: ['ROLE_USER', 'ROLE_ADMIN'],
          isAdmin: true,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/units') return reply({ member: units, totalItems: units.length })
      if (key === 'GET /api/v1/departments')
        return reply({
          member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'GET /api/v1/conversions')
        return reply({
          member: [
            {
              id: 'c1',
              ingredientSlug: null,
              ingredientName: null,
              startUnitSlug: 'kilo',
              startUnitName: 'kilo',
              endUnitSlug: 'gramme',
              endUnitName: 'gramme',
              coefficient: 1000,
            },
          ],
          totalItems: 1,
        })

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )
}

const phrase = (page: Page) => page.locator('[aria-live="polite"]')

test('l’équation d’une conversion est accessible dans les deux thèmes : la feuille d’administration, son erreur et la fiche d’un ingrédient', async ({
  page,
}) => {
  await fakeBack(page)

  // 1. L'administrateur écrit « 8 tasses = 1 kilo » : la phrase se lit en direct
  await page.goto('/admin/conversions')
  await expect(page.getByText('1 kilo = 1000 gramme')).toBeVisible()
  await page.getByRole('button', { name: 'Nouvelle conversion' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Unité de départ').selectOption('tasse')
  await dialog.getByLabel('Quantité de départ').fill('8')
  await dialog.getByLabel(/Unité d.arrivée/).selectOption('kilo')
  await dialog.getByLabel(/Quantité d.arrivée/).fill('1')
  await expect(phrase(dialog)).toHaveText('1 tasse = 0,125 kilo, et 1 kilo = 8 tasses.')
  await axeBothThemes(page, 'equation-admin')

  // 2. Deux unités identiques : l'erreur se dit tout de suite (sa couleur est jugée dans les deux thèmes)
  await dialog.getByLabel(/Unité d.arrivée/).selectOption('tasse')
  await expect(phrase(dialog)).toHaveText('Choisis deux unités différentes.')
  await axeBothThemes(page, 'equation-admin-erreur')

  // 3. La fiche d'un nouvel ingrédient : « 1 kilo = ? cuillères à soupe », l'équation en ligne (pas en feuille)
  await page.goto('/ingredients/nouveau?rayon=epicerie')
  await page.getByLabel(/Nom de l.ingrédient/).fill('Farine')
  await page.getByLabel('Unité des recettes').selectOption('cuillere-a-soupe')
  await page.getByLabel(/Unité d.achat/).selectOption('kilo')
  await expect(page.getByText('Dans 1 kilo, combien de cuillères à soupe ?')).toBeVisible()
  await expect(page.getByLabel(/Unité d.arrivée/)).toHaveCount(0)
  await expect(page.getByLabel(/Quantité d.arrivée/)).toHaveValue('')
  await page.getByLabel(/Quantité d.arrivée/).fill('100')
  await expect(phrase(page)).toHaveText('Farine : 1 kilo = 100 cuillères à soupe.')
  await axeBothThemes(page, 'equation-ingredient')
})

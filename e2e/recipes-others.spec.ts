// « Recettes des autres », sans back ni compte : l'API est simulée par `page.route`. Sans recherche, la liste est rangée par catégorie
// (une section chacune) ; avec une recherche, une liste simple par pertinence où chaque ligne dit sa catégorie ; sans résultat, une phrase
// courte ; « Copier » reste sur la liste (message, bouton « Copiée »), et le nom d'une recette mène à une fiche qui propose « Copier »
// (jamais « Ajouter » à la liste). Un seul test, au téléphone (360 px) : le parcours catégories -> recherche -> sans résultat -> copier ->
// fiche, et à chaque étape l'accessibilité
// (WCAG AA, contraste compris) dans les DEUX thèmes de la même visite et l'absence de défilement horizontal. Le reste (délai de la frappe,
// une seule requête par pause, effacement, pagination, illustration de saison) est dans `OtherRecipes.spec.ts` et `UiSearchField.spec.ts`.
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page } from './support/test'
import { axeBothThemes } from './support/screen'

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

const entree = { typeName: 'entrée', typeSlug: 'entree' }
const plat = { typeName: 'plat', typeSlug: 'plat' }
const dessert = { typeName: 'dessert', typeSlug: 'dessert' }

const byCategory = [
  { id: 'a1', name: 'Velouté de potimarron', ...entree },
  { id: 'a2', name: 'Salade de chèvre chaud', ...entree },
  { id: 'p1', name: 'Pâtes carbonara', ...plat },
  { id: 'p2', name: 'Ramen au poulet', ...plat },
  { id: 'p3', name: 'Tarte flambée', ...plat },
  { id: 'd1', name: 'Tarte aux pommes', ...dessert },
  { id: 'd2', name: 'Mousse au chocolat', ...dessert },
]
// « tarte » : par pertinence, catégories mélangées
const found = [byCategory[5]!, byCategory[4]!]

async function fakeBack(page: Page) {
  // Comme le vrai back : une recette copiée n'est plus rendue à la relecture
  let copied = false
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname}`
      const reply = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

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
      if (key === 'GET /api/v1/recipes/other-people') {
        const q = url.searchParams.get('q')
        const all = q === null ? byCategory : q === 'zzz' ? [] : found
        const member = copied ? all.filter((recipe) => recipe.id !== 'p1') : all

        return reply({ member, totalItems: member.length })
      }

      if (key === 'POST /api/v1/recipes/p1/copy') {
        copied = true

        return route.fulfill({
          status: 201,
          headers: { Location: '/api/v1/recipes/copie-1' },
        })
      }
      const open = url.pathname.match(/^\/api\/v1\/recipes\/([a-z0-9]+)$/)
      if (request.method() === 'GET' && open !== null) {
        const match = byCategory.find((recipe) => recipe.id === open[1])

        return reply({
          id: open[1],
          name: match?.name,
          serving: 4,
          typeSlug: 'plat',
          typeName: 'Plat',
          version: 1,
          rows: [
            {
              ingredientSlug: 'pate',
              ingredientName: 'Pâtes',
              ingredientImage: '',
              quantity: 200,
              unitSlug: 'gramme',
              unitSymbol: 'g',
              convertible: true,
            },
          ],
        })
      }
      if (key === 'GET /api/v1/recipe-types/plat/recipes')
        return reply({ member: [], totalItems: 0 })

      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Appel non prévu : ${key}` } }),
      })
    },
  )
}

test('la liste par catégorie, la recherche, le sans résultat, la copie et la fiche sont accessibles dans les deux thèmes, sans défilement horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await fakeBack(page)
  await page.goto('/recettes/autres')

  // 1. Sans recherche : une section par catégorie
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Entrée', 'Plat', 'Dessert'])
  await expect(
    page.getByRole('region', { name: 'Plat' }).getByRole('link', { name: 'Tarte flambée' }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-par-categorie')

  // 2. Une recherche : une liste simple, la catégorie sur chaque ligne
  const field = page.getByRole('searchbox', { name: 'Rechercher une recette des autres' })
  await field.fill('tarte')
  const results = page.getByRole('list', { name: 'Résultats de la recherche' })
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(results.getByRole('listitem').first()).toContainText('Tarte aux pommes')
  await expect(results.getByRole('listitem').first()).toContainText('Dessert')
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-recherche')

  // 3. Effacer revient aux sections et rend le focus au champ
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(field).toHaveValue('')
  await expect(field).toBeFocused()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)

  // 4. Sans résultat : une phrase courte, le champ reste
  await field.fill('zzz')
  await expect(page.getByText('Aucune recette ne ressemble à « zzz ».')).toBeVisible()
  await expect(field).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-sans-resultat')

  // 5. Copier reste sur la liste : un message, et le bouton de cette recette dit « Copiée » (grisé)
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await page.getByRole('button', { name: 'Copier Pâtes carbonara dans mes recettes' }).click()
  await expect(page.getByText('« Pâtes carbonara » est dans tes recettes.')).toBeVisible()
  const done = page.getByRole('button', { name: 'Copiée : Pâtes carbonara est dans tes recettes' })
  await expect(done).toBeDisabled()
  await expect(page).toHaveURL(/\/recettes\/autres$/)
  // Elle reste à sa place, même si le back ne la rend plus
  await expect(page.getByRole('region', { name: 'Plat' }).getByRole('link')).toHaveText([
    'Pâtes carbonara',
    'Ramen au poulet',
    'Tarte flambée',
  ])
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-copiee')

  // 6. Le nom mène à la fiche : « Copier » seulement (pas d'ajout à la liste), et un retour vers « Recettes des autres »
  await page.getByRole('link', { name: 'Ramen au poulet' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ramen au poulet' })).toBeVisible()
  const copy = page.getByRole('button', { name: 'Copier Ramen au poulet dans mes recettes' })
  await expect(copy).toBeVisible()
  await expect(page.getByRole('button', { name: /à la liste de courses/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Recettes des autres' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-fiche')
})

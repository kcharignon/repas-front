// Images manquantes : un faux back (page.route), des images de type de recette présentes ou introuvables.
// La fiche d'une recette n'affiche aucune image d'ingrédient ; les autres images laissent une icône par défaut, jamais une icône cassée.
// Un test par état des images (présentes, introuvables) : la liste des recettes puis la fiche d'une recette, l'accessibilité (WCAG AA,
// contraste compris) de chacune dans les DEUX thèmes de la même visite. Le chemin nominal d'une image est un test de composant
// (`UiImage.spec.ts`, `Recipes.spec.ts`) ; seul le navigateur déclenche un vrai `error` sur un 404, d'où le test « introuvables ».
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page, type Route } from './support/test'
import { axeBothThemes } from './support/screen'

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#2f7d4f"/></svg>'

async function fakeBack(page: Page, imagesExist: boolean) {
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/images/'),
    (route) =>
      imagesExist
        ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PICTURE })
        : route.fulfill({ status: 404 }),
  )
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const { pathname } = new URL(route.request().url())
      switch (`${route.request().method()} ${pathname}`) {
        case 'POST /api/auth/refresh':
          return json(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return json(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
          })
        case 'GET /api/v1/recipe-types':
          return json(route, {
            member: [
              { slug: 'entree', name: 'Entrée', image: 'images/type/entree.svg', order: 1 },
              { slug: 'plat', name: 'Plat', image: 'images/type/plat.svg', order: 2 },
            ],
            totalItems: 2,
          })
        case 'GET /api/v1/recipe-types/entree/recipes':
        case 'GET /api/v1/recipe-types/plat/recipes':
          return json(route, {
            member: [{ id: 'r1', name: 'Gratin de courgettes' }],
            totalItems: 1,
          })
        case 'GET /api/v1/shopping-lists/active/summary':
          return json(route, {
            shoppingListId: null,
            quantityByIngredientSlug: {},
            plannedRecipeIds: [],
          })
        case 'GET /api/v1/recipes/r1':
          return json(route, {
            id: 'r1',
            name: 'Gratin de courgettes',
            serving: 4,
            typeSlug: 'plat',
            typeName: 'Plat',
            version: 2,
            rows: [
              {
                ingredientSlug: 'courgette',
                ingredientName: 'courgette',
                ingredientImage: 'images/ingredient/courgette.svg',
                quantity: 600,
                unitSlug: 'gramme',
                unitSymbol: 'g',
              },
              {
                ingredientSlug: 'lait',
                ingredientName: 'lait',
                ingredientImage: 'images/ingredient/lait.svg',
                quantity: 0.5,
                unitSlug: 'litre',
                unitSymbol: 'l',
              },
            ],
          })
        default:
          return route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: '{"error":{"message":"inconnu"}}',
          })
      }
    },
  )
}

for (const { imagesExist, state, label, images, fallbacks } of [
  { imagesExist: true, state: 'présentes', label: 'ok', images: 2, fallbacks: 0 },
  { imagesExist: false, state: 'introuvables', label: '404', images: 0, fallbacks: 2 },
]) {
  test(`la liste des recettes et la fiche d'une recette sont accessibles dans les deux thèmes (images ${state})`, async ({
    page,
  }) => {
    await fakeBack(page, imagesExist)

    // La liste : l'image de chaque type, ou l'icône par défaut quand elle est introuvable
    await page.goto('/recettes')
    await expect(page.getByText('Gratin de courgettes')).toBeVisible()
    const tiles = page.getByRole('group').getByRole('button')
    await expect(tiles).toHaveCount(2)
    // Aucune image cassée : soit l'image est chargée, soit l'icône par défaut a pris sa place
    await expect(page.locator('[role="group"] img')).toHaveCount(images)
    await expect(page.getByTestId('image-fallback')).toHaveCount(fallbacks)
    await axeBothThemes(page, `recettes-${label}`)

    // La fiche : aucune image d'ingrédient, présente ou non
    await page.goto('/recettes/r1')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Gratin de courgettes' }),
    ).toBeVisible()
    await expect(page.getByText('courgette', { exact: true })).toBeVisible()
    await expect(page.locator('li img')).toHaveCount(0)
    await expect(page.locator('li svg')).toHaveCount(0)
    await axeBothThemes(page, `fiche-${label}`)
  })
}

test('le catalogue montre une image présente, introuvable et sans chemin', async ({ page }) => {
  await page.goto('/design')

  await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible()
  await expect(page.getByTestId('image-fallback')).toHaveCount(2)
})

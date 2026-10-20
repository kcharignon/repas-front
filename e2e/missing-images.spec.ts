// Images manquantes : un faux back (page.route), des images de type de recette présentes ou introuvables.
// La fiche d'une recette n'affiche aucune image d'ingrédient ; les autres images laissent une icône par défaut, jamais une icône cassée.
// SHOTS=<dossier> garde une capture de chaque cas.
import process from 'node:process'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

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

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
}

for (const imagesExist of [true, false]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    const label = `${imagesExist ? 'images présentes' : 'images introuvables'}, ${colorScheme}`

    test(`la fiche d'une recette n'affiche aucune image d'ingrédient (${label})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await fakeBack(page, imagesExist)
      await page.goto('/recettes/r1')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Gratin de courgettes' }),
      ).toBeVisible()

      await expect(page.getByText('courgette', { exact: true })).toBeVisible()
      await expect(page.locator('li img')).toHaveCount(0)
      await expect(page.locator('li svg')).toHaveCount(0)
      await shot(page, `fiche-${imagesExist ? 'ok' : '404'}-${colorScheme}`)
      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(violations).toEqual([])
    })

    test(`la liste des recettes remplace l'image d'un type introuvable par une icône (${label})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await fakeBack(page, imagesExist)
      await page.goto('/recettes')
      await expect(page.getByText('Gratin de courgettes')).toBeVisible()

      const tiles = page.getByRole('group').getByRole('button')
      await expect(tiles).toHaveCount(2)
      // Aucune image cassée : soit l'image est chargée, soit l'icône par défaut a pris sa place
      await expect(page.locator('[role="group"] img')).toHaveCount(imagesExist ? 2 : 0)
      await expect(page.getByTestId('image-fallback')).toHaveCount(imagesExist ? 0 : 2)
      await shot(page, `recettes-${imagesExist ? 'ok' : '404'}-${colorScheme}`)
      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(violations).toEqual([])
    })
  }
}

test('le catalogue montre une image présente, introuvable et sans chemin', async ({ page }) => {
  await page.goto('/design')

  await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible()
  await expect(page.getByTestId('image-fallback')).toHaveCount(2)
  await page.getByRole('heading', { name: 'Images' }).scrollIntoViewIfNeeded()
  await shot(page, 'catalogue')
})

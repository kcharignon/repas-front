// Découper un ingrédient en parties (SUB-007), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit le découpage.
// Un seul test, au téléphone (Pixel 7), le flux qui compte : on ouvre la fiche de l'œuf, on ajoute « Jaune d'œuf » comme partie, puis on voit
// la ligne « Œuf 5 » de la liste avec ce qu'elle comprend. Ce que jsdom ne voit pas se juge ici : l'accessibilité (WCAG AA, contraste
// compris) de chaque écran dans les DEUX thèmes de la même visite, les zones tactiles de 44 px, rien qui déborde à 360 px. Les phrases,
// les refus du back, le nombre, « Nouvelle partie » et la fiche d'une partie sont des tests de composant (`IngredientParts.spec.ts`).
// `E2E_SHOTS=<dossier>` garde une capture de chaque écran et de chaque thème.
import { expect, test, type Locator, type Page, type Route } from './support/test'
import { axeBothThemes } from './support/screen'

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

const egg = (parts: unknown[], overrides: Record<string, unknown> = {}) => ({
  slug: 'oeuf',
  name: 'Œuf',
  image: '',
  departmentSlug: 'cremerie',
  departmentName: 'Crémerie',
  cookingUnitSlug: 'unite',
  cookingUnitName: 'unité',
  purchaseUnitSlug: 'unite',
  purchaseUnitName: 'unité',
  purchaseUnitSymbol: '',
  hasSameUnit: true,
  coefficient: null,
  creatorId: 'u1',
  canEdit: true,
  isBase: false,
  canSetBase: false,
  recipeCount: 0,
  listCount: 0,
  parts,
  partOf: null,
  ...overrides,
})

/** Un faux back : l'œuf commence sans partie, `PUT /ingredients/jaune/parent` en fait une, et la liste dit alors ce qu'elle comprend. */
async function fakeBack(page: Page) {
  let linked = false
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
          })
        case 'GET /api/v1/departments':
          return reply(route, {
            member: [{ slug: 'cremerie', name: 'Crémerie', image: '' }],
            totalItems: 1,
          })
        case 'GET /api/v1/units':
          return reply(route, {
            member: [{ slug: 'unite', name: 'unité', symbol: '', dimension: null }],
            totalItems: 1,
          })
        case 'GET /api/v1/ingredients':
          return reply(route, {
            member: [
              {
                slug: 'oeuf',
                name: 'Œuf',
                departmentSlug: 'cremerie',
                departmentName: 'Crémerie',
                partOfSlug: null,
                partOfName: null,
              },
              {
                slug: 'jaune',
                name: "Jaune d'œuf",
                departmentSlug: 'cremerie',
                departmentName: 'Crémerie',
                partOfSlug: linked ? 'oeuf' : null,
                partOfName: linked ? 'Œuf' : null,
              },
              {
                slug: 'beurre',
                name: 'Beurre',
                departmentSlug: 'cremerie',
                departmentName: 'Crémerie',
                partOfSlug: null,
                partOfName: null,
              },
            ],
            totalItems: 3,
          })
        case 'GET /api/v1/ingredients/oeuf':
          return reply(
            route,
            egg(
              linked ? [{ slug: 'jaune', name: "Jaune d'œuf", ratio: 1, unitName: 'unité' }] : [],
            ),
          )
        case 'GET /api/v1/ingredients/jaune':
          return reply(
            route,
            egg([], {
              slug: 'jaune',
              name: "Jaune d'œuf",
              partOf: linked ? { slug: 'oeuf', name: 'Œuf', ratio: 1 } : null,
            }),
          )
        case 'GET /api/v1/ingredients/oeuf/conversions':
        case 'GET /api/v1/ingredients/jaune/conversions':
          return reply(route, {
            member: [],
            common: [],
            totalItems: 0,
            convertible: true,
            cookingUnitSlug: 'unite',
            purchaseUnitSlug: 'unite',
          })
        case 'PUT /api/v1/ingredients/jaune/parent':
          linked = true
          return reply(route)
        case 'GET /api/v1/shopping-lists/active/summary':
          return reply(route, {
            shoppingListId: 'l1',
            quantityByIngredientSlug: {},
            plannedRecipeIds: [],
          })
        case 'GET /api/v1/shopping-lists/l1':
          return reply(route, {
            id: 'l1',
            name: 'Courses du week-end',
            displayName: 'Courses du week-end',
            dateLabel: '14 octobre 2026',
            createdAt: '2026-10-14T10:00:00+02:00',
            status: 'ACTIVE',
            version: 3,
            isActive: true,
            isPaused: false,
            isCompleted: false,
            isSent: false,
            rowCount: 2,
            recipeCount: 0,
            departments: [
              {
                slug: 'cremerie',
                name: 'Crémerie',
                image: '',
                rows: [
                  {
                    id: 'r1',
                    ingredientName: 'Œuf',
                    quantity: 5,
                    unitSymbol: '',
                    checked: false,
                    includes: [
                      { name: "Jaune d'œuf", quantity: 2, unitSymbol: '' },
                      { name: "Blanc d'œuf", quantity: 2, unitSymbol: '' },
                    ],
                  },
                  {
                    id: 'r2',
                    ingredientName: 'Beurre',
                    quantity: 250,
                    unitSymbol: 'g',
                    checked: false,
                    includes: [],
                  },
                ],
              },
            ],
            recipeTypes: [],
          })
        default:
          return reply(route, { error: { message: `Appel non prévu : ${key}` } }, 404)
      }
    },
  )
}

/** Une zone tactile d'au moins 44 px dans les deux sens (WCAG 2.5.8 et la règle du dépôt). */
async function expectTouchTarget(target: Locator, name: string) {
  const box = await target.boundingBox()
  expect(box, `${name} : visible`).not.toBeNull()
  expect(box!.height, `${name} : 44 px de haut`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${name} : 44 px de large`).toBeGreaterThanOrEqual(44)
}

/** Rien ne déborde sur le côté à 360 px. */
async function expectNoSideScroll(page: Page, name: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${name} : pas de défilement latéral`).toBeLessThanOrEqual(0)
}

test('découper l’œuf en parties : la fiche, la feuille « Ajouter une partie », puis la ligne « Œuf 5 » de la liste', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await fakeBack(page)

  // 1. La fiche d'un ingrédient entier sans partie : la phrase d'aide et « Ajouter une partie »
  await page.goto('/ingredients/oeuf/modifier')
  const section = page.getByRole('region', { name: 'Ses parties' })
  await expect(section).toBeVisible()
  await expect(section).toContainText('Un œuf, c’est un jaune et un blanc.')
  const add = section.getByRole('button', { name: 'Ajouter une partie' })
  await add.scrollIntoViewIfNeeded()
  await expectTouchTarget(add, 'Ajouter une partie')
  await expectNoSideScroll(page, 'fiche sans partie')
  await axeBothThemes(page, 'parties-fiche-vide')

  // 2. La feuille : on choisit « Jaune d'œuf » (un nombre : 1 par défaut), et c'est tout
  await add.click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une partie' })
  await expect(dialog).toBeVisible()
  await dialog.getByText("Jaune d'œuf", { exact: true }).click()
  await expect(dialog.getByLabel('Combien dans 1 œuf ?')).toHaveValue('1')
  await expectTouchTarget(dialog.locator('label', { hasText: "Jaune d'œuf" }), 'choix')
  await expectTouchTarget(dialog.getByRole('button', { name: 'Ajouter' }), 'Ajouter')
  await expectNoSideScroll(page, 'feuille')
  await axeBothThemes(page, 'parties-feuille')

  // 3. La partie est rangée : sa carte dit « 1 œuf = 1 jaune d'œuf », la croix la détache
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(section.getByText("1 œuf = 1 jaune d'œuf")).toBeVisible()
  const detach = section.getByRole('button', {
    name: "Ne plus faire de « Jaune d'œuf » une partie",
  })
  await expectTouchTarget(detach, 'croix')
  await expectNoSideScroll(page, 'fiche avec une partie')
  await axeBothThemes(page, 'parties-fiche-remplie')

  // 4. La fiche de la partie dit de quoi elle fait partie
  await page.goto('/ingredients/jaune/modifier')
  const banner = page.getByTestId('part-of')
  await expect(banner).toContainText('Partie de : Œuf')
  await expect(banner).toContainText('Ça ne s’achète pas tout seul : ça compte dans tes œufs.')
  await expectNoSideScroll(page, 'fiche d’une partie')
  await axeBothThemes(page, 'parties-fiche-partie')

  // 5. La liste : « Œuf 5 », et dessous ce qu'elle comprend ; rien sous le beurre
  await page.goto('/liste')
  const row = page.getByRole('checkbox', { name: /Œuf/ })
  await expect(row).toBeVisible()
  await expect(page.getByText("Comprend 2 jaunes d'œuf et 2 blancs d'œuf.")).toBeVisible()
  await expect(page.getByTestId('row-includes')).toHaveCount(1)
  await expectNoSideScroll(page, 'liste')
  await axeBothThemes(page, 'parties-liste')
})

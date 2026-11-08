// « Recettes des autres », sans back ni compte : l'API est simulée par `page.route`. L'écran s'ouvre sur des TUILES par catégorie (celles des
// rayons) ; une tuile ouvre la liste de sa catégorie (`?categorie=plat`, une entrée d'historique : le bouton retour ramène aux tuiles) ;
// le champ cherche partout sur l'accueil et dans la catégorie seule une fois ouverte ; sans résultat, une phrase courte ; « Copier » reste
// sur la catégorie (message, bouton « Copiée »), et le nom d'une recette mène à une fiche qui propose « Copier » (jamais « Ajouter » à la
// liste). Un test au téléphone (360 px) : tuiles -> recherche -> sans résultat -> catégorie -> retour -> recherche dans la catégorie ->
// copier -> fiche, et à chaque étape l'accessibilité (WCAG AA, contraste compris) dans les DEUX thèmes de la même visite, l'absence de
// défilement horizontal et les cibles de 44 px ; un test sur le bureau (1280 px, quatre colonnes). Le reste (délai de la frappe, une seule
// requête par pause, effacement, pagination, catégorie inconnue, illustration de saison) est dans `OtherRecipes.spec.ts` et
// `UiSearchField.spec.ts`. `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { BUREAU_SEUL, expect, test, type Page } from './support/test'
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

const recipeTypes = [
  { slug: 'entree', name: 'Entrée', image: '', order: 1 },
  { slug: 'plat', name: 'Plat', image: '', order: 2 },
  { slug: 'dessert', name: 'Dessert', image: '', order: 3 },
]

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
      if (key === 'GET /api/v1/recipe-types') return reply({ member: recipeTypes, totalItems: 3 })
      const visible = () => byCategory.filter((recipe) => !(copied && recipe.id === 'p1'))
      if (key === 'GET /api/v1/recipes/other-people/types') {
        const member = [
          ...new Map(visible().map((recipe) => [recipe.typeSlug, recipe])).values(),
        ].map((first) => ({
          typeSlug: first.typeSlug,
          typeName: first.typeName,
          count: visible().filter((recipe) => recipe.typeSlug === first.typeSlug).length,
        }))

        return reply({ member, totalItems: member.length })
      }
      if (key === 'GET /api/v1/recipes/other-people') {
        const q = url.searchParams.get('q')
        const slug = url.searchParams.get('typeSlug')
        const all =
          q === null
            ? visible()
            : q === 'zzz'
              ? []
              : found.filter((recipe) => visible().includes(recipe))
        const member = all.filter((recipe) => slug === null || recipe.typeSlug === slug)

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

async function expectTileSizes(page: Page) {
  const tiles = page.getByRole('list', { name: 'Types de recette' }).getByRole('link')
  const boxes = await tiles.evaluateAll((links) =>
    links.map((link) => {
      const { width, height } = link.getBoundingClientRect()

      return { width, height }
    }),
  )
  expect(boxes.length).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(128)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
}

test('les tuiles, la recherche, la catégorie, le retour, la copie et la fiche sont accessibles dans les deux thèmes, sans défilement horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await fakeBack(page)
  await page.goto('/recettes/autres')

  // 1. L'accueil : une tuile par catégorie, avec son compte
  const tiles = page.getByRole('list', { name: 'Types de recette' }).getByRole('link')
  await expect(tiles).toHaveText(['Entrée2 recettes', 'Plat3 recettes', 'Dessert2 recettes'])
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  await expectTileSizes(page)
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-tuiles')

  // 2. Une recherche sur l'accueil : une liste simple, toutes catégories, la catégorie sur chaque ligne
  const field = page.getByRole('searchbox', { name: 'Rechercher une recette des autres' })
  await field.fill('tarte')
  const results = page.getByRole('list', { name: 'Résultats de la recherche' })
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(results.getByRole('listitem').first()).toContainText('Tarte aux pommes')
  await expect(results.getByRole('listitem').first()).toContainText('Dessert')
  await expect(tiles).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-recherche')

  // 3. Effacer revient aux tuiles et rend le focus au champ ; la recherche n'a rien ajouté à l'historique
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(field).toHaveValue('')
  await expect(field).toBeFocused()
  await expect(tiles).toHaveCount(3)
  await expect(page).toHaveURL(/\/recettes\/autres$/)

  // 4. Sans résultat : une phrase courte, le champ reste
  await field.fill('zzz')
  await expect(page.getByText('Aucune recette ne ressemble à « zzz ».')).toBeVisible()
  await expect(field).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-sans-resultat')
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()

  // 5. Une tuile ouvre sa catégorie : titre, compte, retour de 44 px, champ qui dit sa portée, cartes sans la catégorie
  await page.getByRole('link', { name: /^Plat/ }).click()
  await expect(page).toHaveURL(/\/recettes\/autres\?categorie=plat$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Plat' })).toBeVisible()
  await expect(page.getByText('3 recettes')).toBeVisible()
  const category = page.getByRole('list', { name: 'Plat' })
  await expect(category.getByRole('link')).toHaveText([
    'Pâtes carbonara',
    'Ramen au poulet',
    'Tarte flambée',
  ])
  const back = page.getByRole('link', { name: 'Recettes des autres' })
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(
    page.getByRole('searchbox', { name: 'Rechercher dans cette catégorie' }),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-categorie')

  // 6. Le bouton retour du téléphone ramène aux tuiles ; le lien « Recettes des autres » fait de même sans empiler d'entrée
  await page.goBack()
  await expect(tiles).toHaveCount(3)
  await expect(page).toHaveURL(/\/recettes\/autres$/)
  await page.getByRole('link', { name: /^Plat/ }).click()
  await page.getByRole('link', { name: 'Recettes des autres' }).click()
  await expect(tiles).toHaveCount(3)
  await expect(page).toHaveURL(/\/recettes\/autres$/)
  // Le lien a fait un retour d’historique : la catégorie est restée devant, en avant, et non empilée derrière
  await page.goForward()
  await expect(page).toHaveURL(/categorie=plat/)

  // 7. Dans la catégorie (retrouvée par « avance »), le champ cherche dans cette catégorie seulement
  const inCategory = page.getByRole('searchbox', { name: 'Rechercher dans cette catégorie' })
  await inCategory.fill('tarte')
  await expect(results.getByRole('link')).toHaveText(['Tarte flambée'])
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-categorie-recherche')
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()

  // 8. Copier reste sur la catégorie : un message, et le bouton de cette recette dit « Copiée » (grisé)
  await page.getByRole('button', { name: 'Copier Pâtes carbonara dans mes recettes' }).click()
  await expect(page.getByText('« Pâtes carbonara » est dans tes recettes.')).toBeVisible()
  const done = page.getByRole('button', { name: 'Copiée : Pâtes carbonara est dans tes recettes' })
  await expect(done).toBeDisabled()
  await expect(page).toHaveURL(/\/recettes\/autres\?categorie=plat$/)
  // Elle reste à sa place, même si le back ne la rend plus
  await expect(category.getByRole('link')).toHaveText([
    'Pâtes carbonara',
    'Ramen au poulet',
    'Tarte flambée',
  ])
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-copiee')

  // 9. Le nom mène à la fiche : « Copier » seulement (pas d'ajout à la liste), et un retour vers « Recettes des autres »
  await page.getByRole('link', { name: 'Ramen au poulet' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ramen au poulet' })).toBeVisible()
  const copy = page.getByRole('button', { name: 'Copier Ramen au poulet dans mes recettes' })
  await expect(copy).toBeVisible()
  await expect(page.getByRole('button', { name: /à la liste de courses/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Recettes des autres' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await axeBothThemes(page, 'autres-fiche')
})

test(
  'sur le bureau : quatre tuiles par rangée, puis la catégorie',
  { tag: BUREAU_SEUL },
  async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await fakeBack(page)
    await page.goto('/recettes/autres')

    const tiles = page.getByRole('list', { name: 'Types de recette' }).getByRole('link')
    await expect(tiles).toHaveCount(3)
    await expectTileSizes(page)
    await expectNoHorizontalScroll(page)
    await axeBothThemes(page, 'autres-tuiles-bureau')

    await page.getByRole('link', { name: /^Dessert/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Dessert' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await axeBothThemes(page, 'autres-categorie-bureau')
  },
)

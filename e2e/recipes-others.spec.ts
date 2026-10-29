// « Recettes des autres », sans back ni compte : l'API est simulée par `page.route`. Sans recherche, la liste est rangée par catégorie
// (une section chacune) ; avec une recherche (le champ attend une pause dans la frappe), une liste simple par pertinence où chaque ligne dit
// sa catégorie ; le bouton d'effacement revient aux sections. Jouée en clair et en sombre, au téléphone (le bureau : largeur 1280 et axe étiqueté), axe sans violation.
// `E2E_SHOTS=<dossier>` garde des captures (360, 390 et 1280 px).
import AxeBuilder from '@axe-core/playwright'
import { expect, IN_SEASON, test, type Page, viewportTag, BUREAU } from './support/test'

const shots = process.env.E2E_SHOTS

async function shot(page: Page, name: string) {
  if (shots === undefined) return
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

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
  const asked: string[] = []
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
        asked.push(url.search)
        const q = url.searchParams.get('q')
        const member = q === null ? byCategory : q === 'zzz' ? [] : found

        return reply({ member, totalItems: member.length })
      }

      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Appel non prévu : ${key}` } }),
      })
    },
  )

  return { asked }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`recettes des autres, thème ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test(
      'la liste est rangée par catégorie, sans violation axe',
      { tag: BUREAU },
      async ({ page }) => {
        await fakeBack(page)
        await page.goto('/recettes/autres')

        await expect(page.getByRole('heading', { level: 2 })).toHaveText([
          'Entrée',
          'Plat',
          'Dessert',
        ])
        await expect(
          page.getByRole('region', { name: 'Plat' }).getByRole('link', { name: 'Tarte flambée' }),
        ).toBeVisible()
        await shot(page, `autres-par-categorie-${colorScheme}`)
        expect((await scan(page)).violations).toEqual([])
      },
    )

    test('une recherche : liste simple, catégorie sur chaque ligne ; effacer revient aux sections', async ({
      page,
    }) => {
      const { asked } = await fakeBack(page)
      await page.goto('/recettes/autres')
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)

      const field = page.getByRole('searchbox', { name: 'Rechercher une recette des autres' })
      await field.pressSequentially('tarte', { delay: 30 })

      const results = page.getByRole('list', { name: 'Résultats de la recherche' })
      await expect(results.getByRole('listitem')).toHaveCount(2)
      await expect(results.getByRole('listitem').first()).toContainText('Tarte aux pommes')
      await expect(results.getByRole('listitem').first()).toContainText('Dessert')
      await expect(results.getByRole('listitem').last()).toContainText('Plat')
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
      // Une seule requête de recherche malgré cinq lettres tapées
      expect(asked.filter((search) => search.includes('q='))).toEqual(['?q=tarte'])
      await shot(page, `autres-recherche-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Effacer la recherche' }).click()
      await expect(field).toHaveValue('')
      await expect(field).toBeFocused()
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)
      await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toHaveCount(0)
    })

    test('sans résultat : une phrase courte et l’illustration, le champ reste', async ({
      page,
    }) => {
      await fakeBack(page)
      await page.goto('/recettes/autres')
      const field = page.getByRole('searchbox', { name: 'Rechercher une recette des autres' })
      await field.fill('zzz')

      await expect(page.getByText('Aucune recette ne ressemble à « zzz ».')).toBeVisible()
      await expect(field).toBeVisible()
      await shot(page, `autres-sans-resultat-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])
    })

    test('champ rempli : le bouton d’effacer est visible', async ({ page }) => {
      await fakeBack(page)
      await page.goto('/recettes/autres')
      await page.getByRole('searchbox').fill('tarte')

      await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toBeVisible()
      await expect(page.getByRole('listitem').first()).toContainText('Dessert')
      await shot(page, `autres-champ-rempli-${colorScheme}`)
    })
  })
}

test.describe('trois largeurs, sans défilement horizontal (captures avec E2E_SHOTS)', () => {
  for (const width of [360, 390, 1280]) {
    test(`${width} px`, { tag: viewportTag({ width }) }, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await fakeBack(page)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        await page.goto('/recettes/autres')
        await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)
        await shot(page, `w${width}-categories-${colorScheme}`)
        await expectNoHorizontalScroll(page)
        await page.getByRole('searchbox').fill('tarte')
        await expect(page.getByRole('listitem')).toHaveCount(2)
        await shot(page, `w${width}-recherche-${colorScheme}`)
        await expectNoHorizontalScroll(page)
        await page.getByRole('searchbox').fill('zzz')
        await expect(page.getByText('Aucune recette ne ressemble')).toBeVisible()
        await shot(page, `w${width}-vide-${colorScheme}`)
      }
    })
  }
})

test.describe('en saison', () => {
  test('sans résultat, l’illustration de recherche vide de la saison est là', async ({ page }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/recettes/autres')
    await page.getByRole('searchbox').fill('zzz')

    await expect(page.getByText('Aucune recette ne ressemble à « zzz ».')).toBeVisible()
    await expect(page.locator('main svg[aria-hidden="true"]').first()).toBeVisible()
    await shot(page, 'autres-sans-resultat-saison')
    expect((await scan(page)).violations).toEqual([])
  })
})

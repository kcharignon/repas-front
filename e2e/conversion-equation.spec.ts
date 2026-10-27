// L'équation d'une conversion, sans back ni compte : l'API est simulée par `page.route`. Deux écrans la portent : « Nouvelle conversion »
// de l'administration et la fiche d'un nouvel ingrédient dont les deux unités diffèrent. On écrit « 8 tasses = 1 kilo », la phrase se lit
// en direct, et le coefficient que le back garde part inchangé. Jouée sur bureau et sur Pixel 7, en clair et en sombre.
// `E2E_SHOTS=<dossier>` garde des captures à lire.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const shots = process.env.E2E_SHOTS

async function shot(page: Page, name: string) {
  if (shots === undefined) return
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

const units = [
  { slug: 'cuillere-a-soupe', name: 'cuillère à soupe', symbol: 'c. à s.', dimension: null },
  { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  { slug: 'tasse', name: 'tasse', symbol: 'tasse', dimension: null },
]

async function fakeBack(page: Page) {
  const posts: { key: string; body: unknown }[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      const reply = (body?: unknown, status = body === undefined ? 204 : 200) =>
        route.fulfill(
          body === undefined
            ? { status }
            : { status, contentType: 'application/json', body: JSON.stringify(body) },
        )

      if (request.method() === 'POST' || request.method() === 'PUT')
        posts.push({ key, body: request.postData() === null ? null : request.postDataJSON() })
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
      if (key === 'GET /api/v1/departments/epicerie/ingredients')
        return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'GET /api/v1/ingredients') return reply({ member: [], totalItems: 0 })
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
      if (key === 'POST /api/v1/conversions')
        return route.fulfill({ status: 201, headers: { Location: '/api/v1/conversions/c2' } })
      if (key === 'POST /api/v1/ingredients')
        return route.fulfill({ status: 201, headers: { Location: '/api/v1/ingredients/farine' } })

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { posts, bodyOf: (key: string) => posts.find((entry) => entry.key === key)?.body }
}

const phrase = (page: Page) => page.locator('[aria-live="polite"]')

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`l'équation d'une conversion, thème ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test("l'administrateur écrit « 8 tasses = 1 kilo » et la phrase se lit en direct", async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/admin/conversions')
      await expect(page.getByText('1 kilo = 1000 gramme')).toBeVisible()

      await page.getByRole('button', { name: 'Nouvelle conversion' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await shot(page, `admin-equation-vide-${colorScheme}`)

      await dialog.getByLabel('Unité de départ').selectOption('tasse')
      await dialog.getByLabel('Quantité de départ').fill('8')
      await dialog.getByLabel(/Unité d.arrivée/).selectOption('kilo')
      await dialog.getByLabel(/Quantité d.arrivée/).fill('1')
      await expect(phrase(dialog)).toHaveText('1 tasse = 0,125 kilo, et 1 kilo = 8 tasses.')
      await shot(page, `admin-equation-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await dialog.getByRole('button', { name: 'Inverser les deux côtés' }).click()
      await expect(phrase(dialog)).toHaveText('1 kilo = 8 tasses, et 1 tasse = 0,125 kilo.')

      await dialog.getByRole('button', { name: 'Inverser les deux côtés' }).click()
      await dialog.getByRole('button', { name: 'Enregistrer' }).click()
      await expect.poll(() => back.bodyOf('POST /api/v1/conversions')).toBeTruthy()
      expect(back.bodyOf('POST /api/v1/conversions')).toEqual({
        startUnitSlug: 'tasse',
        endUnitSlug: 'kilo',
        coefficient: 0.125,
        ingredientSlug: null,
      })
    })

    test('l’administrateur voit l’erreur tout de suite pour deux unités identiques', async ({
      page,
    }) => {
      await fakeBack(page)
      await page.goto('/admin/conversions')
      await page.getByRole('button', { name: 'Nouvelle conversion' }).click()
      const dialog = page.getByRole('dialog')

      await dialog.getByLabel('Unité de départ').selectOption('tasse')
      await dialog.getByLabel(/Unité d.arrivée/).selectOption('tasse')

      await expect(phrase(dialog)).toHaveText('Choisis deux unités différentes.')
      await shot(page, `admin-equation-erreur-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])
    })

    test('la fiche d’un ingrédient propose le gramme et envoie le coefficient du kilo', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/ingredients/nouveau?rayon=epicerie')
      await page.getByLabel(/Nom de l.ingrédient/).fill('Farine')
      await page.getByLabel('Unité des recettes').selectOption('cuillere-a-soupe')
      await page.getByLabel(/Unité d.achat/).selectOption('kilo')

      await expect(page.getByText('Combien ça fait ?')).toBeVisible()
      await expect(page.getByLabel(/Unité d.arrivée/)).toHaveValue('gramme')
      await expect(page.getByLabel('Unité de départ')).toHaveCount(0)
      await page.getByLabel(/Quantité d.arrivée/).fill('10')
      await expect(phrase(page)).toHaveText(
        'Farine : 1 cuillère à soupe = 10 grammes, et 1 gramme = 0,1 cuillère à soupe.',
      )
      await shot(page, `ingredient-equation-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect.poll(() => back.bodyOf('POST /api/v1/ingredients')).toBeTruthy()
      // 1 cuillère = 10 g = 0,01 kilo : 1 kilo = 100 cuillères
      expect(back.bodyOf('POST /api/v1/ingredients')).toMatchObject({
        defaultCookingUnitSlug: 'cuillere-a-soupe',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 100,
      })
    })
  })
}

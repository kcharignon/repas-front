// Les conversions d'un ingrédient, sans back ni compte : l'API est simulée par `page.route`. Deux écrans : la recette dont la farine ne se
// convertit pas en kilo (la ligne le dit, l'auteur règle sans quitter la page) et la fiche de la farine (ses conversions propres : ajouter,
// modifier, retirer). Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour les tests étiquetés (playwright.config.ts), en clair et en sombre, à 390 px de large. `E2E_SHOTS=<dossier>` garde des captures.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './support/test'

const shots = process.env.E2E_SHOTS

test.use({ viewport: { width: 390, height: 844 } })

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
  {
    slug: 'cuillere-a-soupe',
    name: 'cuillère à soupe',
    symbol: 'cuillère à soupe',
    dimension: null,
  },
  { slug: 'tasse', name: 'tasse', symbol: 'tasse', dimension: null },
  { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  { slug: 'pot', name: 'pot', symbol: 'pot', dimension: 'PACKAGE', baseFactor: 1 },
]

const row = (overrides: Record<string, unknown>) => ({
  ingredientSlug: 'veau',
  ingredientName: 'veau (épaule)',
  ingredientImage: '',
  quantity: 800,
  unitSlug: 'gramme',
  unitSymbol: 'g',
  unitName: 'gramme',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
  convertible: true,
  ...overrides,
})

const conversion = (
  id: string,
  start: string,
  startName: string,
  end: string,
  coefficient: number,
) => ({
  id,
  startUnitSlug: start,
  startUnitName: startName,
  endUnitSlug: end,
  endUnitName: end,
  coefficient,
})

async function fakeBack(page: Page) {
  const state = {
    farineFixed: false,
    conversions: [
      conversion('c1', 'cuillere-a-soupe', 'cuillère à soupe', 'gramme', 10),
      conversion('c2', 'tasse', 'tasse', 'gramme', 125),
    ],
  }
  const sent: { key: string; body: unknown }[] = []
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
      if (['POST', 'PUT', 'DELETE'].includes(request.method()))
        sent.push({ key, body: request.postData() === null ? null : request.postDataJSON() })

      if (key === 'POST /api/auth/refresh') return reply({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply({
          id: 'u1',
          email: 'moi@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/units') return reply({ member: units, totalItems: units.length })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'GET /api/v1/recipe-types')
        return reply({
          member: [{ slug: 'plat', name: 'Plat', image: '', order: 1 }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/recipe-types/plat/recipes')
        return reply({ member: [{ id: 'r1', name: 'Blanquette de veau' }], totalItems: 1 })
      if (key === 'GET /api/v1/recipes/r1')
        return reply({
          id: 'r1',
          name: 'Blanquette de veau',
          serving: 4,
          typeSlug: 'plat',
          typeName: 'Plat',
          version: 2,
          rows: [
            row({}),
            row({
              ingredientSlug: 'carotte',
              ingredientName: 'carotte',
              quantity: 4,
              unitSlug: 'tasse',
              unitSymbol: 'tasse',
              unitName: 'tasse',
              purchaseUnitSlug: 'tasse',
              purchaseUnitName: 'tasse',
            }),
            row({
              ingredientSlug: 'farine',
              ingredientName: 'farine',
              quantity: 3,
              unitSlug: 'cuillere-a-soupe',
              unitSymbol: 'cuillère à soupe',
              unitName: 'cuillère à soupe',
              convertible: state.farineFixed,
            }),
            row({ ingredientSlug: 'beurre', ingredientName: 'beurre', quantity: 30 }),
            row({
              ingredientSlug: 'creme',
              ingredientName: 'crème fraîche',
              quantity: 20,
              unitSlug: 'gramme',
              purchaseUnitSlug: 'pot',
              purchaseUnitName: 'pot',
              convertible: false,
            }),
          ],
        })
      if (key === 'POST /api/v1/ingredients/farine/conversions') {
        state.farineFixed = true
        return route.fulfill({
          status: 201,
          headers: { Location: '/api/v1/ingredients/farine/conversions/c9' },
        })
      }

      if (key === 'GET /api/v1/departments')
        return reply({ member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }], totalItems: 1 })
      if (key === 'GET /api/v1/ingredients/farine')
        return reply({
          slug: 'farine',
          name: 'farine',
          image: '',
          departmentSlug: 'epicerie',
          departmentName: 'Épicerie',
          cookingUnitSlug: 'cuillere-a-soupe',
          cookingUnitName: 'cuillère à soupe',
          purchaseUnitSlug: 'kilo',
          purchaseUnitName: 'kilo',
          purchaseUnitSymbol: 'kg',
          hasSameUnit: false,
          coefficient: 100,
          creatorId: 'u1',
          canEdit: true,
        })
      if (key === 'GET /api/v1/ingredients/farine/conversions')
        return reply({
          member: state.conversions,
          common: [conversion('u1', 'kilo', 'kilo', 'gramme', 1000)],
          totalItems: state.conversions.length,
          convertible: true,
          cookingUnitSlug: 'cuillere-a-soupe',
          purchaseUnitSlug: 'kilo',
        })
      if (
        key === 'POST /api/v1/ingredients/farine/conversions' ||
        key === 'PUT /api/v1/ingredients/farine/conversions/c2'
      )
        return reply()
      if (key === 'DELETE /api/v1/ingredients/farine/conversions/c2') {
        state.conversions = state.conversions.filter((item) => item.id !== 'c2')
        return reply()
      }

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent, bodyOf: (key: string) => sent.find((entry) => entry.key === key)?.body }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`conversions d'un ingrédient, thème ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('la recette dit quelle ligne ne se convertit pas et l’auteur la règle sans quitter la page', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/recettes/r1')

      const farine = page.getByRole('listitem').filter({ hasText: 'farine' })
      await expect(farine).toContainText('Je ne sais pas convertir en kilo')
      await expect(page.getByRole('listitem').filter({ hasText: 'crème fraîche' })).toContainText(
        'Je ne sais pas convertir en pot',
      )
      await expect(page.getByRole('listitem').filter({ hasText: 'veau' })).not.toContainText(
        'Je ne sais pas',
      )
      await expect(page.getByRole('button', { name: '2 à régler' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Ajouter Blanquette de veau/ })).toBeDisabled()
      await expect(page.getByText('Règle d’abord les ingrédients signalés.')).toBeVisible()
      await shot(page, `recette-a-regler-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Régler la conversion de farine' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      // « 1 kilo = ? cuillères à soupe » : l'unité d'achat à gauche avec 1, l'unité de la ligne à droite, le focus sur le nombre à dire
      await expect(dialog.getByLabel('Unité de départ')).toHaveValue('kilo')
      await expect(dialog.getByLabel(/Unité d.arrivée/)).toHaveValue('cuillere-a-soupe')
      await expect(dialog).toContainText('Dans 1 kilo, combien de cuillères à soupe ?')
      await expect(dialog.getByLabel(/Quantité d.arrivée/)).toBeFocused()
      await dialog.getByLabel(/Quantité d.arrivée/).fill('100')
      await expect(dialog.locator('[aria-live="polite"]')).toHaveText(
        'Farine : 1 kilo = 100 cuillères à soupe.',
      )
      await shot(page, `recette-regler-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await dialog.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(dialog).toBeHidden()
      await expect(farine).not.toContainText('Je ne sais pas')
      await expect(page.getByRole('button', { name: '1 à régler' })).toBeVisible()
      expect(back.bodyOf('POST /api/v1/ingredients/farine/conversions')).toEqual({
        startUnitSlug: 'kilo',
        endUnitSlug: 'cuillere-a-soupe',
        coefficient: 100,
      })
      await expect(farine).toBeFocused()
    })

    test('la pastille mène à la première ligne à régler', async ({ page }) => {
      await fakeBack(page)
      await page.goto('/recettes/r1')

      await page.getByRole('button', { name: '2 à régler' }).click()

      await expect(
        page.getByRole('button', { name: 'Régler la conversion de farine' }),
      ).toBeFocused()
    })

    test('la fiche de la farine liste ses conversions, en ajoute et en retire', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/ingredients/farine/modifier')

      const section = page.getByRole('region', { name: 'Conversions de farine' })
      await expect(section.getByText('1 cuillère à soupe = 10 g')).toBeVisible()
      await expect(section.getByText('1 tasse = 125 g')).toBeVisible()
      await expect(section.getByText('Pour tout le monde : 1 kg = 1 000 g')).toBeVisible()
      await expect(section.getByText('La recette peut se convertir en kilo.')).toBeVisible()
      await section.scrollIntoViewIfNeeded()
      await shot(page, `fiche-conversions-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await section.getByRole('button', { name: 'Ajouter une conversion' }).click()
      const dialog = page.getByRole('dialog')
      // L'unité d'achat à gauche avec 1, l'unité des recettes à droite : on change l'arrivée pour « 1 kilo = 8 tasses »
      await expect(dialog.getByLabel('Unité de départ')).toHaveValue('kilo')
      await expect(dialog.getByLabel(/Unité d.arrivée/)).toHaveValue('cuillere-a-soupe')
      await dialog.getByLabel(/Unité d.arrivée/).selectOption('tasse')
      await dialog.getByLabel(/Quantité d.arrivée/).fill('8')
      await shot(page, `fiche-ajouter-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])
      await dialog.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(dialog).toBeHidden()
      expect(back.bodyOf('POST /api/v1/ingredients/farine/conversions')).toEqual({
        startUnitSlug: 'kilo',
        endUnitSlug: 'tasse',
        coefficient: 8,
      })

      await section.getByRole('button', { name: 'Supprimer : 1 tasse = 125 g' }).click()
      const confirmation = page.getByRole('dialog')
      await expect(confirmation).toContainText('Supprimer cette conversion ?')
      await shot(page, `fiche-supprimer-${colorScheme}`)
      await confirmation.getByRole('button', { name: 'Supprimer' }).click()
      await expect(section.getByText('1 tasse = 125 g')).toHaveCount(0)
      await expect(section.getByRole('button', { name: 'Ajouter une conversion' })).toBeFocused()
    })
  })
}

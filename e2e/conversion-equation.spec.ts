// L'équation d'une conversion, sans back ni compte : l'API est simulée par `page.route`. Deux écrans la portent : « Nouvelle conversion »
// de l'administration et la fiche d'un nouvel ingrédient dont les deux unités diffèrent. On écrit « 8 tasses = 1 kilo », la phrase se lit
// en direct, et le coefficient que le back garde part inchangé. Jouée sur bureau et sur Pixel 7, en clair et en sombre.
// `E2E_SHOTS=<dossier>` garde des captures à lire.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './support/test'

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
  { slug: 'bouteille', name: 'bouteille', symbol: 'bouteille', dimension: null },
  { slug: 'centilitre', name: 'centilitre', symbol: 'cl', dimension: null },
]

// La conversion de « vin » (une bouteille, des centilitres), telle que le back la garde : dans le sens « 1 bouteille = 30 centilitres » ou à l'envers
type Stored = { start: string; end: string; coefficient: number }

async function fakeBack(page: Page, wineAs: Stored | null = null) {
  let wine: Stored | null = wineAs
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
      if (key === 'GET /api/v1/ingredients/vin')
        return reply({
          slug: 'vin',
          name: 'vin',
          image: '',
          departmentSlug: 'epicerie',
          departmentName: 'Épicerie',
          cookingUnitSlug: 'centilitre',
          cookingUnitName: 'centilitre',
          purchaseUnitSlug: 'bouteille',
          purchaseUnitName: 'bouteille',
          purchaseUnitSymbol: '',
          hasSameUnit: false,
          // Le back ne rend le coefficient que pour « achat vers recettes »
          coefficient: wine?.start === 'bouteille' ? wine.coefficient : null,
          creatorId: 'u1',
          canEdit: true,
        })
      if (key === 'GET /api/v1/ingredients/vin/conversions')
        return reply({
          member:
            wine === null
              ? []
              : [
                  {
                    id: 'c1',
                    startUnitSlug: wine.start,
                    startUnitName: wine.start,
                    endUnitSlug: wine.end,
                    endUnitName: wine.end,
                    coefficient: wine.coefficient,
                  },
                ],
          common: [],
          totalItems: wine === null ? 0 : 1,
          convertible: wine !== null,
          cookingUnitSlug: 'centilitre',
          purchaseUnitSlug: 'bouteille',
        })
      if (key === 'PUT /api/v1/ingredients/vin') return reply()

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return {
    posts,
    bodyOf: (key: string) => posts.find((entry) => entry.key === key)?.body,
    // Ce que le back garde : « 1 bouteille = 30 centilitres » (sens du formulaire) ou « 1 centilitre = 1/30 bouteille »
    keepWine: (value: Stored) => {
      wine = value
    },
  }
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

    test('la fiche d’un ingrédient demande « 1 kilo = ? cuillères à soupe » et envoie ce nombre tel quel', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/ingredients/nouveau?rayon=epicerie')
      await page.getByLabel(/Nom de l.ingrédient/).fill('Farine')
      await page.getByLabel('Unité des recettes').selectOption('cuillere-a-soupe')
      await page.getByLabel(/Unité d.achat/).selectOption('kilo')

      // L'unité d'achat à gauche avec 1, l'unité des recettes à droite : les deux sont écrites, reste le nombre
      await expect(page.getByText('Dans 1 kilo, combien de cuillères à soupe ?')).toBeVisible()
      await expect(page.getByLabel(/Unité d.arrivée/)).toHaveCount(0)
      await expect(page.getByLabel('Unité de départ')).toHaveCount(0)
      await expect(page.getByLabel(/Quantité d.arrivée/)).toHaveValue('')
      await page.getByLabel(/Quantité d.arrivée/).fill('100')
      await expect(phrase(page)).toHaveText('Farine : 1 kilo = 100 cuillères à soupe.')
      await shot(page, `ingredient-equation-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect.poll(() => back.bodyOf('POST /api/v1/ingredients')).toBeTruthy()
      // 1 kilo = 100 cuillères : le nombre de droite est le coefficient du back
      expect(back.bodyOf('POST /api/v1/ingredients')).toMatchObject({
        defaultCookingUnitSlug: 'cuillere-a-soupe',
        defaultPurchaseUnitSlug: 'kilo',
        coefficient: 100,
      })
    })

    for (const [how, stored] of [
      ['dans le sens du formulaire', { start: 'bouteille', end: 'centilitre', coefficient: 30 }],
      ['à l’envers', { start: 'centilitre', end: 'bouteille', coefficient: 1 / 30 }],
    ] as const) {
      test(`« 1 bouteille = 30 centilitres » enregistrée ${how} se rouvre « 1 bouteille = 30 centilitres »`, async ({
        page,
      }) => {
        const back = await fakeBack(page)
        // On l'enregistre par la fiche : 1 bouteille = 30 centilitres
        await page.goto('/ingredients/nouveau?rayon=epicerie')
        await page.getByLabel(/Nom de l.ingrédient/).fill('Vin')
        await page.getByLabel('Unité des recettes').selectOption('centilitre')
        await page.getByLabel(/Unité d.achat/).selectOption('bouteille')
        await page.getByLabel(/Quantité d.arrivée/).fill('30')
        await page.getByRole('button', { name: 'Enregistrer' }).click()
        await expect.poll(() => back.bodyOf('POST /api/v1/ingredients')).toBeTruthy()
        expect(back.bodyOf('POST /api/v1/ingredients')).toMatchObject({ coefficient: 30 })

        // Le back la garde ${how}, puis on revient sur l'ingrédient
        back.keepWine(stored)
        await page.goto('/ingredients/vin/modifier')

        await expect(page.getByLabel(/Quantité d.arrivée/)).toHaveValue('30')
        await expect(page.getByLabel('Quantité de départ')).toHaveValue('1')
        await expect(page.getByText('Dans 1 bouteille, combien de centilitres ?')).toBeVisible()
        // La fiche porte aussi la section « Conversions de vin », qui a sa propre ligne d'état : on lit celle de l'équation
        await expect(phrase(page.getByRole('group', { name: 'La conversion' }))).toHaveText(
          'Vin : 1 bouteille = 30 centilitres.',
        )
        await expect(page.getByText('0,033')).toHaveCount(0)
        await shot(page, `ingredient-rouvert-${colorScheme}`)
        expect((await scan(page)).violations).toEqual([])

        // Rien touché : le back ne reçoit aucun coefficient
        await page.getByRole('button', { name: 'Enregistrer' }).click()
        await expect.poll(() => back.bodyOf('PUT /api/v1/ingredients/vin')).toBeTruthy()
        expect(back.bodyOf('PUT /api/v1/ingredients/vin')).toMatchObject({ coefficient: null })
      })
    }
  })
}

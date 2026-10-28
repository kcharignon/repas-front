// La première lettre d'un nom de recette ou d'ingrédient passe en majuscule dès qu'elle est tapée, et le nom envoyé au back l'a toujours,
// sans back ni compte : l'API est simulée par `page.route`. Le reste du nom reste tel qu'il est tapé ; un champ de recherche n'est pas touché.
// Jouée au téléphone (390 px) et au bureau, en clair et en sombre, axe sans violation. `E2E_SHOTS=<dossier>` garde des captures.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './support/test'

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

const detail = {
  id: 'r1',
  name: 'Pâtes carbonara',
  serving: 4,
  typeSlug: 'plat',
  typeName: 'Plat',
  version: 1,
  canEdit: true,
  rows: [],
}

async function fakeBack(page: Page) {
  const sent: { key: string; body: unknown }[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname}`
      const reply = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (request.method() !== 'GET')
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
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'GET /api/v1/recipe-types')
        return reply({
          member: [{ slug: 'plat', name: 'Plat', image: '', order: 1 }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/ingredients')
        return reply({ member: [{ slug: 'sel', name: 'Sel' }], totalItems: 1 })
      if (key === 'GET /api/v1/ingredients/sel/units')
        return reply({ member: [{ slug: 'gramme', name: 'Gramme' }], totalItems: 1 })
      if (key === 'POST /api/v1/recipes')
        return route.fulfill({ status: 201, headers: { Location: '/api/v1/recipes/r1' } })
      if (key === 'GET /api/v1/recipes/r1') return reply(detail)
      if (key === 'GET /api/v1/departments')
        return reply({
          member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/units')
        return reply({
          member: [{ slug: 'gramme', name: 'Gramme', symbol: 'g' }],
          totalItems: 1,
        })
      if (key === 'POST /api/v1/ingredients')
        return route.fulfill({ status: 201, headers: { Location: '/api/v1/ingredients/oeufs' } })
      if (url.pathname.endsWith('/ingredients') && url.pathname.startsWith('/api/v1/departments/'))
        return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/recipes/other-people')
        return reply({
          member: [
            { id: 'a1', name: 'Velouté de potimarron', typeName: 'entrée', typeSlug: 'entree' },
          ],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/ingredients/to-fix') return reply({ member: [], totalItems: 0 })

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`première lettre en majuscule, thème ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('une recette : le nom tapé en minuscules passe en majuscule, et part ainsi', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/recettes/nouvelle')
      const name = page.getByLabel('Nom de la recette')

      await name.pressSequentially('pâtes carbonara')
      await expect(name).toHaveValue('Pâtes carbonara')
      await shot(page, `recette-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByLabel('Nombre de personnes').fill('4')
      await page.getByRole('combobox', { name: 'Ingrédient 1', exact: true }).fill('sel')
      await page.getByRole('option', { name: 'Sel', exact: true }).click()
      await page.getByLabel("Quantité de l'ingrédient 1").fill('5')
      await expect(page.getByLabel("Unité de l'ingrédient 1")).not.toHaveValue('')
      await page.getByRole('button', { name: 'Enregistrer' }).click()

      await expect(page).toHaveURL(/\/recettes\/r1$/)
      expect(back.sent.find((call) => call.key === 'POST /api/v1/recipes')?.body).toMatchObject({
        name: 'Pâtes carbonara',
      })
    })

    test('un ingrédient : « œufs » devient « Œufs », le curseur reste où il était', async ({
      page,
    }) => {
      const back = await fakeBack(page)
      await page.goto('/ingredients/nouveau?rayon=epicerie')
      const name = page.getByLabel("Nom de l'ingrédient")

      await name.pressSequentially('œufs de caille')
      await expect(name).toHaveValue('Œufs de caille')

      // Une lettre ajoutée au milieu : rien ne saute, et la suite du nom n'est pas touchée
      await name.press('Home')
      await name.press('ArrowRight')
      await name.press('ArrowRight')
      await name.pressSequentially('X')
      await expect(name).toHaveValue('ŒuXfs de caille')
      await name.fill('')
      await name.pressSequentially('éclair')
      await expect(name).toHaveValue('Éclair')
      await shot(page, `ingredient-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(page).toHaveURL(/\/rayons\/epicerie$/)
      expect(back.sent.find((call) => call.key === 'POST /api/v1/ingredients')?.body).toMatchObject(
        { name: 'Éclair' },
      )
    })

    test("coller un nom en minuscules le met en majuscule ; une recherche n'est pas touchée", async ({
      page,
    }) => {
      await fakeBack(page)
      await page.goto('/ingredients/nouveau?rayon=epicerie')
      const name = page.getByLabel("Nom de l'ingrédient")

      await name.fill('de la farine T55')
      await expect(name).toHaveValue('De la farine T55')

      await page.goto('/recettes/autres')
      const search = page.getByRole('searchbox')
      await search.fill('pâtes')
      await expect(search).toHaveValue('pâtes')
    })
  })
}

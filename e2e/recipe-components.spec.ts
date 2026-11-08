// Les recettes utilisées dans une autre recette (COMP-006, ADR 0040 du back) : le seul parcours de bout en bout, sans back ni compte (l'API est
// simulée par `page.route`). Le détail (chaque refus, l'échelle, les pas du nombre de fois, la copie) est dans `RecipeComponents.spec.ts` (jsdom).
// Au téléphone (Pixel 7), chaque écran dans les DEUX thèmes de la même visite (axe WCAG AA, contraste compris) ; le bureau ne change que la
// mise en page de l'éditeur et de la fiche, il a son test.
import type { Page } from '@playwright/test'

import { BUREAU_SEUL, expect, test } from './support/test'
import { axeBothThemes } from './support/screen'

const row = (slug: string, name: string, quantity: number, unit = 'g') => ({
  ingredientSlug: slug,
  ingredientName: name,
  ingredientImage: '',
  quantity,
  unitSlug: 'gramme',
  unitSymbol: unit,
  unitName: 'Gramme',
  purchaseUnitSlug: 'gramme',
  purchaseUnitName: 'Gramme',
  convertible: true,
  departmentSlug: 'epicerie',
  departmentName: 'Épicerie',
})
const pateRows = [row('farine', 'Farine', 250), row('beurre', 'Beurre', 125)]
const base = {
  version: 1,
  secret: false,
  favorite: false,
  canEdit: true,
  ownerless: false,
  copyId: null,
}

/** Un faux back qui retient la recette créée, pour que la fiche la relise avec ses recettes utilisées. */
async function fakeBack(page: Page) {
  const created: { body?: { components?: { recipeId: string; multiplier: number }[] } } = {}
  const sent: unknown[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers,
          body: JSON.stringify(body),
        })
      const pate = {
        ...base,
        id: 'pate',
        name: 'Pâte sablée',
        serving: 6,
        typeSlug: 'plat',
        typeName: 'Plat',
        rows: pateRows,
        components: [],
      }

      if (key === 'POST /api/auth/refresh') return reply({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply({
          id: 'u1',
          email: 'alexiane@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/recipe-types')
        return reply({
          member: [
            { slug: 'plat', name: 'Plat', image: '', order: 1 },
            { slug: 'dessert', name: 'Dessert', image: '', order: 2 },
          ],
          totalItems: 2,
        })
      if (key === 'GET /api/v1/departments') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/ingredients') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/units') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({ shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] })
      if (key === 'GET /api/v1/recipes/usable')
        return reply({
          member: [
            {
              id: 'pate',
              name: 'Pâte sablée',
              serving: 6,
              typeSlug: 'plat',
              typeName: 'Plat',
              secret: false,
            },
            {
              id: 'creme',
              name: 'Crème au citron',
              serving: 4,
              typeSlug: 'dessert',
              typeName: 'Dessert',
              secret: false,
            },
          ],
          totalItems: 2,
          canHaveComponents: true,
        })
      if (key === 'POST /api/v1/recipes') {
        created.body = request.postDataJSON()
        sent.push(created.body)

        return reply(null, 201, { Location: '/api/v1/recipes/tarte' })
      }
      if (key === 'GET /api/v1/recipes/tarte')
        return reply({
          ...base,
          id: 'tarte',
          name: 'Tarte au citron',
          serving: 8,
          typeSlug: 'dessert',
          typeName: 'Dessert',
          rows: [],
          components: (created.body?.components ?? []).map((component) => ({
            recipeId: 'pate',
            name: 'Pâte sablée',
            serving: 6,
            multiplier: component.multiplier,
            secret: false,
            convertible: true,
            rows: pateRows,
          })),
        })
      if (key === 'GET /api/v1/recipe-types/dessert/recipes')
        return reply({
          member: [{ id: 'tarte', name: 'Tarte au citron', secret: false }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/recipe-types/plat/recipes')
        return reply({
          member: [{ id: 'pate', name: 'Pâte sablée', secret: false }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/recipes/tarte/used-in') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/recipes/pate') return reply(pate)
      if (key === 'GET /api/v1/recipes/pate/used-in')
        return reply({
          member: [
            { id: 'quiche', name: 'Quiche lorraine', secret: false },
            { id: 'tarte', name: 'Tarte au citron', secret: false },
          ],
          totalItems: 2,
        })
      if (key === 'DELETE /api/v1/recipes/pate')
        return reply({ error: { message: 'RECIPE_USED_AS_COMPONENT' } }, 409)

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent }
}

test('écrire une recette qui en utilise une, puis la voir dans la fiche', async ({ page }) => {
  const { sent } = await fakeBack(page)

  await page.goto('/recettes/nouvelle/ecrire')
  await expect(page.getByRole('heading', { level: 2, name: 'Recettes utilisées' })).toBeVisible()
  await page.getByLabel('Nom de la recette').fill('Tarte au citron')
  await page.getByLabel('Nombre de personnes').fill('8')
  await axeBothThemes(page, 'composants-editeur-vide')

  // La feuille : les recettes de l'utilisateur, une touche pour en choisir une
  await page.getByRole('button', { name: 'Ajouter une de mes recettes' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choisis une de tes recettes' })
  await expect(sheet.getByRole('button', { name: /Pâte sablée/ })).toBeVisible()
  await axeBothThemes(page, 'composants-feuille')
  await sheet.getByRole('button', { name: /Pâte sablée/ }).click()
  await expect(sheet).toBeHidden()

  // La ligne vide du départ s'en est allée ; « + » passe à 1,5 puis 2 fois, dit en mots
  await expect(page.getByLabel('Ingrédient 1', { exact: true })).toHaveCount(0)
  const plus = page.getByRole('button', { name: 'Plus de fois pour Pâte sablée' })
  expect((await plus.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await plus.click()
  await plus.click()
  await expect(page.getByLabel('Nombre de fois pour Pâte sablée')).toHaveValue('2')
  await expect(page.getByText('Tu prends 2 fois les quantités de Pâte sablée.')).toBeVisible()
  await axeBothThemes(page, 'composants-editeur-rempli')

  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // La fiche : « Avec », la carte ouverte, les quantités mises à l'échelle
  await expect(page.getByRole('heading', { level: 1, name: 'Tarte au citron' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Avec' })).toBeVisible()
  await expect(page.getByText('2 fois · 2 ingrédients')).toBeVisible()
  await expect(page.getByText('500 g')).toBeVisible()
  await expect(page.getByText('250 g')).toBeVisible()
  await axeBothThemes(page, 'composants-fiche')
  expect(sent).toEqual([
    expect.objectContaining({ rows: [], components: [{ recipeId: 'pate', multiplier: 2 }] }),
  ])
})

test(
  'une recette qui sert ailleurs : la note, où elle sert, et la suppression refusée',
  { tag: BUREAU_SEUL },
  async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await fakeBack(page)

    await page.goto('/recettes/pate')
    await expect(
      page.getByText(
        'Cette recette sert dans Quiche lorraine et Tarte au citron. Les listes déjà faites ne changent pas.',
      ),
    ).toBeVisible()
    await axeBothThemes(page, 'composants-sert-dans')

    await page.getByRole('button', { name: 'Voir lesquelles' }).click()
    const sheet = page.getByRole('dialog', { name: 'Cette recette sert dans' })
    await expect(sheet.getByRole('link', { name: 'Quiche lorraine' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Fermer' }).first().click()

    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
    const refused = page.getByRole('dialog', { name: 'Suppression impossible' })
    await expect(refused.getByText('Rien n’a été supprimé.', { exact: false })).toBeVisible()
    await expect(refused.getByRole('link', { name: 'Tarte au citron' })).toBeVisible()
    await axeBothThemes(page, 'composants-suppression')

    // Le bureau : l'éditeur d'une recette qui sert ailleurs dit pourquoi la section n'est pas là
    await refused.getByRole('button', { name: 'Fermer' }).last().click()
    await page.getByRole('link', { name: 'Modifier' }).click()
    await expect(
      page.getByText(
        'Cette recette sert dans Quiche lorraine et Tarte au citron. Elle ne peut pas',
      ),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ajouter une de mes recettes' })).toHaveCount(0)
    await axeBothThemes(page, 'composants-editeur-sert')
  },
)

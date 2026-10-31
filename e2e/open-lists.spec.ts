// Plusieurs listes en cours, une par type de liste (LST-007), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les
// planifications, les terminaisons et les choix de liste d'un produit. Un seul test, à 360 px : les pastilles de l'écran Liste, « Terminer cette
// liste », le message après avoir planifié une recette (et son « Voir »), puis la liste de courses d'un produit, avec à chaque écran la mise en
// page (pas de défilement horizontal, cibles de 44 px) et l'accessibilité (WCAG AA, contraste compris) dans les DEUX thèmes de la même visite.
// Les textes, les refus du back et chaque état sont des tests de composant. `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page } from './support/test'
import { axeBothThemes } from './support/screen'

test.use({ viewport: { width: 360, height: 780 } })

interface FakeList {
  id: string
  displayName: string
  typeId: string | null
  rows: { id: string; name: string; slug: string; checked: boolean }[]
}

const detail = (list: FakeList) => ({
  id: list.id,
  name: list.typeId === null ? null : list.displayName,
  displayName: list.displayName,
  dateLabel: '31 octobre 2026',
  createdAt: '2026-10-31T10:00:00+02:00',
  status: 'ACTIVE',
  version: 2,
  isActive: true,
  isPaused: false,
  isCompleted: false,
  isSent: false,
  rowCount: list.rows.length,
  recipeCount: 0,
  departments: [
    {
      slug: 'viandes',
      name: 'Viandes',
      image: '',
      rows: list.rows.map((row) => ({
        id: row.id,
        ingredientName: row.name,
        ingredientSlug: row.slug,
        quantity: 2,
        unitSlug: 'piece',
        unitSymbol: '',
        checked: row.checked,
        departmentSlug: 'viandes',
        departmentName: 'Viandes',
      })),
    },
  ],
  recipeTypes: [],
})

async function fakeBack(page: Page) {
  const lists: FakeList[] = [
    {
      id: 'l-main',
      displayName: 'Liste du 31 octobre 2026',
      typeId: null,
      rows: [
        { id: 'r1', name: 'Pâtes', slug: 'pates', checked: false },
        { id: 'r2', name: 'Riz', slug: 'riz', checked: true },
      ],
    },
    {
      id: 'l-b',
      displayName: 'Boucherie',
      typeId: 't1',
      rows: [
        { id: 'r3', name: 'Merguez', slug: 'merguez', checked: false },
        { id: 'r4', name: 'Poulet', slug: 'poulet', checked: false },
        { id: 'r5', name: 'Saucisses', slug: 'saucisses', checked: false },
      ],
    },
    {
      id: 'l-m',
      displayName: 'Marché',
      typeId: 't2',
      rows: [{ id: 'r6', name: 'Poireaux', slug: 'poireaux', checked: false }],
    },
  ]
  let destination: { mode: 'DEFAULT' | 'MAIN' | 'TYPE'; typeId: string | null } = {
    mode: 'DEFAULT',
    typeId: null,
  }
  const sent: { key: string; body: unknown }[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const key = `${request.method()} ${path}`
      const reply = (body?: unknown, status = body === undefined ? 204 : 200) =>
        route.fulfill(
          body === undefined
            ? { status }
            : { status, contentType: 'application/json', body: JSON.stringify(body) },
        )
      const body = request.postData() === null ? null : request.postDataJSON()
      if (['POST', 'PUT', 'DELETE'].includes(request.method())) sent.push({ key, body })

      if (key === 'POST /api/auth/refresh') return reply({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply({
          id: 'u1',
          email: 'moi@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/shopping-lists/open')
        return reply({
          member: lists.map((list) => ({
            id: list.id,
            name: list.displayName,
            typeId: list.typeId,
            rowCount: list.rows.length,
            uncheckedCount: list.rows.filter((row) => !row.checked).length,
            version: 2,
          })),
          totalItems: lists.length,
        })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return reply({
          shoppingListId: lists.find((list) => list.typeId === null)?.id ?? null,
          quantityByIngredientSlug: {},
          plannedRecipeIds: [],
        })
      const one = /^GET \/api\/v1\/shopping-lists\/([^/]+)$/.exec(key)
      if (one !== null) {
        const list = lists.find((candidate) => candidate.id === one[1])

        return list === undefined ? reply({ error: { message: 'x' } }, 404) : reply(detail(list))
      }
      const complete = /^POST \/api\/v1\/shopping-lists\/([^/]+)\/complete$/.exec(key)
      if (complete !== null) {
        lists.splice(
          lists.findIndex((list) => list.id === complete[1]),
          1,
        )

        return reply()
      }
      if (key === 'GET /api/v1/shopping-lists/l-b/estimate' || path.includes('/drive/'))
        return reply({ error: { message: 'DRIVE_DISABLED' } }, 404)
      if (key === 'GET /api/v1/recipe-types')
        return reply({
          member: [{ slug: 'plat', name: 'Plat', image: '', recipeCount: 1 }],
          totalItems: 1,
        })
      if (key === 'GET /api/v1/recipes/favorites') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/recipe-types/plat/recipes')
        return reply({
          member: [{ id: 'rec1', name: 'Hachis parmentier', image: '', secret: false }],
          totalItems: 1,
        })
      if (key === 'PUT /api/v1/shopping-lists/active/recipes/rec1')
        return reply({
          lists: [
            { id: 'l-main', name: 'Liste du 31 octobre 2026', typeId: null },
            { id: 'l-b', name: 'Boucherie', typeId: 't1' },
          ],
        })
      if (key === 'GET /api/v1/shopping-list-types')
        return reply({
          member: [
            { id: 't1', name: 'Boucherie', departmentSlugs: ['viandes'], ingredientCount: 0 },
            { id: 't2', name: 'Marché', departmentSlugs: [], ingredientCount: 0 },
          ],
          totalItems: 2,
        })
      if (key === 'GET /api/v1/departments')
        return reply({
          member: [
            { slug: 'viandes', name: 'Viandes', image: '', icon: null, listTypeId: 't1' },
            { slug: 'charcuterie', name: 'Charcuterie', image: '', icon: null, listTypeId: null },
          ],
          totalItems: 2,
        })
      if (key === 'GET /api/v1/units')
        return reply({ member: [{ slug: 'piece', name: 'pièce', symbol: '' }], totalItems: 1 })
      if (key === 'GET /api/v1/ingredients/merguez')
        return reply({
          slug: 'merguez',
          name: 'Merguez',
          image: '',
          departmentSlug: 'charcuterie',
          departmentName: 'Charcuterie',
          cookingUnitSlug: 'piece',
          cookingUnitName: 'pièce',
          purchaseUnitSlug: 'piece',
          purchaseUnitName: 'pièce',
          purchaseUnitSymbol: '',
          hasSameUnit: true,
          coefficient: 1,
          creatorId: 'u1',
          canEdit: true,
          listDestination: {
            mode: destination.mode,
            typeId: destination.typeId,
            typeName: destination.typeId === null ? null : 'Boucherie',
          },
        })
      if (key === 'GET /api/v1/ingredients/merguez/conversions')
        return reply({ member: [], common: [], totalItems: 0, convertible: true })
      if (key === 'PUT /api/v1/ingredients/merguez') return reply()
      if (key === 'PUT /api/v1/ingredients/merguez/list-destination') {
        const chosen = (body as { destination: string }).destination
        destination =
          chosen === 'default'
            ? { mode: 'DEFAULT', typeId: null }
            : chosen === 'main'
              ? { mode: 'MAIN', typeId: null }
              : { mode: 'TYPE', typeId: chosen }

        return reply()
      }
      if (path.startsWith('/api/v1/departments/')) return reply({ member: [], totalItems: 0 })

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent, bodyOf: (key: string) => sent.find((entry) => entry.key === key)?.body }
}

test('on voit ses listes en cours par pastilles, on planifie une recette, on choisit la liste d’un produit, accessible dans les deux thèmes', async ({
  page,
}) => {
  const back = await fakeBack(page)
  const noOverflow = async () =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)

  // 1. Liste : une pastille par liste en cours avec ses articles à cocher
  await page.goto('/liste')
  const pills = page.getByRole('group', { name: 'Tes listes en cours' })
  await expect(pills.getByRole('button')).toHaveCount(3)
  await expect(pills.getByRole('button', { name: /^Principale/ })).toContainText('1')
  await expect(pills.getByRole('button', { name: /^Boucherie/ })).toContainText('3')
  await expect(pills.getByRole('button', { name: /^Marché/ })).toContainText('1')
  await expect(pills.getByRole('button', { name: /^Principale/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  for (const pill of await pills.getByRole('button').all())
    expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await noOverflow()
  await axeBothThemes(page, 'liste-pastilles')

  // 2. Une pastille montre l'autre liste, et le bouton dit laquelle il termine
  await pills.getByRole('button', { name: /^Boucherie/ }).click()
  await expect(page.getByRole('heading', { name: 'Boucherie', level: 1 })).toBeVisible()
  await expect(page.getByText('Merguez')).toBeVisible()
  await expect(page.getByText('Pâtes')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Terminer cette liste' }).first()).toBeVisible()
  await noOverflow()
  await axeBothThemes(page, 'liste-boucherie')

  // 3. Terminer cette liste : les autres ne bougent pas, on retombe sur la principale
  await page.getByRole('button', { name: 'Terminer cette liste' }).first().click()
  await expect(pills.getByRole('button')).toHaveCount(2)
  await expect(
    page.getByRole('heading', { name: 'Liste du 31 octobre 2026', level: 1 }),
  ).toBeVisible()
  expect(
    back.sent.filter((entry) => entry.key.endsWith('/complete')).map((entry) => entry.key),
  ).toEqual(['POST /api/v1/shopping-lists/l-b/complete'])
})

test('un message dit où la recette est allée, « Voir » ouvre la liste', async ({ page }) => {
  await fakeBack(page)

  await page.goto('/recettes')
  await page
    .getByRole('button', { name: 'Ajouter Hachis parmentier à la liste de courses' })
    .click()
  const message = page.getByRole('status').filter({ hasText: 'Ajouté à' })
  await expect(message).toContainText('Ajouté à Boucherie et Liste principale.')
  const see = message.getByRole('button', { name: 'Voir' })
  expect((await see.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await axeBothThemes(page, 'recette-planifiee')

  await see.click()
  await expect(page).toHaveURL(/\/liste\?liste=l-main$/)
  await expect(
    page.getByRole('heading', { name: 'Liste du 31 octobre 2026', level: 1 }),
  ).toBeVisible()
})

test('le produit à part : on choisit la liste de courses de la merguez, puis on enregistre', async ({
  page,
}) => {
  const back = await fakeBack(page)
  const noOverflow = async () =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)

  await page.goto('/ingredients/merguez/modifier')
  const field = page.getByRole('group', { name: 'Liste de courses' })
  await expect(field.getByRole('radio')).toHaveCount(4)
  await expect(field.getByRole('radio', { name: /Comme son rayon/ })).toBeChecked()
  await expect(field).toContainText('Ce produit ira dans la liste principale, comme son rayon.')
  await field.getByText('Boucherie', { exact: true }).click()
  await expect(field.getByRole('radio', { name: 'Boucherie' })).toBeChecked()
  await expect(field).toContainText('Ce produit ira dans Boucherie, quel que soit son rayon.')
  for (const label of await field.locator('label').all())
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await noOverflow()
  await axeBothThemes(page, 'produit-liste-de-courses')

  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/rayons\/charcuterie$/)
  expect(
    back.sent.map((entry) => entry.key).filter((key) => key.startsWith('PUT /api/v1/ingredients')),
  ).toEqual(['PUT /api/v1/ingredients/merguez', 'PUT /api/v1/ingredients/merguez/list-destination'])
  expect(back.bodyOf('PUT /api/v1/ingredients/merguez/list-destination')).toEqual({
    destination: 't1',
  })
})

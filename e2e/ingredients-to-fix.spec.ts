// L'écran « Ingrédients à régler », sans back ni compte : l'API est simulée par `page.route`. La ligne ambre des Rayons le montre quand il y a
// quelque chose à régler, l'écran liste les ingrédients, « Régler » ouvre la feuille « 1 [unité d'achat] = ? [unité des recettes] » et
// l'ingrédient disparaît une fois la conversion enregistrée. Jouée à 390 px, en clair et en sombre. `E2E_SHOTS=<dossier>` garde des captures.
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
  { slug: 'unite', name: 'unité', symbol: '', dimension: 'COUNT', baseFactor: 1 },
  { slug: 'paquet', name: 'paquet', symbol: 'paquet', dimension: 'PACKAGE', baseFactor: 1 },
  {
    slug: 'cuillere-a-soupe',
    name: 'cuillère à soupe',
    symbol: 'cuillère à soupe',
    dimension: null,
  },
  { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
  {
    slug: 'bouteille',
    name: 'bouteille',
    symbol: 'bouteille',
    dimension: 'PACKAGE',
    baseFactor: 1,
  },
  { slug: 'centilitre', name: 'centilitre', symbol: 'cl', dimension: 'VOLUME', baseFactor: 10 },
]

const item = (slug: string, name: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  name,
  departmentName: 'Épicerie',
  cookingUnitSlug: 'unite',
  cookingUnitName: 'unité',
  purchaseUnitSlug: 'paquet',
  purchaseUnitName: 'paquet',
  ...overrides,
})

async function fakeBack(page: Page, initial: ReturnType<typeof item>[]) {
  let pending = [...initial]
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
      if (key === 'GET /api/v1/departments')
        return reply({ member: [{ slug: 'epicerie', name: 'Épicerie', image: '' }], totalItems: 1 })
      if (key === 'GET /api/v1/ingredients/duplicates') return reply({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/ingredients/to-fix')
        return reply({ member: pending, totalItems: pending.length })
      const created = /^POST \/api\/v1\/ingredients\/([^/]+)\/conversions$/.exec(key)
      if (created !== null) {
        pending = pending.filter((candidate) => candidate.slug !== created[1])
        return route.fulfill({ status: 201 })
      }

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent, bodyOf: (key: string) => sent.find((entry) => entry.key === key)?.body }
}

const farine = item('farine', 'farine', {
  cookingUnitSlug: 'cuillere-a-soupe',
  cookingUnitName: 'cuillère à soupe',
  purchaseUnitSlug: 'kilo',
  purchaseUnitName: 'kilo',
})
const vin = item('vin', 'vin', {
  cookingUnitSlug: 'centilitre',
  cookingUnitName: 'centilitre',
  purchaseUnitSlug: 'bouteille',
  purchaseUnitName: 'bouteille',
})
const biscotte = item('biscotte', 'biscotte')

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`ingrédients à régler, thème ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('la ligne des Rayons dit combien il y en a et mène à l’écran', async ({ page }) => {
      await fakeBack(page, [biscotte, farine, vin])
      await page.goto('/rayons')

      const line = page.getByRole('link', { name: '3 ingrédients à régler' })
      await expect(line).toBeVisible()
      await shot(page, `rayons-a-regler-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await line.click()
      await expect(
        page.getByRole('heading', { name: 'Ingrédients à régler', level: 1 }),
      ).toBeVisible()
      await expect(page.getByTestId('to-fix-card')).toHaveCount(3)
    })

    test('la ligne n’existe pas quand tout est réglé', async ({ page }) => {
      await fakeBack(page, [])
      await page.goto('/rayons')

      await expect(page.getByRole('link', { name: 'Épicerie' })).toBeVisible()
      await expect(page.getByRole('link', { name: /à régler/ })).toHaveCount(0)
    })

    test('on règle un ingrédient depuis la liste : il disparaît, le focus revient au titre', async ({
      page,
    }) => {
      const back = await fakeBack(page, [biscotte, farine, vin])
      await page.goto('/ingredients/a-regler')

      await expect(page.getByTestId('to-fix-card')).toHaveCount(3)
      await expect(page.getByText('Recettes : cuillère à soupe · Magasin : kilo')).toBeVisible()
      await shot(page, `a-regler-liste-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await page.getByRole('button', { name: 'Régler la conversion de vin' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      // « 1 bouteille = ? centilitres » : l'unité d'achat à gauche avec 1, le nombre à dire à droite, le focus dessus
      await expect(dialog.getByLabel('Unité de départ')).toHaveValue('bouteille')
      await expect(dialog.getByLabel(/Unité d.arrivée/)).toHaveValue('centilitre')
      await expect(dialog).toContainText('Dans 1 bouteille, combien de centilitres ?')
      await expect(dialog.getByLabel(/Quantité d.arrivée/)).toBeFocused()
      await dialog.getByLabel(/Quantité d.arrivée/).fill('75')
      await shot(page, `a-regler-feuille-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])

      await dialog.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByTestId('to-fix-card')).toHaveCount(2)
      await expect(page.getByTestId('to-fix-card').filter({ hasText: 'vin' })).toHaveCount(0)
      await expect(page.getByText('2 ingrédients à régler')).toBeVisible()
      expect(back.bodyOf('POST /api/v1/ingredients/vin/conversions')).toEqual({
        startUnitSlug: 'bouteille',
        endUnitSlug: 'centilitre',
        coefficient: 75,
      })
      await expect(
        page.getByRole('heading', { name: 'Ingrédients à régler', level: 1 }),
      ).toBeFocused()
    })

    test('« Tout est réglé. » quand la dernière carte disparaît', async ({ page }) => {
      await fakeBack(page, [biscotte])
      await page.goto('/ingredients/a-regler')

      await page.getByRole('button', { name: 'Régler la conversion de biscotte' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel(/Quantité d.arrivée/).fill('12')
      await dialog.getByRole('button', { name: 'Enregistrer' }).click()

      await expect(page.getByText('Tout est réglé.')).toBeVisible()
      await shot(page, `a-regler-vide-${colorScheme}`)
      expect((await scan(page)).violations).toEqual([])
      await expect(page.getByRole('main').getByRole('link', { name: 'Rayons' })).toBeVisible()
    })
  })
}

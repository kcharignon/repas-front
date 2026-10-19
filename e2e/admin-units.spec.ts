// Administration des unités (DRV-409), sans back ni compte : l'API est simulée par `page.route`, avec une unité qui garde ce qu'on y
// enregistre. Jouée sur bureau et sur Pixel 7 : dimension et facteur de base, accessibilité (axe) en thème clair et sombre.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

type Unit = {
  slug: string
  name: string
  symbol: string
  dimension: string | null
  baseFactor: number | null
}

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Un faux back : trois unités, dont `PUT /units/{slug}` retient le corps (et refuse une dimension sans facteur comme le vrai). */
async function fakeBack(page: Page) {
  const units: Unit[] = [
    { slug: 'gramme', name: 'Gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
    { slug: 'tranche', name: 'Tranche', symbol: '', dimension: null, baseFactor: null },
  ]
  const bodies: Record<string, unknown>[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const key = `${request.method()} ${path}`
      switch (true) {
        case key === 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case key === 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER', 'ROLE_ADMIN'],
            isAdmin: true,
            defaultServing: 4,
          })
        case key === 'GET /api/v1/units':
          return reply(route, { member: units, totalItems: units.length })
        case request.method() === 'PUT' && path.startsWith('/api/v1/units/'): {
          const body = request.postDataJSON() as Omit<Unit, 'slug'>
          bodies.push(body)
          if ((body.dimension === null) !== (body.baseFactor === null))
            return reply(route, { error: { message: 'UNIT_MEASURE_INCOMPLETE' } }, 422)
          const unit = units.find((candidate) => candidate.slug === path.split('/').pop())
          if (unit) Object.assign(unit, body)
          return reply(route)
        }
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return bodies
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

test('l’administrateur renseigne la dimension et le facteur d’une unité, l’incohérence est refusée', async ({
  page,
}) => {
  const bodies = await fakeBack(page)
  await page.goto('/admin/unites')
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name })
  await expect(row('Kilo')).toContainText('Poids, × 1000')
  await expect(row('Tranche')).not.toContainText('×')

  // Renseigner : la dimension et le facteur partent ensemble
  await page.getByRole('button', { name: 'Modifier Tranche', exact: true }).click()
  await expect(page.getByText('Sert à calculer combien de produits acheter.')).toBeVisible()
  await page.getByLabel('Ce que l’unité mesure').selectOption('COUNT')
  await page.getByLabel('Facteur de base').fill('1')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(row('Tranche')).toContainText('Nombre de pièces, × 1')
  expect(bodies.at(-1)).toEqual({
    name: 'Tranche',
    symbol: '',
    dimension: 'COUNT',
    baseFactor: 1,
  })

  // Une dimension sans facteur : le back refuse, son code est dit en français
  await page.getByRole('button', { name: 'Modifier Tranche', exact: true }).click()
  await page.getByLabel('Facteur de base').fill('')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'La dimension et le facteur de base vont ensemble',
  )

  // Un facteur nul est refusé avant l'envoi
  const sent = bodies.length
  await page.getByLabel('Facteur de base').fill('0')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Entre un nombre supérieur à zéro, ou laisse vide.')).toBeVisible()
  expect(bodies).toHaveLength(sent)

  // « Aucune » avec un facteur vide efface la paire
  await page.getByLabel('Ce que l’unité mesure').selectOption('')
  await page.getByLabel('Facteur de base').fill('')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(row('Tranche')).not.toContainText('×')
  expect(bodies.at(-1)).toMatchObject({ dimension: null, baseFactor: null })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`la liste et le formulaire des unités sont accessibles, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/admin/unites')
    await expect(page.getByRole('listitem').filter({ hasText: 'Kilo' })).toBeVisible()
    expect((await scan(page)).violations).toEqual([])

    await page.getByRole('button', { name: 'Modifier Kilo', exact: true }).click()
    await expect(page.getByLabel('Facteur de base')).toHaveValue('1000')
    expect((await scan(page)).violations).toEqual([])
  })
}

// Administration des unités (DRV-409), sans back ni compte : l'API est simulée par `page.route`. Un seul test, au téléphone (Pixel 7) :
// l'accessibilité (WCAG AA, contraste compris) de la liste et du formulaire d'une unité dans les DEUX thèmes de la même visite. Le bureau
// n'y change rien (`AdminPage` n'a pas de règle `md:` hors le titre) : le menu latéral du bureau est jugé par `admin-users.spec.ts`.
// Renseigner la dimension et le facteur, le refus de l'incohérence et la liste relue sont des tests de composant (`Admin.spec.ts`, « unités »).
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page, type Route } from './support/test'
import { axeBothThemes } from './support/screen'

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

/** Un faux back : trois unités, lues seulement. */
async function fakeBack(page: Page) {
  const units: Unit[] = [
    { slug: 'gramme', name: 'Gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'Kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
    { slug: 'tranche', name: 'Tranche', symbol: '', dimension: null, baseFactor: null },
  ]
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const key = `${route.request().method()} ${new URL(route.request().url()).pathname}`
      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER', 'ROLE_ADMIN'],
            isAdmin: true,
            defaultServing: 4,
          })
        case 'GET /api/v1/units':
          return reply(route, { member: units, totalItems: units.length })
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )
}

test('la liste et le formulaire des unités sont accessibles dans les deux thèmes', async ({
  page,
}) => {
  await fakeBack(page)
  await page.goto('/admin/unites')
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name })
  await expect(row('Kilo')).toContainText('Poids, × 1000')
  await expect(row('Tranche')).not.toContainText('×')
  await axeBothThemes(page, 'admin-unites')

  await page.getByRole('button', { name: 'Modifier Kilo', exact: true }).click()
  await expect(page.getByLabel('Facteur de base')).toHaveValue('1000')
  await axeBothThemes(page, 'admin-unites-formulaire')
})

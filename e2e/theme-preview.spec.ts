// L'aperçu des thèmes de l'administrateur (ADR 0013) : en mémoire seulement, il ne survit pas à un rechargement. Ni back ni compte :
// l'API est simulée par `page.route` (comme theme-season.spec.ts).
import { expect, IN_NOEL, IN_SEASON, test, type Page } from './support/test'

async function fakeBack(page: Page, isAdmin: boolean) {
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (key === 'POST /api/auth/refresh') return json({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return json({
          id: 'u1',
          email: 'alexiane@example.com',
          roles: isAdmin ? ['ROLE_USER', 'ROLE_ADMIN'] : ['ROLE_USER'],
          isAdmin,
          defaultServing: 4,
        })
      return json({ error: { message: 'inconnu' } }, 404)
    },
  )
}

/** Tout ce que le navigateur garde pour la page : les deux stockages, sans la session ni les copies du compte. */
const stored = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  )

const group = (page: Page) => page.getByRole('group', { name: 'Aperçu des thèmes' })

test.describe('aperçu des thèmes', () => {
  test('un administrateur choisit Noël hors saison, rien n’est retenu, un rechargement revient au thème du moment', async ({
    page,
  }) => {
    await fakeBack(page, true)
    await page.goto('/moi')
    await expect(page.getByRole('heading', { level: 2, name: 'Aperçu des thèmes' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    const before = await stored(page)

    await group(page).getByRole('button', { name: 'Noël' }).click()

    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#7a1530')
    await expect(group(page).getByRole('button', { name: 'Noël' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Ni stockage, ni adresse : rien n'a changé dans le navigateur.
    expect(await stored(page)).toBe(before)
    expect(page.url()).toMatch(/\/moi$/)

    await page.reload()

    await expect(page.getByRole('heading', { level: 2, name: 'Aperçu des thèmes' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(group(page).getByRole('button', { name: 'Thème du moment' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('en pleine saison de Noël, « Sans décor » force le thème de base, puis Halloween passe devant', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_NOEL)
    await fakeBack(page, true)
    await page.goto('/moi')
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')

    await group(page).getByRole('button', { name: 'Sans décor' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)

    await group(page).getByRole('button', { name: 'Halloween' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')

    await group(page).getByRole('button', { name: 'Thème du moment' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
  })

  test('l’aperçu ne remplace pas l’interrupteur du décor et ne le touche pas', async ({ page }) => {
    await page.clock.setSystemTime(IN_SEASON)
    await fakeBack(page, true)
    await page.goto('/moi')
    await page.getByRole('switch', { name: 'Décor d’Halloween' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    const before = await stored(page)

    await group(page).getByRole('button', { name: 'Noël' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    expect(await stored(page)).toBe(before)

    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
  })

  test('un utilisateur qui n’est pas administrateur ne voit pas la section', async ({ page }) => {
    await fakeBack(page, false)
    await page.goto('/moi')

    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByText('Aperçu des thèmes')).toHaveCount(0)
  })
})

// Le thème enregistré s'applique dès l'ouverture, sans passer par « Moi » (ni back ni compte : l'API est simulée par `page.route`).
import { expect, test, type Page } from './support/test'

async function fakeBack(page: Page) {
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
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      return json({ error: { message: 'inconnu' } }, 404)
    },
  )
}

// Deux cas suffisent : la préférence explicite bat le système, et « système » suit le système. Les polarités opposées prennent le même chemin ; la
// valeur de `data-theme` pour chaque préférence (`light`, `dark`, `system`, inconnue, absente) est prouvée en jsdom contre le vrai
// `public/theme-init.js` (`theme.spec.ts`, « au démarrage »).
const cases = [
  { stored: 'light', system: 'dark', attribute: 'light', dark: false },
  { stored: 'system', system: 'dark', attribute: null, dark: true },
] as const

for (const { stored, system, attribute, dark } of cases) {
  test(`préférence « ${stored} », système ${system} : la liste s’ouvre en ${attribute ?? 'thème du système'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system })
    await fakeBack(page)
    await page.addInitScript((stored) => localStorage.setItem('repas.theme', stored), stored)

    await page.goto('/liste')

    await expect(page).toHaveURL(/\/liste$/)
    await expect(page.locator('#app > *').first()).toBeVisible()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(attribute)
    const luminance = await page.evaluate(() => {
      const [r = 0, g = 0, b = 0] = getComputedStyle(document.documentElement)
        .backgroundColor.match(/\d+/g)!
        .map(Number)
      return (r + g + b) / 3
    })
    expect(luminance < 128).toBe(dark)
  })
}

test('le script d’amorçage est chargé avant l’application, depuis la même origine (CSP script-src self)', async ({
  page,
}) => {
  await page.goto('/connexion')

  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((script) => ({
      src: script.getAttribute('src'),
      type: script.getAttribute('type'),
      async: script.hasAttribute('async') || script.hasAttribute('defer'),
    })),
  )
  const init = scripts.findIndex((script) => script.src === '/theme-init.js')
  expect(init).toBe(0)
  expect(scripts[init]).toMatchObject({ type: null, async: false })
  expect(scripts.findIndex((script) => script.type === 'module')).toBeGreaterThan(init)
  expect((await page.request.get('/theme-init.js')).status()).toBe(200)
})

// Les thèmes saisonniers (ADR 0010 à 0016), jour du navigateur, VUS DANS UN VRAI NAVIGATEUR. L'horloge est posée par chaque test
// (`page.clock`) : rien ne dépend du jour où la suite tourne. Ni back ni compte : l'API est simulée par `page.route`.
//
// Ce fichier ne garde que ce que seul un navigateur prouve : le script d'amorçage branché dans `index.html`, la cascade CSS réelle
// (le sombre du système bat le clair, une préférence enregistrée bat le système), le minuteur de minuit, la mise en page à 360 × 640,
// l'accessibilité (contraste WCAG AA) sur le rendu, et le rechargement réel de l'interrupteur du décor. Le reste est plus bas :
//  - les dates de chaque saison (bornes, Pâques 2024-2040), les préférences, le suivi de la date, le script d'amorçage rejoué contre
//    `applySeason` : `src/design/__tests__/season.spec.ts` ;
//  - la phrase et le héros du bandeau de chaque saison : `src/views/__tests__/AuthLayout.spec.ts` ;
//  - les couleurs du bandeau et du fond de chaque saison, clair et sombre, et la barre du navigateur : `src/design/__tests__/seasonTokens.spec.ts` ;
//  - les interrupteurs du décor : `src/features/account/__tests__/Account.spec.ts` ;
//  - le coin, la scène et les pièces : `src/design/season/__tests__/`.
import {
  expect,
  IN_AUTOMNE,
  IN_ETE,
  IN_GALETTE,
  IN_NOEL,
  IN_PAQUES,
  IN_SEASON,
  IN_VALENTIN,
  test,
  type Page,
} from './support/test'
import { axeBothThemes, switchTheme, violations } from './support/screen'

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'
const PITCH_AUTOMNE = 'Tes recettes, tes courses, sans oublier la tarte aux pommes.'
const PITCH_NOEL = 'Tes recettes, tes courses, sans oublier la bûche.'

// Les couleurs du bandeau (jeton --brand) et du fond de la page (jeton --bg) : vert hors saison, violet nuit en saison. Les valeurs de
// chaque saison sont figées par `seasonTokens.spec.ts` ; ici, Halloween sert à prouver que la cascade réelle les applique.
const GREEN = 'rgb(30, 107, 76)'
const PURPLE = 'rgb(67, 32, 107)'
const PURPLE_DARK = 'rgb(45, 24, 80)'
const PURPLE_BG = 'rgb(247, 242, 234)'
const PURPLE_BG_DARK = 'rgb(17, 11, 27)'

const banner = (page: Page) => page.locator('header').first()
const corner = (page: Page) => page.getByTestId('season-corner')
const scene = (page: Page) => page.getByTestId('season-scene')
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

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

/** Le bouton « Se connecter » se voit en entier et rien d'autre que lui n'est au point cliqué : le décor ne reçoit aucun événement. */
async function expectLoginButtonReachable(page: Page, label: string) {
  const button = page.getByRole('button', { name: 'Se connecter' })
  await expect(button, `${label} : le bouton se voit en entier`).toBeInViewport({ ratio: 1 })
  const box = (await button.boundingBox())!
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )
  expect(hit, `${label} : rien ne recouvre le bouton`).toBe('Se connecter')
}

test.describe('écran de connexion', () => {
  test('hors saison (la date des tests) : basilic, bandeau vert, aucun décor', async ({ page }) => {
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
    await expect(banner(page).locator('svg')).toHaveCount(0)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
  })

  test('en saison : citrouille, bandeau violet puis violet nuit en sombre, accessible dans les deux thèmes', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
    await expect(page.getByText(PITCH_HALLOWEEN)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', PURPLE)
    // Le héros illustré (la sorcière) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#43206b')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await background(page), 'le fond clair').toBe(PURPLE_BG)
    expect(await violations(page), 'accessibilité, thème clair').toEqual([])

    await switchTheme(page, 'dark')

    await expect(banner(page)).toHaveCSS('background-color', PURPLE_DARK)
    expect(await background(page), 'le fond sombre').toBe(PURPLE_BG_DARK)
    expect(await violations(page), 'accessibilité, thème sombre').toEqual([])
  })

  // La préférence enregistrée (`repas.theme`) bat le thème du système : seule la cascade réelle (`[data-theme]` contre
  // `@media (prefers-color-scheme: dark)`) le tranche. Les autres croisements (« système » avec un système clair ou sombre) sont le cas
  // précédent.
  for (const { stored, system, bg } of [
    { stored: 'light', system: 'dark', bg: PURPLE_BG },
    { stored: 'dark', system: 'light', bg: PURPLE_BG_DARK },
  ] as const) {
    test(`en saison, préférence « ${stored} », système ${system} : le fond suit la préférence`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: system })
      await page.addInitScript((stored) => localStorage.setItem('repas.theme', stored), stored)
      await page.clock.setSystemTime(IN_SEASON)
      await page.goto('/connexion')

      await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
      expect(await background(page)).toBe(bg)
    })
  }

  test('une application laissée ouverte change de thème à minuit, sans rechargement', async ({
    page,
  }) => {
    await page.clock.setSystemTime(new Date(2026, 9, 14, 23, 59, 30))
    await page.goto('/connexion')
    await expect(page.getByText(PITCH_AUTOMNE)).toBeVisible()

    await page.clock.fastForward('01:00')

    await expect(page.getByText(PITCH_HALLOWEEN)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
  })

  // La hauteur du bandeau change avec le héros de la saison : à 360 × 640 le bouton de connexion reste entier à l'écran, et le décor
  // (coin, scène) ne le couvre pas. Une seule page, les sept saisons à la suite, clair puis sombre ; la même visite prouve que le module
  // de décor de chaque saison se résout dans le build (coin et scène visibles, sans événement de souris).
  test('à 360 × 640, pour chaque saison : le décor est là et le bouton principal reste visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.emulateMedia({ colorScheme: 'light' })

    for (const [season, date] of [
      ['galette', IN_GALETTE],
      ['valentin', IN_VALENTIN],
      ['paques', IN_PAQUES],
      ['ete', IN_ETE],
      ['automne', IN_AUTOMNE],
      ['halloween', IN_SEASON],
      ['noel', IN_NOEL],
    ] as const) {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      await expect(page.locator('html'), season).toHaveAttribute('data-season', season)
      await expect(banner(page).locator('svg[focusable="false"]'), season).toHaveCount(1)
      await expect(corner(page).locator('svg'), `${season} : le coin`).toBeVisible()
      await expect(scene(page).locator('svg'), `${season} : la scène`).toBeVisible()
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
      await expect(scene(page)).toHaveCSS('pointer-events', 'none')
      await expectLoginButtonReachable(page, `${season}, clair`)

      await switchTheme(page, 'dark')
      await expectLoginButtonReachable(page, `${season}, sombre`)
      await switchTheme(page, 'light')
    }
  })

  // Noël est la seule saison au fond clair différent des autres (un blanc bleuté) et au bandeau bordeaux : on garde son contrôle de contraste.
  test('à Noël, l’écran est accessible (WCAG AA) dans les deux thèmes', async ({ page }) => {
    await page.clock.setSystemTime(IN_NOEL)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    await expect(page.getByText(PITCH_NOEL)).toBeVisible()
    await axeBothThemes(page, 'connexion-noel')
  })
})

test.describe('écran « Moi »', () => {
  test('en saison : accessible dans les deux thèmes ; l’interrupteur coupe le décor et se retient après un rechargement', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/moi')

    const toggle = page.getByRole('switch', { name: 'Décor d’Halloween' })
    await expect(toggle).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
    await expect(corner(page).locator('svg')).toBeVisible()
    await expect(scene(page).locator('svg')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 }).locator('svg')).toBeVisible()
    await axeBothThemes(page, 'moi-halloween')

    await toggle.click()

    await expect(toggle).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
    // Plus de coin, de scène ni de pièce
    await expect(corner(page)).toHaveCount(0)
    await expect(scene(page)).toHaveCount(0)
    await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(corner(page)).toHaveCount(0)
    await expect(scene(page)).toHaveCount(0)
    await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
  })

  test('à Noël, l’écran est accessible (WCAG AA) dans les deux thèmes', async ({ page }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/moi')
    await expect(page.getByRole('switch', { name: 'Décor de Noël' })).toBeVisible()

    await axeBothThemes(page, 'moi-noel')
  })
})

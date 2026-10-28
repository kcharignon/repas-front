// Les thèmes saisonniers « Citrouille & nuit » (ADR 0010, du 15 octobre au 1er novembre) et « Houx & neige » (ADR 0011, du 15 novembre
// au 5 janvier), jour du navigateur. L'horloge est posée par
// chaque test (`page.clock`) : rien ne dépend du jour où la suite tourne. Ni back ni compte : l'API est simulée par `page.route`.
import AxeBuilder from '@axe-core/playwright'
import { expect, IN_NOEL, IN_SEASON, test, type Page } from './support/test'

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'
const PITCH_NOEL = 'Tes recettes, tes courses, sans oublier la bûche.'

// Les couleurs du bandeau (jeton --brand) : vert hors saison, violet nuit en saison, plus sombre en mode sombre.
const GREEN = 'rgb(30, 107, 76)'
const PURPLE = 'rgb(67, 32, 107)'
const PURPLE_DARK = 'rgb(45, 24, 80)'
// Noël : bordeaux, plus sombre en mode sombre.
const BURGUNDY = 'rgb(122, 21, 48)'
const BURGUNDY_DARK = 'rgb(90, 18, 38)'

const banner = (page: Page) => page.locator('header').first()
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

test.describe('écran de connexion', () => {
  test('hors saison (la date des tests) : basilic, bandeau vert, aucun décor', async ({ page }) => {
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
    await expect(banner(page).locator('svg')).toHaveCount(0)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
  })

  test('en saison : citrouille, bandeau violet, décor, barre du navigateur violette', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
    await expect(page.getByText(PITCH_HALLOWEEN)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', PURPLE)
    await expect(banner(page).locator('[aria-hidden="true"] svg')).toHaveCount(4)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#43206b')
  })

  test('en saison et en sombre : le bandeau est violet nuit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', PURPLE_DARK)
    expect(await background(page)).toBe('rgb(17, 11, 27)')
  })

  test('le décor coupé par l’utilisateur : comme hors saison, même en octobre', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'off'))
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })

  test('le lendemain de la saison (2 novembre) : plus de thème saisonnier', async ({ page }) => {
    await page.clock.setSystemTime(new Date(2026, 10, 2, 0, 0, 0))
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
  })

  test('une application laissée ouverte change de thème à minuit, sans rechargement', async ({
    page,
  }) => {
    await page.clock.setSystemTime(new Date(2026, 9, 14, 23, 59, 30))
    await page.goto('/connexion')
    await expect(page.getByText(PITCH)).toBeVisible()

    await page.clock.fastForward('01:00')

    await expect(page.getByText(PITCH_HALLOWEEN)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
  })

  test('à 360 × 640 le bouton principal reste visible, le décor ne le couvre pas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')

    const button = page.getByRole('button', { name: 'Se connecter' })
    await expect(button).toBeInViewport({ ratio: 1 })
    const box = (await button.boundingBox())!
    // Rien d'autre que le bouton n'est au point cliqué : le décor ne reçoit aucun événement.
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(hit).toBe('Se connecter')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`en saison, l’écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.clock.setSystemTime(IN_SEASON)
      await page.goto('/connexion')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

test.describe('écran de connexion, Noël', () => {
  test('le 20 décembre : houx et neige, bandeau bordeaux, décor, barre du navigateur bordeaux', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    await expect(page.getByText(PITCH_NOEL)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(page.getByText('citrouille')).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', BURGUNDY)
    await expect(banner(page).locator('[aria-hidden="true"] svg')).toHaveCount(13)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#7a1530')
  })

  test('en sombre : le bandeau est bordeaux nuit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', BURGUNDY_DARK)
    expect(await background(page)).toBe('rgb(11, 21, 32)')
  })

  test('en clair : le fond est celui de Noël', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    expect(await background(page)).toBe('rgb(243, 246, 247)')
  })

  for (const [label, date] of [
    ['le 1er janvier', new Date(2027, 0, 1, 0, 0, 0)],
    ['le 5 janvier à 23:59:59', new Date(2027, 0, 5, 23, 59, 59)],
    ['le 15 novembre à 00:00:00', new Date(2026, 10, 15, 0, 0, 0)],
  ] as const) {
    test(`${label} : Noël`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
      await expect(page.getByText(PITCH_NOEL)).toBeVisible()
    })
  }

  for (const [label, date] of [
    ['le 6 janvier (lendemain de la saison)', new Date(2027, 0, 6, 0, 0, 0)],
    ['le 14 novembre (veille de la saison)', new Date(2026, 10, 14, 23, 59, 59)],
  ] as const) {
    test(`${label} : thème de base`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
      await expect(page.getByText(PITCH)).toBeVisible()
      await expect(banner(page)).toHaveCSS('background-color', GREEN)
      await expect(banner(page).locator('svg')).toHaveCount(0)
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
    })
  }

  test('Halloween reste correct le 20 octobre', async ({ page }) => {
    await page.clock.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')
    await expect(page.getByText(PITCH_HALLOWEEN)).toBeVisible()
    await expect(banner(page)).toHaveCSS('background-color', PURPLE)
  })

  test('couper Halloween ne coupe pas Noël', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'halloween'))
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    await expect(page.getByText(PITCH_NOEL)).toBeVisible()
  })

  test('l’ancienne valeur « off » ne coupe pas Noël, mais coupe toujours Halloween', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'off'))
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')

    await page.clock.setSystemTime(IN_SEASON)
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
  })

  test('Noël coupé : comme hors saison', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'noel'))
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })

  test('une application ouverte le soir du 14 novembre passe à Noël à minuit', async ({ page }) => {
    await page.clock.setSystemTime(new Date(2026, 10, 14, 23, 59, 30))
    await page.goto('/connexion')
    await expect(page.getByText(PITCH)).toBeVisible()

    await page.clock.fastForward('01:00')

    await expect(page.getByText(PITCH_NOEL)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
  })

  test('à 360 × 640 le bouton principal reste visible, le décor ne le couvre pas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    const button = page.getByRole('button', { name: 'Se connecter' })
    await expect(button).toBeInViewport({ ratio: 1 })
    const box = (await button.boundingBox())!
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(hit).toBe('Se connecter')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`l’écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.clock.setSystemTime(IN_NOEL)
      await page.goto('/connexion')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

const noelModes = [
  { stored: 'light', system: 'dark', bg: 'rgb(243, 246, 247)' },
  { stored: 'dark', system: 'light', bg: 'rgb(11, 21, 32)' },
  { stored: 'system', system: 'dark', bg: 'rgb(11, 21, 32)' },
  { stored: 'system', system: 'light', bg: 'rgb(243, 246, 247)' },
] as const

for (const { stored, system, bg } of noelModes) {
  test(`Noël, préférence « ${stored} », système ${system} : le fond suit`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system })
    await page.addInitScript((stored) => localStorage.setItem('repas.theme', stored), stored)
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    expect(await background(page)).toBe(bg)
  })
}

// Clair, sombre, « Système » : les trois choix du thème gardent leur place sous le thème saisonnier.
const modes = [
  { stored: 'light', system: 'dark', bg: 'rgb(247, 242, 234)' },
  { stored: 'dark', system: 'light', bg: 'rgb(17, 11, 27)' },
  { stored: 'system', system: 'dark', bg: 'rgb(17, 11, 27)' },
  { stored: 'system', system: 'light', bg: 'rgb(247, 242, 234)' },
] as const

for (const { stored, system, bg } of modes) {
  test(`en saison, préférence « ${stored} », système ${system} : le fond suit`, async ({
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

test.describe('écran « Moi »', () => {
  test('en saison : l’interrupteur est sous le choix du thème, le couper rend le thème de base', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/moi')

    const toggle = page.getByRole('switch', { name: 'Décor d’Halloween' })
    await expect(toggle).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'halloween')

    await toggle.click()

    await expect(toggle).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
  })

  test('le 20 décembre : « Décor de Noël » coupe le thème, se retient après rechargement', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/moi')

    const toggle = page.getByRole('switch', { name: 'Décor de Noël' })
    await expect(toggle).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')

    await toggle.click()

    await expect(toggle).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E6B4C')
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Décor de Noël' })).not.toBeChecked()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)

    await page.getByRole('switch', { name: 'Décor de Noël' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
  })

  test('le 1er janvier : l’interrupteur est là, le 6 janvier non', async ({ page }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(new Date(2027, 0, 1, 12, 0, 0))
    await page.goto('/moi')
    await expect(page.getByRole('switch', { name: 'Décor de Noël' })).toBeChecked()

    await page.clock.setSystemTime(new Date(2027, 0, 6, 12, 0, 0))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Thème' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Décor de Noël' })).toHaveCount(0)
  })

  test('couper Halloween ne coupe pas Noël : l’interrupteur de Noël reste activé', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/moi')
    await page.getByRole('switch', { name: 'Décor d’Halloween' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)

    await page.clock.setSystemTime(IN_NOEL)
    await page.reload()

    await expect(page.getByRole('switch', { name: 'Décor de Noël' })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
  })

  test('hors saison : pas d’interrupteur', async ({ page }) => {
    await fakeBack(page)
    await page.goto('/moi')

    await expect(page.getByRole('heading', { name: 'Thème' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`à Noël, l’écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({
      page,
    }) => {
      await fakeBack(page)
      await page.emulateMedia({ colorScheme })
      await page.clock.setSystemTime(IN_NOEL)
      await page.goto('/moi')
      await expect(page.getByRole('switch', { name: 'Décor de Noël' })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      expect(violations).toEqual([])
    })
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`en saison, l’écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({
      page,
    }) => {
      await fakeBack(page)
      await page.emulateMedia({ colorScheme })
      await page.clock.setSystemTime(IN_SEASON)
      await page.goto('/moi')
      await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .exclude('.vue-devtools__anchor-btn')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

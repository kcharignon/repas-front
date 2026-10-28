// Les thèmes saisonniers « Citrouille & nuit » (ADR 0010, du 15 octobre au 1er novembre) et « Houx & neige » (ADR 0011, du 15 novembre
// au 5 janvier), jour du navigateur. L'horloge est posée par
// chaque test (`page.clock`) : rien ne dépend du jour où la suite tourne. Ni back ni compte : l'API est simulée par `page.route`.
import AxeBuilder from '@axe-core/playwright'
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

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'
const PITCH_GALETTE = 'Tes recettes, tes courses, sans oublier la galette.'
const PITCH_VALENTIN = 'Tes recettes, tes courses, sans oublier le dîner à deux.'
const PITCH_ETE = 'Tes recettes, tes courses, sans oublier le barbecue.'
const PITCH_AUTOMNE = 'Tes recettes, tes courses, sans oublier la tarte aux pommes.'
const PITCH_PAQUES = 'Tes recettes, tes courses, sans oublier le chocolat.'
const PITCH_NOEL = 'Tes recettes, tes courses, sans oublier la bûche.'

// Les couleurs du bandeau (jeton --brand) : vert hors saison, violet nuit en saison, plus sombre en mode sombre.
const GREEN = 'rgb(30, 107, 76)'
const PURPLE = 'rgb(67, 32, 107)'
const PURPLE_DARK = 'rgb(45, 24, 80)'
// La galette : bleu roi, plus sombre en mode sombre.
const ROYAL = 'rgb(34, 59, 134)'
const ROYAL_DARK = 'rgb(26, 42, 102)'
// La Saint-Valentin : rose, plus sombre en mode sombre.
const ROSE = 'rgb(168, 50, 106)'
const ROSE_DARK = 'rgb(125, 35, 80)'
// Pâques : violet, plus sombre en mode sombre.
const VIOLET = 'rgb(106, 80, 176)'
const VIOLET_DARK = 'rgb(74, 54, 127)'
// L'été : orange brûlé, plus sombre en mode sombre.
const BURNT = 'rgb(184, 70, 15)'
const BURNT_DARK = 'rgb(138, 50, 9)'
// L'automne : olive, plus sombre en mode sombre.
const OLIVE = 'rgb(77, 90, 22)'
const OLIVE_DARK = 'rgb(58, 68, 16)'
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
    // Le héros illustré (la sorcière) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
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
    await expect(page.getByText(PITCH_AUTOMNE)).toBeVisible()

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

test.describe('écran de connexion, la galette', () => {
  test('le 15 janvier 2027 : or et bleu roi, bandeau bleu roi, décor, barre du navigateur bleu roi', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_GALETTE)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'galette')
    await expect(page.getByText(PITCH_GALETTE)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', ROYAL)
    // Le héros illustré (la galette couronnée et les crêpes) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#223b86')
  })

  test('en sombre : le bandeau est bleu nuit et le fond indigo', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_GALETTE)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', ROYAL_DARK)
    expect(await background(page)).toBe('rgb(17, 24, 50)')
  })

  for (const [label, date, season] of [
    ['le 6 janvier à 00:00:00 (début)', new Date(2027, 0, 6, 0, 0, 0), 'galette'],
    ['le 2 février à 23:59:59 (la Chandeleur, fin)', new Date(2027, 1, 2, 23, 59, 59), 'galette'],
    ['le 5 janvier à 23:59:59 (la veille, Noël)', new Date(2027, 0, 5, 23, 59, 59), 'noel'],
    ['le 3 février à 00:00:00 (le lendemain)', new Date(2027, 1, 3, 0, 0, 0), null],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      if (season) await expect(page.locator('html')).toHaveAttribute('data-season', season)
      else await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    })
  }

  test('le décor de la galette coupé : comme hors saison', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'galette'))
    await page.clock.setSystemTime(IN_GALETTE)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })
})

test.describe('écran de connexion, la Saint-Valentin', () => {
  test('le 12 février 2027 : rose et cœur, bandeau rose, décor, barre du navigateur rose', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_VALENTIN)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'valentin')
    await expect(page.getByText(PITCH_VALENTIN)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', ROSE)
    // Le héros illustré (la table pour deux) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#a8326a')
  })

  test('en sombre : le bandeau est rose vin et le fond vin', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_VALENTIN)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', ROSE_DARK)
    expect(await background(page)).toBe('rgb(29, 15, 23)')
  })

  for (const [label, date, season] of [
    ['le 7 février à 00:00:00 (début)', new Date(2027, 1, 7, 0, 0, 0), 'valentin'],
    ['le 14 février à 23:59:59 (fin)', new Date(2027, 1, 14, 23, 59, 59), 'valentin'],
    ['le 6 février à 23:59:59 (la veille)', new Date(2027, 1, 6, 23, 59, 59), null],
    ['le 15 février à 00:00:00 (le lendemain)', new Date(2027, 1, 15, 0, 0, 0), null],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      if (season) await expect(page.locator('html')).toHaveAttribute('data-season', season)
      else await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    })
  }

  test('le décor de la Saint-Valentin coupé : comme hors saison, sans couper la galette', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'valentin'))
    await page.clock.setSystemTime(IN_VALENTIN)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })
})

test.describe('écran de connexion, Pâques', () => {
  test('le 20 mars 2027 : prairie et œufs, bandeau violet, décor, barre du navigateur violette', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_PAQUES)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'paques')
    await expect(page.getByText(PITCH_PAQUES)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', VIOLET)
    // Le héros illustré (le lapin et son panier) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#6a50b0')
  })

  test('en sombre : le bandeau est violet nuit et le fond chocolat', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_PAQUES)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', VIOLET_DARK)
    expect(await background(page)).toBe('rgb(26, 19, 16)')
  })

  for (const [label, date, season] of [
    ['le 7 mars à 00:00:00 (début)', new Date(2027, 2, 7, 0, 0, 0), 'paques'],
    ['le lundi de Pâques, 29 mars à 23:59:59', new Date(2027, 2, 29, 23, 59, 59), 'paques'],
    ['le 6 mars à 23:59:59 (la veille)', new Date(2027, 2, 6, 23, 59, 59), null],
    ['le 30 mars à 00:00:00 (le lendemain)', new Date(2027, 2, 30, 0, 0, 0), null],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      if (season) await expect(page.locator('html')).toHaveAttribute('data-season', season)
      else await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    })
  }

  test('le décor de Pâques coupé : comme hors saison, sans couper Halloween', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'paques'))
    await page.clock.setSystemTime(IN_PAQUES)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })
})

test.describe('écran de connexion, l’été', () => {
  test('le 15 juillet 2027 : soleil et mer, bandeau orange brûlé, décor, barre du navigateur orange', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_ETE)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'ete')
    await expect(page.getByText(PITCH_ETE)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', BURNT)
    // Le héros illustré (la plage) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#b8460f')
  })

  test('en sombre : le bandeau est brun brûlé et le fond nuit de mer', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_ETE)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', BURNT_DARK)
    expect(await background(page)).toBe('rgb(10, 30, 36)')
  })

  for (const [label, date, season] of [
    ['le 21 juin à 00:00:00 (début)', new Date(2027, 5, 21, 0, 0, 0), 'ete'],
    ['le 31 août à 23:59:59 (fin)', new Date(2027, 7, 31, 23, 59, 59), 'ete'],
    ['le 20 juin à 23:59:59 (la veille)', new Date(2027, 5, 20, 23, 59, 59), null],
    [
      'le 1er septembre à 00:00:00 (le lendemain, l’automne)',
      new Date(2027, 8, 1, 0, 0, 0),
      'automne',
    ],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      if (season) await expect(page.locator('html')).toHaveAttribute('data-season', season)
      else await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    })
  }

  test('le décor de l’été coupé : comme hors saison, sans couper l’automne', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'ete'))
    await page.clock.setSystemTime(IN_ETE)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })
})

test.describe('écran de connexion, l’automne', () => {
  test('le 20 septembre 2027 : forêt et feuilles, bandeau olive, décor, barre du navigateur olive', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_AUTOMNE)
    await page.goto('/connexion')

    await expect(page.locator('html')).toHaveAttribute('data-season', 'automne')
    await expect(page.getByText(PITCH_AUTOMNE)).toBeVisible()
    await expect(page.getByText(PITCH, { exact: true })).toHaveCount(0)
    await expect(banner(page)).toHaveCSS('background-color', OLIVE)
    // Le héros illustré (le hérisson et l’écureuil) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#4d5a16')
  })

  test('en sombre : le bandeau est olive foncé et le fond sous-bois', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.clock.setSystemTime(IN_AUTOMNE)
    await page.goto('/connexion')

    await expect(banner(page)).toHaveCSS('background-color', OLIVE_DARK)
    expect(await background(page)).toBe('rgb(23, 22, 12)')
  })

  for (const [label, date, season] of [
    ['le 1er septembre à 00:00:00 (début)', new Date(2027, 8, 1, 0, 0, 0), 'automne'],
    ['le 14 octobre à 23:59:59 (fin)', new Date(2027, 9, 14, 23, 59, 59), 'automne'],
    ['le 31 août à 23:59:59 (la veille, l’été)', new Date(2027, 7, 31, 23, 59, 59), 'ete'],
    [
      'le 15 octobre à 00:00:00 (le lendemain, Halloween)',
      new Date(2027, 9, 15, 0, 0, 0),
      'halloween',
    ],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      await page.clock.setSystemTime(date)
      await page.goto('/connexion')

      await expect(page.locator('html')).toHaveAttribute('data-season', season)
    })
  }

  test('le décor de l’automne coupé : comme hors saison, sans couper Halloween', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('repas.season', 'automne'))
    await page.clock.setSystemTime(IN_AUTOMNE)
    await page.goto('/connexion')

    await expect(page.getByText(PITCH)).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/)
    await expect(banner(page)).toHaveCSS('background-color', GREEN)
  })
})

// Les bandeaux orange brûlé et olive sont hauts : à 360 × 640 le bouton de connexion reste entier à l'écran, et le décor ne le couvre pas.
test.describe('écran de connexion, téléphone étroit, été et automne', () => {
  for (const [label, date] of [
    ['l’été', IN_ETE],
    ['l’automne', IN_AUTOMNE],
  ] as const)
    for (const colorScheme of ['light', 'dark'] as const)
      test(`${label}, ${colorScheme} : le bouton principal reste visible`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: 360, height: 640 })
        await page.clock.setSystemTime(date)
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
    // Le héros illustré (la cabane) est dans le bandeau
    await expect(banner(page).locator('svg[focusable="false"]')).toHaveCount(1)
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

  test('le 1er janvier : l’interrupteur de Noël est là, le 6 janvier non (la galette prend le relais)', async ({
    page,
  }) => {
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

  for (const [label, date, name] of [
    ['la galette', IN_GALETTE, 'Décor de la galette'],
    ['la Saint-Valentin', IN_VALENTIN, 'Décor de la Saint-Valentin'],
    ['l’été', IN_ETE, 'Décor d’été'],
    ['l’automne', IN_AUTOMNE, 'Décor d’automne'],
  ] as const)
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`pour ${label}, l’écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({
        page,
      }) => {
        await fakeBack(page)
        await page.emulateMedia({ colorScheme })
        await page.clock.setSystemTime(date)
        await page.goto('/moi')
        await expect(page.getByRole('switch', { name })).toBeVisible()

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

// Administration des utilisateurs, sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les
// changements de statut et les suppressions. Jouée sur bureau (tableau) et sur Pixel 7 (cartes). Données inventées.
// SHOTS_DIR=<dossier> : garde une capture de chaque état (clair et sombre) pour la relire.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

type Status = 'PENDING' | 'ACTIVE' | 'DISABLED'
interface FakeUser {
  id: string
  email: string
  status: Status
  isAdmin: boolean
  recipeCount: number
  ingredientCount: number
  shoppingListCount: number
  createdAt: string
  lastLoginAt: string | null
  appVersion: string | null
  appOutdated: boolean
}

// Mardi 20 octobre 2026, 14 h (heure du navigateur, figée par `page.clock`)
const NOW = new Date(2026, 9, 20, 14, 0)
const iso = (...args: [number, number, number, number, number]) => new Date(...args).toISOString()

const account = (fields: Partial<FakeUser> & Pick<FakeUser, 'id' | 'email'>): FakeUser => ({
  status: 'ACTIVE',
  isAdmin: false,
  recipeCount: 0,
  ingredientCount: 0,
  shoppingListCount: 0,
  createdAt: iso(2026, 8, 1, 10, 0),
  lastLoginAt: null,
  appVersion: null,
  appOutdated: false,
  ...fields,
})

const initialUsers = (): FakeUser[] => [
  account({
    id: 'u1',
    email: 'admin@exemple.test',
    isAdmin: true,
    recipeCount: 12,
    ingredientCount: 9,
    shoppingListCount: 3,
    lastLoginAt: iso(2026, 9, 20, 13, 55),
    appVersion: '0.1.25',
  }),
  account({
    id: 'u2',
    email: 'nouveau@exemple.test',
    status: 'PENDING',
    createdAt: iso(2026, 9, 20, 9, 30),
  }),
  account({
    id: 'u3',
    email: 'ancien@exemple.test',
    status: 'DISABLED',
    recipeCount: 4,
    lastLoginAt: iso(2026, 8, 2, 9, 0),
    appVersion: '0.1.8',
    appOutdated: true,
  }),
  account({
    id: 'u4',
    email: 'cuisinier.avec.une.adresse.vraiment.tres.longue.pour.voir@sous-domaine.exemple.test',
    recipeCount: 31,
    ingredientCount: 5,
    shoppingListCount: 2,
    lastLoginAt: iso(2026, 9, 19, 18, 0),
    appVersion: '0.1.25',
  }),
  account({ id: 'u5', email: 'jamais@exemple.test', shoppingListCount: 1 }),
]

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

async function fakeBack(page: Page, colorScheme: 'light' | 'dark' = 'light') {
  let users = initialUsers()
  const received: string[] = []
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.clock.install({ time: NOW })
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      received.push(`${request.method()} ${path}`)
      if (path === '/api/auth/refresh') return reply(route, { token: 'jeton' })
      if (path === '/api/v1/me')
        return reply(route, {
          id: 'u1',
          email: 'admin@exemple.test',
          roles: ['ROLE_USER', 'ROLE_ADMIN'],
          isAdmin: true,
          defaultServing: 4,
        })
      if (path === '/api/v1/users' && request.method() === 'GET')
        return reply(route, { member: users, totalItems: users.length })
      const status = /^\/api\/v1\/users\/([^/]+)\/status$/.exec(path)
      if (status && request.method() === 'PUT') {
        const body = request.postDataJSON() as { status: Status }
        users = users.map((user) =>
          user.id === status[1] ? { ...user, status: body.status } : user,
        )

        return reply(route)
      }
      const one = /^\/api\/v1\/users\/([^/]+)$/.exec(path)
      if (one && request.method() === 'DELETE') {
        users = users.filter((user) => user.id !== one[1])

        return reply(route)
      }

      return reply(route, { error: { message: 'NOT_FOUND' } }, 404)
    },
  )

  return received
}

const shot = async (page: Page, name: string) => {
  const dir = process.env.SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
}

const rowOf = (page: Page, email: string) =>
  page.getByRole('listitem').filter({ hasText: email, has: page.locator('p', { hasText: email }) })

test.describe('administration des utilisateurs', () => {
  test('les comptes en attente passent en premier, avec une action visible et une dernière connexion lisible', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.goto('/admin/utilisateurs')

    await expect(page.getByRole('main')).toContainText('5 comptes · 1 en attente')
    await expect(page.getByRole('listitem').first()).toContainText('nouveau@exemple.test')
    await expect(
      rowOf(page, 'nouveau@exemple.test').getByRole('button', { name: /^Activer/ }),
    ).toBeVisible()
    await expect(rowOf(page, 'nouveau@exemple.test')).toContainText('Pas encore vu')
    await expect(rowOf(page, 'admin@exemple.test')).toContainText('il y a 5 min')
    await expect(rowOf(page, 'admin@exemple.test').locator('time')).toHaveAttribute(
      'title',
      '20 octobre 2026 à 13:55',
    )
    await expect(rowOf(page, 'ancien@exemple.test')).toContainText('2 septembre 2026')
    await expect(
      rowOf(page, 'ancien@exemple.test').getByRole('button', { name: /^Réactiver/ }),
    ).toBeVisible()
    await shot(page, 'liste')
  })

  test('active un compte en attente en un clic', async ({ page }) => {
    const received = await fakeBack(page)
    await page.goto('/admin/utilisateurs')

    await rowOf(page, 'nouveau@exemple.test')
      .getByRole('button', { name: /^Activer/ })
      .click()

    await expect(
      page.getByRole('status').filter({ hasText: 'Statut de nouveau@exemple.test modifié.' }),
    ).toBeVisible()
    await expect(
      rowOf(page, 'nouveau@exemple.test').getByRole('button', { name: /^Activer/ }),
    ).toHaveCount(0)
    await expect(page.getByRole('main')).not.toContainText('en attente')
    expect(received).toContain('PUT /api/v1/users/u2/status')
  })

  test('désactive un compte par le menu « Plus d’actions », au clavier', async ({ page }) => {
    const received = await fakeBack(page)
    await page.goto('/admin/utilisateurs')
    const row = rowOf(page, 'jamais@exemple.test')

    await expect(row.getByRole('button', { name: /^Activer|^Réactiver/ })).toHaveCount(0)
    const more = row.getByRole('button', { name: 'Plus d’actions pour jamais@exemple.test' })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem')).toHaveText([
      'Mettre en attente',
      'Désactiver',
      'Supprimer',
    ])
    await shot(page, 'menu')
    await page.getByRole('menuitem', { name: 'Désactiver' }).click()

    await expect(row.getByRole('button', { name: /^Réactiver/ })).toBeVisible()
    expect(received).toContain('PUT /api/v1/users/u5/status')
  })

  test('le menu du compte connecté grise « Supprimer » et dit pourquoi', async ({ page }) => {
    await fakeBack(page)
    await page.goto('/admin/utilisateurs')

    await rowOf(page, 'admin@exemple.test')
      .getByRole('button', { name: 'Plus d’actions pour admin@exemple.test' })
      .click()

    await expect(page.getByRole('menuitem', { name: /Supprimer/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(page.getByRole('menuitem', { name: /Supprimer/ })).toContainText(
      'C’est ton compte',
    )
  })

  test('supprime un compte après confirmation, et annuler ne supprime rien', async ({ page }) => {
    const received = await fakeBack(page)
    await page.goto('/admin/utilisateurs')
    const more = () =>
      rowOf(page, 'jamais@exemple.test').getByRole('button', {
        name: 'Plus d’actions pour jamais@exemple.test',
      })

    await more().click()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await expect(page.getByRole('dialog')).toContainText('irréversible')
    await shot(page, 'confirmation')
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(rowOf(page, 'jamais@exemple.test')).toBeVisible()
    expect(received.filter((call) => call.startsWith('DELETE'))).toEqual([])

    await more().click()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()

    await expect(rowOf(page, 'jamais@exemple.test')).toHaveCount(0)
    await expect(page.getByRole('main')).toContainText('4 comptes')
    expect(received).toContain('DELETE /api/v1/users/u5')
  })

  test('les puces filtrent les comptes', async ({ page }) => {
    await fakeBack(page)
    await page.goto('/admin/utilisateurs')
    const chip = (name: string) => page.getByRole('button', { name })

    await expect(chip('Tous')).toHaveAttribute('aria-pressed', 'true')
    await chip('Actifs (3)').click()
    await expect(page.getByRole('listitem')).toHaveCount(3)
    await expect(chip('Actifs (3)')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip('Tous')).toHaveAttribute('aria-pressed', 'false')
    await shot(page, 'filtre-actifs')

    await chip('Désactivés (1)').click()
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('listitem')).toContainText('ancien@exemple.test')

    await chip('En attente (1)').click()
    await expect(page.getByRole('listitem')).toContainText('nouveau@exemple.test')
  })

  test('pas de défilement horizontal, cibles de 44 px', async ({ page }) => {
    await fakeBack(page)
    await page.goto('/admin/utilisateurs')
    await expect(page.getByRole('listitem').first()).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    const controls = page
      .getByRole('main')
      .locator('button')
      .filter({ hasNot: page.locator('[aria-hidden="true"] button') })
    for (const control of await controls.all()) {
      const box = await control.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(43.5)
      expect(box?.width).toBeGreaterThanOrEqual(43.5)
    }
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`la vue est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await fakeBack(page, colorScheme)
      await page.goto('/admin/utilisateurs')
      await expect(page.getByRole('listitem').first()).toBeVisible()
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      expect((await scan()).violations).toEqual([])
      await shot(page, `vue-${colorScheme}`)

      await rowOf(page, 'jamais@exemple.test')
        .getByRole('button', { name: /Plus d’actions/ })
        .click()
      await expect(page.getByRole('menu')).toBeVisible()
      expect((await scan()).violations).toEqual([])
      await shot(page, `menu-${colorScheme}`)
    })
  }
})

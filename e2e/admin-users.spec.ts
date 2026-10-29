// Administration des utilisateurs, sans back ni compte : l'API est simulée par `page.route`. Jouée sur le téléphone (cartes) ET sur le bureau
// (tableau dès 1280 px : le DOM n'est pas le même), étiquette BUREAU : c'est le seul test qui porte l'accessibilité du bureau (menu latéral
// compris) pour les pages d'administration. Un test : la mise en page (pas de défilement horizontal, cibles de 44 px), puis l'accessibilité
// (WCAG AA, contraste compris) de la liste et de son menu ouvert au clavier dans les DEUX thèmes de la même visite. Tri, filtres, activation,
// désactivation, suppression et leurs messages sont des tests de composant (`Admin.spec.ts`, `users.spec.ts`, `UiActionMenu.spec.ts`,
// `AppToasts.spec.ts`). Données inventées. `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page, type Route, BUREAU } from './support/test'
import { axeBothThemes } from './support/screen'

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

async function fakeBack(page: Page) {
  const users = initialUsers()
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.clock.install({ time: NOW })
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
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
      return reply(route, { error: { message: 'NOT_FOUND' } }, 404)
    },
  )
}

const rowOf = (page: Page, email: string) =>
  page.getByRole('listitem').filter({ hasText: email, has: page.locator('p', { hasText: email }) })

test.describe('administration des utilisateurs', { tag: BUREAU }, () => {
  test('la liste et son menu sont accessibles dans les deux thèmes, sans défilement horizontal, avec des cibles de 44 px', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.goto('/admin/utilisateurs')
    await expect(page.getByRole('main')).toContainText('5 comptes · 1 en attente')
    await expect(page.getByRole('listitem').first()).toContainText('nouveau@exemple.test')

    // La mise en page (elle ne dépend pas du thème) : rien ne déborde, chaque bouton se touche du pouce
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
    await axeBothThemes(page, 'admin-utilisateurs')

    // Le menu « Plus d'actions » s'ouvre au clavier (vrai focus, vraie touche Entrée) sur ses trois actions
    const more = rowOf(page, 'jamais@exemple.test').getByRole('button', {
      name: 'Plus d’actions pour jamais@exemple.test',
    })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem')).toHaveText([
      'Mettre en attente',
      'Désactiver',
      'Supprimer',
    ])
    await axeBothThemes(page, 'admin-utilisateurs-menu')
  })
})

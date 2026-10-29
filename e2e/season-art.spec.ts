// Les illustrations de saison (ADR 0012) : coin, scène de fond, héros et pièces d'accueil. L'horloge est posée par chaque test
// (`page.clock`). Ni back ni compte : l'API est simulée par `page.route`.
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
  viewportTag,
} from './support/test'

const PHONE = { width: 360, height: 640 }
const DESKTOP = { width: 1280, height: 800 }

const types = {
  member: [{ slug: 'plat', name: 'Plat', image: '', order: 1 }],
  totalItems: 1,
}
const emptyList = {
  id: 'list-1',
  name: null,
  displayName: 'Liste du 14 octobre 2026',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status: 'ACTIVE',
  version: 1,
  isActive: true,
  isPaused: false,
  isCompleted: false,
  isSent: false,
  rowCount: 0,
  recipeCount: 0,
  departments: [],
  recipeTypes: [],
}

async function fakeBack(page: Page, { withList = false }: { withList?: boolean } = {}) {
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
      if (key === 'GET /api/v1/recipe-types') return json(types)
      if (key === 'GET /api/v1/recipe-types/plat/recipes')
        return json({ member: [], totalItems: 0 })
      if (key === 'GET /api/v1/shopping-lists/active/summary')
        return json({
          shoppingListId: withList ? 'list-1' : null,
          quantityByIngredientSlug: {},
          plannedRecipeIds: [],
        })
      if (key === 'GET /api/v1/shopping-lists/list-1') return json(emptyList)
      if (key === 'GET /api/v1/recipe-types/plat') return json(types.member[0])
      return json({ error: { message: 'inconnu' } }, 404)
    },
  )
}

const corner = (page: Page) => page.getByTestId('season-corner')
const scene = (page: Page) => page.getByTestId('season-scene')

for (const viewport of [PHONE, DESKTOP]) {
  const label = `${viewport.width} × ${viewport.height}`

  test.describe(`coin et scène de saison, ${label}`, { tag: viewportTag(viewport) }, () => {
    test.use({ viewport })

    test('Halloween : le coin et la scène sont là sur la connexion, sans recouvrir d’action', async ({
      page,
    }) => {
      await page.clock.setSystemTime(IN_SEASON)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      const box = (await corner(page).boundingBox())!
      expect(box.x + box.width).toBeCloseTo(viewport.width, 0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.width).toBe(viewport.width < 768 ? 120 : 160)
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
      await expect(scene(page)).toHaveCSS('pointer-events', 'none')
      // Rien d'autre que le lien « Confidentialité » n'est au point cliqué, même sous le coin
      await page.getByRole('link', { name: 'Confidentialité' }).click()
      await expect(page).toHaveURL(/\/confidentialite/)
      // Et le coin est aussi sur cette page (404, confidentialité : tous les écrans)
      await expect(corner(page).locator('svg')).toBeVisible()
    })

    test('la galette : le coin (les couronnes) et la scène (la cuisine) sont là', async ({
      page,
    }) => {
      await page.clock.setSystemTime(IN_GALETTE)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'galette')
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
    })

    test('la Saint-Valentin : le coin (les cœurs) et la scène (les toits) sont là', async ({
      page,
    }) => {
      await page.clock.setSystemTime(IN_VALENTIN)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'valentin')
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
    })

    test('l’été : le coin (le soleil) et la scène (le bord de mer) sont là', async ({ page }) => {
      await page.clock.setSystemTime(IN_ETE)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'ete')
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
    })

    test('l’automne : le coin (les feuilles) et la scène (le sous-bois) sont là', async ({
      page,
    }) => {
      await page.clock.setSystemTime(IN_AUTOMNE)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'automne')
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
    })

    test('Pâques : le coin (les fleurs) et la scène (la prairie) sont là', async ({ page }) => {
      await page.clock.setSystemTime(IN_PAQUES)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'paques')
      await expect(corner(page)).toHaveCSS('pointer-events', 'none')
    })

    test('Noël : le coin (la guirlande) et la scène (le village) sont là', async ({ page }) => {
      await page.clock.setSystemTime(IN_NOEL)
      await page.goto('/connexion')

      await expect(corner(page).locator('svg')).toBeVisible()
      await expect(scene(page).locator('svg')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-season', 'noel')
    })

    test('sur une vue connectée, le coin ne bloque pas le bouton situé dessous', async ({
      page,
    }) => {
      await fakeBack(page)
      await page.clock.setSystemTime(IN_SEASON)
      await page.goto('/recettes')

      await expect(corner(page).locator('svg')).toBeVisible()
      const button = page.getByRole('link', { name: 'Nouvelle recette' })
      const buttonBox = (await button.boundingBox())!
      const cornerBox = (await corner(page).boundingBox())!
      // Le bouton est bien dans l'angle du coin : le clic le traverse
      expect(buttonBox.x + buttonBox.width).toBeGreaterThan(cornerBox.x)
      expect(buttonBox.y).toBeLessThan(cornerBox.y + cornerBox.height)
      await button.click()
      await expect(page).toHaveURL(/\/recettes\/nouvelle/)
    })

    test('hors saison : ni coin ni scène, comme avant', async ({ page }) => {
      await fakeBack(page)
      await page.goto('/moi')

      await expect(page.getByRole('heading', { name: 'Thème' })).toBeVisible()
      await expect(corner(page)).toHaveCount(0)
      await expect(scene(page)).toHaveCount(0)
      await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
    })
  })
}

test.describe('interrupteur du décor', () => {
  test('couper le décor retire tout (coin, scène, pièces) et se retient après rechargement', async ({
    page,
  }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/moi')

    await expect(corner(page).locator('svg')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 }).locator('svg')).toBeVisible()

    await page.getByRole('switch', { name: 'Décor d’Halloween' }).click()

    await expect(corner(page)).toHaveCount(0)
    await expect(scene(page)).toHaveCount(0)
    await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Décor d’Halloween' })).not.toBeChecked()
    await expect(corner(page)).toHaveCount(0)
    await expect(scene(page)).toHaveCount(0)
    await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
  })
})

test.describe('chargement à la demande', () => {
  // Un fichier de décor est un module à part (`art/<saison>/<pièce>.svg`) : le serveur de développement le sert sous son chemin, le
  // build sous le nom de la pièce suivi d'une empreinte.
  const piece = /season\/art\/[\w-]+\/|\/assets\/season\/[\w-]+\.js/

  test('hors saison, aucun fichier de décor n’est demandé', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (piece.test(request.url())) requested.push(request.url())
    })
    await fakeBack(page)
    await page.goto('/moi')
    await expect(page.getByRole('heading', { name: 'Thème' })).toBeVisible()
    await page.goto('/recettes')
    await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()

    expect(requested).toEqual([])
  })

  test('hors saison, l’écran de connexion ne demande aucun fichier de décor non plus', async ({
    page,
  }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (piece.test(request.url())) requested.push(request.url())
    })
    await page.goto('/connexion')
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()

    expect(requested).toEqual([])
  })

  test('en saison, les pièces sont demandées, chacune à part', async ({ page }) => {
    const requested = new Set<string>()
    page.on('request', (request) => {
      if (piece.test(request.url())) requested.add(request.url())
    })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/connexion')
    await expect(corner(page).locator('svg')).toBeVisible()

    await expect.poll(() => requested.size).toBeGreaterThanOrEqual(3)
  })
})

test.describe('états vides illustrés', () => {
  test('liste sans article, en saison : l’illustration est au-dessus de la phrase', async ({
    page,
  }) => {
    await fakeBack(page, { withList: true })
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/liste')

    const phrase = page.getByText('Rien à acheter pour l', { exact: false })
    await expect(phrase.first()).toBeVisible()
    const art = page.locator('main span[aria-hidden="true"] svg').last()
    await expect(art).toBeVisible()
    const artBox = (await art.boundingBox())!
    const phraseBox = (await phrase.first().boundingBox())!
    expect(artBox.y + artBox.height).toBeLessThanOrEqual(phraseBox.y + 1)
    expect(artBox.height).toBeGreaterThanOrEqual(120)
  })

  test('aucune liste, à Noël : la pièce de Noël, avec le même texte', async ({ page }) => {
    await fakeBack(page)
    await page.clock.setSystemTime(IN_NOEL)
    await page.goto('/liste')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main section svg[focusable="false"]')).toBeVisible()
  })

  test('page introuvable : l’illustration de la saison, le bouton de retour reste utilisable', async ({
    page,
  }) => {
    await page.clock.setSystemTime(IN_SEASON)
    await page.goto('/nimporte-quoi')

    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
    await expect(page.locator('main svg[focusable="false"]')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Retour à la liste' })).toBeVisible()
  })
})

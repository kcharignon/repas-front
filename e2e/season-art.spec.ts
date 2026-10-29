// Les illustrations de saison (ADR 0012) : coin, scène de fond, héros et pièces d'accueil. L'horloge est posée par chaque test
// (`page.clock`). Ni back ni compte : l'API est simulée par `page.route`.
// Ne reste ici que ce que seul un navigateur prouve : la géométrie du coin et le clic qui le traverse (le viewport change le résultat),
// les fichiers réellement demandés au réseau par le build, la hauteur de la pièce d'un état vide. Le coin et la scène de chaque saison
// (calque fixe, sans événement de souris, caché des lecteurs d'écran, opacité par jeton), les pièces de chaque écran et l'interrupteur du
// décor sont prouvés par `src/design/season/__tests__/` et `src/features/account/__tests__/Account.spec.ts` ; le décor des sept saisons dans
// le build, par `e2e/theme-season.spec.ts` (« à 360 × 640, pour chaque saison ») ; l'interrupteur de bout en bout (rechargement réel),
// par le même fichier (écran « Moi »).
import { expect, IN_SEASON, test, type Page, viewportTag } from './support/test'

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
  })
}

test.describe('chargement à la demande', () => {
  // Un fichier de décor est un module à part (`art/<saison>/<pièce>.svg`) : le serveur de développement le sert sous son chemin, le
  // build sous le nom de la pièce suivi d'une empreinte.
  const piece = /season\/art\/[\w-]+\/|\/assets\/season\/[\w-]+\.js/

  test('hors saison, ni pièce ni fichier de décor, sur la connexion, « Moi » et les recettes', async ({
    page,
  }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (piece.test(request.url())) requested.push(request.url())
    })
    // L'écran de connexion d'abord, sans session ; puis la session est posée pour les écrans connectés
    await page.goto('/connexion')
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
    await fakeBack(page)
    await page.goto('/moi')
    await expect(page.getByRole('heading', { name: 'Thème' })).toBeVisible()
    // Comme avant : ni coin, ni scène, ni pièce décorative
    await expect(corner(page)).toHaveCount(0)
    await expect(scene(page)).toHaveCount(0)
    await expect(page.locator('svg[focusable="false"]')).toHaveCount(0)
    await page.goto('/recettes')
    await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()

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

    // L'état vide est le parent de la phrase ; sa pièce est l'enfant qui la précède. La pièce arrive après un import dynamique et pousse
    // alors la phrase vers le bas : on attend qu'elle soit là et que la mise en page ait fini de bouger avant de mesurer.
    const phrase = page.getByText('Rien à acheter pour l', { exact: false }).first()
    await expect(phrase).toBeVisible()
    const art = phrase.locator('xpath=..').locator(':scope > span[aria-hidden="true"] svg')
    await expect(art).toBeVisible()
    await expect
      .poll(async () => (await art.boundingBox())?.height ?? 0, {
        message: 'la pièce fait au moins 120 px',
      })
      .toBeGreaterThanOrEqual(120)
    await expect
      .poll(
        async () => {
          const artBox = await art.boundingBox()
          const phraseBox = await phrase.boundingBox()

          return (
            artBox !== null && phraseBox !== null && artBox.y + artBox.height <= phraseBox.y + 1
          )
        },
        { message: 'la pièce est au-dessus de la phrase' },
      )
      .toBe(true)
  })
})

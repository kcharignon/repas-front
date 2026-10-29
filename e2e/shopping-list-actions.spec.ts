// Les actions de l'en-tête d'une liste tiennent sur UNE rangée, même à 320 px : l'action principale de l'état de la liste, au plus une
// action secondaire, et « ⋮ » (« Plus d'actions ») pour le reste. Sans back : l'API est simulée par `page.route`.
// Il ne reste ici que ce qui exige un vrai navigateur : la mise en page de la rangée et du menu (largeurs, débordement, cibles de 44 px,
// grands caractères), le clavier réel (Tab, focus) et l'accessibilité (contraste, WCAG AA) dans les DEUX thèmes. Les actions de chaque
// état, les appels qu'elles font, la confirmation de suppression et le menu lui-même sont prouvés en jsdom (ShoppingListSent.spec.ts,
// ShoppingLists.spec.ts, UiActionMenu.spec.ts). `E2E_SHOTS=<dossier>` garde des captures de chaque étape.
import { expect, test, type Page, type Route, BUREAU_SEUL } from './support/test'

import { fakeApp } from './support/drive'
import { axeBothThemes, switchTheme, violations } from './support/screen'

const shots = process.env.E2E_SHOTS

async function shot(page: Page, name: string, width: number) {
  if (shots === undefined) return
  await page.screenshot({ path: `${shots}/${name}.png`, clip: { x: 0, y: 0, width, height: 420 } })
}

type Status = 'ACTIVE' | 'PAUSED' | 'SENT' | 'COMPLETED'

const list = (status: Status) => ({
  id: 'l1',
  name: 'Courses du week-end',
  displayName: 'Courses du week-end',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status,
  version: 3,
  isActive: status === 'ACTIVE',
  isPaused: status === 'PAUSED',
  isCompleted: status === 'COMPLETED',
  isSent: status === 'SENT',
  sentAt: status === 'SENT' ? '2026-10-15T18:30:00+02:00' : null,
  rowCount: 2,
  recipeCount: 1,
  departments: [
    {
      slug: 'divers',
      name: 'Divers',
      image: 'images/department/divers.png',
      rows: [
        { id: 'r1', ingredientName: 'Sel', quantity: 5, unitSymbol: 'g', checked: false },
        { id: 'r2', ingredientName: 'Farine', quantity: 1, unitSymbol: 'kg', checked: true },
      ],
    },
  ],
  recipeTypes: [
    {
      slug: 'plat',
      name: 'Plat',
      image: 'images/type/plat.png',
      meals: [{ id: 'm1', recipeId: 'rec1', recipeName: 'Gratin', serving: 4 }],
    },
  ],
})

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

/** Un faux back : une liste dont le statut suit pause, fin et reprise. Rend les appels reçus. */
async function fakeBack(page: Page, initial: Status) {
  let status = initial
  const received: string[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.push(key)
      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER'],
            isAdmin: false,
            defaultServing: 4,
          })
        case 'GET /api/v1/shopping-lists/l1':
          return reply(route, list(status))
        case 'GET /api/v1/drive/settings':
          return reply(route, {
            enabled: true,
            retailer: 'leclerc',
            store: {
              id: '123456',
              label: null,
              baseUrl: 'https://courses-test.leclercdrive.fr/magasin-123456-123456',
            },
          })
        case 'POST /api/v1/shopping-lists/l1/pause':
          status = 'PAUSED'
          return reply(route)
        case 'POST /api/v1/shopping-lists/l1/complete':
          status = 'COMPLETED'
          return reply(route)
        case 'POST /api/v1/shopping-lists/l1/activate':
          status = 'ACTIVE'
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return received
}

const more = (page: Page) => page.getByRole('button', { name: 'Plus d’actions' })

/** Les actions visibles de la rangée, dans l'ordre : leur nom, leur boîte, et si leur libellé déborde. */
const rowOf = (page: Page) =>
  page.locator('[data-test="list-actions"]').evaluate((row) =>
    [...row.querySelectorAll<HTMLElement>('a, button')]
      .filter((action) => getComputedStyle(action).visibility !== 'hidden')
      .map((action) => {
        const box = action.getBoundingClientRect()

        return {
          name: action.getAttribute('aria-label') ?? action.textContent.trim(),
          top: box.top,
          left: box.left,
          right: box.right,
          height: box.height,
          width: box.width,
          overflows: action.scrollWidth > action.clientWidth,
        }
      }),
  )

const scenarios = [
  {
    name: 'en-cours-envoi',
    status: 'ACTIVE',
    app: true,
    actions: ['Envoyer au drive', 'Terminer', 'Plus d’actions'],
    menu: ['Renommer', 'Mettre en pause', 'Supprimer'],
    // À 320 px, « Terminer » ne tient plus à côté : il passe en tête de « ⋮ »
    narrow: {
      actions: ['Envoyer au drive', 'Plus d’actions'],
      menu: ['Terminer', 'Renommer', 'Mettre en pause', 'Supprimer'],
    },
  },
  {
    name: 'en-cours-sans-envoi',
    status: 'ACTIVE',
    app: false,
    actions: ['Terminer', 'Plus d’actions'],
    menu: ['Renommer', 'Mettre en pause', 'Supprimer'],
  },
  {
    name: 'envoyee',
    status: 'SENT',
    app: true,
    actions: ['Reprendre l’envoi', 'Terminer', 'Plus d’actions'],
    menu: ['Rouvrir la liste', 'Supprimer'],
    narrow: {
      actions: ['Reprendre l’envoi', 'Plus d’actions'],
      menu: ['Terminer', 'Rouvrir la liste', 'Supprimer'],
    },
  },
  {
    name: 'en-pause',
    status: 'PAUSED',
    app: false,
    actions: ['Reprendre cette liste', 'Plus d’actions'],
    menu: ['Renommer', 'Supprimer'],
  },
  {
    name: 'terminee',
    status: 'COMPLETED',
    app: false,
    actions: ['Reprendre cette liste', 'Plus d’actions'],
    menu: ['Renommer', 'Supprimer'],
  },
] as const satisfies {
  name: string
  status: Status
  app: boolean
  actions: readonly string[]
  menu: readonly string[]
  narrow?: { actions: readonly string[]; menu: readonly string[] }
}[]

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

/** Une seule rangée : même hauteur de ligne pour toutes les actions, aucune ne déborde de son libellé ni de l'écran, « ⋮ » fait 44 px. */
async function checkRow(page: Page, expected: readonly string[], width: number) {
  await expect
    .poll(async () => (await rowOf(page)).map((action) => action.name))
    .toEqual([...expected])
  const row = await rowOf(page)
  for (const action of row) {
    expect(Math.abs(action.top - row[0]!.top)).toBeLessThan(1)
    expect(action.height).toBeLessThanOrEqual(48)
    expect(action.overflows).toBe(false)
    expect(action.right).toBeLessThanOrEqual(width - 16 + 0.5)
  }
  expect(row.at(-1)!.width).toBeGreaterThanOrEqual(44)
  expect(row.at(-1)!.height).toBeGreaterThanOrEqual(44)
  await noHorizontalScroll(page)
}

/** Ouvre « ⋮ » : ses actions, dans l'ordre, ouvert vers le bas, aligné à droite, dans l'écran. */
async function checkMenu(page: Page, expected: readonly string[], width: number) {
  await more(page).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveText([...expected])
  const box = (await menu.boundingBox())!
  const trigger = (await more(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y).toBeGreaterThan(trigger.y + trigger.height - 1)
  await noHorizontalScroll(page)
}

// Un état de la liste = un test, une seule visite : 360 px puis 320 px (la rangée se remesure quand la largeur change), thème clair puis
// thème sombre (la page ne se recharge pas). La mise en page ne dépend pas du thème et les couleurs ne dépendent pas de la largeur : ni
// l'une ni l'autre n'a besoin d'être rejouée dans l'autre. L'axe passe fermé et menu ouvert, dans les deux thèmes.
for (const scenario of scenarios) {
  test(`${scenario.name} : une rangée à 360 et à 320 px, rien ne passe à la ligne, le menu tient dans l’écran, accessible dans les deux thèmes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await page.emulateMedia({ colorScheme: 'light' })
    await fakeBack(page, scenario.status)
    if (scenario.app) await fakeApp(page)
    await page.goto('/listes/l1')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (scenario.actions[0] === 'Envoyer au drive')
      await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toBeVisible()
    else await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)

    // 360 px, thème clair
    await checkRow(page, scenario.actions, 360)
    expect(await violations(page), 'rangée fermée, 360 px, thème clair').toEqual([])
    await shot(page, `${scenario.name}-360-light`, 360)
    await checkMenu(page, scenario.menu, 360)
    expect(await violations(page), 'menu ouvert, 360 px, thème clair').toEqual([])
    await shot(page, `${scenario.name}-360-light-menu`, 360)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    // 320 px, le pire cas : certaines actions passent dans « ⋮ »
    const narrow = 'narrow' in scenario ? scenario.narrow : scenario
    await page.setViewportSize({ width: 320, height: 700 })
    await checkRow(page, narrow.actions, 320)
    await shot(page, `${scenario.name}-320-light`, 320)
    await checkMenu(page, narrow.menu, 320)

    // Thème sombre, à 320 px : menu ouvert, puis la rangée fermée
    await switchTheme(page, 'dark')
    expect(await violations(page), 'menu ouvert, 320 px, thème sombre').toEqual([])
    await shot(page, `${scenario.name}-320-dark-menu`, 320)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await violations(page), 'rangée fermée, 320 px, thème sombre').toEqual([])
    await shot(page, `${scenario.name}-320-dark`, 320)
  })
}

test(
  'bureau : les actions se suivent à gauche, « ⋮ » juste après, le menu est accessible dans les deux thèmes',
  { tag: BUREAU_SEUL },
  async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await fakeBack(page, 'ACTIVE')
    await fakeApp(page)
    await page.goto('/listes/l1')
    await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toBeVisible()

    const row = await rowOf(page)
    expect(row.map((action) => action.name)).toEqual([
      'Envoyer au drive',
      'Terminer',
      'Plus d’actions',
    ])
    for (const action of row) expect(Math.abs(action.top - row[0]!.top)).toBeLessThan(1)
    await more(page).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await axeBothThemes(page, 'liste-bureau-menu')
  },
)

test('grands caractères du téléphone (125 %) à 360 px : toujours une rangée, « Terminer » passe dans « ⋮ »', async ({
  page,
}) => {
  await fakeBack(page, 'ACTIVE')
  await fakeApp(page)
  await page.setViewportSize({ width: 360, height: 700 })
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '125%'
    }),
  )
  await page.goto('/listes/l1')
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toBeVisible()

  await expect
    .poll(async () => (await rowOf(page)).map((action) => action.name))
    .toEqual(['Envoyer au drive', 'Plus d’actions'])
  for (const action of await rowOf(page)) expect(action.overflows).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await more(page).click()
  await expect(page.getByRole('menuitem').first()).toHaveText('Terminer')
})

test('le menu au clavier : flèches, Échap rend le focus à « ⋮ », Tab en sort sans piège', async ({
  page,
}) => {
  await fakeBack(page, 'ACTIVE')
  await page.goto('/listes/l1')
  await expect(more(page)).toHaveAttribute('aria-haspopup', 'menu')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')

  await more(page).focus()
  await page.keyboard.press('Enter')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('menuitem', { name: 'Renommer' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Mettre en pause' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Renommer' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more(page)).toBeFocused()

  // Tab ferme le menu et le focus continue sa route
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more(page)).not.toBeFocused()
})

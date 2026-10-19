// Les actions de l'en-tête d'une liste tiennent sur UNE rangée, même à 320 px : l'action principale de l'état de la liste, au plus une
// action secondaire, et « ⋮ » (« Plus d'actions ») pour le reste. Sans back : l'API est simulée par `page.route`. Captures (360 et
// 320 px, clair et sombre, menu fermé et ouvert) dans test-results/, à lire avant de fusionner.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

import { fakeApp } from './support/drive'

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

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

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

for (const width of [360, 320]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const scenario of scenarios) {
      test(`${scenario.name}, ${width} px, thème ${colorScheme} : une rangée, rien ne passe à la ligne, le menu tient dans l’écran`, async ({
        page,
      }, testInfo) => {
        // eslint-disable-next-line playwright/no-skipped-test
        test.skip(testInfo.project.name !== 'mobile', 'largeurs de téléphone')
        await page.setViewportSize({ width, height: 700 })
        await page.emulateMedia({ colorScheme })
        const expected = width < 360 && 'narrow' in scenario ? scenario.narrow : scenario
        await fakeBack(page, scenario.status)
        if (scenario.app) await fakeApp(page)
        await page.goto('/listes/l1')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (scenario.actions[0] === 'Envoyer au drive')
          await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toBeVisible()
        else await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toHaveCount(0)

        // Une seule rangée : même hauteur de ligne pour toutes les actions, aucune ne déborde, la page ne défile pas de côté
        await expect
          .poll(async () => (await rowOf(page)).map((action) => action.name))
          .toEqual([...expected.actions])
        const row = await rowOf(page)
        for (const action of row) {
          expect(Math.abs(action.top - row[0]!.top)).toBeLessThan(1)
          expect(action.height).toBeLessThanOrEqual(48)
          expect(action.overflows).toBe(false)
          expect(action.right).toBeLessThanOrEqual(width - 16 + 0.5)
        }
        expect(row.at(-1)!.width).toBeGreaterThanOrEqual(44)
        expect(row.at(-1)!.height).toBeGreaterThanOrEqual(44)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        expect((await scan(page)).violations).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath(`${scenario.name}-${width}-${colorScheme}.png`),
          clip: { x: 0, y: 0, width, height: 420 },
        })

        // Le menu : ouvert vers le bas, aligné à droite, dans l'écran
        await more(page).click()
        const menu = page.getByRole('menu')
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('menuitem')).toHaveText([...expected.menu])
        const box = (await menu.boundingBox())!
        const trigger = (await more(page).boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(box.y).toBeGreaterThan(trigger.y + trigger.height - 1)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        expect((await scan(page)).violations).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath(`${scenario.name}-${width}-${colorScheme}-menu.png`),
          clip: { x: 0, y: 0, width, height: 420 },
        })
      })
    }
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`bureau, thème ${colorScheme} : les actions se suivent à gauche, « ⋮ » juste après`, async ({
    page,
  }, testInfo) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'écran de bureau')
    await page.emulateMedia({ colorScheme })
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
    expect((await scan(page)).violations).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath(`bureau-${colorScheme}-menu.png`),
      clip: { x: 0, y: 0, width: 1280, height: 420 },
    })
  })
}

test('à 320 px, « Terminer » rangé dans « ⋮ » termine la liste', async ({ page }) => {
  const received = await fakeBack(page, 'ACTIVE')
  await fakeApp(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/listes/l1')
  await expect(page.getByRole('button', { name: 'Envoyer au drive' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Terminer' })).toHaveCount(0)

  await more(page).click()
  await page.getByRole('menuitem', { name: 'Terminer' }).click()

  await expect(page.getByText('Terminée', { exact: true })).toBeVisible()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/complete')
})

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

test('un clic ailleurs ferme le menu', async ({ page }) => {
  await fakeBack(page, 'ACTIVE')
  await page.goto('/listes/l1')

  await more(page).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()

  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
})

test('« Supprimer » du menu ouvre sa confirmation ; l’annuler rend le focus à « ⋮ »', async ({
  page,
}) => {
  await fakeBack(page, 'ACTIVE')
  await page.goto('/listes/l1')

  await more(page).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('Supprimer la liste ?')
  await expect(confirm.locator(':focus')).toHaveCount(1)

  await confirm.getByRole('button', { name: 'Annuler' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(more(page)).toBeFocused()
})

test('« Mettre en pause » du menu met la liste en pause, qui propose alors de la reprendre', async ({
  page,
}) => {
  const received = await fakeBack(page, 'ACTIVE')
  await page.goto('/listes/l1')

  await more(page).click()
  await page.getByRole('menuitem', { name: 'Mettre en pause' }).click()

  await expect(page.getByText('En pause')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reprendre cette liste' })).toBeVisible()
  expect(received).toContain('POST /api/v1/shopping-lists/l1/pause')
})

// Estimation du coût d'une liste (DRV-612) sur la liste de courses et sur l'écran d'envoi, sans back ni compte : l'API est simulée par
// `page.route`. Données inventées. Joué sur bureau et sur Pixel 7.
import { expect, test } from './support/test'
import type { Page } from '@playwright/test'

import { estimate, fakeApp, fakeBack, scan } from './support/drive'

const list = {
  id: 'l1',
  name: 'Courses du week-end',
  displayName: 'Courses du week-end',
  dateLabel: '14 octobre 2026',
  createdAt: '2026-10-14T10:00:00+02:00',
  status: 'ACTIVE',
  version: 3,
  isActive: true,
  isPaused: false,
  isCompleted: false,
  isSent: false,
  sentAt: null,
  rowCount: 2,
  recipeCount: 0,
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
  recipeTypes: [],
}

/** Le faux back des écrans du drive, plus la liste active `l1` pour l'écran de la liste. */
async function withList(page: Page) {
  const calls: string[] = []
  await fakeBack(page)
  await page.route('**/api/v1/shopping-lists/active/summary', (route) =>
    route.fulfill({
      json: { shoppingListId: 'l1', quantityByIngredientSlug: {}, plannedRecipeIds: [] },
    }),
  )
  await page.route('**/api/v1/shopping-lists/l1', (route) => route.fulfill({ json: list }))
  page.on('request', (request) =>
    calls.push(`${request.method()} ${new URL(request.url()).pathname}`),
  )

  return calls
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`sur la liste : total, couverture et détail au clavier, rien d’autre (DRV-628), thème ${colorScheme}`, async ({
    page,
  }) => {
    await withList(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/liste')

    const block = page.getByRole('region', { name: 'Estimation du coût' })
    await expect(block.getByText('Total estimé')).toBeVisible()
    await expect(block.getByText(/^5,72\s€$/)).toBeVisible()
    await expect(block).toContainText('3 articles sur 5 estimés')
    // Le total et le nombre d'articles estimés, rien d'autre : ni date, ni réserve, ni avertissement du back
    await expect(block).not.toContainText(/ne sont pas dans le total|D’après les prix/)
    await expect(block).not.toContainText(estimate.disclaimer)
    await expect(block.getByTestId('low-coverage')).toHaveCount(0)

    // Le détail est replié, se déplie au clavier et nomme les lignes non estimées
    const summary = block.getByText('Voir le détail (6 articles)')
    await expect(block.getByText('Non estimées (2)')).toBeHidden()
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(block.getByText('Non estimées (2)')).toBeVisible()
    await expect(block.getByText('pas de prix connu')).toBeVisible()
    await expect(block.getByText('pas de produit choisi')).toBeVisible()
    await expect(block.getByText('j’en ai toujours').last()).toBeVisible()
    await expect(block.getByText('2 × 0,99 €')).toBeVisible()

    expect((await scan(page)).violations).toEqual([])
  })
}

test('sur l’écran d’envoi : le même bloc, après le bouton et avant les articles', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')

  await expect(page.getByText('Voir les articles')).toBeVisible()
  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block).toContainText('3 articles sur 5 estimés')
  const blockBox = await block.boundingBox()
  const buttonBox = await page.getByRole('button', { name: 'Ouvrir le drive' }).boundingBox()
  const linesBox = await page.getByText('Voir les articles').boundingBox()
  // Le bouton d'abord, puis l'estimation, puis les articles
  expect(buttonBox!.y).toBeLessThan(blockBox!.y)
  expect(blockBox!.y).toBeLessThan(linesBox!.y)
  expect((await scan(page)).violations).toEqual([])
})

test('couverture faible : le compteur suffit, aucun avertissement (DRV-628)', async ({ page }) => {
  await withList(page)
  await page.route('**/api/v1/drive/estimates/l1', (route) =>
    route.fulfill({
      json: { ...estimate, estimatedLines: 1, unestimatedLines: 4, coverage: 0.2 },
    }),
  )
  await page.goto('/liste')

  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block).toContainText('1 article sur 5 estimé')
  await expect(block).not.toContainText(/fiable|moitié/)
  await expect(block.getByTestId('low-coverage')).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])
})

test('aucun prix connu : une seule phrase, ni compteur, ni avertissement, ni détail (DRV-626)', async ({
  page,
}) => {
  await withList(page)
  await page.route('**/api/v1/drive/estimates/l1', (route) =>
    route.fulfill({
      json: {
        ...estimate,
        estimatedTotalCents: 0,
        estimatedLines: 0,
        unestimatedLines: 6,
        coverage: 0,
        oldestPriceAt: null,
        newestPriceAt: null,
        lines: estimate.lines.filter((line) => line.status !== 'ESTIMATED'),
      },
    }),
  )
  await page.goto('/liste')

  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block).toContainText('Pas encore de prix connu.')
  await expect(block.getByRole('paragraph')).toHaveCount(1)
  await expect(block.getByTestId('low-coverage')).toHaveCount(0)
  await expect(block.getByText('Voir le détail')).toHaveCount(0)
  await expect(block).not.toContainText(/estimés|ne sont pas dans le total|Estimation peu fiable/)
  expect((await scan(page)).violations).toEqual([])
})

test('drive coupé : pas de bloc sur la liste', async ({ page }) => {
  await withList(page)
  await page.route('**/api/v1/drive/settings', (route) =>
    route.fulfill({ json: { enabled: false, retailer: 'leclerc', store: null } }),
  )
  await page.goto('/liste')

  await expect(page.getByRole('heading', { level: 1, name: 'Courses du week-end' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Estimation du coût' })).toHaveCount(0)
})

test('panne de l’estimation : message et nouvel essai, la liste reste lisible', async ({
  page,
}) => {
  const calls = await withList(page)
  // Le client relit deux fois une panne du back (1 s puis 2 s) avant d'afficher l'erreur
  let attempts = 0
  await page.route('**/api/v1/drive/estimates/l1', (route) =>
    ++attempts <= 3
      ? route.fulfill({ status: 500, json: { error: { message: 'boom' } } })
      : route.fulfill({ json: estimate }),
  )
  await page.goto('/liste')

  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block.getByRole('alert')).toHaveText(
    'L’estimation n’est pas disponible pour le moment.',
    { timeout: 15_000 },
  )
  await expect(page.getByText('Courses du week-end').first()).toBeVisible()
  await block.getByRole('button', { name: 'Réessayer' }).click()
  await expect(block.getByText(/^5,72\s€$/)).toBeVisible()
  expect(calls.filter((call) => call === 'GET /api/v1/drive/estimates/l1').length).toBeGreaterThan(
    1,
  )
})

// Estimation du coût d'une liste (DRV-612) sur la liste de courses et sur l'écran d'envoi, sans back ni compte : l'API est simulée par
// `page.route`. Données inventées. Joué sur bureau et sur Pixel 7.
import { expect, test } from '@playwright/test'
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
  test(`sur la liste : total, couverture, dates, avertissement et détail au clavier, thème ${colorScheme}`, async ({
    page,
  }) => {
    await withList(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/liste')

    const block = page.getByRole('region', { name: 'Estimation du coût' })
    await expect(block.getByText('Total estimé')).toBeVisible()
    await expect(block.getByText(/^5,72\s€$/)).toBeVisible()
    await expect(block).toContainText('3 articles sur 5 estimés')
    await expect(block).toContainText('2 articles ne sont pas dans le total.')
    await expect(block).toContainText(
      'D’après les prix vus entre le 12 octobre 2026 et le 18 octobre 2026.',
    )
    await expect(block).toContainText(estimate.disclaimer)
    await expect(block.getByTestId('low-coverage')).toHaveCount(0)

    // Le détail est replié, se déplie au clavier et nomme les lignes non estimées
    const summary = block.getByText('Voir le détail (6 lignes)')
    await expect(block.getByText('Non estimées (2)')).toBeHidden()
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(block.getByText('Non estimées (2)')).toBeVisible()
    await expect(block.getByText('pas de prix connu')).toBeVisible()
    await expect(block.getByText('pas de produit choisi')).toBeVisible()
    await expect(block.getByText('déjà à la maison').last()).toBeVisible()
    await expect(block.getByText('2 × 0,99 €')).toBeVisible()

    expect((await scan(page)).violations).toEqual([])
  })
}

test('sur l’écran d’envoi : le même bloc, avant la liste des lignes', async ({ page }) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')

  await expect(page.getByRole('heading', { level: 2, name: 'Votre liste (12)' })).toBeVisible()
  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block).toContainText('3 articles sur 5 estimés')
  const blockBox = await block.boundingBox()
  const linesBox = await page
    .getByRole('heading', { level: 2, name: 'Votre liste (12)' })
    .boundingBox()
  expect(blockBox!.y).toBeLessThan(linesBox!.y)
  expect((await scan(page)).violations).toEqual([])
})

test('couverture faible : l’avertissement est en tête du bloc', async ({ page }) => {
  await withList(page)
  await page.route('**/api/v1/drive/estimates/l1', (route) =>
    route.fulfill({
      json: { ...estimate, estimatedLines: 1, unestimatedLines: 4, coverage: 0.2 },
    }),
  )
  await page.goto('/liste')

  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block.getByTestId('low-coverage')).toContainText('moins de la moitié des articles')
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

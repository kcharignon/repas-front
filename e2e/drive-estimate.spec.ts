// Estimation du coût d'une liste (DRV-612) sur la liste de courses et sur l'écran d'envoi, sans back ni compte : l'API est simulée par
// `page.route`. Données inventées. Jouée sur le téléphone (Pixel 7) seulement.
import { expect, test } from './support/test'
import type { Page } from '@playwright/test'

import { estimate, fakeBack, scan } from './support/drive'
import { switchTheme } from './support/screen'

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

// Le bloc sur la liste : les textes et les états (couverture faible, aucun prix, drive coupé, panne, 429) sont dans `DriveEstimate.spec.ts` ;
// ici ce que seul un navigateur prouve : le détail replié qui s'ouvre au clavier (Entrée sur `<summary>`) et le contraste des deux thèmes.
test('sur la liste : total, couverture et détail au clavier, accessible en clair et en sombre (DRV-628)', async ({
  page,
}) => {
  await withList(page)
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

  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, colorScheme).toEqual([])
  }
})

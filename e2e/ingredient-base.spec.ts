// L'ingrédient de base (ING-015), sans back ni compte : l'API est simulée par `page.route` (support/ingredientsBack.ts, option `base`).
// Le propriétaire du catalogue voit la pastille « de base » dans le rayon et l'interrupteur sur la fiche de son ingrédient. Un seul test, à
// 360 px (le pire cas du téléphone) : pas de défilement horizontal, cible tactile d'au moins 44 px pour l'interrupteur, et l'accessibilité
// (WCAG AA, contraste compris) du rayon et de la fiche dans les DEUX thèmes de la même visite. Marquer, démarquer, ce que voit un autre
// compte, ce qui part au back et le rayon relu après l'enregistrement sont des tests de composant (`Ingredients.spec.ts`).
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page } from './support/test'
import { axeBothThemes } from './support/screen'

import { fakeIngredientsBack } from './support/ingredientsBack'

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })
const baseSwitch = (page: Page) => page.getByRole('switch', { name: 'Ingrédient de base' })

test('le rayon et la fiche de l’ingrédient de base sont accessibles dans les deux thèmes, sans défilement horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await fakeIngredientsBack(page, { base: { owner: true, isBase: true } })
  await page.goto('/rayons/fruit-et-legume')

  // Le rayon : la pastille « de base » sur l'ingrédient marqué
  await expect(row(page, 'Tomates').getByText('de base', { exact: true })).toBeVisible()
  await noHorizontalScroll(page)
  await axeBothThemes(page, 'ingredient-de-base-rayon')

  // La fiche : l'interrupteur est allumé, une vraie cible tactile, un seul bouton principal
  await row(page, 'Tomates')
    .getByRole('link', { name: /^Modifier/ })
    .click()
  await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await noHorizontalScroll(page)
  const box = await baseSwitch(page).boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(1)
  await axeBothThemes(page, 'ingredient-de-base-fiche')
})

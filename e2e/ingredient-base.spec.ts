// L'ingrédient de base (ING-015), sans back ni compte : l'API est simulée par `page.route` (support/ingredientsBack.ts, option `base`).
// Le propriétaire du catalogue règle le marqueur sur la fiche d'un de ses ingrédients et voit la pastille « de base » dans le rayon ;
// tout autre compte ne voit ni l'un ni l'autre. Jouée sur le téléphone (Pixel 7, 412 px), puis à 360 px, en clair et en sombre.
// `E2E_SHOTS=<dossier>` garde des captures à lire.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, viewportTag } from './support/test'

import { fakeIngredientsBack } from './support/ingredientsBack'

const shots = process.env.E2E_SHOTS

async function shot(page: Page, name: string) {
  if (shots === undefined) return
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })
const baseSwitch = (page: Page) => page.getByRole('switch', { name: 'Ingrédient de base' })

test.describe('l’ingrédient de base', () => {
  test('le propriétaire du catalogue marque puis démarque un de ses ingrédients', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page, { base: { owner: true } })
    await page.goto('/rayons/fruit-et-legume')

    // 1. Rien n'est marqué au départ
    await expect(row(page, 'Tomates')).toBeVisible()
    await expect(page.getByText('de base', { exact: true })).toHaveCount(0)
    await shot(page, 'rayon-sans-pastille')

    // 2. La fiche : l'interrupteur est là, éteint, avec son aide ;
    await row(page, 'Tomates')
      .getByRole('link', { name: /^Modifier/ })
      .click()
    await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('Copié dans les nouveaux comptes.')).toBeVisible()
    await shot(page, 'fiche-interrupteur-eteint')

    // 3. On l'allume et on enregistre : un seul bouton, le corps porte isBase
    await baseSwitch(page).click()
    await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await shot(page, 'fiche-interrupteur-allume')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    // 4. De retour dans le rayon : la pastille est là, lisible aussi sans la voir
    await expect(page.getByRole('heading', { level: 1, name: 'Fruit & légume' })).toBeVisible()
    await expect(row(page, 'Tomates').getByText('de base', { exact: true })).toBeVisible()
    await expect(row(page, 'Sel').getByText('de base')).toHaveCount(0)
    await shot(page, 'rayon-avec-pastille')
    expect((back.bodyOf('PUT /api/v1/ingredients/tomates') as { isBase: boolean }).isBase).toBe(
      true,
    )

    // 5. On la retire : l'interrupteur reflète l'état, l'envoi porte false, la pastille disparaît
    await row(page, 'Tomates')
      .getByRole('link', { name: /^Modifier/ })
      .click()
    await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await baseSwitch(page).click()
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fruit & légume' })).toBeVisible()
    await expect(page.getByText('de base', { exact: true })).toHaveCount(0)
    expect(back.keys().filter((key) => key === 'PUT /api/v1/ingredients/tomates').length).toBe(2)
  })

  test('sans y toucher, l’enregistrement n’envoie pas isBase', async ({ page }) => {
    const back = await fakeIngredientsBack(page, { base: { owner: true, isBase: true } })
    await page.goto('/ingredients/tomates/modifier')

    await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fruit & légume' })).toBeVisible()

    expect(back.bodyOf('PUT /api/v1/ingredients/tomates')).not.toHaveProperty('isBase')
  })

  test('un autre compte ne voit ni interrupteur ni pastille et envoie ce qu’il envoyait avant', async ({
    page,
  }) => {
    // Même si la base porte un marqueur, le back ne le montre qu'au propriétaire du catalogue
    const back = await fakeIngredientsBack(page, { base: { owner: false, isBase: true } })
    await page.goto('/rayons/fruit-et-legume')

    await expect(row(page, 'Tomates')).toBeVisible()
    await expect(page.getByText('de base', { exact: true })).toHaveCount(0)

    await row(page, 'Tomates')
      .getByRole('link', { name: /^Modifier/ })
      .click()
    await expect(page.getByLabel("Nom de l'ingrédient")).toHaveValue('Tomates')
    await expect(page.getByRole('switch')).toHaveCount(0)
    await expect(page.getByText('Copié dans les nouveaux comptes.')).toHaveCount(0)
    await shot(page, 'fiche-autre-compte')

    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fruit & légume' })).toBeVisible()
    expect(back.bodyOf('PUT /api/v1/ingredients/tomates')).not.toHaveProperty('isBase')
  })

  test('à la création, il n’y a pas d’interrupteur', async ({ page }) => {
    await fakeIngredientsBack(page, { base: { owner: true } })
    await page.goto('/ingredients/nouveau?rayon=fruit-et-legume')

    await expect(page.getByRole('heading', { level: 1, name: 'Nouvel ingrédient' })).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [360, 412, 1280]) {
      test(
        `accessible, sans défilement horizontal, ${width} px, thème ${colorScheme}`,
        { tag: viewportTag({ width }) },
        async ({ page }) => {
          await page.emulateMedia({ colorScheme })
          await page.setViewportSize({ width, height: 800 })
          await fakeIngredientsBack(page, { base: { owner: true, isBase: true } })
          await page.goto('/rayons/fruit-et-legume')

          await expect(row(page, 'Tomates').getByText('de base', { exact: true })).toBeVisible()
          await noHorizontalScroll(page)
          expect((await scan(page)).violations).toEqual([])
          await shot(page, `rayon-${width}-${colorScheme}`)

          await row(page, 'Tomates')
            .getByRole('link', { name: /^Modifier/ })
            .click()
          await expect(baseSwitch(page)).toHaveAttribute('aria-checked', 'true')
          await noHorizontalScroll(page)
          expect((await scan(page)).violations).toEqual([])

          // Une cible tactile d'au moins 44 px, un seul bouton principal
          const box = await baseSwitch(page).boundingBox()
          expect(box?.height).toBeGreaterThanOrEqual(44)
          expect(box?.width).toBeGreaterThanOrEqual(44)
          await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(1)
          await shot(page, `fiche-${width}-${colorScheme}`)

          // Éteint
          await baseSwitch(page).click()
          await shot(page, `fiche-eteint-${width}-${colorScheme}`)
        },
      )
    }
  }
})

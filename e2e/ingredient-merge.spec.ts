// Doublons possibles et fusion de deux ingrédients (ING-007), sans back ni compte : l'API est simulée par `page.route` (support/ingredientsBack.ts),
// avec les cas réels de la production (« Melon » en double, « Épice guacamole », « Pâte » et « Pâte-2 »), des noms inventés.
// Il ne reste ici que ce qui exige un vrai navigateur : le parcours de bout en bout avec le bundle réel (page Rayons -> doublons -> fusion),
// les flèches du clavier, et l'accessibilité (contraste, WCAG AA) et la mise en page à 360 px de chaque écran, dans les DEUX thèmes de la même visite.
// Les textes, les refus, les erreurs et les compteurs sont prouvés en jsdom : Duplicates.spec.ts, DuplicatesLink.spec.ts,
// MergeConfirmSheet.spec.ts, MergeFromRecord.spec.ts (src/features/ingredients/__tests__). `E2E_SHOTS=<dossier>` garde des captures à lire.
import { expect, test, type Page } from './support/test'

import { axeBothThemes } from './support/screen'
import { fakeIngredientsBack } from './support/ingredientsBack'

const shots = process.env.E2E_SHOTS

async function shot(page: Page, name: string) {
  if (shots === undefined) return
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

const cards = (page: Page) => page.getByTestId('duplicate-card')

test.describe('la page « Doublons possibles »', () => {
  test('de la page Rayons à la fusion : trois touches, une carte en moins, un message', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page)
    await page.goto('/rayons')

    // 1. Le lien n'apparaît que s'il y a des doublons
    await page.getByRole('link', { name: '3 doublons possibles' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Doublons possibles' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Rayons' })).toBeVisible()
    await expect(page.getByText('Ces ingrédients se ressemblent dans le même rayon.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Fruit & légume', 'Épicerie'])
    await expect(cards(page)).toHaveCount(3)

    // 2. La première carte est ouverte : « Melon » à garder, rien ne bouge sans appel réseau
    const first = cards(page).first()
    await expect(first.getByRole('radio')).toHaveCount(2)
    await expect(first.getByRole('radio').first()).toBeChecked()
    await expect(first.getByText('À garder', { exact: true })).toHaveCount(1)
    await noHorizontalScroll(page)
    await shot(page, 'doublons-liste')

    // 3. Fusionner : l'aperçu est demandé à l'ouverture de la confirmation
    await first.getByRole('button', { name: /^Fusionner/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Fusionner « Melon » dans « Melon » ?' })
    await expect(sheet.getByText('Tes quantités ne changent pas.')).toBeVisible()
    await expect(sheet.getByRole('listitem')).toHaveCount(3)
    expect(back.keys().filter((key) => key.endsWith('/merge-preview'))).toEqual([
      'GET /api/v1/ingredients/melon-2/merge-preview',
    ])
    await noHorizontalScroll(page)
    const primary = sheet.getByRole('button', { name: 'Fusionner', exact: true })
    await expect(primary).toBeInViewport()
    expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await shot(page, 'confirmation')
    await primary.click()

    // 4. La carte disparaît, le message est annoncé, la liste est relue
    await expect(sheet).toBeHidden()
    await expect(cards(page)).toHaveCount(2)
    await expect(
      page.getByRole('status').filter({ hasText: 'Fusionné dans « Melon ».' }),
    ).toBeVisible()
    expect(back.bodyOf('POST /api/v1/ingredients/melon-2/merge')).toEqual({ into: 'melon' })
    expect(back.keys().filter((key) => key.endsWith('/duplicates'))).toHaveLength(2)
    // Le focus revient au titre : la carte qui l'avait n'existe plus
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

    // 5. Le compteur de la page Rayons a baissé
    await page.getByRole('main').getByRole('link', { name: 'Rayons' }).click()
    await expect(page.getByRole('link', { name: '2 doublons possibles' })).toBeVisible()
  })

  test('se parcourt au clavier : flèches entre les deux lignes, Entrée sur Fusionner, Échap referme', async ({
    page,
  }) => {
    await fakeIngredientsBack(page)
    await page.goto('/ingredients/doublons')
    const first = cards(page).first()

    await first.getByRole('radio').first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(first.getByRole('radio').nth(1)).toBeChecked()
    await expect(first.getByTestId('duplicate-effect')).toHaveText('1 recette passe sur « Melon ».')

    const merge = first.getByRole('button', { name: /^Fusionner/ })
    await merge.focus()
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(merge).toBeFocused()
  })
})

// Chaque écran est préparé une fois, mesuré (débordement, bouton principal dans l'écran et d'au moins 44 px), puis scanné dans le thème
// clair et dans le thème sombre sans recharger la page. 360 px : la plus étroite des largeurs de téléphone ; le parcours ci-dessus joue 412 px.
async function prepare(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await fakeIngredientsBack(page, {
    previews: {
      'epice-guacamole>epice-pour-guacamole': {
        blockedBy: 'UNIT_MISSING',
        canMerge: false,
        missingUnits: [{ slug: 'tranche', name: 'tranche' }],
      },
      'pate-2>pate': { recoveredConversionCount: 2, listQuantitiesConverted: true },
    },
  })
}

test('accessibilité (WCAG A/AA) et mise en page à 360 px : Rayons, doublons et confirmation, thèmes clair et sombre de la même visite', async ({
  page,
}) => {
  await prepare(page)

  // La page Rayons et son lien
  await page.goto('/rayons')
  await expect(page.getByRole('link', { name: '3 doublons possibles' })).toBeVisible()
  await noHorizontalScroll(page)
  await axeBothThemes(page, 'rayons')

  // La liste des doublons : la première carte ouverte, les autres repliées
  await page.goto('/ingredients/doublons')
  await expect(cards(page)).toHaveCount(3)
  await noHorizontalScroll(page)
  await axeBothThemes(page, 'doublons')

  // La confirmation, dans le cas normal : le bouton principal se voit sans défiler, il fait au moins 44 px
  await cards(page)
    .first()
    .getByRole('button', { name: /^Fusionner/ })
    .click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Tes quantités ne changent pas.')).toBeVisible()
  await noHorizontalScroll(page)
  const primary = sheet.getByRole('button', { name: 'Fusionner', exact: true })
  await expect(primary).toBeInViewport()
  expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await axeBothThemes(page, 'confirmation')
})

test('accessibilité (WCAG A/AA) et mise en page à 360 px : unité manquante, conversions et choix de la fiche, thèmes clair et sombre de la même visite', async ({
  page,
}) => {
  await prepare(page)
  await page.goto('/ingredients/doublons')
  await expect(cards(page)).toHaveCount(3)

  // Quand une unité manque
  await cards(page)
    .nth(1)
    .getByRole('button', { name: /^Voir et fusionner/ })
    .click()
  await cards(page)
    .nth(1)
    .getByRole('button', { name: /^Fusionner/ })
    .click()
  await expect(page.getByRole('dialog').getByText(/ne connaît pas toutes les unités/)).toBeVisible()
  await noHorizontalScroll(page)
  await axeBothThemes(page, 'unite')

  // La confirmation la plus longue : le total, le remplacé, les conversions et celles des listes
  await page.goto('/ingredients/doublons')
  await cards(page)
    .nth(2)
    .getByRole('button', { name: /^Voir et fusionner/ })
    .click()
  await cards(page)
    .nth(2)
    .getByRole('button', { name: /^Fusionner/ })
    .click()
  const longest = page.getByRole('dialog')
  await expect(longest.getByText(/sont ajoutées à/)).toBeVisible()
  await expect(longest.getByRole('listitem')).toHaveCount(5)
  await noHorizontalScroll(page)
  await expect(longest.getByRole('button', { name: 'Fusionner', exact: true })).toBeInViewport()
  await axeBothThemes(page, 'conversions')

  // La feuille de choix de la fiche
  await page.goto('/ingredients/tomates/modifier')
  await page.getByRole('button', { name: 'Fusionner avec un autre ingrédient' }).click()
  await page.getByRole('searchbox').fill('tomate')
  await expect(page.getByText('Très proche')).toBeVisible()
  await noHorizontalScroll(page)
  await axeBothThemes(page, 'fiche')
})

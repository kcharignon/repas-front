// Doublons possibles et fusion de deux ingrédients (ING-007), sans back ni compte : l'API est simulée par `page.route` (support/ingredientsBack.ts),
// avec les cas réels de la production (« Melon » en double, « Épice guacamole », « Pâte » et « Pâte-2 »), des noms inventés.
// Jouée sur bureau et sur Pixel 7 (412 px) ; les parcours sont aussi rejoués à 360 px. `E2E_SHOTS=<dossier>` garde des captures à lire.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { fakeIngredientsBack, productionPairs } from './support/ingredientsBack'

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
    await shot(page, 'doublons-liste')

    // 3. Fusionner : l'aperçu est demandé à l'ouverture de la confirmation
    await first.getByRole('button', { name: /^Fusionner/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Fusionner « Melon » dans « Melon » ?' })
    await expect(sheet.getByText('Tes quantités ne changent pas.')).toBeVisible()
    await expect(sheet.getByRole('listitem')).toHaveCount(3)
    expect(back.keys().filter((key) => key.endsWith('/merge-preview'))).toEqual([
      'GET /api/v1/ingredients/melon-2/merge-preview',
    ])
    await shot(page, 'confirmation')
    await sheet.getByRole('button', { name: 'Fusionner', exact: true }).click()

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

  test('toucher l’autre ligne bascule « À garder » et la phrase d’effet, sans appel réseau', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page)
    await page.goto('/ingredients/doublons')
    await cards(page)
      .nth(1)
      .getByRole('button', { name: /^Voir et fusionner/ })
      .click()
    const card = cards(page).nth(1)
    const effect = card.getByTestId('duplicate-effect')

    // Le back suggère « Épice pour guacamole » (5 recettes) : l'autre passe dessus
    await expect(card.getByRole('radio', { name: /Épice pour guacamole/ })).toBeChecked()
    await expect(effect).toHaveText('2 recettes et 1 liste passent sur « Épice pour guacamole ».')
    await expect(cards(page).first().getByRole('radio')).toHaveCount(0)
    const before = back.keys().length

    await card.getByText('Épice guacamole', { exact: true }).click()

    await expect(card.getByRole('radio', { name: /Épice guacamole/ })).toBeChecked()
    await expect(effect).toHaveText('5 recettes et 2 listes passent sur « Épice guacamole ».')
    await expect(card.getByText('À garder', { exact: true })).toHaveCount(1)
    expect(back.keys()).toHaveLength(before)
    await shot(page, 'doublons-bascule')

    // Fusionner garde ce que l'utilisateur a choisi
    await card.getByRole('button', { name: /^Fusionner/ }).click()
    await expect(page.getByRole('dialog')).toContainText(
      'Fusionner « Épice pour guacamole » dans « Épice guacamole » ?',
    )
    expect(back.keys()).toContain('GET /api/v1/ingredients/epice-pour-guacamole/merge-preview')
    expect(back.received.at(-1)?.query).toBe('?into=epice-guacamole')
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

  test('« Pas le même » retire la carte tout de suite et ne la remet pas au rechargement', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page)
    await page.goto('/ingredients/doublons')

    await cards(page)
      .first()
      .getByRole('button', { name: /^Pas le même/ })
      .click()

    await expect(cards(page)).toHaveCount(2)
    await expect(
      page.getByRole('status').filter({ hasText: 'Ces deux ingrédients restent séparés.' }),
    ).toBeVisible()
    expect(back.bodyOf('POST /api/v1/ingredients/melon/distinct-from')).toEqual({
      other: 'melon-2',
    })
    await page.reload()
    await expect(cards(page)).toHaveCount(2)
    await expect(page.getByText('Melon')).toHaveCount(0)
  })

  test('dit une phrase courte quand il n’y a aucun doublon, et le lien de Rayons disparaît', async ({
    page,
  }) => {
    await fakeIngredientsBack(page, { pairs: [] })
    await page.goto('/rayons')
    await expect(page.getByRole('link', { name: /doublon/ })).toHaveCount(0)

    await page.goto('/ingredients/doublons')

    await expect(page.getByText('Aucun doublon pour le moment.')).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
  })

  test('dit « plus de 49 » quand le back atteint son plafond de 50 paires', async ({ page }) => {
    const many = Array.from({ length: 50 }, (_, index) => ({
      ...productionPairs()[0]!,
      first: { ...productionPairs()[0]!.first, slug: `a${index}`, name: `Ingrédient ${index}` },
      second: {
        ...productionPairs()[0]!.second,
        slug: `b${index}`,
        name: `Ingrédient ${index} bis`,
      },
      suggestedKeep: `a${index}`,
    }))
    await fakeIngredientsBack(page, { pairs: many })

    await page.goto('/rayons')

    await expect(page.getByRole('link', { name: 'Plus de 49 doublons possibles' })).toBeVisible()
  })
})

test.describe('la confirmation de la fusion', () => {
  test('quand une unité manque : explique, mène à l’ingrédient gardé, sans bouton « Fusionner »', async ({
    page,
  }) => {
    await fakeIngredientsBack(page, {
      previews: {
        'melon-2>melon': {
          blockedBy: 'UNIT_MISSING',
          canMerge: false,
          missingUnits: [{ slug: 'tranche', name: 'tranche' }],
        },
      },
    })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()

    const sheet = page.getByRole('dialog', { name: '« Melon » ne connaît pas toutes les unités.' })
    await expect(
      sheet.getByText(
        'La quantité en « tranche » ne peut pas être convertie en « kilo ». Rien n’a changé.',
      ),
    ).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Fusionner', exact: true })).toHaveCount(0)
    await shot(page, 'confirmation-unite')

    await sheet.getByRole('link', { name: 'Modifier « Melon »' }).click()
    await expect(page).toHaveURL(/\/ingredients\/melon\/modifier$/)
  })

  test('quand une liste envoyée au drive utilise l’un des deux : une phrase et « Compris »', async ({
    page,
  }) => {
    await fakeIngredientsBack(page, {
      previews: { 'melon-2>melon': { blockedBy: 'IN_SENT_LIST', canMerge: false } },
    })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()

    const sheet = page.getByRole('dialog')
    await expect(
      sheet.getByText(
        'Une liste envoyée au drive utilise l’un des deux. Rouvre-la ou termine-la, puis fusionne.',
      ),
    ).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Fusionner', exact: true })).toHaveCount(0)
    await shot(page, 'confirmation-liste-envoyee')
    await sheet.getByRole('button', { name: 'Compris' }).click()
    await expect(sheet).toBeHidden()
  })

  test('un refus que le front ne connaît pas se lit comme un refus général', async ({ page }) => {
    await fakeIngredientsBack(page, {
      previews: { 'melon-2>melon': { blockedBy: 'UN_REFUS_DE_DEMAIN', canMerge: false } },
    })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()

    await expect(
      page.getByRole('dialog').getByText('Ces deux ingrédients ne peuvent pas être fusionnés.'),
    ).toBeVisible()
  })

  test('dit la conversion des quantités en liste', async ({ page }) => {
    await fakeIngredientsBack(page, {
      previews: { 'melon-2>melon': { listQuantitiesConverted: true } },
    })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()

    await expect(
      page.getByRole('dialog').getByText('Tes quantités en liste sont converties en « kilo ».'),
    ).toBeVisible()
  })

  test('un conflit pendant la fusion : une phrase, l’aperçu relu, et on réessaie', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page, {
      mergeAnswers: [{ status: 409, message: 'INGREDIENT_MERGE_CONFLICT' }],
    })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'Fusionner', exact: true }).click()

    await expect(sheet.getByRole('alert')).toHaveText(
      'Quelque chose a changé pendant la fusion. Réessaie.',
    )
    await shot(page, 'confirmation-conflit')
    await expect
      .poll(() => back.keys().filter((key) => key.endsWith('/merge-preview')).length)
      .toBe(2)

    await sheet.getByRole('button', { name: 'Fusionner', exact: true }).click()
    await expect(sheet).toBeHidden()
    await expect(cards(page)).toHaveCount(2)
  })

  test('un ingrédient disparu (404) : la feuille se ferme et la liste se relit', async ({
    page,
  }) => {
    await fakeIngredientsBack(page, { mergeAnswers: [{ status: 404 }] })
    await page.goto('/ingredients/doublons')
    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'Fusionner', exact: true }).click()

    await expect(sheet).toBeHidden()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Cet ingrédient n’existe plus. La liste est à jour.' }),
    ).toBeVisible()
  })
})

test.describe('la fusion depuis la fiche', () => {
  test('recherche, choix, confirmation, fusion, puis le rayon de l’ingrédient gardé', async ({
    page,
  }) => {
    const back = await fakeIngredientsBack(page)
    await page.goto('/ingredients/tomates/modifier')

    await expect(page.getByTestId('ingredient-usage')).toHaveText(
      'Utilisé dans 7 recettes · 2 listes',
    )
    await page.getByRole('button', { name: 'Fusionner avec un autre ingrédient' }).click()

    const picker = page.getByRole('dialog', { name: 'Fusionner « Tomates » avec…' })
    await expect(
      picker.getByText(
        '« Tomates » disparaît : ses recettes et ses listes passent sur l’ingrédient choisi.',
      ),
    ).toBeVisible()
    await expect(picker.getByRole('searchbox')).toHaveValue('tomates')
    // « tomates » ne ressemble à rien tel quel : on efface pour voir les candidats
    await picker.getByRole('searchbox').fill('tomate')
    await expect(picker.getByRole('heading', { level: 3 })).toHaveText([
      'Dans le même rayon · Fruit & légume',
      'Autres rayons',
    ])
    await expect(picker.getByText('Très proche')).toBeVisible()
    await shot(page, 'fiche-choix')
    await picker.getByRole('searchbox').fill('cerise')
    await expect(picker.getByRole('button')).toHaveCount(2) // « Tomate cerise » et le bouton de fermeture
    await picker.getByRole('button', { name: /Tomate cerise/ }).click()

    const sheet = page.getByRole('dialog', {
      name: 'Fusionner « Tomates » dans « Tomate cerise » ?',
    })
    await expect(sheet.getByText('Tes quantités ne changent pas.')).toBeVisible()
    expect(back.keys()).toContain('GET /api/v1/ingredients/tomates/merge-preview')
    await sheet.getByRole('button', { name: 'Fusionner', exact: true }).click()

    // Jamais l'ancienne adresse de l'absorbé : le rayon de l'ingrédient gardé
    await expect(page).toHaveURL(/\/rayons\/[a-z-]+$/)
    expect(back.bodyOf('POST /api/v1/ingredients/tomates/merge')).toEqual({ into: 'tomate-cerise' })
    await expect(
      page.getByRole('status').filter({ hasText: 'Fusionné dans « Tomate cerise ».' }),
    ).toBeVisible()
  })

  test('ne propose aucun bouton « Fusionner » pour un ingrédient commun', async ({ page }) => {
    await fakeIngredientsBack(page)
    await page.goto('/ingredients/sel/modifier')

    await expect(page.getByLabel("Nom de l'ingrédient")).toHaveValue('Sel')
    await expect(page.getByRole('button', { name: /Fusionner/ })).toHaveCount(0)
    await expect(page.getByTestId('ingredient-usage')).toHaveCount(0)
  })

  test('ne propose aucun bouton « Fusionner » pour un nouvel ingrédient', async ({ page }) => {
    await fakeIngredientsBack(page)
    await page.goto('/ingredients/nouveau?rayon=epicerie')

    await expect(page.getByLabel("Nom de l'ingrédient")).toBeVisible()
    await expect(page.getByRole('button', { name: /Fusionner/ })).toHaveCount(0)
  })
})

for (const width of [360, 412]) {
  test(`à ${width} px : aucun défilement horizontal et un seul bouton principal par feuille`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 })
    await fakeIngredientsBack(page)
    await page.goto('/ingredients/doublons')
    await expect(cards(page)).toHaveCount(3)
    await noHorizontalScroll(page)
    await shot(page, `doublons-${width}`)

    await cards(page)
      .first()
      .getByRole('button', { name: /^Fusionner/ })
      .click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Tes quantités ne changent pas.')).toBeVisible()
    await noHorizontalScroll(page)
    // Le bouton principal est visible sans défiler
    const primary = sheet.getByRole('button', { name: 'Fusionner', exact: true })
    await expect(primary).toBeInViewport()
    const box = await primary.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    await shot(page, `confirmation-${width}`)
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [360, 1280]) {
    test(`accessibilité (WCAG A/AA), thème ${colorScheme}, ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await fakeIngredientsBack(page, {
        previews: {
          'epice-guacamole>epice-pour-guacamole': {
            blockedBy: 'UNIT_MISSING',
            canMerge: false,
            missingUnits: [{ slug: 'tranche', name: 'tranche' }],
          },
        },
      })

      // La page Rayons et son lien
      await page.goto('/rayons')
      await expect(page.getByRole('link', { name: '3 doublons possibles' })).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      await shot(page, `rayons-${colorScheme}-${width}`)

      // La liste des doublons : la première carte ouverte, les autres repliées
      await page.goto('/ingredients/doublons')
      await expect(cards(page)).toHaveCount(3)
      expect((await scan(page)).violations).toEqual([])
      await shot(page, `doublons-${colorScheme}-${width}`)

      // La confirmation, dans le cas normal puis quand une unité manque
      await cards(page)
        .first()
        .getByRole('button', { name: /^Fusionner/ })
        .click()
      await expect(
        page.getByRole('dialog').getByText('Tes quantités ne changent pas.'),
      ).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      await shot(page, `confirmation-${colorScheme}-${width}`)
      await page.keyboard.press('Escape')
      await cards(page)
        .nth(1)
        .getByRole('button', { name: /^Voir et fusionner/ })
        .click()
      await cards(page)
        .nth(1)
        .getByRole('button', { name: /^Fusionner/ })
        .click()
      await expect(
        page.getByRole('dialog').getByText(/ne connaît pas toutes les unités/),
      ).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      await shot(page, `unite-${colorScheme}-${width}`)

      // La feuille de choix de la fiche
      await page.goto('/ingredients/tomates/modifier')
      await page.getByRole('button', { name: 'Fusionner avec un autre ingrédient' }).click()
      await page.getByRole('searchbox').fill('tomate')
      await expect(page.getByText('Très proche')).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      await shot(page, `fiche-${colorScheme}-${width}`)
    })
  }
}

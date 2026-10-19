// Filtrer le choix par rayon du site, de bout en bout (DRV-647, étape 1) : la recherche « carotte » du faux site rend 40 produits de quatre rayons
// (jus 15, conserves 7, surgelés 60, frais 41). La rangée montre « Tous » puis les rayons présents, du plus fourni au moins fourni, avec le libellé que
// l'agent lit dans les données reçues (sLibelleUrlNaviguerRayon, sUrlVoirRayon, objFiltreBloc) ou le repli « Rayon 1 » ; toucher un rayon ne montre que
// ses produits, sans requête ; le rayon appris est choisi d'avance. Données inventées ; le faux site ne prouve pas le vrai.
import type { Page } from '@playwright/test'

import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, planOf } from './support/plans'

const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const

const cardsOf = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Choisir' }) })
const rowOf = (page: Page) => page.getByRole('group', { name: 'Rayons' })

/** Fait défiler jusqu'à ce que la liste ne grandisse plus, et rend les titres des fiches dans l'ordre affiché. */
async function allTitles(page: Page, expected: number): Promise<string[]> {
  const cards = cardsOf(page)
  await expect
    .poll(
      async () => {
        await page.locator('.scroll').evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        return cards.count()
      },
      { timeout: 20_000, intervals: [100, 200] },
    )
    .toBe(expected)
  return cards.locator('.name').allTextContents()
}

test.use({ viewport: { width: 360, height: 640 } })

test('la rangée montre « Tous » et les rayons présents avec leur nombre ; toucher un rayon ne laisse que ses produits, sans requête', async ({
  page,
  fake,
  agentCode,
}, testInfo) => {
  // Given : « carotte », sans rayon appris
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('carotte', 'Carotte', { needed: KILO })]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()

  // Then : « Tous » choisi, puis les rayons du plus fourni au moins fourni, chacun avec son libellé du site ou le repli « Rayon 1 »
  const chips = rowOf(page).getByRole('button')
  await expect(chips).toHaveText([
    'Tous (40)',
    'Boissons sans alcool (12)',
    'Rayon 1 (12)',
    'Surgelés (10)',
    'Fruits et légumes (6)',
  ])
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: testInfo.outputPath('rangee-tous-360.png') })
  const searches = fake.paced().length

  // When : toucher « Surgelés »
  await rowOf(page).getByRole('button', { name: 'Surgelés (10)' }).click()

  // Then : ses 10 produits seulement, et aucune requête de plus
  await expect(rowOf(page).getByRole('button', { name: 'Surgelés (10)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const frozen = await allTitles(page, 10)
  expect(frozen.every((title) => title.startsWith('Poêlée de carottes surgelée'))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('rangee-surgeles-360.png') })

  // When : retoucher « Surgelés », puis « Fruits et légumes », puis « Tous »
  await rowOf(page).getByRole('button', { name: 'Surgelés (10)' }).click()
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()
  await expect(cardsOf(page)).toHaveCount(6)
  await rowOf(page).getByRole('button', { name: 'Tous (40)' }).click()

  // Then : toute la liste revient, dans l'ordre du site ; toujours une seule recherche
  expect((await allTitles(page, 40)).map((title) => Number(title.slice(-2)))).toEqual(
    Array.from({ length: 40 }, (_unused, index) => index + 1),
  )
  expect(fake.paced()).toHaveLength(searches)
  expect(fake.paced().map((call) => call.kind)).toEqual(['search'])
})

test('le rayon appris est choisi d’avance, « Tous » est à un toucher, et le produit choisi après le filtre renvoie son rayon', async ({
  page,
  fake,
  agentCode,
}, testInfo) => {
  // Given : le rayon frais appris (DRV-642)
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('carotte', 'Carotte', { needed: KILO, rayonHints: [41] })]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()

  // Then : « Fruits et légumes » choisi d'avance, ses 6 produits seulement
  const freshChip = rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' })
  await expect(freshChip).toHaveAttribute('aria-pressed', 'true')
  await expect(cardsOf(page)).toHaveCount(6)
  await page.screenshot({ path: testInfo.outputPath('rangee-appris-360.png') })

  // When : « Tous », puis de nouveau le rayon frais, et choisir la première carotte fraîche
  await rowOf(page).getByRole('button', { name: 'Tous (40)' }).click()
  await expect(cardsOf(page)).toHaveCount(8)
  await freshChip.click()
  await cardsOf(page).first().getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)

  // Then : au panier, une seule recherche, et le résultat porte le rayon comme avant (aucune clé nouvelle)
  expect(fake.cart()).toEqual({ 1000093: 1 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart'])
  expectPoliteAgent(fake)
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [{ outcome: 'CHOSEN', product: { id: '1000093', rayonId: 41, familyId: 413 } }],
  })
})

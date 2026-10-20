// Chercher dans le bon rayon, de bout en bout (DRV-642, lot 1b) : la recherche « carotte » du faux site rend 40 produits dont 6 frais (rayon 41)
// dispersés parmi des produits d'autres rayons. Avec le rayon frais conseillé par Repas (`rayonHints`), les 6 frais passent d'abord, aucun produit
// n'est caché, et le produit choisi renvoie son rayon et sa famille. Sans rayon conseillé, l'ordre est celui du site, comme avant.
import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, planOf } from './support/plans'

const FRESH_AISLE = 41
const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const
/** Les rangs, dans l'ordre du site, des 6 produits frais de la recherche « carotte » (numéros de fiche = rang + 1). */
const FRESH_NUMBERS = [6, 12, 20, 21, 34, 40]

const cardsOf = (page: import('@playwright/test').Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Choisir' }) })

/** Fait défiler jusqu'à ce que les 40 fiches soient là, et rend leurs titres dans l'ordre affiché. */
async function allTitles(page: import('@playwright/test').Page): Promise<string[]> {
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
    .toBe(40)
  return cards.locator('.name').allTextContents()
}

test('avec le rayon frais conseillé, les 6 produits frais passent d’abord, les 34 autres suivent dans l’ordre du site, et le produit choisi renvoie son rayon', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : 40 produits « carotte » dont 6 frais, et le rayon frais conseillé pour la ligne
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('carotte', 'Carotte', { needed: KILO, rayonHints: [FRESH_AISLE] })]),
  )

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()

  // Then (DRV-647) : le rayon frais appris est choisi d'avance dans la rangée : seuls ses 6 produits ; « Tous » est à un toucher
  await expect(page.getByRole('button', { name: 'Legumes frais (6)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cardsOf(page)).toHaveCount(6)
  await page.getByRole('button', { name: 'Tous (40)' }).click()

  // And : le premier lot de huit montre déjà les 6 frais, puis deux autres, dans l'ordre du site
  const cards = cardsOf(page)
  await expect(cards).toHaveCount(8)
  const first = await cards.locator('.name').allTextContents()
  expect(first.slice(0, 6).every((title) => title.startsWith('Carottes fraîches'))).toBe(true)
  expect(first.slice(0, 6).map((title) => Number(title.slice(-2)))).toEqual(FRESH_NUMBERS)

  // And : aucun produit n'est caché, les autres restent dans l'ordre du site ; une seule requête
  const titles = await allTitles(page)
  const numbers = titles.map((title) => Number(title.slice(-2)))
  expect(new Set(numbers).size).toBe(40)
  const others = numbers.slice(6)
  expect(others).toEqual([...others].sort((a, b) => a - b))
  expect(others.some((number) => FRESH_NUMBERS.includes(number))).toBe(false)
  expect(fake.paced().map((call) => call.kind)).toEqual(['search'])
  expect(fake.cart()).toEqual({})

  // When : on choisit une carotte fraîche
  await cards.first().getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)

  // Then : au panier, et le résultat porte le rayon et la famille du produit choisi
  expect(fake.cart()).toEqual({ 1000093: 1 })
  expectPoliteAgent(fake)
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [
      {
        ingredientSlug: 'carotte',
        outcome: 'CHOSEN',
        product: { id: '1000093', rayonId: FRESH_AISLE, familyId: 413 },
      },
    ],
  })
})

test('sans rayon conseillé, l’ordre est celui du site, et le produit choisi renvoie quand même son rayon', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le même plan sans `rayonHints`
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('carotte', 'Carotte', { needed: KILO })]),
  )

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()

  // Then : fiche 01, 02, 03… dans l'ordre du site
  const titles = await allTitles(page)
  expect(titles.map((title) => Number(title.slice(-2)))).toEqual(
    Array.from({ length: 40 }, (_unused, index) => index + 1),
  )

  // And : le choix d'un produit non frais renvoie son rayon (conserves, 7)
  await cardsOf(page).nth(1).getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [{ outcome: 'CHOSEN', product: { id: '1000089', rayonId: 7, familyId: 71 } }],
  })
})

test('« Chercher autre chose » est rangé de la même façon', async ({ page, fake, agentCode }) => {
  // Given : un plan dont la recherche de départ ne rend rien d'utile, avec le rayon frais conseillé
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      fresh('legume', 'Légume', { needed: KILO, searchQuery: 'légume', rayonHints: [FRESH_AISLE] }),
    ]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByLabel('Chercher autre chose')).toBeVisible()

  // When : la personne cherche « carotte »
  await page.getByLabel('Chercher autre chose').fill('carotte')
  await page.getByRole('button', { name: 'Chercher', exact: true }).click()

  // Then : les 6 frais d'abord
  await expect(cardsOf(page).first()).toContainText('Carottes fraîches')
  const first = await cardsOf(page).locator('.name').allTextContents()
  expect(first.slice(0, 6).every((title) => title.startsWith('Carottes fraîches'))).toBe(true)
})

// Filtrer le choix par les rayons du site, de bout en bout (DRV-647, 0.36.0) : la recherche « carotte » du faux site rend 40 produits et, comme le vrai site
// (relevé du 2026-10-20), une facette « Rayons » (libellé, nombre de références, enfants, `sIdValeurUrl` de la forme N-N). La rangée montre « Tous » puis ces
// rayons ; toucher un rayon envoie UNE recherche filtrée (`Filtres=<sIdValeurUrl>`, chemin du magasin sans ville, cadence normale), gardée en mémoire ; ses
// enfants forment une seconde rangée. Si la première recherche filtrée ne filtre pas (paramètre ignoré, HTTP 404), la rangée des familles (0.34.0) la
// remplace, sans message. Données inventées ; le faux site ne prouve pas le vrai.
import type { Page } from '@playwright/test'

import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, planOf } from './support/plans'

const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const

const cardsOf = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Choisir' }) })
const rowOf = (page: Page) => page.getByRole('group', { name: 'Rayons', exact: true })
const subRowOf = (page: Page) =>
  page.getByRole('group', { name: 'Rayons de « Fruits et légumes »' })

/** Fait défiler jusqu'à ce que la liste ait [expected] fiches, et rend leurs titres dans l'ordre affiché. */
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

async function openCarrots(
  page: Page,
  fake: Parameters<typeof openWithFragment>[1],
  agentCode: string,
  rayonHints?: number[],
) {
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('carotte', 'Carotte', { needed: KILO, ...(rayonHints && { rayonHints }) })]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()
}

test('la rangée des rayons du site : un toucher, UNE recherche filtrée, ses produits et ses enfants ; « Tous » et le cache sans requête', async ({
  page,
  fake,
  agentCode,
}, testInfo) => {
  // Given : « carotte », avec le rayon frais appris (il ne choisit rien d'avance dans la rangée du site)
  await openCarrots(page, fake, agentCode, [41])

  // Then : « Tous » puis les rayons du site, par nombre de références, avec leur libellé du site
  const chips = rowOf(page).getByRole('button')
  await expect(chips).toHaveText([
    'Tous (40)',
    'Boissons et conserves (12)',
    'Conserves (12)',
    'Surgelés (10)',
    'Fruits et légumes (6)',
  ])
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: testInfo.outputPath('rayons-du-site-360.png') })

  // When : toucher « Fruits et légumes »
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()

  // Then : ses 6 produits, la seconde rangée de ses enfants, UNE recherche filtrée au chemin du magasin sans ville
  await expect(cardsOf(page)).toHaveCount(6)
  const titles = await cardsOf(page).locator('.name').allTextContents()
  expect(titles.every((title) => title.startsWith('Carottes fraîches'))).toBe(true)
  await expect(subRowOf(page).getByRole('button')).toHaveText(['Legumes frais (6)'])
  await page.screenshot({ path: testInfo.outputPath('rayon-choisi-enfants-360.png') })
  const filtered = fake.paced().filter((call) => call.filter !== undefined)
  expect(filtered.map((call) => [call.path, call.filter])).toEqual([
    ['/magasin-000001-000001/recherche.aspx', '4-900041'],
  ])

  // When : « Tous », puis de nouveau « Fruits et légumes » (déjà chargé), puis l'enfant
  await rowOf(page).getByRole('button', { name: 'Tous (40)' }).click()
  expect(await allTitles(page, 40)).toHaveLength(40)
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()
  await expect(cardsOf(page)).toHaveCount(6)
  await subRowOf(page).getByRole('button', { name: 'Legumes frais (6)' }).click()
  await expect(subRowOf(page).getByRole('button', { name: 'Legumes frais (6)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cardsOf(page)).toHaveCount(6)

  // Then : une seule requête pour le rayon, une pour l'enfant ; la cadence est tenue
  // (la requête de l'enfant peut être encore en route quand ses 6 fiches, les mêmes que celles du rayon, sont déjà là)
  await expect
    .poll(() => fake.paced().map((call) => call.filter ?? 'recherche'))
    .toEqual(['recherche', '4-900041', '4-413'])
  await expect(page.getByText('Je cherche…')).toBeHidden()
  expectPoliteAgent(fake)
})

test('un produit choisi dans un rayon du site renvoie son rayonId et sa familyId, comme avant', async ({
  page,
  fake,
  agentCode,
}) => {
  await openCarrots(page, fake, agentCode)
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()
  await expect(cardsOf(page)).toHaveCount(6)

  await cardsOf(page).first().getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)

  expect(fake.cart()).toEqual({ 1000093: 1 })
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [{ outcome: 'CHOSEN', product: { id: '1000093', rayonId: 41, familyId: 413 } }],
  })
  expectPoliteAgent(fake)
})

for (const [name, facetFilter, capture] of [
  ['le site ignore le filtre (les mêmes produits)', 'ignored', true],
  ['le site refuse l’adresse filtrée (HTTP 404)', 'not-found', false],
] as const) {
  test(`repli sur la rangée des familles, sans message, quand ${name}`, async ({
    page,
    fake,
    agentCode,
  }, testInfo) => {
    // Given : une forme d'adresse filtrée qui ne marche pas
    fake.setBehavior({ facetFilter })
    await openCarrots(page, fake, agentCode)

    // When : toucher un rayon du site
    await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()

    // Then : la rangée des familles (0.34.0) la remplace, la liste reste entière, aucun message
    await expect(rowOf(page).getByRole('button')).toHaveText([
      'Tous (40)',
      'Jus de legumes (12)',
      'Rayon 1 (12)',
      'Légumes surgelés (10)',
      'Legumes frais (6)',
    ])
    await expect(page.getByRole('alert')).toBeHidden()
    await page.screenshot({
      path: testInfo.outputPath(capture ? 'repli-familles-360.png' : 'repli-404-360.png'),
    })
    expect(await allTitles(page, 40)).toHaveLength(40)

    // And : la rangée des familles filtre la liste reçue, sans requête
    await rowOf(page).getByRole('button', { name: 'Legumes frais (6)' }).click()
    await expect(cardsOf(page)).toHaveCount(6)
    expect(fake.paced().filter((call) => call.filter !== undefined)).toHaveLength(1)
    expectPoliteAgent(fake)
  })
}

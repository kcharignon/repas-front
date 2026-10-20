// Filtrer le choix par les rayons du site, de bout en bout (DRV-647, 0.37.0) : la recherche « carotte » du faux site rend 40 produits et une facette
// « Rayons » (libellé, nombre de références, enfants, `sIdValeurUrl` de la forme N-N). La rangée affichée d'abord est celle des FAMILLES (0.34.0) ; en tâche de
// fond, l'agent valide la forme de `Filtres` (jusqu'à trois formes, la première COHÉRENTE avec la valeur demandée : total proche de ses références, ou produits
// dans ses enfants), puis la rangée bascule vers les rayons du site. Un filtre leurre (moins de produits, mais d'autres rayons, et le même total : le piège
// relevé sur le vrai site le 2026-10-20) est refusé ; sans forme valide, les familles restent, sans message. Données inventées ; le faux site ne prouve pas le vrai.
import type { Page } from '@playwright/test'

import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, planOf } from './support/plans'

const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const
const SITE_ROW = [
  'Tous (40)',
  'Boissons et conserves (12)',
  'Conserves (12)',
  'Surgelés (10)',
  'Fruits et légumes (6)',
]
const FAMILY_ROW = [
  'Tous (40)',
  'Jus de legumes (12)',
  'Rayon 1 (12)',
  'Légumes surgelés (10)',
  'Legumes frais (6)',
]

const cardsOf = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Choisir' }) })
const rowOf = (page: Page) => page.getByRole('group', { name: 'Rayons', exact: true })
const subRowOf = (page: Page) =>
  page.getByRole('group', { name: 'Rayons de « Fruits et légumes »' })
const filtersOf = (fake: { paced(): { filter?: string }[] }) =>
  fake.paced().flatMap((call) => (call.filter === undefined ? [] : [call.filter]))

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

test('la forme du filtre validée en tâche de fond, la rangée bascule vers les rayons du site ; un toucher, UNE recherche filtrée, ses enfants, le cache', async ({
  page,
  fake,
  agentCode,
}, testInfo) => {
  // Given : « carotte », sans rayon appris ; la validation se fait sur le rayon le plus fourni qui a des enfants (« Boissons et conserves »)
  await openCarrots(page, fake, agentCode)

  // Then : la rangée des rayons du site, une fois la forme (i) validée (une requête)
  await expect(rowOf(page).getByRole('button')).toHaveText(SITE_ROW)
  await expect(rowOf(page).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
  expect(filtersOf(fake)).toEqual(['4-900015'])
  await page.screenshot({ path: testInfo.outputPath('rayons-du-site-360.png') })

  // When : toucher « Fruits et légumes »
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()

  // Then : ses 6 produits frais et la seconde rangée de ses enfants
  await expect(cardsOf(page)).toHaveCount(6)
  const titles = await cardsOf(page).locator('.name').allTextContents()
  expect(titles.every((title) => title.startsWith('Carottes fraîches'))).toBe(true)
  await expect(subRowOf(page).getByRole('button')).toHaveText(['Legumes frais (6)'])
  await page.screenshot({ path: testInfo.outputPath('rayon-choisi-enfants-360.png') })

  // When : « Tous », puis de nouveau « Fruits et légumes » (déjà chargé)
  await rowOf(page).getByRole('button', { name: 'Tous (40)' }).click()
  expect(await allTitles(page, 40)).toHaveLength(40)
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()
  await expect(cardsOf(page)).toHaveCount(6)

  // Then : la validation, puis UNE requête pour le rayon ; le chemin du magasin sans ville ; la cadence est tenue
  await expect.poll(() => filtersOf(fake)).toEqual(['4-900015', '4-900041'])
  expect(
    fake
      .paced()
      .filter((call) => call.filter !== undefined)
      .every((call) => call.path === '/magasin-000001-000001/recherche.aspx'),
  ).toBe(true)
  expectPoliteAgent(fake)
})

test('seule la forme (ii) filtre : (i) est un leurre refusé, (ii) est retenue et sert ensuite à chaque rayon', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un sIdValeurUrl que le site n'accepte pas, et un leurre (moins de produits, autres rayons, même total)
  fake.setBehavior({ facetUrlId: 'other', facetDecoy: true })
  await openCarrots(page, fake, agentCode)

  // Then : la rangée bascule une fois la forme (ii) validée
  await expect(rowOf(page).getByRole('button')).toHaveText(SITE_ROW)
  expect(filtersOf(fake)).toEqual(['9-900015', '4-900015'])

  // When : un rayon
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (6)' }).click()

  // Then : la forme (ii) appliquée à ce rayon ; ses 6 produits frais ; le produit choisi garde son rayon
  await expect(cardsOf(page)).toHaveCount(6)
  await expect.poll(() => filtersOf(fake)).toEqual(['9-900015', '4-900015', '4-900041'])
  await cardsOf(page).first().getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [{ outcome: 'CHOSEN', product: { id: '1000093', rayonId: 41, familyId: 413 } }],
  })
  expectPoliteAgent(fake)
})

for (const [name, behavior, attempts, capture] of [
  [
    'un leurre pour toutes les formes : trois requêtes au plus',
    { facetFilter: 'none', facetDecoy: true, facetUrlId: 'other' },
    ['9-900015', '4-900015', '900015-4'],
    'repli-leurre-360.png',
  ],
  [
    'le site ignore le filtre (les mêmes produits)',
    { facetFilter: 'ignored' },
    ['4-900015', '900015-4'],
    'repli-ignore-360.png',
  ],
  [
    'le site refuse l’adresse filtrée (HTTP 404)',
    { facetFilter: 'not-found' },
    ['4-900015', '900015-4'],
    'repli-404-360.png',
  ],
] as const) {
  test(`aucune forme valide, la rangée des familles reste, sans message : ${name}`, async ({
    page,
    fake,
    agentCode,
  }, testInfo) => {
    // Given : une forme d'adresse filtrée qui ne marche jamais
    fake.setBehavior(behavior)
    await openCarrots(page, fake, agentCode)

    // Then : les formes sont essayées en tâche de fond (trois au plus), puis plus aucune requête filtrée ; la rangée reste celle des familles
    await expect.poll(() => filtersOf(fake)).toEqual([...attempts])
    await expect(rowOf(page).getByRole('button')).toHaveText(FAMILY_ROW)
    await expect(rowOf(page)).not.toContainText('Voir le rayon')
    await expect(page.getByRole('alert')).toBeHidden()
    await page.screenshot({ path: testInfo.outputPath(capture) })

    // And : la rangée des familles filtre la liste reçue, sans requête
    await rowOf(page).getByRole('button', { name: 'Legumes frais (6)' }).click()
    await expect(cardsOf(page)).toHaveCount(6)
    expect(filtersOf(fake)).toEqual([...attempts])
    expectPoliteAgent(fake)
  })
}

test('une pastille des familles touchée avant la fin de la validation : les familles restent pour ce mot', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : une validation lente (le site met du temps à répondre aux recherches filtrées)
  fake.setBehavior({ latencyMs: 1500 })
  await openCarrots(page, fake, agentCode)

  // When : la personne touche une famille pendant la validation
  const validated = page.waitForResponse((response) => response.url().includes('Filtres='))
  await expect(rowOf(page).getByRole('button')).toHaveText(FAMILY_ROW)
  await rowOf(page).getByRole('button', { name: 'Legumes frais (6)' }).click()
  await expect(cardsOf(page)).toHaveCount(6)

  // Then : la validation finie, la rangée des familles reste, la famille choisie aussi
  await validated
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  expect(filtersOf(fake)).toEqual(['4-900015'])
  await expect(rowOf(page).getByRole('button')).toHaveText(FAMILY_ROW)
  await expect(rowOf(page).getByRole('button', { name: 'Legumes frais (6)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cardsOf(page)).toHaveCount(6)
})

test('les produits frais d’une AUTRE liste de la réponse (`objContenuMDD`, 0.38.0) : lus, comptés par « Tous » et par la facette, et trouvés par le filtre « Fruits et légumes »', async ({
  page,
  fake,
  agentCode,
}, testInfo) => {
  // Given : « tomate », dont deux produits frais de marque de distributeur sont rangés dans `objContenuMDD`, pas dans les résultats
  fake.setBehavior({ mddList: true })
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('tomate', 'Tomate', { needed: KILO })]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()

  // Then : ils sont dans la liste (après les résultats principaux) et comptés par « Tous » et par la facette
  await expect(rowOf(page).getByRole('button')).toHaveText([
    'Tous (5)',
    'Fruits et légumes (3)',
    'Boissons et conserves (2)',
  ])
  const all = await cardsOf(page).locator('.name').allTextContents()
  expect(all.slice(-2)).toEqual([
    'Tomates rondes Nos Régions Inventées',
    'Tomates grappe Marque Repère Inventée',
  ])

  // When : le rayon « Fruits et légumes »
  await rowOf(page).getByRole('button', { name: 'Fruits et légumes (3)' }).click()

  // Then : ses 3 produits frais, dont les deux de l'autre liste, et ses enfants « Legumes fruits » et « Legumes »
  await expect(cardsOf(page)).toHaveCount(3)
  await expect(cardsOf(page).locator('.name')).toHaveText([
    'Tomates cerises Jardin Inventé',
    'Tomates rondes Nos Régions Inventées',
    'Tomates grappe Marque Repère Inventée',
  ])
  await expect(subRowOf(page).getByRole('button')).toHaveText(['Legumes fruits (1)', 'Legumes (2)'])
  await page.screenshot({ path: testInfo.outputPath('rayon-frais-mdd-360.png') })

  // When : choisir une tomate de l'autre liste
  await cardsOf(page)
    .filter({ hasText: 'Tomates rondes Nos Régions Inventées' })
    .getByRole('button', { name: 'Choisir' })
    .click()
  await returnsToRepas(page, fake)

  // Then : au panier, et son rayon et sa famille repartent comme avant
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [{ outcome: 'CHOSEN', product: { id: '1000128', rayonId: 41, familyId: 414 } }],
  })
  expectPoliteAgent(fake)
})

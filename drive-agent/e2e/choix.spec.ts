// La phase B de bout en bout : l'agent affiche lui-même la liste des produits trouvés par la recherche, l'utilisateur choisit, et seul
// ce choix met un produit au panier (la page de l'enseigne refuse d'être affichée dans un cadre : décision G1).
import { openWithFragment, returnedResult } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import { BACK_FORBIDDEN } from '../test/back-label-rules'

const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const

test('fait choisir un nouveau produit dans la liste de l’agent, calcule le nombre à mettre au panier et le met au panier', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : du poivre jamais acheté, 80 g demandés
  const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
  await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre', { needed })]))

  // When : la recherche affiche les produits ; on choisit le poivre moulu de 40 g
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Il te faut : 80 g.')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })
  await expect(card).toContainText('80 g demandés, 40 g par produit : 2')
  expect(fake.cart(), 'l’agent ne choisit jamais seul').toEqual({})
  await card.getByRole('button', { name: 'Choisir' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : 2 produits au panier, le choix revient à Repas avec son prix lu
  expect(fake.cart()).toEqual({ 1000021: 2 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart'])
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 2,
        placement: 'PRIMARY',
        product: { id: '1000021', price: { cents: 180 } },
      },
    ],
  })
})

test('retire les caractères invisibles d’un libellé de l’enseigne : la liste, le résultat et le libellé envoyé n’en gardent aucun (le back refuserait tout le lot)', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : du vinaigre, dont les deux libellés portent sur le faux site des caractères invisibles (1000032), 500 ml demandés
  const needed = { quantity: 500, unitSymbol: 'ml', dimension: 'VOLUME', baseFactor: 1 } as const
  await openWithFragment(page, fake, agentCode, planOf([fresh('vinaigre', 'Vinaigre', { needed })]))

  // When : la liste montre le produit (son libellé se lit d'une traite), on le choisit
  await page.getByRole('button', { name: 'Commencer' }).click()
  const card = page.getByRole('listitem').filter({ hasText: 'Vinaigre de cidre Verger Imaginaire' })
  await expect(card).toContainText('500 ml demandés, 750 ml par produit : 1')
  await card.getByRole('button', { name: 'Choisir' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : le libellé renvoyé à Repas est propre et le back l'accepterait
  expect(fake.cart()).toEqual({ 1000032: 1 })
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  const result = await returnedResult(page, fake)
  expect(result).toMatchObject({
    lines: [
      {
        ingredientSlug: 'vinaigre',
        outcome: 'CHOSEN',
        product: { id: '1000032', label: 'Vinaigre de cidre Verger Imaginaire 75 cl' },
      },
    ],
  })
  expect(BACK_FORBIDDEN.test(JSON.stringify(result))).toBe(false)
})

test('remplace un produit devenu indisponible : nouvelle recherche, « ne plus jamais prendre », rôle du nouveau produit', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le seul produit connu de la farine est en rupture
  const plan = planOf([known('farine', 'Farine', [product(1000002)], { needed: KILO })])
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

  // When : l'utilisateur ne veut plus jamais ce produit, cherche autre chose et choisit le sarrasin comme produit de secours
  await page.getByLabel('Ne plus jamais prendre Farine de blé T45').check()
  await page.getByLabel('Chercher autre chose').fill('farine sarrasin')
  await page.getByRole('button', { name: 'Chercher', exact: true }).click()
  await expect(page.getByText('Résultats pour « farine sarrasin »')).toBeVisible()
  await page.getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Produit de secours' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : 1 kg demandé, 500 g par produit, donc 2 ; le produit refusé et l'indisponible partent avec le résultat
  expect(fake.cart()).toEqual({ 1000004: 2 })
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [
      {
        outcome: 'CHOSEN',
        product: { id: '1000004' },
        quantity: 2,
        placement: 'FALLBACK',
        unavailableIds: ['1000002'],
        rejected: [{ id: '1000002' }],
      },
    ],
  })
})

test('laisse passer une ligne ou dire « j’en ai toujours », même quand la recherche ne trouve rien', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un produit que le faux site n'a pas, puis du sel
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('gnocchis', 'Gnocchis'), fresh('sel', 'Sel')]),
  )

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Aucun produit trouvé pour « gnocchis »')).toBeVisible()
  await page.getByRole('button', { name: 'Passer cette fois' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
  await page.getByRole('button', { name: 'J’en ai toujours' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : rien au panier, deux recherches et aucune écriture
  expect(fake.cart()).toEqual({})
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search'])
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [
      { ingredientSlug: 'gnocchis', outcome: 'SKIPPED' },
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
    ],
  })
})

for (const [form, cart] of [
  ['no-list', { 1000001: 2 }],
  ['encoded', {}],
] as const) {
  test(`une page sans résultat d'une autre forme (« ${form} »)${Object.keys(cart).length > 0 ? ', panier garni,' : ''} n'arrête pas le passage : la ligne est proposée à « Passer cette fois », la suivante est cherchée`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le site répond à « gnocchis » par une page sans produit d'une forme que le vrai site n'a jamais été relevé servir
    fake.setBehavior({ emptySearch: form })
    fake.seedCart(cart)
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('gnocchis', 'Gnocchis'), fresh('sel', 'Sel')]),
    )

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByText('Aucun produit trouvé pour « gnocchis »')).toBeVisible()
    await page.getByRole('button', { name: 'Passer cette fois' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
    await page.getByRole('button', { name: 'J’en ai toujours' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

    // Then : aucune erreur, deux recherches, aucune écriture, le panier n'a pas bougé
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search'])
    expect(fake.cart()).toEqual(cart)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    const result = await returnedResult(page, fake)
    expect(result).toMatchObject({
      outcome: 'completed',
      lines: [
        { ingredientSlug: 'gnocchis', outcome: 'SKIPPED' },
        { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      ],
    })
    expect(result).not.toHaveProperty('error')
  })
}

test('annule le passage depuis le choix : la ligne reste à choisir et Repas le sait', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre')]))
  await page.getByRole('button', { name: 'Commencer' }).click()

  // When
  await page.getByRole('button', { name: 'Annuler le passage' }).click()
  await expect(page.getByRole('heading', { name: 'Envoi arrêté' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'aborted',
    lines: [{ ingredientSlug: 'poivre', outcome: 'UNAVAILABLE' }],
  })
  expect(fake.cart()).toEqual({})
})

// Le passage de bout en bout (phase A) : l'agent réel dans Chromium mobile, plan reçu par le fragment d'adresse, résultat rendu au faux
// Repas par navigation. Le faux site juge la cadence (jamais en parallèle, 800 ms au moins entre deux requêtes) et la forme exacte des
// requêtes du panier.
import { openWithFragment, returnedResult } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { home, known, planOf, product, RUN_ID, skip } from './support/plans'

test('remplit le panier à la cadence du chantier, avec des requêtes de la forme exacte du site, et rend le résultat au faux Repas', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : deux produits connus, un « j'en ai toujours », un « passer » ; la latence rend un envoi en parallèle visible
  fake.setBehavior({ latencyMs: 120 })
  const plan = planOf([
    known('farine', 'Farine', [product(1000001, 3)]),
    known('sucre', 'Sucre', [product(1000006, 1)]),
    home('sel', 'Sel'),
    skip('huile', 'Huile'),
  ])

  // When : l'utilisateur lit le récapitulatif, puis commence
  await openWithFragment(page, fake, agentCode, plan)
  await expect(page.getByRole('heading', { name: 'Prêt à remplir ton panier' })).toBeVisible()
  expect(fake.paced(), 'rien ne part avant « Commencer »').toEqual([])
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : le panier du faux site a les quantités absolues du plan, une recherche puis une écriture par ligne
  expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 1 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search', 'cart'])
  expectPoliteAgent(fake)

  // And : le résultat revient au faux Repas, qui l'affiche
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  const result = await returnedResult(page, fake)
  expect(result).toMatchObject({
    type: 'result',
    runId: RUN_ID,
    outcome: 'completed',
    store: { id: '000001' },
    lines: [
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '1000001',
        quantity: 3,
        usedRank: 1,
      },
      { ingredientSlug: 'sucre', outcome: 'ADDED', productId: '1000006', quantity: 1, usedRank: 1 },
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
      { ingredientSlug: 'huile', outcome: 'SKIPPED' },
    ],
  })
  await expect(page.locator('#resultat[data-ready="true"]')).toContainText(RUN_ID)
})

test('prend le produit suivant quand le préféré est en rupture, et le dit à Repas', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le produit préféré (1000002) est en rupture au faux site, le suivant (1000003) est en promotion
  const plan = planOf([known('farine', 'Farine', [product(1000002, 1), product(1000003, 2)])])

  // When
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : rien n'est écrit pour le produit en rupture ; le suivant est pris, au prix de la promotion
  expect(fake.cart()).toEqual({ 1000003: 2 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'cart'])
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [
      {
        outcome: 'ADDED',
        productId: '1000003',
        quantity: 2,
        usedRank: 2,
        unavailableIds: ['1000002'],
      },
    ],
  })
})

test('met la quantité demandée au panier même quand il est déjà garni, sans toucher au reste', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la farine est déjà au panier (2), avec du sel (5) que le plan ne cite pas
  fake.seedCart({ 1000001: 2, 1000009: 5 })

  // When : le plan veut 3 farines
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([known('farine', 'Farine', [product(1000001, 3)])]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : la quantité est absolue (3, pas 5) et le sel est resté
  expect(fake.cart()).toEqual({ 1000001: 3, 1000009: 5 })
})

test('demande la quantité quand elle est à vérifier, et passe la ligne si l’utilisateur le veut', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : deux produits connus dont le nombre à mettre au panier est à vérifier
  const plan = planOf([
    known('farine', 'Farine', [product(1000001, null)]),
    known('sucre', 'Sucre', [product(1000006, null)]),
  ])

  // When : 4 farines, puis on passe le sucre
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Vérifie la quantité' })).toBeVisible()
  await page.getByLabel('Nombre de produits (de 1 à 99)').fill('4')
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByText('Combien de « Sucre')).toBeVisible()
  await page.getByRole('button', { name: 'Passer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then
  expect(fake.cart()).toEqual({ 1000001: 4 })
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    lines: [
      { ingredientSlug: 'farine', outcome: 'ADDED', quantity: 4 },
      { ingredientSlug: 'sucre', outcome: 'SKIPPED' },
    ],
  })
})

test('annule au récapitulatif : rien ne part vers le site, Repas est prévenu', async ({
  page,
  fake,
  agentCode,
}) => {
  // When
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([known('farine', 'Farine', [product(1000001, 3)])]),
  )
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('heading', { name: 'Envoi arrêté' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then
  expect(await returnedResult(page, fake)).toMatchObject({ outcome: 'aborted', lines: [] })
  expect(fake.paced()).toEqual([])
  expect(fake.cart()).toEqual({})
})

for (const [name, message] of [
  [
    'un plan d’une version inconnue',
    { ...planOf([known('farine', 'Farine', [product(1000001)])]), v: 2 },
  ],
  ['un fragment qui n’est pas du base64url', '!!pas-du-base64'],
] as const) {
  test(`refuse ${name} avant toute requête`, async ({ page, fake, agentCode }) => {
    // When
    await openWithFragment(page, fake, agentCode, message)

    // Then
    await expect(page.getByRole('heading', { name: 'Liste illisible' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(fake.paced()).toEqual([])
  })
}

test('refuse un plan fait pour un autre magasin que celui de la page, et le dit à Repas', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la page est celle du magasin 000002, le plan est fait pour 000001
  const plan = planOf([known('farine', 'Farine', [product(1000001)])])

  // When
  await openWithFragment(page, fake, agentCode, plan, {
    path: '/magasin-000002-000002-Ville-Test/',
  })
  await expect(page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'error',
    error: { code: 'STORE_MISMATCH' },
  })
  expect(fake.paced()).toEqual([])
})

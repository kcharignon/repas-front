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
  await expect(page.getByRole('heading', { name: 'Prêt à remplir votre panier' })).toBeVisible()
  expect(fake.paced(), 'rien ne part avant « Commencer »').toEqual([])
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

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
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

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
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : la quantité monte à celle du plan (3) et le sel est resté
  expect(fake.cart()).toEqual({ 1000001: 3, 1000009: 5 })
})

test('ne réduit jamais une quantité déjà au panier : 5 déjà pour un plan de 2, rien n’est écrit, le résultat dit 5 et la fin le dit', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la farine est déjà au panier en 5 exemplaires, avec du sel (5) que le plan ne cite pas ; le plan n'en veut que 2
  fake.seedCart({ 1000001: 5, 1000009: 5 })

  // When
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([known('farine', 'Farine', [product(1000001, 2)])]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : le panier n'a pas bougé, sans une seule écriture, et la fin dit ce qui a été conservé
  expect(fake.cart()).toEqual({ 1000001: 5, 1000009: 5 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search'])
  await expect(page.getByText('Déjà 5 au panier : conservé')).toBeVisible()
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [{ ingredientSlug: 'farine', outcome: 'ADDED', productId: '1000001', quantity: 5 }],
  })
})

test('rejouer un envoi déjà fait n’écrit plus rien : le panier a déjà les quantités du plan', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le panier a déjà exactement les quantités du plan (un premier envoi vient de les y mettre)
  fake.seedCart({ 1000001: 3, 1000006: 1 })

  // When
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      known('farine', 'Farine', [product(1000001, 3)]),
      known('sucre', 'Sucre', [product(1000006, 1)]),
    ]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : une recherche par ligne, aucune écriture, aucune mention
  expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 1 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search'])
  await expect(page.getByText('conservé')).toHaveCount(0)
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
  await expect(page.getByRole('heading', { name: 'Vérifiez la quantité' })).toBeVisible()
  await page.getByLabel('Nombre de produits (de 1 à 99)').fill('4')
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByText('Combien de « Sucre')).toBeVisible()
  await page.getByRole('button', { name: 'Pas cette fois' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

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

test('la quantité se tape par-dessus le « 1 » prérempli (jamais « 14 »), et l’écran dit ce qu’il vous faut (DRV-626)', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un produit connu dont le nombre est à vérifier, pour 200 g
  const needed = { quantity: 200, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
  const plan = planOf([known('farine', 'Farine', [product(1000001, null)], { needed })])
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Vérifiez la quantité' })).toBeVisible()
  const input = page.getByLabel('Nombre de produits (de 1 à 99)')

  // Then : la quantité demandée est dite, le champ « 1 » est sélectionné en entier : taper 4 donne « 4 »
  await expect(page.getByText('Il vous faut : 200 g.')).toBeVisible()
  await expect(input).toBeFocused()
  await page.keyboard.type('4')
  await expect(input).toHaveValue('4')

  // And : on peut aussi passer la ligne
  await page.getByRole('button', { name: 'Pas cette fois' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()
  expect(fake.cart()).toEqual({})
})

test('toucher le champ de la quantité avant de taper garde « 1 » sélectionné (DRV-626)', async ({
  page,
  fake,
  agentCode,
}) => {
  const plan = planOf([known('farine', 'Farine', [product(1000001, null)])])
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  const input = page.getByLabel('Nombre de produits (de 1 à 99)')
  await expect(input).toHaveValue('1')

  await input.click()
  await page.keyboard.type('6')

  await expect(input).toHaveValue('6')
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()
  expect(fake.cart()).toEqual({ 1000001: 6 })
})

/** Une quantité demandée en poids, dans l'unité de la liste (« 3 kg »), comme le plan du back la porte. */
const weight = (quantity: number, unitSymbol = 'kg', baseFactor = 1000) =>
  ({ quantity, unitSymbol, dimension: 'WEIGHT', baseFactor }) as const

test('met au panier le nombre calculé sur le contenu lu sur le site, pas celui du plan, et le dit à la fin (DRV-613)', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le plan mémorise 30 farines (contenu mémorisé : 100 g) pour 3 kg, le site en vend de 1 kg ; le sucre est conforme au plan
  const memorized = { ...product(1000001, 30), content: { value: 100, unit: 'g' as const } }
  const plan = planOf([
    known('farine', 'Farine', [memorized], { needed: weight(3) }),
    known('sucre', 'Sucre', [product(1000006, 2)], { needed: weight(2) }),
  ])

  // When
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : 3 farines (le contenu en direct fait foi), 2 sucres (inchangé), sans question ni requête de plus
  expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 2 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search', 'cart'])
  expectPoliteAgent(fake)

  // And : l'écran de fin signale la seule ligne recalculée
  await expect(page.getByText('Contenu différent de celui dont Repas se souvenait')).toBeVisible()
  await expect(page.getByText('Farine : 3 au lieu de 30')).toBeVisible()
  await expect(page.getByText('Sucre :')).toHaveCount(0)

  // And : le résultat porte la quantité réellement mise au panier
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [
      { ingredientSlug: 'farine', outcome: 'ADDED', productId: '1000001', quantity: 3 },
      { ingredientSlug: 'sucre', outcome: 'ADDED', productId: '1000006', quantity: 2 },
    ],
  })
})

test('garde le nombre du plan quand le contenu lu sur le site ne se compare pas, sans rien signaler (DRV-613)', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un produit au contenu illisible sur le site (1000031), un autre dont le contenu est en pièces pour une quantité en grammes
  const plan = planOf([
    known('cacao', 'Cacao', [product(1000031, 5)], { needed: weight(1) }),
    known('oeufs', 'Oeufs', [product(1000014, 2)], { needed: weight(500, 'g', 1) }),
  ])

  // When
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : comme avant, le plan fait foi, et rien n'est signalé
  expect(fake.cart()).toEqual({ 1000031: 5, 1000014: 2 })
  await expect(page.getByText('Contenu différent de celui dont Repas se souvenait')).toHaveCount(0)
  expectPoliteAgent(fake)
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
  await expect(page.getByRole('heading', { name: 'Vous avez arrêté l’envoi' })).toBeVisible()
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

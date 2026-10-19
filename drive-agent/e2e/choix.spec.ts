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
  await expect(page.getByText('Il vous faut : 80 g.')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })
  await expect(card).toContainText('40 g par produit : 2 produits.')
  expect(fake.cart(), 'l’agent ne choisit jamais seul').toEqual({})
  await card.getByRole('button', { name: 'Choisir' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

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
  await expect(card).toContainText('750 ml par produit : 1 produit.')
  await card.getByRole('button', { name: 'Choisir' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

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

for (const [button, placement] of [
  ['Toujours prendre celui-ci', 'PRIMARY'],
  ['Cette fois seulement', 'ONCE'],
] as const) {
  test(`remplace un produit devenu indisponible : nouvelle recherche, « Ne plus proposer », une question à deux réponses (« ${button} »)`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le seul produit connu de la farine est en rupture
    const plan = planOf([known('farine', 'Farine', [product(1000002)], { needed: KILO })])
    await openWithFragment(page, fake, agentCode, plan)
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

    // When : l'utilisateur ne veut plus de ce produit, cherche autre chose, choisit le sarrasin et répond à l'unique question
    await page.getByLabel('Ne plus proposer Farine de blé T45').check()
    await page.getByLabel('Chercher autre chose').fill('farine sarrasin')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await expect(page.getByText('Résultats pour « farine sarrasin »')).toBeVisible()
    await page.getByRole('button', { name: 'Choisir' }).click()
    await expect(page.getByRole('heading', { name: 'Toujours prendre ce produit ?' })).toBeVisible()
    // Deux réponses seulement (la sortie « Revenir à la liste » n'en est pas une), jamais un mot de l'ordre de préférence
    await expect(page.locator('.overlay').getByRole('button')).toHaveText([
      'Toujours prendre celui-ci',
      'Cette fois seulement',
      'Revenir à la liste',
    ])
    await expect(page.getByText(/secours|préféré/i)).toHaveCount(0)
    await page.getByRole('button', { name: button }).click()
    await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

    // Then : 1 kg demandé, 500 g par produit, donc 2 ; le produit refusé et l'indisponible partent avec le résultat, la réponse dans `placement`
    expect(fake.cart()).toEqual({ 1000004: 2 })
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      lines: [
        {
          outcome: 'CHOSEN',
          product: { id: '1000004' },
          quantity: 2,
          placement,
          unavailableIds: ['1000002'],
          rejected: [{ id: '1000002' }],
        },
      ],
    })
  })
}

test('« Revenir à la liste » sur la question ne met rien au panier : la liste revient avec la recherche', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le seul produit connu de la farine est en rupture, l'utilisateur choisit le sarrasin
  const plan = planOf([known('farine', 'Farine', [product(1000002)], { needed: KILO })])
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Chercher autre chose').fill('farine sarrasin')
  await page.getByRole('button', { name: 'Chercher', exact: true }).click()
  await expect(page.getByText('Résultats pour « farine sarrasin »')).toBeVisible()
  await page.getByRole('button', { name: 'Choisir' }).click()

  // When
  await page.getByRole('button', { name: 'Revenir à la liste' }).click()

  // Then : la liste est revenue, le panier n'a pas bougé
  await expect(page.getByText('Résultats pour « farine sarrasin »')).toBeVisible()
  expect(fake.cart()).toEqual({})
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
  await page.getByRole('button', { name: 'Pas cette fois' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
  await page.getByRole('button', { name: 'J’en ai toujours' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : rien au panier, trois recherches (« gnocchis », son singulier « gnocchi » quand il ne répond rien, puis « sel ») et aucune écriture
  expect(fake.cart()).toEqual({})
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'search'])
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
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
    await page.getByRole('button', { name: 'J’en ai toujours' }).click()
    await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

    // Then : aucune erreur, trois recherches (« gnocchis », « gnocchi », « sel »), aucune écriture, le panier n'a pas bougé
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'search'])
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
  await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  await expect(page.getByRole('heading', { name: 'Vous avez arrêté l’envoi' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'aborted',
    lines: [{ ingredientSlug: 'poivre', outcome: 'UNAVAILABLE' }],
  })
  expect(fake.cart()).toEqual({})
})

// —— « Passer les n suivants » (DRV-624) ————————————————————————————————————————————————————————————————————————————————————

test('quatre nouveaux articles : choisir le premier, passer les trois suivants (avec la confirmation d’une ligne), rien n’est cherché ni retenu pour eux', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : quatre articles jamais achetés
  const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      fresh('poivre', 'Poivre', { needed }),
      fresh('sel', 'Sel'),
      fresh('riz', 'Riz'),
      fresh('huile', 'Huile'),
    ]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.locator('.head')).toHaveText('Poivre (1 sur 4)')

  // When : on choisit le premier ; sur le deuxième écran, un bouton passe les trois qui restent
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Poivre noir moulu' })
    .getByRole('button', { name: 'Choisir' })
    .click()
  await expect(page.locator('.head')).toHaveText('Sel (2 sur 4)')
  await page.getByRole('button', { name: 'Passer les 3 suivants' }).click()
  // Aucun article n'a encore de produit retenu : une confirmation d'une ligne, rien n'est passé avant
  await expect(page.getByText('Ces 3 articles ne seront pas mis au panier.')).toBeVisible()
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search'])
  await page.getByRole('button', { name: 'Passer les 3 suivants' }).click()
  await expect(page.getByRole('heading', { name: 'Le panier est rempli' })).toBeVisible()

  // Then : un seul produit au panier, deux recherches (poivre, sel) et une écriture, les trois autres sont passés sans produit ni refus
  expect(fake.cart()).toEqual({ 1000021: 2 })
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  const result = await returnedResult(page, fake)
  expect(result).toMatchObject({
    outcome: 'completed',
    lines: [
      { ingredientSlug: 'poivre', outcome: 'CHOSEN', placement: 'PRIMARY' },
      { ingredientSlug: 'sel', outcome: 'SKIPPED' },
      { ingredientSlug: 'riz', outcome: 'SKIPPED' },
      { ingredientSlug: 'huile', outcome: 'SKIPPED' },
    ],
  })
  expect(JSON.stringify(result)).not.toMatch(/HAVE_AT_HOME|rejected/)
})

test('« Revenir au choix » sur la confirmation garde l’article et sa liste, sans rien passer', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : deux articles jamais achetés, une recherche déjà tapée sur le premier
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('poivre', 'Poivre'), fresh('sel', 'Sel')]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByRole('button', { name: 'Passer les 2 suivants' }).click()
  await expect(page.getByText('Ces 2 articles ne seront pas mis au panier.')).toBeVisible()

  // When
  await page.getByRole('button', { name: 'Revenir au choix' }).click()

  // Then : les réponses sont revenues, on peut encore choisir
  await expect(page.getByRole('button', { name: 'Pas cette fois' })).toBeVisible()
  await expect(page.getByText('Ces 2 articles')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Choisir' }).first()).toBeVisible()
  expect(fake.cart()).toEqual({})
})

test('trois articles dont le produit habituel est en rupture : « Passer les 3 suivants » passe tout de suite, sans confirmation', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : farine, sucre et lait ont chacun un produit retenu, en rupture au faux site (1000002, 1000008, 1000013)
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      known('farine', 'Farine', [product(1000002)]),
      known('sucre', 'Sucre', [product(1000008)]),
      known('lait', 'Lait', [product(1000013)]),
    ]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

  // When
  await page.getByRole('button', { name: 'Passer les 3 suivants' }).click()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then : rien au panier, rien n'est retenu, aucune question
  expect(fake.cart()).toEqual({})
  const result = await returnedResult(page, fake)
  expect(result).toMatchObject({
    lines: [
      { ingredientSlug: 'farine', outcome: 'SKIPPED' },
      { ingredientSlug: 'sucre', outcome: 'SKIPPED' },
      { ingredientSlug: 'lait', outcome: 'SKIPPED' },
    ],
  })
  expect(JSON.stringify(result)).not.toMatch(/HAVE_AT_HOME|rejected|CHOSEN/)
})

test('un produit retenu et disponible n’ouvre jamais l’écran de choix : la phase A le met au panier, seul l’article nouveau est proposé', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la farine a son produit habituel en stock (1000001) ; le sel est nouveau
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([known('farine', 'Farine', [product(1000001, 3)]), fresh('sel', 'Sel')]),
  )

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('button', { name: 'Choisir' }).first()).toBeVisible()

  // Then : l'écran de choix est celui du sel, seul (1 sur 1, pas de « Passer les suivants »), et la farine est déjà au panier
  await expect(page.locator('.head')).toHaveText('Sel (1 sur 1)')
  await expect(page.locator('.head strong')).toHaveText('Sel')
  await expect(page.getByRole('button', { name: /Passer les/ })).toHaveCount(0)
  expect(fake.cart()).toEqual({ 1000001: 3 })
})

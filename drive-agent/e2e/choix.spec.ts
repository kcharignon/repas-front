// La phase B de bout en bout : l'agent affiche lui-même la liste des produits trouvés par la recherche, l'utilisateur choisit, et seul
// ce choix met un produit au panier (la page de l'enseigne refuse d'être affichée dans un cadre : décision G1).
import type { Page } from '@playwright/test'

import { PHOTO_HOST, photoReply } from '../fake-leclerc/photos'
import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
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
  await expect(page.getByText('Il te faut : 80 g.')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })
  await expect(card).toContainText('40 g par produit : 2 produits.')
  expect(fake.cart(), 'l’agent ne choisit jamais seul').toEqual({})
  await card.getByRole('button', { name: 'Choisir' }).click()
  await returnsToRepas(page, fake)

  // Then : 2 produits au panier, le choix revient à Repas avec son prix lu
  expect(fake.cart()).toEqual({ 1000021: 2 })
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart'])
  expectPoliteAgent(fake)
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
  const card = page.getByRole('listitem').filter({ hasText: 'Vinaigre de cidre Verger Imaginaire' })
  await expect(card).toContainText('750 ml par produit : 1 produit.')
  await card.getByRole('button', { name: 'Choisir' }).click()
  await returnsToRepas(page, fake)

  // Then : le libellé renvoyé à Repas est propre et le back l'accepterait
  expect(fake.cart()).toEqual({ 1000032: 1 })
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
  ['Choisir', 'PRIMARY'],
  ['Pas mon habituel', 'ONCE'],
] as const) {
  test(`remplace un produit devenu indisponible : nouvelle recherche, « Ne plus proposer », un seul geste sur la fiche (« ${button} »)`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le seul produit connu de la farine est en rupture
    const plan = planOf([known('farine', 'Farine', [product(1000002)], { needed: KILO })])
    await openWithFragment(page, fake, agentCode, plan)
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

    // When : l'utilisateur ne veut plus de ce produit, cherche autre chose, puis touche UN bouton de la fiche du sarrasin
    await page.getByLabel('Ne plus proposer Farine de blé T45').check()
    await page.getByLabel('Chercher autre chose').fill('farine sarrasin')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await expect(page.getByText('Résultats pour « farine sarrasin »')).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${button} : `) }).click()
    await returnsToRepas(page, fake)

    // Then : 1 kg demandé, 500 g par produit, donc 2 ; aucune question ensuite ; la réponse est dans `placement`, avec le refus et l'indisponible
    expect(fake.cart()).toEqual({ 1000004: 2 })
    expectPoliteAgent(fake)
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

for (const width of [412, 360]) {
  test(`la fiche d’un produit a deux boutons côte à côte à ${width} px, de 44 px au moins, aux noms complets, sans jamais poser « Toujours prendre ce produit ? »`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : du poivre, jamais acheté, sur un écran de ${width} px
    await page.setViewportSize({ width, height: 800 })
    await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre')]))
    const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })

    // Then : « Choisir » et « Pas mon habituel » nomment le produit, sur la même ligne, assez grands pour le doigt, sans défilement horizontal
    const choose = card.getByRole('button', { name: /^Choisir : Poivre noir moulu/ })
    const once = card.getByRole('button', { name: /^Pas mon habituel : Poivre noir moulu/ })
    await expect(choose).toBeVisible()
    await expect(once).toBeVisible()
    const [a, b] = [await choose.boundingBox(), await once.boundingBox()]
    expect(a && b && Math.abs(a.y - b.y) < 2, 'les deux boutons sont côte à côte').toBe(true)
    expect(a && b && Math.min(a.height, b.height) >= 44 && Math.min(a.width, b.width) >= 44).toBe(
      true,
    )
    // La page de l'enseigne est affichée à l'échelle d'un site de bureau : on compare à la fiche, pas à la fenêtre
    const frame = await card.boundingBox()
    expect(
      a && b && frame && a.x + a.width <= b.x && b.x + b.width <= frame.x + frame.width,
      'les deux boutons restent dans la fiche',
    ).toBe(true)
    await expect(page.getByText(/Toujours prendre ce produit/)).toHaveCount(0)
    await expect(page.getByText(/secours|préféré/i)).toHaveCount(0)
  })
}

test('« Pas mon habituel » sur un article sans produit retenu : le produit est au panier, ONCE, aucune question, rien à retenir', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : du poivre, jamais acheté
  const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
  await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre', { needed })]))
  const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })

  // When : un seul geste
  await card.getByRole('button', { name: /^Pas mon habituel : / }).click()
  await returnsToRepas(page, fake)

  // Then : 2 produits au panier, la ligne dit ONCE et ne porte aucune recherche à retenir
  expect(fake.cart()).toEqual({ 1000021: 2 })
  const result = await returnedResult(page, fake)
  expect(result).toMatchObject({
    outcome: 'completed',
    lines: [{ ingredientSlug: 'poivre', outcome: 'CHOSEN', placement: 'ONCE', quantity: 2 }],
  })
  expect(JSON.stringify(result)).not.toContain('searchQuery')
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
  await expect(page.getByText('Aucun produit trouvé pour « gnocchis »')).toBeVisible()
  await page.getByRole('button', { name: 'Pas cette fois' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
  await page.getByRole('button', { name: 'J’en ai toujours' }).click()
  await returnsToRepas(page, fake)

  // Then : rien au panier, trois recherches (« gnocchis », son singulier « gnocchi » quand il ne répond rien, puis « sel ») et aucune écriture
  expect(fake.cart()).toEqual({})
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'search'])
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
    await expect(page.getByText('Aucun produit trouvé pour « gnocchis »')).toBeVisible()
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Sel fin' })).toBeVisible()
    await page.getByRole('button', { name: 'J’en ai toujours' }).click()
    await returnsToRepas(page, fake)

    // Then : aucune erreur, trois recherches (« gnocchis », « gnocchi », « sel »), aucune écriture, le panier n'a pas bougé
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'search'])
    expect(fake.cart()).toEqual(cart)
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

  // When
  await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  await expect(page.getByRole('heading', { name: 'Tu as arrêté l’envoi' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'aborted',
    lines: [{ ingredientSlug: 'poivre', outcome: 'UNAVAILABLE' }],
  })
  expect(fake.cart()).toEqual({})
})

// —— « Passer ces n articles » (DRV-624, DRV-626) ————————————————————————————————————————————————————————————————————————————————————

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
  await expect(page.locator('.head')).toHaveText('Poivre (1 sur 4)')

  // When : on choisit le premier ; sur le deuxième écran, un bouton passe les trois qui restent
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Poivre noir moulu' })
    .getByRole('button', { name: 'Choisir' })
    .click()
  await expect(page.locator('.head')).toHaveText('Sel (2 sur 4)')
  await page.getByRole('button', { name: 'Passer ces 3 articles' }).click()
  // Aucun article n'a encore de produit retenu : une confirmation d'une ligne, rien n'est passé avant
  await expect(page.getByText('Ces 3 articles ne seront pas mis au panier.')).toBeVisible()
  // L'écran n'a plus que deux boutons : ni la liste de produits (aucun « Choisir » vert dessous), ni la recherche (DRV-626)
  await expect(page.getByRole('button', { name: 'Choisir' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chercher', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revenir au choix' })).toBeVisible()
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search'])
  await page.getByRole('button', { name: 'Passer ces 3 articles' }).click()
  await returnsToRepas(page, fake)

  // Then : un seul produit au panier, deux recherches (poivre, sel) et une écriture, les trois autres sont passés sans produit ni refus
  expect(fake.cart()).toEqual({ 1000021: 2 })
  expectPoliteAgent(fake)
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
  await page.getByRole('button', { name: 'Passer ces 2 articles' }).click()
  await expect(page.getByText('Ces 2 articles ne seront pas mis au panier.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choisir' })).toHaveCount(0)

  // When
  await page.getByRole('button', { name: 'Revenir au choix' }).click()

  // Then : les réponses sont revenues, on peut encore choisir
  await expect(page.getByRole('button', { name: 'Pas cette fois' })).toBeVisible()
  await expect(page.getByText('Ces 2 articles ne seront pas mis au panier.')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Choisir' }).first()).toBeVisible()
  expect(fake.cart()).toEqual({})
})

test('trois articles dont le produit habituel est en rupture : « Passer ces 3 articles » passe tout de suite, sans confirmation', async ({
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
  await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

  // When
  await page.getByRole('button', { name: 'Passer ces 3 articles' }).click()
  await returnsToRepas(page, fake)

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
  await expect(page.getByRole('button', { name: 'Choisir' }).first()).toBeVisible()

  // Then : l'écran de choix est celui du sel, seul (ni « (1 sur 1) », ni « Passer ces n articles »), et la farine est déjà au panier
  await expect(page.locator('.head')).toHaveText('Sel')
  await expect(page.locator('.head strong')).toHaveText('Sel')
  await expect(page.getByRole('button', { name: /Passer ces/ })).toHaveCount(0)
  expect(fake.cart()).toEqual({ 1000001: 3 })
})

// —— Les photos des produits (DRV-633) ————————————————————————————————————————————————————————————————————————————————————————————

/**
 * Le navigateur de test n'a aucune adresse pour l'hôte d'images (et la page est en HTTP) : on répond nous-mêmes aux adresses
 * `https://photos-test.leclercdrive.fr/…` avec l'image synthétique du faux site, et on note toute requête d'image.
 */
async function servePhotos(page: Page): Promise<string[]> {
  const requested: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image') requested.push(request.url())
  })
  await page.route(`https://${PHOTO_HOST}/**`, async (route) => {
    const url = new URL(route.request().url())
    const photo = photoReply(url.search)
    await route.fulfill({ status: photo.status, contentType: photo.type, body: photo.body })
  })
  return requested
}

test('montre la photo des produits qui en ont une, et laisse les autres en texte : adresse refusée, photo en 404, pas de photo', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : de la farine (1000001 et 1000002 ont une photo, 1000003 l'adresse d'un autre hôte, 1000004 une photo en 404, 1000005 rien)
  const requested = await servePhotos(page)
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('farine', 'Farine', { needed: KILO })]),
  )

  // When : la liste s'affiche
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()
  const card = (name: string) => page.getByRole('listitem').filter({ hasText: name })

  // Then : deux photos chargées, à gauche du libellé (texte alternatif = libellé), les trois autres fiches sont en texte, sans image cassée
  for (const name of ['Farine de blé T55', 'Farine de blé T45']) {
    const image = card(name).locator('img')
    await expect(image).toHaveCount(1)
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
    await expect(image).toHaveAttribute('alt', new RegExp(name))
    await expect(image).toHaveAttribute('loading', 'lazy')
  }
  for (const name of ['Farine de blé T65', 'Farine de sarrasin', 'Farine complète']) {
    await expect(card(name), name).toBeVisible()
    await expect(card(name).locator('img'), name).toHaveCount(0)
    await expect(card(name).getByRole('button', { name: 'Choisir' }), name).toBeEnabled()
  }
  // Aucune requête d'image vers un autre hôte que celui des images de l'enseigne ; la photo en 404 a bien été demandée, puis retirée
  expect(requested.length).toBeGreaterThan(0)
  for (const address of requested) expect(new URL(address).hostname, address).toBe(PHOTO_HOST)
  expect(
    fake.requests().filter((request) => request.kind === 'image' || request.host === PHOTO_HOST),
    'le faux hôte d’images n’est pas atteint : le navigateur de test ne résout que le faux magasin',
  ).toEqual([])
  expect(requested.some((address) => address.includes('id=1004'))).toBe(true)
  expect(requested.some((address) => address.includes('id=1003'))).toBe(false)

  // Et le résultat renvoyé à Repas ne dit rien des photos
  await card('Farine de blé T55').getByRole('button', { name: 'Choisir' }).click()
  await returnsToRepas(page, fake)
  const result = await returnedResult(page, fake)
  expect(JSON.stringify(result)).not.toMatch(/photo|image|leclercdrive/i)
  expect(result).toMatchObject({ lines: [{ outcome: 'CHOSEN', product: { id: '1000001' } }] })
})

// —— Tous les résultats de la recherche, en défilant (DRV-643) ————————————————————————————————————————————————————————————————

test('une recherche de 45 produits : huit fiches d’abord, la suite en défilant, une seule requête au site, jusqu’à la dernière fiche', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : du biscuit, que le faux site trouve en 45 produits (1000035 à 1000079)
  const requested = await servePhotos(page)
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([fresh('biscuit', 'Biscuit', { needed: KILO })]),
  )

  // When : la liste s'affiche
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()

  // Then : un premier lot seulement, dans l'ordre du site, et ses photos seulement
  const cards = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Choisir' }) })
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toContainText('série 01')
  await expect(page.getByText('série 45')).toHaveCount(0)
  expect(requested.length).toBeLessThanOrEqual(8)

  // When : la personne fait défiler jusqu'au bout
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
    .toBe(45)

  // Then : les 45 produits, dans l'ordre, la dernière fiche et « Annuler l'envoi » sous elle ; une seule recherche, aucune requête de plus
  await expect(cards).toHaveCount(45)
  await expect(cards.last()).toContainText('série 45')
  await page.locator('.scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(cards.last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annuler l’envoi' })).toBeVisible()
  // Une seule recherche du mot (la validation du filtre du site, en tâche de fond, est à part : DRV-647, 0.37.0)
  expect(
    fake
      .paced()
      .filter((call) => call.filter === undefined)
      .map((call) => call.kind),
  ).toEqual(['search'])
  expect(fake.cart()).toEqual({})
  // Les photos suivent les fiches : une fois au bout, 45 images demandées au plus (jamais une rafale avant d'y arriver)
  await expect.poll(() => requested.length).toBeGreaterThan(8)
  expect(requested.length).toBeLessThanOrEqual(45)
  for (const address of requested) expect(new URL(address).hostname, address).toBe(PHOTO_HOST)

  // And : choisir un produit du dernier lot le met au panier comme n'importe quel autre (le contenu du biscuit est inconnu du plan : la quantité se confirme)
  await cards.last().getByRole('button', { name: 'Choisir' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await returnsToRepas(page, fake)
  expect(fake.cart()).toEqual({ 1000079: 1 })
  expect(
    fake
      .paced()
      .filter((call) => call.filter === undefined)
      .map((call) => call.kind),
  ).toEqual(['search', 'cart'])
  expectPoliteAgent(fake)
})

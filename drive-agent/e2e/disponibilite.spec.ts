// DRV-635 de bout en bout : « introuvable à la recherche » n'est pas « indisponible », et le panier tranche la disponibilité. Le faux site a
// un moteur à apostrophe stricte (comme le vrai : « c'est » et « cest » retrouvent « C'est », « c est » ne trouve rien) et deux modes de stock nul :
// « disponibilité trompeuse » (la fiche dit « Bientôt disponible », le panier accepte, comme le site mobile) et « vraie rupture » (le panier refuse).
import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import type { FakeLeclerc } from '../fake-leclerc/server'

/** Les mots cherchés, dans l'ordre des requêtes du faux site. */
const searches = (fake: FakeLeclerc): string[] =>
  fake
    .paced()
    .filter((call) => call.kind === 'search')
    .map((call) => call.detail ?? '')

/** Gâteaux C'est Nous Pépites (1000034, en stock, apostrophe) et Céréales fourrées P'tit Fermier (1000033, stock nul, apostrophe). */
const CAKES = 1000034
const CEREALS = 1000033
const GRAMS = { quantity: 900, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const

test.describe('la recherche d’un libellé qui porte une apostrophe (moteur à apostrophe stricte)', () => {
  test('le libellé tel quel le retrouve : une recherche, une écriture, rien demandé, jamais « c est »', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    fake.setBehavior({ strictApostrophe: true })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('gateaux', 'Gâteaux', [product(CAKES, 2)])]),
    )

    // When
    await returnsToRepas(page, fake)

    // Then
    expect(searches(fake)).toEqual(["Gâteaux C'est Nous Pépites 300 g"])
    expect(fake.cart()).toEqual({ [CAKES]: 2 })
    expectPoliteAgent(fake)
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'completed',
      lines: [{ outcome: 'ADDED', productId: String(CAKES), quantity: 2, usedRank: 1 }],
    })
  })

  test('un libellé périmé que seule la forme la plus simple retrouve : cinq recherches au plus, l’apostrophe est retirée et jamais remplacée par une espace', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le libellé mémorisé porte une mention (« Édition limitée ») que le site n'a plus
    fake.setBehavior({ strictApostrophe: true })
    const stale = {
      ...product(CAKES, 1),
      label: 'Gâteaux C’est Nous Pépites 300 g Édition limitée',
    }
    await openWithFragment(page, fake, agentCode, planOf([known('gateaux', 'Gâteaux', [stale])]))

    // When
    await returnsToRepas(page, fake)

    // Then : le libellé, ses quatre formes (la dernière le retrouve), puis l'écriture
    const asked = searches(fake)
    expect(asked).toEqual([
      'Gâteaux C’est Nous Pépites 300 g Édition limitée',
      "gateaux c'est nous pepites 300 g edition limitee",
      'gateaux cest nous pepites 300 g edition limitee',
      'gateaux cest nous pepites edition limitee',
      'gateaux pepites',
    ])
    expect(asked.some((query) => /\bc est\b/i.test(query))).toBe(false)
    expect(fake.cart()).toEqual({ [CAKES]: 1 })
    expect(fake.paced().map((call) => call.kind)).toEqual([
      'search',
      'search',
      'search',
      'search',
      'search',
      'cart',
    ])
    expectPoliteAgent(fake)
    expect(await returnedResult(page, fake)).toMatchObject({
      lines: [{ outcome: 'ADDED', productId: String(CAKES), usedRank: 1 }],
    })
  })
})

test.describe('« Bientôt disponible » : le panier tranche', () => {
  test('disponibilité trompeuse, produit habituel : tenté une fois, accepté, au panier sans rien demander', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la fiche dit stock nul et « Bientôt disponible », le panier accepte (comme le site mobile)
    fake.setBehavior({ availability: 'misleading' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('cereales', 'Céréales', [product(CEREALS, 2)])]),
    )

    // When
    await returnsToRepas(page, fake)

    // Then : la quantité calculée de d'habitude, une recherche et une écriture
    expect(fake.cart()).toEqual({ [CEREALS]: 2 })
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart'])
    expectPoliteAgent(fake)
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'completed',
      lines: [{ outcome: 'ADDED', productId: String(CEREALS), quantity: 2, usedRank: 1 }],
    })
  })

  test('disponibilité trompeuse, nouveau produit : « Plus en stock » reste dit, « Choisir » reste actif, le produit se met au panier', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    fake.setBehavior({ availability: 'misleading' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('cereales', 'Céréales', { searchQuery: 'cereales', needed: GRAMS })]),
    )

    // When
    const card = page.getByRole('listitem').filter({ hasText: 'Céréales fourrées' })
    await expect(card).toContainText('Plus en stock.')
    await expect(card.getByRole('button', { name: 'Choisir' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Indisponible' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Choisir' }).click()
    await returnsToRepas(page, fake)

    // Then : 900 g demandés, 450 g par produit : 2
    expect(fake.cart()).toEqual({ [CEREALS]: 2 })
    expectPoliteAgent(fake)
    expect(await returnedResult(page, fake)).toMatchObject({
      lines: [{ outcome: 'CHOSEN', product: { id: String(CEREALS) }, quantity: 2 }],
    })
  })

  test('vraie rupture : une seule tentative, « Plus en stock. » sans nombre ; « Choisir » enregistre le choix, le passage continue, la fin dit pourquoi (DRV-644)', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la fiche dit « Bientôt disponible » et le panier refuse
    fake.setBehavior({ availability: 'real-out' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([
        known('cereales', 'Céréales', [product(CEREALS, 2)], {
          searchQuery: 'cereales',
          needed: GRAMS,
        }),
        fresh('sel', 'Sel', { needed: GRAMS }),
      ]),
    )

    // When : la phase A tente une fois l'écriture, le panier la refuse
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search'])

    // And : la fiche dit seulement « Plus en stock. » (pas de nombre de produits à mettre au panier), « Choisir » reste actif
    const card = page.getByRole('listitem').filter({ hasText: 'Céréales fourrées' })
    await expect(card).toContainText('Plus en stock.')
    await expect(card).not.toContainText('À mettre au panier')
    await card.getByRole('button', { name: 'Choisir' }).click()
    await page.getByRole('button', { name: 'Toujours prendre celui-ci' }).click()

    // Then : le passage continue (l'article suivant), sans bandeau ni demande de choisir autre chose
    await expect(page.getByText('Il te faut : 900 g.')).toBeVisible()
    await expect(page.locator('.head strong')).toHaveText('Sel')
    await expect(page.getByText('Choisis-en un autre')).toHaveCount(0)
    await page.getByRole('button', { name: 'Pas cette fois' }).click()

    // And : la fin le dit en une phrase, avec la raison ; le panier est vide
    await expect(
      page.getByText(
        "« Céréales fourrées P'tit Fermier Chocolat noisette » est enregistré, mais pas dans ton panier. Leclerc indique « Bientôt disponible » : tu ne peux pas le commander pour l’instant.",
      ),
    ).toBeVisible()
    expect(fake.cart()).toEqual({})
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    await returnsToRepas(page, fake)

    // And : le résultat est une ligne CHOSEN ordinaire, avec le produit à mémoriser et aucune clé de plus
    const result = await returnedResult(page, fake)
    expect(result).toMatchObject({
      lines: [
        {
          ingredientSlug: 'cereales',
          outcome: 'CHOSEN',
          placement: 'PRIMARY',
          quantity: 2,
          product: { id: String(CEREALS) },
        },
        { ingredientSlug: 'sel', outcome: 'SKIPPED' },
      ],
    })
    const chosen = (result as unknown as { lines: Record<string, unknown>[] }).lines[0] ?? {}
    expect(Object.keys(chosen).sort()).toEqual(
      ['ingredientSlug', 'outcome', 'placement', 'product', 'quantity', 'unavailableIds'].sort(),
    )
    expectPoliteAgent(fake)
  })

  test('disponible sur la fiche mais pas pris par le panier : même enregistrement, la raison dit que Leclerc n’en donne pas', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le panier refuse le gâteau (1000034), dont la fiche dit un stock
    fake.setBehavior({ refuseCart: [CAKES] })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('gateaux', 'Gâteaux', { needed: GRAMS })]),
    )

    // When : l'utilisateur choisit ce gâteau
    const card = page.getByRole('listitem').filter({ hasText: 'Pépites' })
    await card.getByRole('button', { name: 'Choisir' }).click()

    // Then : la fin dit pourquoi, le choix revient à Repas, le panier est vide
    await expect(
      page.getByText(
        "« Gâteaux C'est Nous Pépites » est enregistré, mais pas dans ton panier : Leclerc n’a pas voulu le mettre au panier, sans en donner la raison.",
      ),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    await returnsToRepas(page, fake)
    expect(fake.cart()).toEqual({})
    expect(await returnedResult(page, fake)).toMatchObject({
      lines: [{ ingredientSlug: 'gateaux', outcome: 'CHOSEN', product: { id: String(CAKES) } }],
    })
  })
})

test.describe('introuvable n’est pas indisponible', () => {
  test('un produit habituel que la recherche ne retrouve pas : « Je ne retrouve pas », recherche préremplie, case décochée, mémoire intacte', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : un produit mémorisé que le faux site n'a pas du tout
    const gone = { ...product(CAKES, 1), label: 'Raviolis frais maison 400 g' }
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('gnocchis', 'Gnocchis', [gone], { searchQuery: 'gnocchis' })]),
    )

    // When

    // Then
    await expect(
      page.getByText(
        'Je ne retrouve pas « Raviolis frais maison 400 g » : cherche-le ou choisis-en un autre.',
      ),
    ).toBeVisible()
    await expect(page.getByText('ne sont plus disponibles')).toHaveCount(0)
    await expect(page.getByLabel('Chercher autre chose')).toHaveValue('raviolis maison')
    await expect(page.getByLabel('Ne plus proposer Raviolis frais maison 400 g')).not.toBeChecked()
    // le libellé et ses formes d'abord (5 requêtes au plus), puis la recherche de l'article
    expect(searches(fake)).toEqual([
      'Raviolis frais maison 400 g',
      'raviolis frais maison',
      'raviolis maison',
      'gnocchis',
      'gnocchi',
    ])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await returnsToRepas(page, fake)
    const result = await returnedResult(page, fake)
    expect(JSON.stringify(result)).not.toContain('rejected')
  })
})

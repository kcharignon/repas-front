// Le repli de recherche de bout en bout (ticket D de l'audit du 2026-10-18, H3 et H7) : le moteur de Leclerc est sensible aux accents, à la
// ligature « œ », au pluriel et aux noms longs. Le faux site a un mode « moteur strict » qui l'imite (`strictSearch`) ; quand la recherche du
// nom ne répond rien, l'agent essaie les formes dérivées UNE par UNE, à la cadence normale, au plus 4, jamais deux fois la même, s'arrête à la
// première qui répond et dit laquelle a répondu. Le faux site juge la cadence : jamais en parallèle, jamais plus vite que 800 ms.
import { openWithFragment, returnedResult } from './support/agent'
import { expectPoliteAgent, gapsBetween } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import { MIN_GAP_MS, type FakeLeclerc } from '../fake-leclerc/server'

const ONE = { quantity: 1, unitSymbol: 'boîte', dimension: 'PACKAGE', baseFactor: 1 } as const

/** Les mots cherchés, dans l'ordre des requêtes du faux site. */
const searches = (fake: FakeLeclerc): string[] =>
  fake
    .paced()
    .filter((call) => call.kind === 'search')
    .map((call) => call.detail ?? '')

test.describe('un nouvel ingrédient (phase B)', () => {
  test('« œuf » ne répond rien, « oeuf » répond : l’agent le cherche tout seul, montre ses produits et dit laquelle des recherches a répondu', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le moteur strict ne replie pas la ligature ; le nom de l'ingrédient est « œuf »
    fake.setBehavior({ strictSearch: true })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('oeuf', 'Œuf', { searchQuery: 'œuf', needed: ONE })]),
    )

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()

    // Then : la liste vient de la recherche « oeuf », et le dit ; « Chercher autre chose » est toujours là
    await expect(page.getByText('Résultats pour « oeuf » (rien trouvé pour « œuf »)')).toBeVisible()
    await expect(page.getByLabel('Chercher autre chose')).toHaveValue('oeuf')
    const card = page.getByRole('listitem').filter({ hasText: '6 pièces' })
    await expect(card).toContainText('Oeufs frais de plein air')
    expect(fake.cart(), 'l’agent ne choisit jamais seul').toEqual({})
    expect(searches(fake)).toEqual(['œuf', 'oeuf'])

    // And : le choix de l'utilisateur met le produit au panier
    await card.getByRole('button', { name: 'Choisir' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()
    expect(fake.cart()).toEqual({ 1000014: 1 })
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'cart'])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'completed',
      lines: [{ ingredientSlug: 'oeuf', outcome: 'CHOSEN', product: { id: '1000014' } }],
    })
  })

  test('un nom qui répond du premier coup ne fait qu’une requête et ne dit rien de plus', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    fake.setBehavior({ strictSearch: true })
    await openWithFragment(page, fake, agentCode, planOf([fresh('sel', 'Sel')]))

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()

    // Then
    await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()
    expect(searches(fake)).toEqual(['sel'])
  })

  test('« zzqxkw » ne répond à rien : deux requêtes (le nom et son pluriel), « Aucun produit trouvé », et la main reste à l’utilisateur', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    fake.setBehavior({ strictSearch: true })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('zzqxkw', 'Zzqxkw', { searchQuery: 'zzqxkw' })]),
    )

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()

    // Then
    await expect(
      page.getByText('Aucun produit trouvé pour « zzqxkw ». Essayez un autre mot.'),
    ).toBeVisible()
    await expect(page.getByLabel('Chercher autre chose')).toHaveValue('zzqxkw')
    expect(searches(fake)).toEqual(['zzqxkw', 'zzqxkws'])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()
  })

  test('un nom long qui ne répond à rien fait cinq requêtes au plus, toutes différentes, chacune après la précédente et à la cadence normale', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : un nom de quatre formes, dont aucune ne répond
    const name = 'Zzqxkws de Provence'
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('zzqxkws', name, { searchQuery: name })]),
    )

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByText(`Aucun produit trouvé pour « ${name} ».`)).toBeVisible()

    // Then : le nom, puis ses quatre formes dans l'ordre (minuscules, singulier, sans « de », premier mot)
    expect(searches(fake)).toEqual([
      name,
      'zzqxkws de provence',
      'zzqxkw de provence',
      'zzqxkws provence',
      'zzqxkws',
    ])
    expect(fake.paced()).toHaveLength(5)
    expectPoliteAgent(fake)
    expect(Math.min(...gapsBetween(fake))).toBeGreaterThanOrEqual(MIN_GAP_MS - 5)
    await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  })

  test('ce que l’utilisateur tape dans « Chercher autre chose » n’est pas réécrit : une seule requête', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le moteur strict ; l'utilisateur tape « œuf », qu'il pense bien écrit
    fake.setBehavior({ strictSearch: true })
    await openWithFragment(page, fake, agentCode, planOf([fresh('sel', 'Sel')]))
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()

    // When
    await page.getByLabel('Chercher autre chose').fill('œuf')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()

    // Then
    await expect(
      page.getByText('Aucun produit trouvé pour « œuf ». Essayez un autre mot.'),
    ).toBeVisible()
    expect(searches(fake)).toEqual(['sel', 'œuf'])
    await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  })
})

test.describe('un produit connu (phase A)', () => {
  test('que son libellé complet ne retrouve pas est retrouvé par une forme du libellé, puis mis au panier sans rien demander', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le libellé mémorisé porte la ligature « Œufs », que le moteur strict ne replie pas
    fake.setBehavior({ strictSearch: true })
    const eggs = { ...product(1000014, 1), label: 'Œufs frais de plein air Ferme Fictive' }
    await openWithFragment(page, fake, agentCode, planOf([known('oeufs', 'Oeufs', [eggs])]))

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

    // Then : le libellé, sa forme en minuscules, sa forme sans ligature (qui retrouve le produit), puis l'écriture
    expect(searches(fake)).toEqual([
      'Œufs frais de plein air Ferme Fictive',
      'œufs frais de plein air ferme fictive',
      'oeufs frais de plein air ferme fictive',
    ])
    expect(fake.cart()).toEqual({ 1000014: 1 })
    expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'search', 'search', 'cart'])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      lines: [{ ingredientSlug: 'oeufs', outcome: 'ADDED', productId: '1000014', usedRank: 1 }],
    })
  })

  test('qu’aucune forme ne retrouve reste « plus disponible » : l’utilisateur le remplace, le passage continue', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : un produit mémorisé que le faux site n'a pas, pour un ingrédient qui n'a pas de réponse non plus
    const gone = { ...product(1000014, 1), label: 'Raviolis frais maison' }
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('gnocchis', 'Gnocchis', [gone], { searchQuery: 'gnocchis' })]),
    )

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()
    await expect(
      page.getByText('Aucun produit trouvé pour « gnocchis ». Essayez un autre mot.'),
    ).toBeVisible()

    // Then : le libellé et ses trois formes, puis la recherche de l'ingrédient et son singulier ; aucune requête rejouée
    expect(searches(fake)).toEqual([
      'Raviolis frais maison',
      'raviolis frais maison',
      'ravioli frais maison',
      'raviolis',
      'gnocchis',
      'gnocchi',
    ])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()
    expect(fake.cart()).toEqual({})
  })
})

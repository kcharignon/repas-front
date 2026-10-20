// La recherche qui a fait trouver le produit (DRV-650, agent 0.40.0) de bout en bout, contre le faux site. « Céréale coussin » est le mot de la maison,
// pas celui du drive : le plan porte la recherche mémorisée (`searchQuery`), l'agent la cherche d'abord, puis le libellé du produit mémorisé, puis le nom ;
// et il rend à Repas, avec le produit choisi, la recherche qui l'a fait apparaître, SEULEMENT si elle diffère de celle du plan.
import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import type { FakeLeclerc } from '../fake-leclerc/server'

const ONE = { quantity: 1, unitSymbol: 'boîte', dimension: 'PACKAGE', baseFactor: 1 } as const
const GRAMS = { quantity: 900, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
/** Céréales fourrées P'tit Fermier (stock nul) : le produit habituel qui n'est plus disponible. */
const CEREALS = 1000033
const CEREALS_LABEL = "Céréales fourrées P'tit Fermier Chocolat noisette 450 g"

/** Les mots cherchés, dans l'ordre des requêtes du faux site (hors validation du filtre du site, en tâche de fond). */
const searches = (fake: FakeLeclerc): string[] =>
  fake
    .paced()
    .filter((call) => call.kind === 'search' && call.filter === undefined)
    .map((call) => call.detail ?? '')

/** La ligne `CHOSEN` du résultat, avec ses clés telles qu'elles sont parties. */
async function chosenLine(page: Parameters<typeof returnedResult>[0], fake: FakeLeclerc) {
  const result = await returnedResult(page, fake)
  const [line] = (result as unknown as { lines: Record<string, unknown>[] }).lines

  return line ?? {}
}

test.describe('ce que l’agent rend à Repas avec le produit choisi', () => {
  test('une recherche tapée dans « Chercher autre chose », puis un produit choisi : la ligne porte cette recherche', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : l'article « Sel » ; la personne cherche plutôt « poivre noir moulu »
    await openWithFragment(page, fake, agentCode, planOf([fresh('sel', 'Sel', { needed: ONE })]))
    await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()

    // When
    await page.getByLabel('Chercher autre chose').fill('  poivre   noir moulu ')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    const card = page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })
    await card.getByRole('button', { name: 'Choisir' }).click()
    await returnsToRepas(page, fake)

    // Then : la recherche nettoyée est dans la ligne, et rien d'autre ne change
    const line = await chosenLine(page, fake)
    expect(line).toMatchObject({
      ingredientSlug: 'sel',
      outcome: 'CHOSEN',
      placement: 'PRIMARY',
      searchQuery: 'poivre noir moulu',
    })
    expect(Object.keys(line).sort()).toEqual(
      ['ingredientSlug', 'outcome', 'placement', 'product', 'quantity', 'searchQuery'].sort(),
    )
    expectPoliteAgent(fake)
  })

  test('la dernière recherche lancée gagne : celle qui n’a rien trouvé ne compte pas', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([fresh('sel', 'Sel', { needed: ONE })]))
    await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()

    await page.getByLabel('Chercher autre chose').fill('zzqxkw')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await expect(page.getByText('Aucun produit trouvé pour « zzqxkw »')).toBeVisible()
    await page.getByLabel('Chercher autre chose').fill('poivre noir')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Poivre noir moulu' })
      .getByRole('button', { name: 'Choisir' })
      .click()
    await returnsToRepas(page, fake)

    expect(await chosenLine(page, fake)).toMatchObject({ searchQuery: 'poivre noir' })
  })

  test('la recherche du plan inchangée : le résultat ne porte aucune clé « searchQuery »', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([fresh('sel', 'Sel', { needed: ONE })]))
    await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()

    await page.getByRole('listitem').first().getByRole('button', { name: 'Choisir' }).click()
    await returnsToRepas(page, fake)

    const line = await chosenLine(page, fake)
    expect(line).toMatchObject({ outcome: 'CHOSEN', placement: 'PRIMARY' })
    expect(Object.keys(line)).not.toContain('searchQuery')
  })

  test('« Pas mon habituel » ne mémorise rien : aucune recherche ne repart', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : un produit habituel perdu
    fake.setBehavior({ availability: 'real-out' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('cereales', 'Céréales', [product(CEREALS, 2)], { needed: GRAMS })]),
    )
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

    // When : la personne tape une autre recherche, puis prend le produit sans en faire son habituel
    await page.getByLabel('Chercher autre chose').fill('poivre noir')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Poivre noir moulu' })
      .getByRole('button', { name: /^Pas mon habituel/ })
      .click()
    await returnsToRepas(page, fake)

    // Then
    const line = await chosenLine(page, fake)
    expect(line).toMatchObject({ outcome: 'CHOSEN', placement: 'ONCE' })
    expect(Object.keys(line)).not.toContain('searchQuery')
  })
})

test.describe('un produit habituel devenu indisponible : la recherche du plan, puis le libellé, puis le nom', () => {
  test('la recherche mémorisée répond : elle est cherchée, elle remplit le champ, le besoin reste le nom, et elle n’est pas renvoyée', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : « Céréale coussin » est notre mot ; sur le drive, c'est « céréales fourrées » (recherche mémorisée)
    fake.setBehavior({ availability: 'real-out' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([
        known('cereale-coussin', 'Céréale coussin', [product(CEREALS, 2)], {
          searchQuery: 'céréales fourrées',
          needed: GRAMS,
        }),
      ]),
    )

    // When
    await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()

    // Then : le besoin garde le nom de l'ingrédient, le champ la recherche réellement utilisée
    await expect(page.getByText('Il te faut : 900 g.')).toBeVisible()
    await expect(page.locator('.head strong')).toHaveText('Céréale coussin')
    await expect(page.getByLabel('Chercher autre chose')).toHaveValue('céréales fourrées')
    await expect(
      page.getByText('Résultats pour « céréales fourrées »', { exact: true }),
    ).toBeVisible()
    // le libellé en phase A (le produit habituel), puis la recherche mémorisée ; ni le nom ni rien d'autre
    expect(searches(fake)).toEqual([CEREALS_LABEL, 'céréales fourrées'])

    // And : choisi dans cette liste, rien de nouveau à mémoriser
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Céréales fourrées' })
      .getByRole('button', { name: 'Choisir' })
      .click()
    // Le panier refuse ce produit (vraie rupture) : le choix est enregistré quand même, et la fin le dit (DRV-644)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    await returnsToRepas(page, fake)
    expect(Object.keys(await chosenLine(page, fake))).not.toContain('searchQuery')
    expectPoliteAgent(fake)
  })

  test('la recherche mémorisée ne répond plus : le libellé du produit mémorisé, et la nouvelle recherche est rendue au choix', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la recherche mémorisée « zzqxkw » ne trouve plus rien sur le site
    fake.setBehavior({ availability: 'real-out' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([
        known('cereale-coussin', 'Céréale coussin', [product(CEREALS, 2)], {
          searchQuery: 'zzqxkw',
          needed: GRAMS,
        }),
      ]),
    )

    // When
    await expect(
      page.getByText(`Résultats pour « ${CEREALS_LABEL} » (rien trouvé pour « zzqxkw »)`),
    ).toBeVisible()

    // Then : le libellé (phase A), la recherche mémorisée et sa forme, puis le libellé du produit mémorisé
    await expect(page.getByLabel('Chercher autre chose')).toHaveValue(CEREALS_LABEL)
    expect(searches(fake)).toEqual([CEREALS_LABEL, 'zzqxkw', 'zzqxkws', CEREALS_LABEL])

    // And : le produit choisi dans cette liste rend le libellé comme nouvelle recherche
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Céréales fourrées' })
      .getByRole('button', { name: 'Choisir' })
      .click()
    // Le panier refuse ce produit (vraie rupture) : le choix est enregistré quand même, et la fin le dit (DRV-644)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    await returnsToRepas(page, fake)
    expect(await chosenLine(page, fake)).toMatchObject({
      outcome: 'CHOSEN',
      placement: 'PRIMARY',
      searchQuery: CEREALS_LABEL,
    })
  })

  test('un produit introuvable n’est pas redemandé par son libellé : la recherche mémorisée, puis le nom', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : un produit mémorisé que le faux site n'a pas du tout ; l'ingrédient s'appelle « Céréales »
    const gone = { ...product(CEREALS, 1), label: 'Raviolis frais maison 400 g' }
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('cereales', 'Céréales', [gone], { searchQuery: 'zzqxkw' })]),
    )

    // When
    await expect(
      page.getByText('Résultats pour « Céréales » (rien trouvé pour « zzqxkw »)'),
    ).toBeVisible()

    // Then : le libellé et ses formes (phase A, introuvable), la recherche mémorisée et sa forme, puis le nom, jamais le libellé une seconde fois
    const asked = searches(fake)
    expect(asked.slice(0, 1)).toEqual(['Raviolis frais maison 400 g'])
    expect(asked.slice(-3)).toEqual(['zzqxkw', 'zzqxkws', 'Céréales'])
    expect(asked.filter((query) => query === 'Raviolis frais maison 400 g')).toHaveLength(1)
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  })

  test('une recherche mémorisée hostile reste du texte : ni image, ni script, ni HTML', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    const hostile = '<img src=x onerror="window.pwned=1"><b>gras</b>'
    fake.setBehavior({ availability: 'real-out' })
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([
        known('cereale-coussin', 'Céréale coussin', [product(CEREALS, 2)], {
          searchQuery: hostile,
          needed: GRAMS,
        }),
      ]),
    )

    // When : rien ne répond à ce texte, le libellé du produit répond
    await expect(page.getByText('(rien trouvé pour', { exact: false })).toBeVisible()

    // Then : le texte est lu comme tel, sans élément créé à partir de lui
    await expect(page.getByText(hostile, { exact: false })).toBeVisible()
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    await expect(page.locator('b', { hasText: 'gras' })).toHaveCount(0)
    expect(
      await page.evaluate(() => (window as unknown as { pwned?: number }).pwned),
    ).toBeUndefined()
    await page.getByRole('button', { name: 'Annuler l’envoi' }).click()
  })
})

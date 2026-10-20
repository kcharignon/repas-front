// La contenance du produit dans l'unité de la liste (DRV-652, agent 0.42.0) et la recherche d'un produit pris « Pas mon habituel » (DRV-653) de bout en bout,
// contre le faux site. « Cheddar en tranche : 15 tranches » contre un produit « 20 Tranches - 340g » : le contenu net (g) ne dit rien des tranches, l'écran
// « Vérifie la quantité » demande donc combien de tranches y a-t-il dans le produit, d'où le nombre de produits ; la réponse revient à Repas avec la ligne.
import type { Page } from '@playwright/test'

import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'

const SLICES = {
  quantity: 15,
  unitSymbol: 'tranche',
  dimension: null,
  baseFactor: null,
  unitSlug: 'tranche',
  unitName: 'tranche',
} as const
/** Les fromages « en tranches » du faux site : 20 tranches (1000132), 8 tranches (1000133). */
const TWENTY = 1000132
const EIGHT = 1000133
const TWENTY_LABEL = 'Fromage cheddar en tranches Fromagerie Fictive 20 Tranches - 340g'

const cheddar = () => fresh('cheddar', 'Cheddar en tranche', { needed: SLICES })
const card = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })
const field = (page: Page) => page.getByLabel(/^Combien de tranches y a-t-il dans/)

/** La ligne du résultat, avec ses clés telles qu'elles sont parties. */
async function lineOf(page: Page, fake: Parameters<typeof returnedResult>[1], slug = 'cheddar') {
  const result = await returnedResult(page, fake)
  const lines = (result as unknown as { lines: Record<string, unknown>[] }).lines

  return lines.find((line) => line.ingredientSlug === slug) ?? {}
}

test.describe('« Combien de tranches y a-t-il dans ce produit ? »', () => {
  test('pose la question en tranches, propose le nombre du libellé, montre le nombre de produits en direct, et rend la contenance avec la ligne', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : 15 tranches voulues, le produit choisi dans la liste dit « 20 Tranches »
    await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
    await card(page, '20 Tranches').getByRole('button', { name: 'Choisir' }).click()

    // Then : la question, le nombre du libellé déjà dans le champ, l'aperçu
    await expect(page.getByRole('heading', { name: 'Vérifie la quantité' })).toBeVisible()
    await expect(field(page)).toBeVisible()
    await expect(
      page.getByText(`Combien de tranches y a-t-il dans « ${TWENTY_LABEL} » ?`),
    ).toBeVisible()
    await expect(page.getByText('Nombre de produits')).toHaveCount(0)
    await expect(field(page)).toHaveValue('20')
    await expect(
      page.getByText('Il te faut 15 tranches : 1 produit', { exact: true }),
    ).toBeVisible()

    // When : la personne corrige, l'aperçu suit chaque frappe
    await field(page).fill('8')
    await expect(
      page.getByText('Il te faut 15 tranches : 2 produits', { exact: true }),
    ).toBeVisible()
    await field(page).fill('7,5')
    await expect(
      page.getByText('Il te faut 15 tranches : 2 produits', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Valider' }).click()
    await returnsToRepas(page, fake)

    // Then : 2 produits au panier, et la contenance revient avec la ligne choisie (rien d'autre n'est ajouté à la ligne)
    expect(fake.cart()).toEqual({ [TWENTY]: 2 })
    const line = await lineOf(page, fake)
    expect(line).toMatchObject({
      outcome: 'CHOSEN',
      placement: 'PRIMARY',
      quantity: 2,
      packSize: { value: 7.5, unitSlug: 'tranche' },
    })
    expect(Object.keys(line).sort()).toEqual(
      ['ingredientSlug', 'outcome', 'packSize', 'placement', 'product', 'quantity'].sort(),
    )
    expectPoliteAgent(fake)
  })

  test('« Valider » reste inactif tant que le nombre n’est pas valide, et la virgule française se comprend', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
    await card(page, '8 Tranches').getByRole('button', { name: 'Choisir' }).click()
    const validate = page.getByRole('button', { name: 'Valider' })

    // Le libellé dit 8 : proposé
    await expect(field(page)).toHaveValue('8')
    await expect(validate).toBeEnabled()
    for (const invalid of ['', '0', 'huit', '10000', '1,2345', '1 000']) {
      await field(page).fill(invalid)
      await expect(validate, `« ${invalid} »`).toBeDisabled()
      await expect(page.getByText('Il te faut 15 tranches.', { exact: true })).toBeVisible()
    }
    await field(page).fill('12,5')
    await expect(validate).toBeEnabled()
    await expect(
      page.getByText('Il te faut 15 tranches : 2 produits', { exact: true }),
    ).toBeVisible()
    await validate.click()
    await returnsToRepas(page, fake)

    expect(fake.cart()).toEqual({ [EIGHT]: 2 })
    expect(await lineOf(page, fake)).toMatchObject({
      packSize: { value: 12.5, unitSlug: 'tranche' },
    })
  })

  test('un libellé qui ne dit pas le nombre de tranches : le champ est vide', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
    await card(page, 'râpé').getByRole('button', { name: 'Choisir' }).click()

    await expect(field(page)).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled()
  })

  test('« Pas cette fois » revient à la liste : rien au panier, aucune contenance', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
    await card(page, '20 Tranches').getByRole('button', { name: 'Choisir' }).click()
    await expect(field(page)).toBeVisible()

    await page.getByRole('button', { name: 'Pas cette fois' }).click()

    // Retour à la liste : la fiche est encore là, rien n'est au panier
    await expect(card(page, '20 Tranches')).toBeVisible()
    expect(fake.cart()).toEqual({})
  })

  test('« Pas mon habituel » : la question est posée (le nombre de produits en dépend), mais aucune contenance ne part, et aucun écran « Toujours prendre ce produit ? »', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
    await card(page, '20 Tranches').getByRole('button', { name: 'Pas mon habituel' }).click()
    await expect(field(page)).toHaveValue('20')
    await page.getByRole('button', { name: 'Valider' }).click()
    await returnsToRepas(page, fake)

    expect(fake.cart()).toEqual({ [TWENTY]: 1 })
    const line = await lineOf(page, fake)
    expect(line).toMatchObject({ outcome: 'CHOSEN', placement: 'ONCE', quantity: 1 })
    expect(Object.keys(line)).not.toContain('packSize')
  })

  test('le plan ne dit pas l’unité de la ligne (back ou application plus anciens) : « Nombre de produits (de 1 à 99) », et aucune contenance', async ({
    page,
    fake,
    agentCode,
  }) => {
    const { unitSlug: _slug, unitName: _name, ...old } = SLICES
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([fresh('cheddar', 'Cheddar en tranche', { needed: old })]),
    )
    await card(page, '20 Tranches').getByRole('button', { name: 'Choisir' }).click()

    await expect(page.getByLabel('Nombre de produits (de 1 à 99)')).toBeVisible()
    await expect(field(page)).toHaveCount(0)
    await page.getByLabel('Nombre de produits (de 1 à 99)').fill('2')
    await page.getByRole('button', { name: 'Valider' }).click()
    await returnsToRepas(page, fake)

    expect(fake.cart()).toEqual({ [TWENTY]: 2 })
    const line = await lineOf(page, fake)
    expect(line).toMatchObject({ outcome: 'CHOSEN', quantity: 2 })
    expect(Object.keys(line)).not.toContain('packSize')
  })

  test('un produit connu au nombre à vérifier : la même question, et la contenance revient avec la ligne ADDED', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le fromage de 20 tranches est le produit habituel, le plan ne sait pas calculer
    const plan = planOf([
      known('cheddar', 'Cheddar en tranche', [product(TWENTY, null)], { needed: SLICES }),
    ])
    await openWithFragment(page, fake, agentCode, plan)

    // Then
    await expect(field(page)).toHaveValue('20')
    await page.getByRole('button', { name: 'Valider' }).click()
    await returnsToRepas(page, fake)
    expect(fake.cart()).toEqual({ [TWENTY]: 1 })
    expect(await lineOf(page, fake)).toEqual({
      ingredientSlug: 'cheddar',
      outcome: 'ADDED',
      productId: String(TWENTY),
      quantity: 1,
      usedRank: 1,
      price: expect.objectContaining({ cents: 299 }) as unknown,
      packSize: { value: 20, unitSlug: 'tranche' },
    })
  })

  test('l’envoi suivant : le plan dit COMPUTED avec la contenance, aucune question, rien n’est rendu de plus', async ({
    page,
    fake,
    agentCode,
  }) => {
    const planned = {
      ...product(TWENTY, 1),
      packSize: { value: 20, unitSlug: 'tranche' },
    }
    const plan = planOf([known('cheddar', 'Cheddar en tranche', [planned], { needed: SLICES })])

    await openWithFragment(page, fake, agentCode, plan)
    await returnsToRepas(page, fake)

    expect(fake.cart()).toEqual({ [TWENTY]: 1 })
    const line = await lineOf(page, fake)
    expect(line).toMatchObject({ outcome: 'ADDED', quantity: 1 })
    expect(Object.keys(line)).not.toContain('packSize')
  })
})

test.describe('la recherche d’un produit pris « Pas mon habituel » (DRV-653)', () => {
  test('une recherche tapée dans « Chercher autre chose », puis « Pas mon habituel » : la ligne ONCE porte cette recherche', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : « Poivre » ; la personne cherche plutôt « poivre noir moulu »
    const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
    await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre', { needed })]))
    await expect(page.getByText('Résultats pour « poivre »', { exact: true })).toBeVisible()

    // When
    await page.getByLabel('Chercher autre chose').fill('  poivre   noir moulu ')
    await page.getByRole('button', { name: 'Chercher', exact: true }).click()
    await card(page, 'Poivre noir moulu').getByRole('button', { name: 'Pas mon habituel' }).click()
    await returnsToRepas(page, fake)

    // Then : aucun écran « Toujours prendre ce produit ? » n'a eu lieu, et la recherche nettoyée est dans la ligne
    expect(fake.cart()).toEqual({ 1000021: 2 })
    const line = await lineOf(page, fake, 'poivre')
    expect(line).toMatchObject({
      outcome: 'CHOSEN',
      placement: 'ONCE',
      searchQuery: 'poivre noir moulu',
    })
    expect(Object.keys(line).sort()).toEqual(
      ['ingredientSlug', 'outcome', 'placement', 'product', 'quantity', 'searchQuery'].sort(),
    )
    expectPoliteAgent(fake)
  })

  test('« Pas mon habituel » sans autre recherche que celle du plan : aucune clé', async ({
    page,
    fake,
    agentCode,
  }) => {
    const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
    await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre', { needed })]))

    await card(page, 'Poivre noir moulu').getByRole('button', { name: 'Pas mon habituel' }).click()
    await returnsToRepas(page, fake)

    const line = await lineOf(page, fake, 'poivre')
    expect(line).toMatchObject({ placement: 'ONCE' })
    expect(Object.keys(line)).not.toContain('searchQuery')
  })
})

// —— Captures de l'écran « Vérifie la quantité » (à lire avant de conclure) ———————————————————————————————————————————————————————

for (const [name, viewport] of [
  ['412', { width: 412, height: 915 }],
  ['360', { width: 360, height: 740 }],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`écran de contenance, ${name} px, ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme })

      test('tient à l’écran, boutons à la portée du pouce, captures dans test-results', async ({
        page,
        fake,
        agentCode,
      }, info) => {
        await openWithFragment(page, fake, agentCode, planOf([cheddar()]))
        await card(page, '20 Tranches').getByRole('button', { name: 'Choisir' }).click()
        await expect(field(page)).toHaveValue('20')

        await expect(page.getByRole('button', { name: 'Valider' })).toBeInViewport({ ratio: 0.99 })
        await expect(page.getByRole('button', { name: 'Pas cette fois' })).toBeInViewport({
          ratio: 0.99,
        })
        await page.screenshot({ path: info.outputPath(`contenance-${name}-${scheme}.png`) })

        // Le champ vide : « Valider » inactif
        await field(page).fill('')
        await page.screenshot({ path: info.outputPath(`contenance-${name}-${scheme}-vide.png`) })
      })
    })
  }
}

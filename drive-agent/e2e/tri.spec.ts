// Trier la liste des produits proposés, de bout en bout (DRV-743) : la recherche « pomme » du faux site rend quatre produits dont l'ordre n'est ni celui du prix, ni
// celui du prix au kilo (une compote, un jus mesuré au litre, deux pommes au kilo). Le tri est local : il ne coûte aucune requête, ne change pas ce que l'agent propose,
// et ce que la personne choisit en tête de liste triée est ce produit, pas celui qui était à cette place dans l'ordre du site. Données inventées.
import type { Page } from '@playwright/test'

import { PRODUCTS } from '../fake-leclerc/catalog'
import { openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, planOf } from './support/plans'

const KILO = { quantity: 1, unitSymbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 } as const

test.use({ viewport: { width: 360, height: 640 } })

const idOf = (label: string): number => {
  const found = PRODUCTS.find((product) => product.label1.startsWith(label))
  if (!found) throw new Error(`Produit « ${label} » absent du faux site`)
  return found.id
}

const cardsOf = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Choisir/ }) })
const titlesOf = (page: Page) => cardsOf(page).locator('.name').allTextContents()
const sortRow = (page: Page) => page.getByRole('group', { name: 'Trier' })

async function openApples(
  page: Page,
  fake: Parameters<typeof openWithFragment>[1],
  agentCode: string,
) {
  await openWithFragment(page, fake, agentCode, planOf([fresh('pomme', 'Pomme', { needed: KILO })]))
  await expect(page.getByText('Il te faut : 1 kg.')).toBeVisible()
}

test('trie par prix puis par prix au kilo sans aucune requête de plus, et le premier produit trié est celui qui part au panier', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : « pomme », quatre produits dans l'ordre du site
  await openApples(page, fake, agentCode)
  const siteOrder = [
    'Pommes Gala Verger Imaginaire',
    'Pommes Golden Verger Imaginaire',
    'Compote de pommes Verger Imaginaire',
    'Jus de pomme Verger Imaginaire',
  ]
  await expect(sortRow(page).getByRole('button')).toHaveText([
    'Pertinence',
    'Prix',
    'Prix au kilo',
    'A → Z',
  ])
  await expect(sortRow(page).getByRole('button', { name: 'Pertinence' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await titlesOf(page)).toEqual(siteOrder)
  const requests = fake.paced().length

  // When : « Prix », du moins cher au plus cher
  await sortRow(page).getByRole('button', { name: 'Prix', exact: true }).click()

  // Then : la compote (1,55 €), le jus, les pommes ; la flèche et la phrase le disent
  expect(await titlesOf(page)).toEqual([
    'Compote de pommes Verger Imaginaire',
    'Jus de pomme Verger Imaginaire',
    'Pommes Golden Verger Imaginaire',
    'Pommes Gala Verger Imaginaire',
  ])
  await expect(sortRow(page).getByRole('button', { name: 'Prix ↑' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    page.getByText('Du moins cher au plus cher. Touche encore pour inverser.'),
  ).toBeVisible()

  // When : « Prix » encore, puis « Prix au kilo »
  await sortRow(page).getByRole('button', { name: 'Prix ↑' }).click()
  expect((await titlesOf(page))[0]).toBe('Pommes Gala Verger Imaginaire')
  await sortRow(page).getByRole('button', { name: 'Prix au kilo' }).click()

  // Then : les produits au kilo d'abord (2,39 €, 2,49 €, 3,88 €), le jus mesuré au litre en dernier : on ne compare pas des kilos et des litres
  expect(await titlesOf(page)).toEqual([
    'Pommes Golden Verger Imaginaire',
    'Pommes Gala Verger Imaginaire',
    'Compote de pommes Verger Imaginaire',
    'Jus de pomme Verger Imaginaire',
  ])
  expect(fake.paced().length, 'trier ne demande rien au site').toBe(requests)
  expect(fake.cart(), 'trier ne met rien au panier').toEqual({})

  // When : on choisit le premier produit de la liste triée
  await cardsOf(page)
    .first()
    .getByRole('button', { name: /^Choisir/ })
    .click()
  await returnsToRepas(page, fake)

  // Then : c'est CE produit qui est au panier et dans le résultat (pas celui de la première place du site)
  const golden = idOf('Pommes Golden')
  expect(Object.keys(fake.cart())).toEqual([String(golden)])
  expectPoliteAgent(fake)
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [
      {
        ingredientSlug: 'pomme',
        outcome: 'CHOSEN',
        placement: 'PRIMARY',
        product: { id: String(golden) },
      },
    ],
  })
})

test('A → Z sans tenir compte des accents, puis Z → A ; un nouveau tri repart du sens croissant ; le tri suit « Chercher autre chose »', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la liste des pommes
  await openApples(page, fake, agentCode)

  // When : A → Z
  await sortRow(page).getByRole('button', { name: 'A → Z' }).click()

  // Then : l'ordre alphabétique, avec sa flèche et sa phrase
  expect(await titlesOf(page)).toEqual([
    'Compote de pommes Verger Imaginaire',
    'Jus de pomme Verger Imaginaire',
    'Pommes Gala Verger Imaginaire',
    'Pommes Golden Verger Imaginaire',
  ])
  await expect(page.getByText('De A à Z. Touche encore pour inverser.')).toBeVisible()
  await sortRow(page).getByRole('button', { name: 'A → Z ↑' }).click()
  expect((await titlesOf(page))[0]).toBe('Pommes Golden Verger Imaginaire')
  await expect(page.getByText('De Z à A. Touche encore pour inverser.')).toBeVisible()

  // When : une nouvelle recherche
  await page.getByLabel('Chercher autre chose').fill('farine')
  await page.getByRole('button', { name: 'Chercher', exact: true }).click()

  // Then : le tri choisi est appliqué à ses résultats, sans que la personne le retouche
  await expect(page.getByText('Résultats pour « farine »')).toBeVisible()
  const titles = await titlesOf(page)
  expect(titles.length).toBeGreaterThan(2)
  expect(titles).toEqual(
    [...titles].sort((a, b) => b.localeCompare(a, 'fr', { sensitivity: 'base' })),
  )
  await expect(sortRow(page).getByRole('button', { name: 'A → Z ↓' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('le tri choisi pour un article est déjà là pour le suivant', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : deux articles à choisir
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      fresh('pomme', 'Pomme', { needed: KILO }),
      fresh('farine', 'Farine', { needed: KILO }),
    ]),
  )
  await expect(page.getByText('Pomme (1 sur 2)')).toBeVisible()
  await sortRow(page).getByRole('button', { name: 'Prix', exact: true }).click()
  await sortRow(page).getByRole('button', { name: 'Prix ↑' }).click()

  // When : on choisit une pomme
  await cardsOf(page)
    .first()
    .getByRole('button', { name: /^Choisir/ })
    .click()

  // Then : la farine s'ouvre déjà du plus cher au moins cher
  await expect(page.getByText('Farine (2 sur 2)')).toBeVisible()
  await expect(sortRow(page).getByRole('button', { name: 'Prix ↓' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    page.getByText('Du plus cher au moins cher. Touche encore pour inverser.'),
  ).toBeVisible()
})

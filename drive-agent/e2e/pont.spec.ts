// L'agent vu par l'application Android : injecté avec le VRAI script d'injection de l'application (`injection.js`) par-dessus un faux
// canal natif. Le plan arrive par le pont (pas par le fragment d'adresse) et le résultat repart par le pont (pas de navigation).
// Couvre aussi le mode configuration (lire le magasin de la page) et le diagnostic (commande de l'application).
import { openWithBridge } from './support/agent'
import { waitForQuiet } from './support/cadence'
import { expect, test } from './support/fixtures'
import { known, planOf, product, RUN_ID, SETUP } from './support/plans'
import type { Fault } from '../fake-leclerc/server'

const DIAGNOSTIC = { v: 1, type: 'command', command: 'diagnostic' } as const

test('reçoit le plan par le pont, remplit le panier et renvoie le résultat par le pont, sans quitter la page', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : l'application a ouvert la page du magasin ; l'agent s'annonce (« hello ») et reçoit le plan
  const app = await openWithBridge(page, fake, agentCode)
  await app.received('hello')
  const pageUrl = page.url()
  await app.send(planOf([known('farine', 'Farine', [product(1000001, 2)])]))

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  // Then : le résultat est un message du pont, la page n'a pas bougé et l'interface est retirée
  expect(await app.received('result')).toMatchObject({
    v: 1,
    type: 'result',
    runId: RUN_ID,
    outcome: 'completed',
    lines: [{ ingredientSlug: 'farine', outcome: 'ADDED', productId: '1000001', quantity: 2 }],
  })
  expect(fake.cart()).toEqual({ 1000001: 2 })
  expect(page.url()).toBe(pageUrl)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('refuse un message du pont qui n’est pas un plan valide', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  const app = await openWithBridge(page, fake, agentCode)
  await app.received('hello')

  // When
  await app.send({ v: 3, type: 'plan' })

  // Then
  await expect(page.getByRole('heading', { name: 'Liste illisible' })).toBeVisible()
  expect(fake.paced()).toEqual([])
})

test('mode configuration : lit le magasin de la page et le rend à l’application, sans requête', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  const app = await openWithBridge(page, fake, agentCode)
  app.answerHello(SETUP)

  // When : l'application demande le magasin, l'utilisateur accepte
  await expect(
    page.getByRole('heading', { name: 'Enregistrer ce magasin dans Repas ?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Then : l'identifiant et l'hôte du faux magasin, l'adresse sans suffixe de ville ni port
  expect(await app.received('setup-result')).toMatchObject({
    runId: RUN_ID,
    store: {
      id: '000001',
      host: 'courses-test.leclercdrive.fr',
      baseUrl: 'https://courses-test.leclercdrive.fr/magasin-000001-000001',
    },
  })
  expect(fake.paced()).toEqual([])
})

test('mode configuration sans magasin dans le message (DRV-320) : lit celui de la page', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : l'application ne connaît pas encore le magasin de l'utilisateur
  const app = await openWithBridge(page, fake, agentCode)
  const { store: _store, ...withoutStore } = SETUP
  app.answerHello(withoutStore)

  // When
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Then
  expect(await app.received('setup-result')).toMatchObject({
    runId: RUN_ID,
    store: { id: '000001', host: 'courses-test.leclercdrive.fr' },
  })
})

test('mode configuration avec un autre magasin que celui de la page : STORE_MISMATCH, rien n’est lu', async ({
  page,
  fake,
  agentCode,
}) => {
  const app = await openWithBridge(page, fake, agentCode)
  app.answerHello({ ...SETUP, store: { ...SETUP.store, id: '000999' } })

  await expect(page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' })).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()

  expect(await app.received('result')).toMatchObject({
    outcome: 'error',
    error: { code: 'STORE_MISMATCH' },
    store: { id: '000999' },
  })
})

test('reprend le plan que l’application renvoie à chaque chargement de la page', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un passage commencé, la farine est au panier
  const app = await openWithBridge(page, fake, agentCode)
  app.answerHello(
    planOf([
      known('farine', 'Farine', [product(1000001, 1)]),
      known('sucre', 'Sucre', [product(1000006, 1)]),
    ]),
  )
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Farine : ajouté')).toBeVisible()

  // When : la page se recharge ; l'application renvoie le même plan
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Reprendre où tu t’étais arrêté ?' }),
  ).toBeVisible()
  await waitForQuiet(fake)
  await page.getByRole('button', { name: 'Reprendre' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then
  expect(fake.cart()).toEqual({ 1000001: 1, 1000006: 1 })
})

test.describe('diagnostic', () => {
  for (const [name, fault, expected] of [
    ['le site répond comme prévu', null, /\[OK\] Recherche d’un mot courant/],
    [
      'le site a changé',
      { kind: 'contract-changed' },
      /\[KO CONTRACT_CHANGED\] Recherche d’un mot courant/,
    ],
    ['le site bloque', { kind: 'forbidden' }, /\[KO BLOCKED\] Recherche d’un mot courant/],
  ] as [string, Fault | null, RegExp][]) {
    test(`commande de l’application : ${name}`, async ({ page, fake, agentCode }) => {
      // Given
      fake.setBehavior({ fault })
      const app = await openWithBridge(page, fake, agentCode)
      await app.received('hello')

      // When
      await app.send(DIAGNOSTIC)

      // Then : le rapport dit ce qui marche et ce qui ne marche pas, sans rien écrire au panier
      await expect(page.getByLabel('Rapport à copier')).toHaveValue(expected)
      await expect(page.getByLabel('Rapport à copier')).toHaveValue(/Aucune écriture au panier\./)
      expect(fake.cart()).toEqual({})
      expect(fake.paced().every((call) => call.kind === 'search')).toBe(true)
    })
  }
})

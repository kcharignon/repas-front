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
  await app.received('result')

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
  await expect(page.getByRole('heading', { name: 'Utiliser ce magasin ?' })).toBeVisible()
  await page.getByRole('button', { name: 'Utiliser ce magasin' }).click()

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
  await page.getByRole('button', { name: 'Utiliser ce magasin' }).click()

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
  await expect(page.getByRole('heading', { name: 'Reprendre là où tu en étais ?' })).toBeVisible()
  await waitForQuiet(fake)
  await page.getByRole('button', { name: 'Reprendre' }).click()
  await app.received('result')

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

  test('le rapport donne les rayons et familles de trois produits frais (DRV-646), sans aucun nom de produit', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    const app = await openWithBridge(page, fake, agentCode)
    await app.received('hello')

    // When
    await app.send(DIAGNOSTIC)

    // Then
    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(/Rayons vus pour « tomate » : 15:2 41:1 \(3 produits\)/)
    await expect(report).toHaveValue(
      /Familles vues pour « tomate » : 327:1 328:1 410:1 \(3 produits\)/,
    )
    await expect(report).toHaveValue(/Rayons vus pour « pomme » : 41:2 12:1 15:1 \(4 produits\)/)
    await expect(report).toHaveValue(/Rayons vus pour « courgette » : 41:2 60:1 \(3 produits\)/)
    await expect(report).toHaveValue(
      /Première réponse pour « tomate » : 3 produits ; page suivante : inconnue/,
    )
    await expect(report).not.toHaveValue(/Tomates|Pommes|Courgettes/)
  })

  test('le rapport dit d’où viennent les libellés de rayons (DRV-647) : le menu replié de la page, la structure de la réponse, la correspondance, sans requête de plus', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : l'accueil du magasin porte un menu « Rayons » replié (liens de rayon et de famille au numéro dans l'adresse, données inventées)
    const app = await openWithBridge(page, fake, agentCode)
    await app.received('hello')
    await expect(page.getByRole('link', { name: 'Fruits et légumes' })).toBeHidden()

    // When
    await app.send(DIAGNOSTIC)

    // Then : le menu est lu tel qu'il est (sans clic) : comptes, formes d'adresse, une ligne par rayon avec son numéro et son libellé de catalogue
    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(
      /Menu des rayons de la page : titre « Rayons » présent ; liens de la page : 12, dans le bloc du menu : 8 ; liens de rayon : 5 ; liens de famille : 3/,
    )
    await expect(report).toHaveValue(
      /Adresses des liens de rayon et de famille \(motifs\) : \/magasin-N-N-V\/rayon-N-…\.aspx ; \/magasin-N-N-V\/famille-N-…\.aspx/,
    )
    await expect(report).toHaveValue(/Lien de rayon 41 : « Fruits et légumes »/)
    await expect(report).toHaveValue(/Lien de rayon 60 : « Bébé »/)
    // And : la structure de la réponse « tomate », des noms de clés (rayon et famille avec leur valeur)
    await expect(report).toHaveValue(
      /Réponse « tomate », chemin des produits depuis le premier niveau : \?\[\] > lstProduits\[\]/,
    )
    await expect(report).toHaveValue(
      /Réponse « tomate », clés d’un produit \(\d+, noms seulement sauf rayon et famille\) : iIdProduit, sLibelleLigne1, .*iIdRayon = \d+, iIdFamille = \d+/,
    )
    // And : la correspondance avec les rayons des produits de « tomate » (15 et 41 ; seul 41 a un lien)
    await expect(report).toHaveValue(
      /Rayons de « tomate » avec un lien dans le menu : 1 sur 2 \(sans lien : 15\)/,
    )
    await expect(report).toHaveValue(/Familles de « tomate » avec un lien dans le menu : 1 sur 3/)
    await expect(report).toHaveValue(/\[OK\] Rayons vus : .* ; liens du menu : 1\/2/)
    // And : aucune requête de plus que DRV-646 (cinq recherches), aucun clic, ni ville ni numéro de magasin, ni libellé de famille
    expect(fake.paced().map((call) => call.kind)).toEqual(Array(5).fill('search'))
    await expect(page.getByRole('link', { name: 'Fruits et légumes' })).toBeHidden()
    await expect(report).not.toHaveValue(/Ville-Test|000001|Tomates|Pommes|Courgettes/)
  })
})

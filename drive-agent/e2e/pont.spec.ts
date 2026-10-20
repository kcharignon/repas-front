// L'agent vu par l'application Android : injecté avec le VRAI script d'injection de l'application (`injection.js`) par-dessus un faux
// canal natif. Le plan arrive par le pont (pas par le fragment d'adresse) et le résultat repart par le pont (pas de navigation).
// Couvre aussi le mode configuration (lire le magasin de la page) et le diagnostic (commande de l'application).
import { openWithBridge } from './support/agent'
import { expectPoliteAgent, waitForQuiet } from './support/cadence'
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
    // Aucun nom de produit, sauf le premier produit de la recherche filtrée (0.35.0), demandé pour savoir s'il est frais
    const lines = (await report.inputValue())
      .split('\n')
      .filter((line) => !/premier produit|Libellés de la liste/i.test(line))
    expect(lines.join('\n')).not.toMatch(/Tomates|Pommes|Courgettes/)
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
    // And (correctif DRV-647) : le niveau du filtre, le libellé de chaque groupe et sa source, des produits échantillons ; jamais « Voir le rayon » comme libellé
    await expect(report).toHaveValue(
      /Niveau du filtre pour « tomate » : famille \(produits nommés : 0 au niveau rayon, 1 au niveau famille, sur 3\)/,
    )
    await expect(report).toHaveValue(
      /Libellé de la famille 410 \(1 produit\) : « Legumes fruits » \(source : sUrlVoirRayon\)/,
    )
    await expect(report).toHaveValue(
      /Produit échantillon de « tomate » : iIdRayon=41 iIdFamille=410 ; objFiltreBloc : absent ; sUrlVoirRayon : id=410 \(famille\) nom=« Legumes-fruits » ; sCategorie=« 40 »/,
    )
    await expect(report).toHaveValue(/Produit échantillon de « courgette »/)
    await expect(report).not.toHaveValue(/« Voir le rayon » \(source/)
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
    // And : les cinq recherches de DRV-646, plus UNE recherche « tomate » filtrée (0.35.0), aucun clic, ni ville ni numéro de magasin
    expect(fake.paced().map((call) => call.kind)).toEqual(Array(6).fill('search'))
    await expect(page.getByRole('link', { name: 'Fruits et légumes' })).toBeHidden()
    await expect(report).not.toHaveValue(/Ville-Test|000001/)
  })

  test('le rapport lit la facette « Rayons » de la réponse, la forme du filtre, et sonde UNE recherche « tomate » filtrée (DRV-647, 0.35.0)', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la réponse de recherche du faux site porte une facette « Rayons » et ses liens de recherche filtrée (forme inventée)
    const app = await openWithBridge(page, fake, agentCode)
    await app.received('hello')

    // When
    await app.send(DIAGNOSTIC)

    // Then : les blocs, les rayons du filtre (libellé, iIdValeur, références, enfants), la valeur fraîche, la correspondance des produits
    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(
      /Bloc de filtre 4 « Rayons » de la réponse « tomate » : 2 valeurs de premier niveau/,
    )
    await expect(report).toHaveValue(
      /Bloc de filtre 2 « Marques » de la réponse « tomate » : 1 valeur de premier niveau/,
    )
    await expect(report).toHaveValue(
      /Rayon du filtre « Fruits et légumes » : iIdValeur=900041, niNbReferences=1, 1 enfant ; sIdValeurUrl \(forme\)=« N-N », contient iIdValeur : oui ; enfants : « Legumes fruits »/,
    )
    await expect(report).toHaveValue(
      /Valeur « fruits \/ légumes \/ marché frais » de la facette : « Fruits et légumes » \(iIdValeur=900041/,
    )
    await expect(report).toHaveValue(
      /Correspondance avec la facette d’un produit de « tomate » : iIdRayon=41 → aucune correspondance ; iIdFamille=410 → correspond à la valeur 410 « Legumes fruits » \(enfant\)/,
    )
    // And : la forme des liens à « Filtres », l'adresse déduite, et la recherche filtrée sondée
    await expect(report).toHaveValue(/Liens à « Filtres » \(réponse « tomate »\) : 3/)
    await expect(report).toHaveValue(
      /Adresse d’une recherche filtrée : déduite du lien \/magasin-N-N-V\/recherche\.aspx \?TexteRecherche&Filtres ; Filtres=N-N \(jeton remplacé : sIdValeurUrl\)/,
    )
    await expect(report).toHaveValue(
      /Forme essayée \(i\) Filtres=<sIdValeurUrl> \(forme N-N\) sur « Fruits et légumes » : HTTP 200, iNbTotalProduits 3 → 1 \(niNbReferences 1\), 1 produits, part dans les enfants attendus : 100 % ; verdict : valide/,
    )
    await expect(report).toHaveValue(
      /Clés de pagination \(réponse « tomate », nombres et oui\/non seulement\) : .*iNbResultats=3 \(×1\)/,
    )
    await expect(report).toHaveValue(/eUnivers \(réponse « tomate »\) : 1 ×3/)
    await expect(report).toHaveValue(
      /Premier produit de la forme essayée : « Tomates cerises Jardin Inventé » \(frais : oui\)/,
    )
    await expect(report).toHaveValue(/Forme retenue : \(i\) Filtres=<sIdValeurUrl>/)
    await expect(report).toHaveValue(
      /Forme finale de l’adresse filtrée : \/magasin-N-N\/recherche\.aspx \?TexteRecherche&Filtres ; Filtres=N-N/,
    )
    // And : la requête filtrée est la quatrième, une seule, à la cadence normale ; rien au panier
    const searches = fake.paced().map((call) => call.detail ?? '')
    expect(searches).toHaveLength(6)
    expect(fake.cart()).toEqual({})
    expectPoliteAgent(fake)
    await expect(report).not.toHaveValue(/Ville-Test|000001/)
  })

  test('le rapport dit les listes de produits de la réponse, dont une liste de marque de distributeur aux produits frais (DRV-647, 0.38.0)', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : des produits frais rangés dans `objContenuMDD` (forme inventée)
    fake.setBehavior({ mddList: true })
    const app = await openWithBridge(page, fake, agentCode)
    await app.received('hello')

    // When
    await app.send(DIAGNOSTIC)

    // Then : chaque liste, ses produits vus et lus, ses familles, ses libellés ; la somme face au total ; la sonde « fruits / légumes » par liste
    const report = page.getByLabel('Rapport à copier')
    await expect(report).toHaveValue(
      /Listes de produits de la réponse « tomate » : iNbTotalProduits=5, produits lus dans les listes : 5 ; facette « Fruits et légumes » : 3 références/,
    )
    await expect(report).toHaveValue(
      /Liste objContenuMDD \(« tomate »\) : objet, clés : iNbElements, lstElements\[2\] ; iIdProduit vus : 2, produits lus : 2 \(non lus : 0 objet trop grand, 0 sans libellé\) ; rayons : 41:2 ; familles : « Legumes » \(2\) ; légumes ou fruits : oui/,
    )
    await expect(report).toHaveValue(
      /Libellés de la liste objContenuMDD \(« tomate »\) : « Tomates rondes Nos Régions Inventées 1 kg »/,
    )
    await expect(report).toHaveValue(/Listes de produits de la réponse « courgette »/)
    await expect(report).toHaveValue(
      /Produits par liste de la forme essayée : \? 1, objContenuMDD 2/,
    )
    await expect(report).not.toHaveValue(/Ville-Test|000001/)
  })
})

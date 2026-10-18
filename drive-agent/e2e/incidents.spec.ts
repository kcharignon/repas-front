// Quand le site ne répond pas comme prévu : blocage (403, 429), page de défi de l'anti-robot (le passage attend la vérification), requête
// retenue (délai d'attente), site changé, route disparue, compte déconnecté, et reprise après un rechargement de la page. Le faux site
// simule chaque incident ; l'agent doit s'arrêter proprement ou attendre, sans insister.
import { openWithFragment, returnedResult } from './support/agent'
import { expectPoliteAgent, waitForQuiet } from './support/cadence'
import { expect, test } from './support/fixtures'
import { known, planOf, product, RUN_ID } from './support/plans'
import { startFakeLeclerc, type Fault, type FaultKind } from '../fake-leclerc/server'

const THREE_LINES = planOf([
  known('farine', 'Farine', [product(1000001, 3)]),
  known('sucre', 'Sucre', [product(1000006, 1)]),
  known('sel', 'Sel', [product(1000009, 1)]),
])

for (const kind of ['forbidden', 'too-many-requests'] satisfies FaultKind[]) {
  test(`s’arrête après deux blocages de suite (${kind}), sans insister, et rend ce qui reste en échec`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la recherche de la première ligne passe, puis l'écriture du panier est bloquée
    fake.setBehavior({ fault: { kind, after: 1 } })

    // When
    await openWithFragment(page, fake, agentCode, THREE_LINES)
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli en partie' })).toBeVisible()

    // Then : la requête bloquée est retentée UNE fois (après la pause), puis plus rien ne part
    expect(fake.paced().map((call) => call.fault)).toEqual([undefined, kind, kind])
    expect(fake.cart()).toEqual({})
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      runId: RUN_ID,
      outcome: 'partial',
      error: { code: 'BLOCKED' },
      lines: [
        { ingredientSlug: 'farine', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sucre', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sel', outcome: 'FAILED', error: 'BLOCKED' },
      ],
    })
  })
}

// La page de défi de l'anti-robot (ticket K) : le passage ne se termine pas, il attend que l'utilisateur la passe DANS la page, avec un bandeau
// qui laisse la page visible et touchable. La requête qui a reçu le défi est la recherche de la deuxième ligne.
test.describe('une page de défi de l’anti-robot', () => {
  const CHALLENGE = { kind: 'challenge', after: 2, times: 1 } satisfies Fault

  test('suspend le passage : le bandeau dit quoi faire, la page reste touchable, « Reprendre » refait la ligne après la vérification', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : la farine est faite (recherche et écriture), puis la recherche du sucre tombe sur le défi
    fake.setBehavior({ fault: CHALLENGE })
    await openWithFragment(page, fake, agentCode, THREE_LINES)

    // When
    await page.getByRole('button', { name: 'Commencer' }).click()

    // Then : le message dit quoi faire, sans rien rendre à Repas
    await expect(
      page.getByRole('heading', { name: 'Leclerc demande une vérification' }),
    ).toBeVisible()
    await expect(page.getByText('Fais-la dans la page, puis touche Reprendre.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Arrêter' })).toBeVisible()
    expect(fake.cart()).toEqual({ 1000001: 3 })

    // And : la page de Leclerc est visible et touchable derrière le bandeau (ici : son titre, en haut)
    await page.locator('h1').first().click({ timeout: 5000 })

    // When : l'utilisateur fait la vérification (le faux site ne la demande plus), puis touche « Reprendre »
    fake.setBehavior({ fault: null })
    await page.getByRole('button', { name: 'Reprendre', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

    // Then : la ligne en cours est refaite, rien n'a échoué ni été fait deux fois
    expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 1, 1000009: 1 })
    expect(fake.paced().map((call) => call.kind)).toEqual([
      'search',
      'cart',
      'search',
      'search',
      'cart',
      'search',
      'cart',
    ])
    expect(fake.paced().map((call) => call.fault)).toEqual([
      undefined,
      undefined,
      'challenge',
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expectPoliteAgent(fake)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'completed',
      lines: [{ outcome: 'ADDED' }, { outcome: 'ADDED' }, { outcome: 'ADDED' }],
    })
  })

  test('« Arrêter » rend la main comme un blocage : ce qui est fait reste, le reste échoue, et le résultat dit la cause', async ({
    page,
    fake,
    agentCode,
  }) => {
    fake.setBehavior({ fault: CHALLENGE })
    await openWithFragment(page, fake, agentCode, THREE_LINES)
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(
      page.getByRole('heading', { name: 'Leclerc demande une vérification' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Arrêter' }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli en partie' })).toBeVisible()

    expect(fake.cart()).toEqual({ 1000001: 3 })
    expect(fake.paced()).toHaveLength(3)
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'partial',
      error: { code: 'BLOCKED', message: 'Leclerc a ralenti les requêtes (CHALLENGE)' },
      lines: [
        { ingredientSlug: 'farine', outcome: 'ADDED' },
        { ingredientSlug: 'sucre', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sel', outcome: 'FAILED', error: 'BLOCKED' },
      ],
    })
  })

  test('garde l’état du passage : si la page se recharge devant le défi (la vérification terminée), « Reprendre » repart de la ligne en cours', async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given : le passage attend devant le défi, la farine est faite
    fake.setBehavior({ fault: CHALLENGE })
    await openWithFragment(page, fake, agentCode, THREE_LINES)
    await page.getByRole('button', { name: 'Commencer' }).click()
    await expect(
      page.getByRole('heading', { name: 'Leclerc demande une vérification' }),
    ).toBeVisible()

    // When : la vérification faite, la page se recharge (le plan est toujours dans l'adresse)
    fake.setBehavior({ fault: null })
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Reprendre où tu t’étais arrêté ?' }),
    ).toBeVisible()
    await expect(page.getByText('1 lignes sur 3 sont déjà faites')).toBeVisible()
    await waitForQuiet(fake)
    await page.getByRole('button', { name: 'Reprendre', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

    // Then : la farine n'est pas refaite
    expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 1, 1000009: 1 })
    const writes = fake.paced().filter((call) => call.kind === 'cart')
    expect(writes.filter((call) => call.detail?.includes('"1000001"'))).toHaveLength(1)
  })
})

// Le délai d'attente (ticket K) : le faux site retient la requête, l'agent l'interrompt au bout de 20 s, la retente une fois après 2 s, puis dit
// que Leclerc met trop de temps à répondre. Réel : ce test dure une quarantaine de secondes.
test('interrompt une requête que le site retient (20 s, une reprise), dit que Leclerc met trop de temps à répondre, et passe à la ligne suivante', async ({
  page,
  fake,
  agentCode,
}) => {
  test.setTimeout(150_000)
  // Given : les deux premières requêtes (la recherche de la farine et sa reprise) restent sans réponse
  fake.setBehavior({ fault: { kind: 'hang', times: 2 } })
  await openWithFragment(
    page,
    fake,
    agentCode,
    planOf([
      known('farine', 'Farine', [product(1000001, 3)]),
      known('sucre', 'Sucre', [product(1000006, 1)]),
    ]),
  )

  // When
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli en partie' })).toBeVisible({
    timeout: 100_000,
  })

  // Then : deux requêtes interrompues à 20 s, la seconde 2 s après la première ; le sucre est mis au panier
  const [first, second] = fake.paced()
  expect(first?.fault).toBe('hang')
  expect(second?.fault).toBe('hang')
  expect((first?.endedAt ?? 0) - (first?.startedAt ?? 0)).toBeGreaterThanOrEqual(19_500)
  expect((first?.endedAt ?? 0) - (first?.startedAt ?? 0)).toBeLessThan(25_000)
  expect((second?.startedAt ?? 0) - (first?.endedAt ?? 0)).toBeGreaterThanOrEqual(1_900)
  expect(fake.cart()).toEqual({ 1000006: 1 })
  expectPoliteAgent(fake)
  await expect(page.getByText('Leclerc a mis trop de temps à répondre.')).toBeVisible()
  await expect(page.getByText('Échecs : 1')).toBeVisible()
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'partial',
    lines: [
      { ingredientSlug: 'farine', outcome: 'FAILED', error: 'NETWORK' },
      { ingredientSlug: 'sucre', outcome: 'ADDED' },
    ],
  })
})

// Le site mobile de Leclerc (ticket J) : l'hôte `m-courses` n'a pas les routes du site ordinateur. L'agent le dit tout de suite (au lieu d'échouer
// plus loin sur « le site a changé » ou « ce n'est pas le bon magasin ») et ne touche à rien.
test('sur le site mobile (m-courses), dit « Ce n’est pas la version ordinateur du site » avant toute requête, et la cause revient à Repas', async ({
  page,
  agentCode,
}) => {
  // Given : le faux magasin servi sous l'hôte du site mobile
  const mobile = await startFakeLeclerc({ hosts: ['m-courses.leclercdrive.fr'] })
  try {
    // When
    await openWithFragment(page, mobile, agentCode, THREE_LINES, {
      origin: `http://m-courses.leclercdrive.fr:${mobile.port}`,
    })

    // Then : le message dit ce qui ne va pas et quoi faire, sans récapitulatif, sans requête ni écriture
    await expect(
      page.getByRole('heading', { name: 'Ce n’est pas la version ordinateur du site' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
    expect(mobile.paced()).toEqual([])
    expect(mobile.cart()).toEqual({})
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, mobile)).toMatchObject({
      runId: RUN_ID,
      outcome: 'error',
      error: { code: 'UNSUPPORTED_PAGE', message: 'Page non prise en charge (PAGE_MOBILE)' },
      lines: [],
    })
  } finally {
    await mobile.close()
  }
})

for (const [name, fault, cause] of [
  [
    'une page de recherche dont les champs ont changé',
    { kind: 'contract-changed', on: 'search' },
    'SEARCH_NO_STATE',
  ],
  [
    'une page de recherche dont les produits ont des champs renommés',
    { kind: 'products-renamed', on: 'search' },
    'SEARCH_PRODUCTS_UNREADABLE',
  ],
  [
    'une réponse du panier qui a changé',
    { kind: 'contract-changed', on: 'cart' },
    'CART_NO_CART_EVENT',
  ],
  ['une recherche qui répond 404', { kind: 'not-found', on: 'search' }, 'HTTP_404'],
  ['un panier qui répond 404', { kind: 'not-found', on: 'cart' }, 'HTTP_404'],
] as [string, Fault, string][]) {
  test(`interrompt le passage (« le site a changé ») devant ${name}, et dit laquelle des vérifications a échoué`, async ({
    page,
    fake,
    agentCode,
  }) => {
    // Given
    fake.setBehavior({ fault })

    // When
    await openWithFragment(
      page,
      fake,
      agentCode,
      planOf([known('farine', 'Farine', [product(1000001, 3)])]),
    )
    await page.getByRole('button', { name: 'Commencer' }).click()

    // Then : un 404 n'est pas un blocage (aucune seconde tentative) et rien n'est mis au panier
    await expect(page.getByRole('heading', { name: 'Envoi interrompu' })).toBeVisible()
    await expect(page.getByText('Leclerc a modifié son site')).toBeVisible()
    expect(fake.paced().filter((call) => call.fault)).toHaveLength(1)
    expect(fake.cart()).toEqual({})
    await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'error',
      error: { code: 'CONTRACT_CHANGED', message: `Le site a changé (${cause})` },
    })
  })
}

test('s’arrête aussitôt quand le compte n’est plus connecté', async ({ page, fake, agentCode }) => {
  // Given : le site renvoie vers sa page de connexion
  fake.setBehavior({ fault: { kind: 'logged-out' } })

  // When
  await openWithFragment(page, fake, agentCode, THREE_LINES)
  await page.getByRole('button', { name: 'Commencer' }).click()

  // Then : une seule requête est partie, le conseil est de se reconnecter
  await expect(page.getByText('Connecte-toi à Leclerc')).toBeVisible()
  expect(fake.paced()).toHaveLength(1)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'error',
    error: { code: 'NOT_LOGGED_IN' },
  })
})

test('refuse de commencer devant la page d’un visiteur non connecté : rien n’est cherché ni écrit, et le conseil est de se connecter', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le site sert la page d'un visiteur (le catalogue est public, le panier accepterait les écritures)
  fake.setBehavior({ visitorAfter: 0 })

  // When
  await openWithFragment(page, fake, agentCode, THREE_LINES)

  // Then : « Connecte-toi à Leclerc, puis relance l'envoi », pas de récapitulatif, aucune requête, panier intact
  await expect(page.getByRole('heading', { name: 'Tu n’es pas connecté' })).toBeVisible()
  await expect(page.getByText('Connecte-toi à Leclerc, puis relance l’envoi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
  expect(fake.paced()).toEqual([])
  expect(fake.cart()).toEqual({})
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'error',
    error: { code: 'NOT_LOGGED_IN', message: 'Tu n’es pas connecté (SESSION_VISITOR)' },
    lines: [],
  })
})

test('un client connecté qui devient visiteur en cours de passage : la recherche suivante arrête tout, sans écrire dans un panier anonyme', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : le site sert la page d'un visiteur à partir de la troisième requête (la première ligne est faite avant)
  fake.setBehavior({ visitorAfter: 2 })

  // When
  await openWithFragment(page, fake, agentCode, THREE_LINES)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Connecte-toi à Leclerc')).toBeVisible()

  // Then : la farine est au panier, la ligne suivante a été cherchée puis refusée, rien d'autre n'est parti
  expect(fake.paced().map((call) => call.kind)).toEqual(['search', 'cart', 'search'])
  expect(fake.cart()).toEqual({ 1000001: 3 })
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'error',
    error: { code: 'NOT_LOGGED_IN', message: 'Tu n’es pas connecté (SESSION_VISITOR)' },
    lines: [{ ingredientSlug: 'farine', outcome: 'ADDED' }],
  })
})

test('reprend après un rechargement de la page sans refaire les lignes déjà faites', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un passage en cours, la première ligne est faite
  await openWithFragment(page, fake, agentCode, THREE_LINES)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByText('Farine : ajouté')).toBeVisible()
  expect(fake.cart()).toEqual({ 1000001: 3 })

  // When : la page se recharge (le plan est toujours dans l'adresse) ; l'utilisateur reprend un instant plus tard
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Reprendre où tu t’étais arrêté ?' }),
  ).toBeVisible()
  await expect(page.getByText('1 lignes sur 3 sont déjà faites')).toBeVisible()
  await waitForQuiet(fake)
  await page.getByRole('button', { name: 'Reprendre' }).click()
  await expect(page.getByRole('heading', { name: 'Panier rempli' })).toBeVisible()

  // Then : les deux autres lignes sont faites, la farine n'a pas été cherchée ni écrite une seconde fois
  expect(fake.cart()).toEqual({ 1000001: 3, 1000006: 1, 1000009: 1 })
  const writes = fake.paced().filter((call) => call.kind === 'cart')
  expect(writes.filter((call) => call.detail?.includes('"1000001"'))).toHaveLength(1)
  expect(fake.paced().filter((call) => call.kind === 'search')).toHaveLength(3)
  expectPoliteAgent(fake)
  await page.getByRole('button', { name: 'Retourner dans Repas' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({
    outcome: 'completed',
    lines: [{ outcome: 'ADDED' }, { outcome: 'ADDED' }, { outcome: 'ADDED' }],
  })
})

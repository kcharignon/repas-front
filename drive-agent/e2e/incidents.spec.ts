// Quand le site ne répond pas comme prévu : blocage (403, 429, page de défi), site changé, route disparue, compte déconnecté, et
// reprise après un rechargement de la page. Le faux site simule chaque incident ; l'agent doit s'arrêter proprement, sans insister.
import { openWithFragment, returnedResult } from './support/agent'
import { expectPoliteAgent, waitForQuiet } from './support/cadence'
import { expect, test } from './support/fixtures'
import { known, planOf, product, RUN_ID } from './support/plans'
import type { Fault, FaultKind } from '../fake-leclerc/server'

const THREE_LINES = planOf([
  known('farine', 'Farine', [product(1000001, 3)]),
  known('sucre', 'Sucre', [product(1000006, 1)]),
  known('sel', 'Sel', [product(1000009, 1)]),
])

for (const kind of ['forbidden', 'too-many-requests', 'challenge'] satisfies FaultKind[]) {
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

for (const [name, fault] of [
  ['une page de recherche dont les champs ont changé', { kind: 'contract-changed', on: 'search' }],
  ['une réponse du panier qui a changé', { kind: 'contract-changed', on: 'cart' }],
  ['une recherche qui répond 404', { kind: 'not-found', on: 'search' }],
  ['un panier qui répond 404', { kind: 'not-found', on: 'cart' }],
] as [string, Fault][]) {
  test(`interrompt le passage (« le site a changé ») devant ${name}`, async ({
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
      error: { code: 'CONTRACT_CHANGED' },
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

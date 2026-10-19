// Entrer dans le magasin et revenir sans geste (DRV-625) : le plan s'ouvre sur l'accueil de l'enseigne (`www.leclercdrive.fr`), l'agent suit lui-même
// « Commencer mes courses », une seule fois ; au moindre doute (pas de lien, défi de l'anti-robot, page qui change) il laisse l'utilisateur toucher le
// bouton. L'application simulée (le pont) renvoie le plan à chaque page, comme la vraie.
import { openWithBridge } from './support/agent'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { HOME_HOST, startFakeLeclerc, type FakeLeclerc } from '../fake-leclerc/server'

const PLAN = planOf([known('farine', 'Farine', [product(1000001, 2)])])
const OPENING = 'Ouverture de ton magasin…'
const MANUAL = 'Touche « Commencer mes courses ».'

/** Le faux site, avec l'accueil de l'enseigne. */
async function withHome(use: (fake: FakeLeclerc, home: string) => Promise<void>): Promise<void> {
  const fake = await startFakeLeclerc({ hosts: [HOME_HOST] })
  try {
    await use(fake, `http://${HOME_HOST}:${fake.port}`)
  } finally {
    await fake.close()
  }
}

test('suit « Commencer mes courses » tout seul, puis remplit le panier et rend la main sans écran de fin', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : le plan s'ouvre sur l'accueil de l'enseigne, où se trouve le lien
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    // When : l'agent le dit, puis suit le lien sans que l'utilisateur touche rien
    await expect(page.getByRole('heading', { name: 'Ouverture de ton magasin…' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible()

    // Then : on est dans le magasin, rien n'a été demandé ni écrit avant « Commencer »
    expect(new URL(page.url()).pathname).toBe('/magasin-000001-000001-Ville-Test/')
    expect(fake.paced()).toEqual([])
    await page.getByRole('button', { name: 'Commencer' }).click()

    // And : le résultat part tout de suite, sans « Retourner dans Repas »
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
    await expect(page.getByRole('button', { name: 'Retourner dans Repas' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test('l’accueil sans le lien (page d’un visiteur) : le bandeau dit de toucher le bouton, rien n’est suivi ni écrit', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'no-link' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible()
    await expect(page.getByRole('heading', { name: OPENING })).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe('/')
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})
  })
})

test('un défi de l’anti-robot dans la page : le lien n’est pas suivi ; une fois le bouton touché à la main, l’envoi continue', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'challenge' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')

    // Quand l'utilisateur touche lui-même le bouton, l'agent reprend sur la page du magasin
    await page.locator('#start-shopping').click()
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible()
    expect(fake.paced()).toEqual([])
  })
})

test('un site qui change d’accueil (le lien ne mène plus à une page de magasin) : le lien n’est pas suivi, le bandeau dit de toucher le bouton, sans écriture', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : le lien mène à la racine de l'hôte du magasin, une page 404 qui n'a pas la forme d'une page de magasin
    fake.setBehavior({ startPath: '/' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    // Then : l'agent n'est allé nulle part (une seule page demandée : l'accueil) et dit de toucher le bouton
    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
    const pages = fake.requests().filter((request) => request.kind === 'page')
    expect(pages.map((request) => request.status)).toEqual([200])
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})
  })
})

test('un autre magasin que celui du plan : le lien n’est pas suivi', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : l'accueil de l'utilisateur mène à un autre magasin que celui du plan
    fake.setBehavior({ startPath: '/magasin-000002-000002-Ville-Test/' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

// DRV-629 : sur le vrai site, « Commencer mes courses » est un bouton SANS adresse (constat du 2026-10-19) : l'agent le clique.
test('le bouton sans adresse : l’agent le clique tout seul, arrive sur la page du magasin du plan et remplit le panier', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : l'accueil n'a qu'un bouton, sans adresse, dont un script ouvre le magasin
    fake.setBehavior({ homeForm: 'button' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    // When : l'agent le dit, puis clique le bouton sans que l'utilisateur touche rien
    await expect(page.getByRole('heading', { name: OPENING })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeVisible()

    // Then : on est dans le magasin, rien n'a été demandé ni écrit avant « Commencer »
    expect(new URL(page.url()).pathname).toBe('/magasin-000001-000001-Ville-Test/')
    expect(fake.paced()).toEqual([])
    await page.getByRole('button', { name: 'Commencer', exact: true }).click()
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
  })
})

test('le site ignore le clic d’un programme : le bandeau dit de toucher le bouton, sans boucle ni écriture ; le toucher de l’utilisateur ouvre le magasin', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : le bouton n'ouvre le magasin que pour un vrai toucher (`event.isTrusted`)
    fake.setBehavior({ homeForm: 'button-human' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    // Then : le clic de l'agent n'a rien fait, la page est restée là, l'écran dit quoi faire
    await expect(page.getByRole('heading', { name: OPENING })).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 25_000 })
    expect(new URL(page.url()).pathname).toBe('/')
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})

    // When : l'utilisateur touche lui-même le bouton (un vrai toucher), l'agent reprend sur la page du magasin
    await page.locator('#start-shopping').click()
    await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeVisible()
    expect(fake.paced()).toEqual([])
  })
})

test('un bouton qui ne fait rien : même repli, une seule page demandée (pas de boucle)', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'button-inert' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 25_000 })
    const pages = fake.requests().filter((request) => request.kind === 'page')
    expect(pages.map((request) => request.status)).toEqual([200])
    expect(fake.paced()).toEqual([])
  })
})

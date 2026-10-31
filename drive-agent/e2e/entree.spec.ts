// Entrer dans le magasin et remplir le panier SANS geste (DRV-625, DRV-629, 0.39.0) : le plan s'ouvre sur l'accueil de l'enseigne
// (`www.leclercdrive.fr`), l'agent appuie lui-même sur « Commencer mes courses » (bouton sans adresse du vrai site, ou lien, ou élément à gestionnaire
// de clic, ou fenêtre qui se dessine plus tard), puis démarre sans écran de confirmation. Au moindre doute (pas de bouton, défi de l'anti-robot,
// page qui change, site qui ignore un clic de programme) il laisse l'utilisateur toucher le bouton : une seule fois, sans boucle, rien d'écrit.
// L'application simulée (le pont) renvoie le plan à chaque page, comme la vraie. Chaque test compte les gestes de l'utilisateur (`trackInteractions`).
import { openWithBridge, trackInteractions } from './support/agent'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import { HOME_HOST, startFakeLeclerc, type FakeLeclerc } from '../fake-leclerc/server'
import { MEMBER_COOKIE } from '../fake-leclerc/pages'

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

/** Les formes de l'accueil où l'agent entre seul dans le magasin, puis remplit le panier sans qu'on touche à rien. */
const SELF_ENTERING = [
  ['un lien', 'link'],
  ['un bouton sans adresse (le vrai site, DRV-629)', 'button'],
  ['un élément qui n’est ni un lien ni un bouton, mais cliquable', 'div'],
  ['une fenêtre qui se dessine 1,5 s après l’arrivée du plan', 'late'],
  ['l’étape « choisir mon magasin » : un lien vers l’accueil du magasin du plan', 'store-link'],
] as const

for (const [name, form] of SELF_ENTERING) {
  test(`${name} : l’agent entre seul dans le magasin, remplit le panier et rend la main, sans aucun geste`, async ({
    page,
    agentCode,
  }) => {
    await withHome(async (fake, home) => {
      // Given : le plan s'ouvre sur l'accueil de l'enseigne
      fake.setBehavior({ homeForm: form })
      const gestures = await trackInteractions(page)
      const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
      app.answerHello(PLAN)

      // When : personne ne touche à rien
      const result = await app.received('result')

      // Then : le panier est rempli, rien n'a été demandé avant le plan et aucun geste n'a eu lieu
      expect(result).toMatchObject({ outcome: 'completed' })
      expect(fake.cart()).toEqual({ 1000001: 2 })
      expect(new URL(page.url()).pathname).toBe('/magasin-000001-000001-Ville-Test/')
      await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
      expect(gestures.count()).toBe(0)
    })
  })
}

test('PREUVE : de l’arrivée du plan à l’écran de choix d’un produit nouveau, l’utilisateur ne fait aucun geste ; son seul geste est le choix', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : un article nouveau, le plan s'ouvre sur l'accueil (bouton sans adresse)
    fake.setBehavior({ homeForm: 'button' })
    const gestures = await trackInteractions(page)
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(planOf([fresh('poivre', 'Poivre')]))

    // When : l'agent arrive tout seul au choix du produit
    const choose = page.getByRole('button', { name: 'Choisir' }).first()
    await expect(choose).toBeVisible()

    // Then : zéro geste jusque-là ; le choix est le premier (et le seul) geste attendu de l'utilisateur
    expect(gestures.count()).toBe(0)
    expect(fake.cart()).toEqual({})
    await choose.click()
    expect(gestures.count()).toBeGreaterThan(0)
  })
})

test('l’accueil sans le lien (page d’un visiteur) : l’agent attend la fenêtre, puis le bandeau dit de toucher le bouton, rien n’est suivi ni écrit', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'no-link' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: OPENING })).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/')
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})
  })
})

test('un défi de l’anti-robot dans la page : rien n’est touché ; une fois le bouton touché à la main, l’envoi continue tout seul', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'challenge' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')

    // Quand l'utilisateur touche lui-même le bouton, l'agent reprend sur la page du magasin, sans autre geste
    await page.locator('#start-shopping').click()
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
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

test('« choisir mon magasin » vers un autre magasin que celui du plan : jamais suivi', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'store-link', startPath: '/magasin-000002-000002-Ville-Test/' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/')
    expect(fake.cart()).toEqual({})
  })
})

test('le site ignore le clic d’un programme : au bout de quelques secondes le bandeau dit de toucher le bouton, sans boucle ni écriture ; le toucher de l’utilisateur ouvre le magasin et l’envoi continue seul', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : le bouton n'ouvre le magasin que pour un vrai toucher (`event.isTrusted`)
    fake.setBehavior({ homeForm: 'button-human' })
    const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
    app.answerHello(PLAN)

    // Then : le clic de l'agent n'a rien fait, la page est restée là, l'écran dit quoi faire (3 s d'attente, plus la pause de la cadence)
    await expect(page.getByRole('heading', { name: OPENING })).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 12_000 })
    expect(new URL(page.url()).pathname).toBe('/')
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})

    // When : l'utilisateur touche lui-même le bouton (un vrai toucher), l'agent reprend sur la page du magasin et remplit le panier
    await page.locator('#start-shopping').click()
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
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

    await expect(page.getByRole('heading', { name: MANUAL })).toBeVisible({ timeout: 12_000 })
    const pages = fake.requests().filter((request) => request.kind === 'page')
    expect(pages.map((request) => request.status)).toEqual([200])
    expect(fake.paced()).toEqual([])
  })
})

// La connexion entre deux (DRV-748) : le visiteur qui touche « Commencer mes courses » arrive sur la page de connexion, que la PERSONNE remplit (l'agent ne
// se connecte jamais) ; l'accueil qui revient, connecté, montre de nouveau le bouton : l'agent le suit une seconde fois, sans que la personne y touche.
test.describe('la connexion entre l’accueil et le magasin', () => {
  test('le premier toucher mène à la connexion ; une fois connecté, l’agent entre seul : le seul geste de la personne est la connexion', async ({
    page,
    agentCode,
  }) => {
    await withHome(async (fake, home) => {
      // Given : un visiteur sur l'accueil (installation neuve), le bouton mène à la connexion
      fake.setBehavior({ homeForm: 'login-first' })
      const gestures = await trackInteractions(page)
      const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
      app.answerHello(PLAN)

      // When : l'agent touche le bouton, la page de connexion s'ouvre ; la personne se connecte (son seul geste)
      const login = page.locator('#login')
      await expect(login).toBeVisible({ timeout: 15_000 })
      expect(fake.cart()).toEqual({})
      await login.click()

      // Then : l'accueil revient connecté, l'agent entre seul dans le magasin et remplit le panier, sans « Commencer mes courses » touché
      expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
      expect(fake.cart()).toEqual({ 1000001: 2 })
      expect(new URL(page.url()).pathname).toBe('/magasin-000001-000001-Ville-Test/')
      await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
      expect(gestures.count()).toBe(1)
    })
  })

  test('session déjà ouverte : un seul toucher de l’agent, aucun geste de la personne', async ({
    page,
    agentCode,
  }) => {
    await withHome(async (fake, home) => {
      fake.setBehavior({ homeForm: 'login-first' })
      await page
        .context()
        .addCookies([{ name: MEMBER_COOKIE, value: '1', domain: HOME_HOST, path: '/' }])
      const gestures = await trackInteractions(page)
      const app = await openWithBridge(page, fake, agentCode, { path: '/', origin: home })
      app.answerHello(PLAN)

      expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
      expect(fake.cart()).toEqual({ 1000001: 2 })
      expect(fake.requests().filter((request) => request.path === '/connexion.aspx')).toEqual([])
      expect(gestures.count()).toBe(0)
    })
  })
})

// La fenêtre d'accueil sur la page même du magasin du plan (« <magasin> vous propose le(s) service(s) ») : l'agent la ferme comme un doigt.
test.describe('la fenêtre d’accueil sur la page du magasin du plan', () => {
  test('l’agent appuie sur « Commencer mes courses », la fenêtre se ferme, le panier se remplit, sans aucun geste', async ({
    page,
    fake,
    agentCode,
  }) => {
    fake.setBehavior({ storeWelcome: 'button' })
    const gestures = await trackInteractions(page)
    const app = await openWithBridge(page, fake, agentCode)
    app.answerHello(PLAN)

    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })

    await expect(page.locator('html')).toHaveAttribute('data-welcome-closed', '1')
    expect(fake.cart()).toEqual({ 1000001: 2 })
    expect(gestures.count()).toBe(0)
  })

  for (const welcome of ['human', 'inert'] as const) {
    test(`le site n’y répond pas à un clic de programme (${welcome}) : le passage continue quand même, une seule tentative`, async ({
      page,
      fake,
      agentCode,
    }) => {
      fake.setBehavior({ storeWelcome: welcome })
      const app = await openWithBridge(page, fake, agentCode)
      app.answerHello(PLAN)

      expect(await app.received('result')).toMatchObject({ outcome: 'completed' })

      await expect(page.locator('html')).not.toHaveAttribute('data-welcome-closed', '1')
      expect(fake.cart()).toEqual({ 1000001: 2 })
    })
  }
})

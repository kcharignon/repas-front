// Le PREMIER usage de Leclerc, de bout en bout (DRV-753) : l'accueil national sans magasin et son mur de cookies, le choix du magasin, « Commencer mes courses », la
// connexion, le retour. À chaque instant la personne voit quoi faire (une carte du guide), jamais un message qui désigne un bouton absent (« Touche « Commencer mes
// courses » » sur l'accueil national, où il n'existe pas encore). Le plan est livré comme l'application le fait (`asApplication` : une page de magasin, l'accueil de
// l'enseigne, la connexion hors magasin seulement quand un magasin a déjà été ouvert), pas à chaque page. FORMES PLAUSIBLES : le vrai accueil n'a jamais été relevé dans
// le DOM (voir `firstUsePage` du faux site).
import { openWithBridge } from './support/agent'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { HOME_HOST, startFakeLeclerc, type FakeLeclerc } from '../fake-leclerc/server'

const PLAN = planOf([known('farine', 'Farine', [product(1000001, 2)])])
const MANUAL = 'Touche « Commencer mes courses ».'

async function withHome(use: (fake: FakeLeclerc, home: string) => Promise<void>): Promise<void> {
  const fake = await startFakeLeclerc({ hosts: [HOME_HOST] })
  try {
    await use(fake, `http://${HOME_HOST}:${fake.port}`)
  } finally {
    await fake.close()
  }
}

test('premier usage complet : la carte guide chaque étape, le mur de cookies reste touchable, et le passage finit tout seul', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    // Given : personne n'est connecté, aucun magasin choisi, un mur de cookies plein écran dont les boutons sont DANS la zone où la carte se pose d'ordinaire (en bas)
    fake.setBehavior({
      homeForm: 'first-use',
      cookieWall: 'tall',
      visitorAfter: 0,
      loginForm: true,
    })
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/',
      origin: home,
      asApplication: true,
    })
    app.answerHello(PLAN)

    // Then (1) l'accueil national : la carte « Étape 1 sur 2 », écrire le code postal ; jamais « Touche « Commencer mes courses » »
    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('.g-step').filter({ hasText: 'Étape 1 sur 2' })).toBeVisible()
    // Le mur de cookies est là : la carte dit d'y répondre d'abord (la personne choisit), le repère se retire (le champ est derrière le mur)
    await expect(page.getByText('D’abord, réponds aux cookies, dans la page.')).toBeVisible()
    await expect(page.getByText('Touche ici')).toBeHidden()
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)

    // La carte se met EN HAUT : en bas elle couvrirait les boutons du mur (ils sont dans sa zone). Aucun des trois n'est sous elle, et le premier se touche vraiment
    // (Playwright vérifie qu'aucun élément, la carte comprise, ne le couvre)
    const card = page.locator('.screen.guide')
    const wallButton = page.getByRole('button', { name: 'Continuer sans accepter' })
    await expect
      .poll(async () => ((await card.boundingBox())?.y ?? 9999) < 100, { message: 'carte en haut' })
      .toBe(true)
    const cardBox = await card.boundingBox()
    for (const name of ['Continuer sans accepter', 'Paramétrer les cookies', 'Tout accepter']) {
      const box = await page.getByRole('button', { name }).boundingBox()
      expect(box).not.toBeNull()
      expect((box?.y ?? 0) >= (cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBe(true)
    }
    await wallButton.click({ timeout: 5_000 })
    await expect(page.locator('#cookie-wall')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()

    // Le mur parti, la carte revient au champ du code postal, entouré (« Touche ici »), la personne l'écrit : la page n'est jamais modifiée par l'agent
    await expect(page.getByText('Écris ton code postal dans la page.')).toBeVisible()
    await expect(page.getByText('Touche ici')).toBeVisible()
    await page.locator('#postal').fill('29000')
    await page.locator('#launch').click()
    await page.locator('#pick').click()

    // Then (2) le magasin est choisi : l'agent entre tout seul (le bouton existe maintenant), la page du magasin reçoit le plan
    await expect(page).toHaveURL(/\/magasin-000001-000001-Ville-Test\//)

    // Then (3) la personne n'est pas connectée : « Connecte-toi », jamais « Touche « Commencer mes courses » ». La page du magasin est sur un AUTRE hôte que l'accueil
    // (`fdN-courses…`) : la note de session du parcours ne la suit pas, la carte dit donc l'étape qui reste (« Il reste une étape »), ce qui est exact.
    await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
    await expect(page.locator('.g-step').filter({ hasText: 'Il reste une étape' })).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
    await page.getByRole('link', { name: 'Se connecter' }).click()
    await expect(
      page.getByText('Écris ton e-mail, puis ton mot de passe. Tu les tapes toi-même.'),
    ).toBeVisible()
    await page.locator('#login').click()

    // Then (4) le retour connecté : « Tu es connecté », puis le passage jusqu'au bout, sans retour dans Repas
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
  })
})

test('une bannière de cookies dont les boutons sont dans la zone de la carte : la carte dit d’y répondre d’abord et ne couvre aucun de ses boutons ; le repère est retiré, puis la carte revient au champ', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'first-use', cookieWall: 'banner' })
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/',
      origin: home,
      asApplication: true,
    })
    app.answerHello(PLAN)

    await expect(page.getByText('D’abord, réponds aux cookies, dans la page.')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Touche ici')).toBeHidden()
    // Laisse le garde passer plusieurs fois : la carte ne bouge pas et ne couvre aucun bouton de la bannière
    await page.waitForTimeout(2_500)
    const cardBox = await page.locator('.screen.guide').boundingBox()
    expect(cardBox).not.toBeNull()
    for (const name of ['Continuer sans accepter', 'Paramétrer les cookies', 'Tout accepter']) {
      const box = await page.getByRole('button', { name }).boundingBox()
      expect(box).not.toBeNull()
      const covered =
        (cardBox?.x ?? 0) < (box?.x ?? 0) + (box?.width ?? 0) &&
        (cardBox?.x ?? 0) + (cardBox?.width ?? 0) > (box?.x ?? 0) &&
        (cardBox?.y ?? 0) < (box?.y ?? 0) + (box?.height ?? 0) &&
        (cardBox?.y ?? 0) + (cardBox?.height ?? 0) > (box?.y ?? 0)
      expect(covered, name).toBe(false)
    }

    // La personne répond : la carte revient au champ, entouré
    await page.getByRole('button', { name: 'Continuer sans accepter' }).click()
    await expect(page.getByText('Écris ton code postal dans la page.')).toBeVisible()
    await expect(page.getByText('Touche ici')).toBeVisible()
  })
})

test('sans mur de cookies : la carte du magasin se pose en bas, comme d’habitude', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'first-use' })
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/',
      origin: home,
      asApplication: true,
    })
    app.answerHello(PLAN)

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible({
      timeout: 15_000,
    })
    const box = await page.locator('.screen.guide').boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    // En bas de l'écran (sous le milieu)
    expect((box?.y ?? 0) > (viewport?.height ?? 0) / 4).toBe(true)
    // Arrêter pour l'instant : l'envoi s'arrête, la liste est gardée, rien n'est écrit
    await page.getByRole('button', { name: /Arrêter pour l’instant/ }).click()
    expect(await app.received('result')).toMatchObject({ outcome: 'aborted' })
    expect(fake.cart()).toEqual({})
    expect(fake.paced()).toEqual([])
  })
})

test('la connexion hors d’un magasin : l’agent y dit quoi faire seulement quand un magasin a déjà été ouvert (sinon le message de l’application ramène au choix du magasin)', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'first-use', visitorAfter: 0, loginForm: true })

    // Given : une page de magasin a été ouverte (l'application retient le magasin) ; la personne est visiteuse
    const app = await openWithBridge(page, fake, agentCode, { asApplication: true })
    app.answerHello(PLAN)
    await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()

    // When : elle touche un « Se connecter » qui mène à la connexion de l'enseigne, hors d'un magasin
    await page.goto(`${home}/connexion.aspx`)

    // Then : l'application livre le plan (magasin connu), la carte dit d'entrer ses identifiants
    await expect(
      page.getByText('Écris ton e-mail, puis ton mot de passe. Tu les tapes toi-même.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
  })
})

test('la connexion hors d’un magasin SANS magasin connu : aucun plan livré, donc aucune carte de l’agent (le message natif STORE_FIRST parle seul)', async ({
  page,
  agentCode,
}) => {
  await withHome(async (fake, home) => {
    fake.setBehavior({ homeForm: 'first-use' })
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/connexion.aspx',
      origin: home,
      asApplication: true,
    })
    app.answerHello(PLAN)

    await page.waitForTimeout(3_000)
    await expect(page.locator('.screen.guide')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
    expect(fake.paced()).toEqual([])
  })
})

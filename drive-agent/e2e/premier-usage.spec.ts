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
    // Given : personne n'est connecté, aucun magasin choisi, un mur de cookies plein écran (boutons en bas)
    fake.setBehavior({ homeForm: 'first-use', cookieWall: true, visitorAfter: 0, loginForm: true })
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
    await expect(page.getByText('Étape 1 sur 2')).toBeVisible()
    await expect(page.getByText('Écris ton code postal, puis choisis ton magasin.')).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)

    // La carte est AU-DESSUS du mur et ne cache aucun de ses boutons : le bouton du mur se touche vraiment (Playwright vérifie qu'aucun élément ne le couvre)
    const card = page.locator('.screen.guide')
    const wallButton = page.getByRole('button', { name: 'Continuer sans accepter' })
    const cardBox = await card.boundingBox()
    const buttonBox = await wallButton.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(buttonBox).not.toBeNull()
    const apart =
      (cardBox?.y ?? 0) + (cardBox?.height ?? 0) <= (buttonBox?.y ?? 0) ||
      (buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) <= (cardBox?.y ?? 0)
    expect(apart).toBe(true)
    for (const name of ['Paramétrer les cookies', 'Tout accepter']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
    await wallButton.click({ timeout: 5_000 })
    await expect(page.locator('#cookie-wall')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()

    // Le champ du code postal est entouré (« Touche ici »), la personne l'écrit : la page n'est jamais modifiée par l'agent
    await expect(page.getByText('Touche ici')).toBeVisible()
    await page.locator('#postal').fill('29000')
    await page.locator('#launch').click()
    await page.locator('#pick').click()

    // Then (2) le magasin est choisi : l'agent entre tout seul (le bouton existe maintenant), la page du magasin reçoit le plan
    await expect(page).toHaveURL(/\/magasin-000001-000001-Ville-Test\//)

    // Then (3) la personne n'est pas connectée : « Connecte-toi », jamais « Touche « Commencer mes courses » ». La page du magasin est sur un AUTRE hôte que l'accueil
    // (`fdN-courses…`) : la note de session du parcours ne la suit pas, la carte dit donc l'étape qui reste (« Il reste une étape »), ce qui est exact.
    await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
    await expect(page.getByText('Il reste une étape')).toBeVisible()
    await expect(page.getByRole('heading', { name: MANUAL })).toHaveCount(0)
    await page.getByRole('link', { name: 'Se connecter' }).click()
    await expect(page.getByText('Entre tes identifiants dans la page.')).toBeVisible()
    await page.locator('#login').click()

    // Then (4) le retour connecté : « Tu es connecté », puis le passage jusqu'au bout, sans retour dans Repas
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
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
    await expect(page.getByText('Entre tes identifiants dans la page.')).toBeVisible()
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

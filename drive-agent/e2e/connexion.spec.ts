// La connexion guidée chez Leclerc (DRV-751) : un visiteur sur la page de son magasin voit « Connecte-toi » (la carte désigne « Se connecter ») ; il touche le lien, le site
// l'emmène sur sa page de connexion, que la PERSONNE remplit (l'agent n'y touche jamais, n'y « entre » jamais dans le magasin et n'y dit rien d'autre que « Entre tes
// identifiants dans la page ») ; connecté, la page du magasin revient et le passage continue tout seul. L'application simulée renvoie le plan à chaque page.
import { openWithBridge, trackInteractions } from './support/agent'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'

const PLAN = planOf([known('farine', 'Farine', [product(1000001, 2)])])

test('visiteur sur la page du magasin : « Connecte-toi », la page de connexion sans « Commencer mes courses », puis le passage continue seul', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : la personne a son magasin ouvert mais n'est pas connectée ; « Se connecter » mène à un formulaire que la personne valide
  fake.setBehavior({ visitorAfter: 0, loginForm: true })
  const gestures = await trackInteractions(page)
  const app = await openWithBridge(page, fake, agentCode)
  app.answerHello(PLAN)

  // Then : la carte dit quoi faire et où, entoure « Se connecter » ; rien n'a été demandé au site, aucune erreur
  await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
  await expect(page.getByText('Il reste une étape')).toBeVisible()
  await expect(
    page.getByText('Touche « Se connecter », puis entre tes identifiants.'),
  ).toBeVisible()
  await expect(page.getByText('Touche ici')).toBeVisible()
  await expect(page.getByText('Tu n’es pas connecté')).toHaveCount(0)
  expect(fake.paced()).toEqual([])

  // When : la personne touche « Se connecter » : la page de connexion s'ouvre
  await page.getByRole('link', { name: 'Se connecter' }).click()

  // Then : la carte dit d'entrer ses identifiants ; jamais « Ouverture de ton magasin… » ni « Touche « Commencer mes courses » » par-dessus le formulaire
  await expect(page.getByText('Entre tes identifiants dans la page.')).toBeVisible()
  await expect(page.locator('#login')).toBeVisible()
  await page.waitForTimeout(5_000)
  await expect(page.getByText('Ouverture de ton magasin…')).toHaveCount(0)
  await expect(page.getByText('Touche « Commencer mes courses ».')).toHaveCount(0)
  expect(fake.paced()).toEqual([])

  // When : la personne se connecte (son second et dernier geste)
  await page.locator('#login').click()

  // Then : la page du magasin revient connectée, « Tu es connecté » puis le passage, sans retour dans Repas
  await expect(page.getByRole('heading', { name: 'Tu es connecté' })).toBeVisible()
  expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
  expect(fake.cart()).toEqual({ 1000001: 2 })
  expect(gestures.count()).toBe(2)
})

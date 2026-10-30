// Écran d'envoi au drive (DRV-404), sans back ni compte : l'API est simulée par `page.route`, et le pont natif `repasNative` de
// l'application par un faux installé avant la page. Données inventées (magasin d'essai, produits de test). Jouée sur le téléphone (Pixel 7) seulement : aucun test n'est étiqueté (playwright.config.ts). `E2E_SHOTS=<dossier>` garde des captures.
import { expect, test } from './support/test'

import { BASE, SUMMARY_12, fakeApp, fakeBack, openArticles, scan, shot } from './support/drive'
import { switchTheme } from './support/screen'

test('dans l’application : choisir un autre produit, passer une ligne, ouvrir le drive, retrouver l’attente après rechargement', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ta liste est prête pour le drive' }),
  ).toBeVisible()
  // Une phrase de synthèse, le bouton visible sans défiler, aucune explication (DRV-628) ; la liste est repliée (12 articles)
  await expect(page.getByText(SUMMARY_12)).toBeVisible()
  await expect(page.getByText('va se remplir')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remplir mon panier' })).toBeInViewport()
  await expect(page.getByRole('listitem').filter({ hasText: 'Farine de blé T55' })).toHaveCount(0)
  await openArticles(page)

  const farine = page.getByRole('listitem').filter({ hasText: 'Farine de blé T55' }).first()
  await expect(farine).toContainText('1. Farine de blé T55 Marque Repère 1 kg')
  await expect(farine).toContainText('2. Farine de blé T45 1 kg (remplacement)')
  await expect(farine).toContainText('Ne plus proposer : Farine complète bio 1 kg')
  await expect(page.getByRole('listitem').filter({ hasText: 'Beurre doux' }).first()).toContainText(
    'quantité à vérifier',
  )

  await page.getByRole('button', { name: 'Choisir un autre produit : Farine' }).click()
  await page.getByRole('button', { name: 'Pas cette fois : Lait' }).click()
  await expect(page.getByText('Tu choisiras un autre produit sur Leclerc')).toBeVisible()
  // La phrase suit les choix : Farine devient « à choisir », Lait « pas cette fois »
  await expect(
    page.getByText(
      '12 articles : 6 sont déjà choisis, 4 sont à choisir sur Leclerc, 2 ne seront pas mis au panier.',
    ),
  ).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Remplir mon panier' }).click()
  await expect(page.getByText('En attente du récapitulatif…')).toBeVisible()

  const start = await page.evaluate(() => window.__sent.find((m) => m.type === 'drive.start'))
  expect(start?.plan?.lines).toHaveLength(12)
  const status = Object.fromEntries(start!.plan!.lines.map((l) => [l.ingredientSlug, l.status]))
  expect(status).toMatchObject({
    farine: 'NEW',
    lait: 'SKIP',
    beurre: 'KNOWN',
    sel: 'HAVE_AT_HOME',
  })

  // Le brouillon survit à un rechargement (service worker de production)
  await page.reload()
  await expect(page.getByText('En attente du récapitulatif…')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

// Hors de l'application : le texte et les liens une fois, le contraste dans les deux thèmes (fonctionnel : `DriveSendView.spec.ts`)
test('hors de l’application : message, installation et recherche par ligne, accessible en clair et en sombre', async ({
  page,
}) => {
  await fakeBack(page)
  await page.goto('/drive/envoi/l1')

  await expect(page.getByText('L’envoi automatique n’est pas disponible ici')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remplir mon panier' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Installer l’application' })).toHaveAttribute(
    'href',
    '/drive/aide',
  )
  await expect(page.getByRole('link', { name: /^Chercher sur Leclerc/ })).toHaveCount(11)
  await expect(page.getByRole('link', { name: /Chercher sur Leclerc : Farine/ })).toHaveAttribute(
    'href',
    `${BASE}/recherche.aspx?TexteRecherche=Farine`,
  )
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, colorScheme).toEqual([])
  }
})

test('à 360 px de large : « Remplir mon panier » est visible sans défiler, au-dessus de la barre du bas, sans défilement de côté', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/drive/envoi/l1')

  const open = page.getByRole('button', { name: 'Remplir mon panier' })
  await expect(open).toBeVisible()
  const box = await open.boundingBox()
  const bar = await page.locator('nav').last().boundingBox()
  // La barre de navigation du bas reste posée sur l'écran : le bouton doit finir au-dessus d'elle
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar?.y ?? 640)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect((await scan(page)).violations).toEqual([])
})

// Une application trop ancienne pour le drive (DRV-640) : le web est à jour, l'application non. Une phrase, « Mettre à jour », ni le
// drive ni l'agent, et les recherches à la main restent. 360×640, thèmes clair et sombre. Le détail des versions (0.1.9, sans réponse,
// 0.1.10 et au-dessus, navigateur) est dans `DriveSendView.spec.ts` ; ici ce qu'un navigateur est seul à prouver : la cible de 44 px, la
// largeur, le contraste dans les deux thèmes et le clic vers l'aide.
const TOO_OLD = 'Mets à jour l’application pour envoyer ta liste.'

test('application 0.1.8 : mise à jour demandée, recherche à la main gardée, accessible en clair et en sombre', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page, 'completed', '0.1.8')
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/drive/envoi/l1')

  await expect(page.getByText(TOO_OLD)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remplir mon panier' })).toHaveCount(0)
  const update = page.getByRole('link', { name: 'Mettre à jour' })
  await expect(update).toHaveAttribute('href', '/drive/aide')
  expect((await update.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('link', { name: /^Chercher sur Leclerc/ })).toHaveCount(11)
  expect(await page.evaluate(() => window.__sent.some((m) => m.type === 'drive.start'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, colorScheme).toEqual([])
    await shot(page, `trop-ancienne-${colorScheme}`)
  }

  await update.click()
  await expect(page).toHaveURL(/\/drive\/aide/)
})

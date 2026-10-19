// Écran d'envoi au drive (DRV-404), sans back ni compte : l'API est simulée par `page.route`, et le pont natif `repasNative` de
// l'application par un faux installé avant la page. Données inventées (magasin d'essai, produits de test). Joué sur bureau et Pixel 7.
import { expect, test } from '@playwright/test'

import { BASE, SUMMARY_12, fakeApp, fakeBack, openArticles, scan } from './support/drive'

test('dans l’application : choisir un autre produit, passer une ligne, ouvrir le drive, retrouver l’attente après rechargement', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Votre liste est prête pour le drive' }),
  ).toBeVisible()
  // Une phrase de synthèse, le bouton visible sans défiler, aucune explication (DRV-628) ; la liste est repliée (12 articles)
  await expect(page.getByText(SUMMARY_12)).toBeVisible()
  await expect(page.getByText('va se remplir')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ouvrir le drive' })).toBeInViewport()
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
  await expect(page.getByText('Vous choisirez un autre produit sur Leclerc')).toBeVisible()
  // La phrase suit les choix : Farine devient « à choisir », Lait « pas cette fois »
  await expect(
    page.getByText(
      '12 articles : 6 sont déjà choisis, 4 sont à choisir sur Leclerc, 2 ne seront pas mis au panier.',
    ),
  ).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
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

for (const colorScheme of ['light', 'dark'] as const) {
  test(`hors de l’application : message, installation et recherche par ligne, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/envoi/l1')

    await expect(page.getByText('L’envoi automatique n’est pas disponible ici')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir le drive' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Installer l’application' })).toHaveAttribute(
      'href',
      '/drive/aide',
    )
    await expect(page.getByRole('link', { name: /^Chercher sur Leclerc/ })).toHaveCount(11)
    await expect(page.getByRole('link', { name: /Chercher sur Leclerc : Farine/ })).toHaveAttribute(
      'href',
      `${BASE}/recherche.aspx?TexteRecherche=Farine`,
    )
    expect((await scan(page)).violations).toEqual([])
  })
}

test('à 360 px de large : « Ouvrir le drive » est visible sans défiler, au-dessus de la barre du bas, sans défilement de côté', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/drive/envoi/l1')

  const open = page.getByRole('button', { name: 'Ouvrir le drive' })
  await expect(open).toBeVisible()
  const box = await open.boundingBox()
  const bar = await page.locator('nav').last().boundingBox()
  // La barre de navigation du bas reste posée sur l'écran : le bouton doit finir au-dessus d'elle
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar?.y ?? 640)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect((await scan(page)).violations).toEqual([])
})

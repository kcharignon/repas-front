// Écran d'envoi au drive (DRV-404), sans back ni compte : l'API est simulée par `page.route`, et le pont natif `repasNative` de
// l'application par un faux installé avant la page. Données inventées (magasin d'essai, produits de test). Joué sur bureau et Pixel 7.
import { expect, test } from '@playwright/test'

import { BASE, fakeApp, fakeBack, scan } from './support/drive'

test('dans l’application : choisir un autre produit, passer une ligne, ouvrir le drive, retrouver l’attente après rechargement', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')
  await expect(page.getByRole('heading', { level: 1, name: 'Envoi au drive' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Votre liste (12)' })).toBeVisible()

  const farine = page.getByRole('listitem').filter({ hasText: 'Farine de blé T55' }).first()
  await expect(farine).toContainText('1. Farine de blé T55 Marque Repère 1 kg')
  await expect(farine).toContainText('2. Farine de blé T45 1 kg (secours)')
  await expect(farine).toContainText('Refusés : Farine complète bio 1 kg')
  await expect(page.getByRole('listitem').filter({ hasText: 'Beurre doux' }).first()).toContainText(
    'quantité à vérifier',
  )

  await page.getByRole('button', { name: 'Choisir un autre produit : Farine' }).click()
  await page.getByRole('button', { name: 'Passer cette fois : Lait' }).click()
  await expect(page.getByText('Vous choisirez un autre produit sur Leclerc')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
  await expect(page.getByText('En attente du retour du drive…')).toBeVisible()

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
  await expect(page.getByText('En attente du retour du drive…')).toBeVisible()
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

// Limiteur de débit du drive (DRV-615), sans back ni compte : le faux back refuse d'abord par `429 DRIVE_RATE_LIMITED` (avec un
// `Retry-After` optimiste de 1 seconde) puis répond. L'écran le dit comme un refus passager, n'insiste jamais tout seul et ne perd rien.
// Données inventées. Joué sur bureau et sur Pixel 7.
import { expect, test } from '@playwright/test'

import { fakeApp, fakeBack, scan } from './support/drive'

const message =
  'Trop de demandes en peu de temps. Rien n’est perdu. Attends une minute, puis réessaie.'

test('le plan est refusé (429) : message passager, aucune relecture toute seule, puis nouvel essai à la demande', async ({
  page,
}) => {
  const received = await fakeBack(page, { plan: 1 })
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')

  await expect(page.getByRole('alert')).toHaveText(message)
  await expect(page.getByText('Voir les articles')).toHaveCount(0)
  expect((await scan(page)).violations).toEqual([])
  // Le retour du focus ou du réseau ne relit pas un plan que le back vient de refuser
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
  })
  // Une requête de plus, qui passe après toute relecture éventuelle : sans attente à l'aveugle
  await page.evaluate(() => fetch('/api/v1/me').then((response) => response.status))
  expect(received.calls.filter((call) => call === 'GET /api/v1/drive/plans/l1')).toHaveLength(1)

  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByText('Voir les articles')).toBeVisible()
  expect(received.calls.filter((call) => call === 'GET /api/v1/drive/plans/l1')).toHaveLength(2)
})

test('l’estimation est refusée (429) : le bloc le dit, le reste de l’écran reste utilisable', async ({
  page,
}) => {
  await fakeBack(page, { estimate: 1 })
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')

  const block = page.getByRole('region', { name: 'Estimation du coût' })
  await expect(block.getByRole('alert')).toHaveText(message)
  await expect(page.getByText('Voir les articles')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ouvrir le drive' })).toBeEnabled()
  expect((await scan(page)).violations).toEqual([])

  await block.getByRole('button', { name: 'Réessayer' }).click()
  await expect(block.getByText(/^5,72\s€$/)).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`l’enregistrement des choix est refusé (429) : le résultat reste, rien n’est perdu, on réessaie à la demande, thème ${colorScheme}`, async ({
    page,
  }) => {
    const received = await fakeBack(page, { choices: 1 })
    await fakeApp(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/envoi/l1')
    await expect(page.getByText('Voir les articles')).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le drive' }).click()

    await expect(page).toHaveURL(/\/drive\/retour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Le panier est rempli' }),
    ).toBeVisible()
    const alert = page.getByRole('alert').filter({ hasText: 'Ils sont gardés sur cette page' })
    await expect(alert).toHaveText(
      `Tes choix ne sont pas encore enregistrés. Ils sont gardés sur cette page. ${message}`,
    )
    // Le récapitulatif et le brouillon de passage sont intacts, et rien n'a été enregistré
    await expect(page.getByText('Détails', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('repas.drive.run'))).not.toBeNull()
    expect(received.choices).toHaveLength(0)
    expect((await scan(page)).violations).toEqual([])

    await page.getByRole('button', { name: 'Réessayer l’enregistrement' }).click()
    await expect(
      page.getByText('Tes choix sont enregistrés pour les prochains envois.'),
    ).toBeVisible()
    expect(received.choices).toHaveLength(1)
    expect(await page.evaluate(() => localStorage.getItem('repas.drive.run'))).toBeNull()
  })
}

// Choisir le drive à l'envoi (DRV-710), sans back ni compte : l'API est simulée (`e2e/support/driveSend.ts`), le pont natif de l'application par un faux qui
// annonce les drives qu'elle sert (`fakeApp`). Jouée sur le téléphone (Pixel 7) à 360 × 640. Le texte, les états et les appels sont dans
// `DriveSendRetailers.spec.ts` (jsdom). Ici, ce que seul un navigateur mesure : la mise en page (le bouton principal visible sans défiler, rien ne déborde), le
// contraste des deux thèmes, le clavier réel sur les tuiles, et le message envoyé à l'application. Captures seulement avec `E2E_SHOTS=<dossier>`.
import { expect, test } from './support/test'

import { fakeApp, shot, trackTaps } from './support/drive'
import { fakeSendBack, SECOND_STORE } from './support/driveSend'
import { axeBothThemes } from './support/screen'

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.use({ viewport: { width: 360, height: 640 } })

test('deux drives configurés, aucun habituel : la question, la dernière utilisée cochée, « Ouvrir Auchan » en une touche', async ({
  page,
}) => {
  const back = await fakeSendBack(page, { mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
  await fakeApp(page, 'completed', '1.0.0', ['leclerc', 'auchan'])
  const taps = await trackTaps(page)
  await page.goto('/drive/envoi/l1')

  const group = page.getByRole('group', { name: 'Où envoyer ta liste ?' })
  await expect(group).toBeVisible()
  await expect(group.getByRole('radio', { name: /Auchan/ })).toBeChecked()
  await expect(group.getByText('Ton magasin : …abc')).toBeVisible()
  const open = page.getByRole('button', { name: 'Ouvrir Auchan' })
  await expect(open).toBeInViewport({ ratio: 1 })
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await shot(page, 'drv710-deux-drives-question-360')
  await axeBothThemes(page, 'drive-envoi-question')

  const before = await taps.total()
  await open.click()
  // Une seule touche entre l'écran et l'ouverture du drive : le dernier drive est retenu avant `drive.start`
  expect((await taps.total()) - before).toBe(1)
  await expect(page.getByText('Le panier est rempli')).toBeVisible()

  const start = await page.evaluate(() => window.__sent.find((m) => m.type === 'drive.start'))
  expect(start?.plan?.retailer).toBe('auchan')
  expect(back.lastRetailers).toEqual([{ retailer: 'auchan' }])
  // Le plan se demande toujours pour le drive du passage : à l'envoi, puis au retour (les noms des articles)
  const asked = back.received.filter((call) => call.includes('/plans/l1'))
  expect(asked.length).toBeGreaterThan(0)
  expect(new Set(asked)).toEqual(new Set(['GET /api/v1/drive/plans/l1?retailer=auchan']))
  // Les choix du passage sont enregistrés pour le drive du passage et son magasin
  expect(back.choices).toMatchObject([{ retailer: 'auchan', storeId: SECOND_STORE.id }])
  await shot(page, 'drv710-retour-second-drive-360')
})

test('toucher l’autre tuile (clavier) redemande son plan et nomme le bouton', async ({ page }) => {
  const back = await fakeSendBack(page, { mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
  await fakeApp(page, 'silent', '1.0.0', ['leclerc', 'auchan'])
  await page.goto('/drive/envoi/l1')

  const group = page.getByRole('group', { name: 'Où envoyer ta liste ?' })
  await group.getByRole('radio', { name: /Auchan/ }).focus()
  await page.keyboard.press('ArrowUp')

  await expect(group.getByRole('radio', { name: /Leclerc/ })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Ouvrir Leclerc' })).toBeVisible()
  await expect(page.getByText('sont à choisir sur Leclerc')).toBeVisible()
  expect(back.received.filter((call) => call.includes('/plans/l1'))).toEqual([
    'GET /api/v1/drive/plans/l1?retailer=auchan',
    'GET /api/v1/drive/plans/l1?retailer=leclerc',
  ])
  await shot(page, 'drv710-autre-tuile-360')
})

test('un drive habituel : « Envoyer ailleurs » pose la question pour cet envoi seulement', async ({
  page,
}) => {
  const back = await fakeSendBack(page, { mode: 'AUTO', retailer: 'leclerc', habitual: 'leclerc' })
  await fakeApp(page, 'silent', '1.0.0', ['leclerc', 'auchan'])
  await page.goto('/drive/envoi/l1')

  await expect(page.getByRole('button', { name: 'Ouvrir Leclerc' })).toBeInViewport({ ratio: 1 })
  const elsewhere = page.getByRole('button', { name: 'Envoyer ailleurs' })
  await expect(elsewhere).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await shot(page, 'drv710-drive-habituel-360')
  await axeBothThemes(page, 'drive-envoi-habituel')

  await elsewhere.click()
  const group = page.getByRole('group', { name: 'Où envoyer ta liste ?' })
  await expect(group.getByRole('radio', { name: /Auchan/ })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Ouvrir Auchan' })).toBeVisible()
  await shot(page, 'drv710-envoyer-ailleurs-360')
  expect(back.received.some((call) => call.includes('default-retailer'))).toBe(false)
})

test('l’application ne connaît pas le drive coché : la phrase le nomme, l’autre reste proposé', async ({
  page,
}) => {
  await fakeSendBack(page, { mode: 'ASK', retailer: 'auchan', lastUsed: 'auchan' })
  await fakeApp(page, 'silent', '1.0.0')
  await page.goto('/drive/envoi/l1')

  await expect(
    page.getByText('Mets à jour l’application pour envoyer ta liste à Auchan.'),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mettre à jour' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('button', { name: 'Ouvrir Auchan' })).toHaveCount(0)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await shot(page, 'drv710-application-trop-ancienne-pour-un-drive-360')
  await axeBothThemes(page, 'drive-envoi-application-ancienne')

  await page.locator('label', { hasText: 'Leclerc' }).click()
  await expect(page.getByRole('button', { name: 'Ouvrir Leclerc' })).toBeVisible()
})

test('un seul drive : l’écran d’avant, « Ouvrir le drive », ni question ni lien', async ({
  page,
}) => {
  const back = await fakeSendBack(page, {
    mode: 'AUTO',
    retailer: 'leclerc',
    configured: ['leclerc'],
  })
  await fakeApp(page, 'silent', '1.0.0')
  await page.goto('/drive/envoi/l1')

  await expect(page.getByRole('button', { name: 'Ouvrir le drive' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('group', { name: 'Où envoyer ta liste ?' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Envoyer ailleurs' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
  await expect(page.getByText('En attente du récapitulatif…')).toBeVisible()
  expect(back.lastRetailers).toEqual([])
  await shot(page, 'drv710-un-seul-drive-360')
})

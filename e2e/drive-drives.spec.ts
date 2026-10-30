// « Mes drives » dans les réglages du drive (DRV-709), sans back ni compte : l'API et le pont de l'application sont simulés
// (`e2e/support/driveBack.ts`, `fakeSetupApp`). Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour l'axe du thème clair.
// Le texte, les états, les appels et les refus sont dans `DriveSettingsDrives.spec.ts` (jsdom). Ici, ce que seul un navigateur mesure : la
// mise en page à 360 × 640 (rien ne déborde, le premier drive se voit sans défiler), le contraste des deux thèmes, le clavier réel sur le choix
// du drive habituel et le message envoyé à l'application pour le drive touché. Captures seulement avec `E2E_SHOTS=<dossier>`.
import { expect, test, BUREAU } from './support/test'

import { fakeSetupApp, shot } from './support/drive'
import { fakeDriveBack, fakeSeveralDrives, FIRST_STORE, SECOND_STORE } from './support/driveBack'
import { axeBothThemes } from './support/screen'

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('à 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('deux drives dont un configuré : « Mes drives », le magasin de l’un, « Choisir mon magasin » pour l’autre', async ({
    page,
  }) => {
    await fakeDriveBack(page)
    await fakeSeveralDrives(page)
    await fakeSetupApp(page, ['leclerc', 'auchan'], {
      auchan: { id: SECOND_STORE.id, host: 'www.auchan.fr', baseUrl: SECOND_STORE.baseUrl },
    })
    await page.goto('/drive/reglages')

    const title = page.getByRole('heading', { level: 2, name: 'Mes drives' })
    await expect(title).toBeInViewport({ ratio: 1 })
    await expect(page.getByText('Ton magasin : …456')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choisir mon magasin Auchan' })).toBeVisible()
    await expect(page.getByText('Mon drive habituel')).toHaveCount(0)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await shot(page, 'drv709-deux-drives-un-configure-360')
    await axeBothThemes(page, 'drive-mes-drives')
  })

  test('« Choisir mon magasin » envoie drive.setup pour ce drive, enregistre son magasin, et « Mon drive habituel » apparaît', async ({
    page,
  }) => {
    await fakeDriveBack(page)
    const back = await fakeSeveralDrives(page)
    await fakeSetupApp(page, ['leclerc', 'auchan'], {
      auchan: { id: SECOND_STORE.id, host: 'www.auchan.fr', baseUrl: SECOND_STORE.baseUrl },
    })
    await page.goto('/drive/reglages')

    await page.getByRole('button', { name: 'Choisir mon magasin Auchan' }).click()
    await expect(page.getByText('Mon drive habituel')).toBeVisible()

    const setup = await page.evaluate(() => window.__sent.filter((m) => m.type === 'drive.setup'))
    expect(setup).toHaveLength(1)
    expect(setup[0]?.retailer).toBe('auchan')
    expect(back.writes).toEqual([
      `PUT /api/v1/drive/settings ${JSON.stringify({
        retailer: 'auchan',
        store: { id: SECOND_STORE.id, baseUrl: SECOND_STORE.baseUrl, label: null },
      })}`,
    ])
    await shot(page, 'drv709-deux-drives-configures-360')
  })

  test('deux drives configurés : le drive habituel se choisit au clavier, « Aucun » l’efface', async ({
    page,
  }) => {
    await fakeDriveBack(page)
    const back = await fakeSeveralDrives(page, {
      stores: { leclerc: FIRST_STORE, auchan: SECOND_STORE },
    })
    await fakeSetupApp(page, ['leclerc', 'auchan'])
    await page.goto('/drive/reglages')

    const group = page.getByRole('group', { name: 'Mon drive habituel' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio', { name: 'Aucun' })).toBeChecked()

    await group.getByRole('radio', { name: 'Auchan' }).focus()
    await page.keyboard.press('Space')
    await expect(group.getByRole('radio', { name: 'Auchan' })).toBeChecked()
    expect(back.habitual).toBe('auchan')

    await group.getByText('Aucun', { exact: true }).click()
    await expect(group.getByRole('radio', { name: 'Aucun' })).toBeChecked()
    expect(back.writes).toEqual([
      'PUT /api/v1/drive/default-retailer {"retailer":"auchan"}',
      'PUT /api/v1/drive/default-retailer {"retailer":null}',
    ])
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await axeBothThemes(page, 'drive-mon-drive-habituel')
  })

  test('« Retirer » demande confirmation puis le drive quitte la liste', async ({ page }) => {
    await fakeDriveBack(page)
    const back = await fakeSeveralDrives(page, {
      stores: { leclerc: FIRST_STORE, auchan: SECOND_STORE },
      habitual: 'auchan',
    })
    await fakeSetupApp(page, ['leclerc', 'auchan'])
    await page.goto('/drive/reglages')

    await page.getByRole('button', { name: 'Retirer Auchan' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Retirer Auchan ?')
    await shot(page, 'drv709-retirer-360')
    expect((await page.screenshot()).length).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Retirer Auchan' }).click()

    await expect(page.getByRole('button', { name: 'Choisir mon magasin Auchan' })).toBeVisible()
    await expect(page.getByText('Mon drive habituel')).toHaveCount(0)
    expect(back.writes).toEqual(['DELETE /api/v1/drive/settings?retailer=auchan'])
  })
})

test(
  'les réglages à deux drives sont accessibles et sans défilement horizontal sur le bureau',
  { tag: BUREAU },
  async ({ page }) => {
    await fakeDriveBack(page)
    await fakeSeveralDrives(page, { stores: { leclerc: FIRST_STORE, auchan: SECOND_STORE } })
    await fakeSetupApp(page, ['leclerc', 'auchan'])
    await page.goto('/drive/reglages')

    await expect(page.getByRole('heading', { level: 2, name: 'Mes drives' })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await shot(page, 'drv709-deux-drives-bureau')
    await axeBothThemes(page, 'drive-mes-drives-bureau')
  },
)

test('une application qui ne connaît pas le second drive : la phrase de mise à jour', async ({
  page,
}) => {
  await fakeDriveBack(page)
  await fakeSeveralDrives(page)
  await fakeSetupApp(page, undefined)
  await page.goto('/drive/reglages')

  await expect(page.getByText('Mets à jour l’application pour ajouter Auchan.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choisir mon magasin Auchan' })).toHaveCount(0)
})

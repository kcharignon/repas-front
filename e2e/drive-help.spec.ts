// Aide et mise à jour de l'application (DRV-316, DRV-639), sans back ni compte : l'API est simulée par `page.route`, et le pont natif
// `repasNative` de l'application par un faux installé avant la page. Jouée sur le téléphone (Pixel 7) seulement. Le texte et les liens sont
// dans `DriveHelpView.spec.ts` (jsdom, redirection de `/drive/aide` dans un navigateur comprise) ; la page publique `/installer` dans
// `install.spec.ts`, la mise à jour faite par l'application elle-même dans `app-update.spec.ts` : ici, ce qu'aucune d'elles ne scanne, l'entrée
// « Application » de « Moi » et l'aide d'une application qui ne se met pas encore à jour seule, dans les deux thèmes.
import { expect, test } from './support/test'

import { fakeApp, fakeBack, scan } from './support/drive'

const APK =
  'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`dans l’application : « Moi » propose de la mettre à jour, l’aide donne la version et le téléchargement, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await fakeApp(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/moi')

    // L'entrée « Application » de « Moi » : mettre à jour dans l'application (qu'on n'a pas à installer)
    const entry = page.getByRole('link', { name: /Mettre à jour l’application/ })
    await expect(entry).toBeVisible()
    await expect(page.getByText('Ouvrir la dernière version.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Installer l’application Android/ })).toHaveCount(0)
    expect((await scan(page)).violations).toEqual([])

    await entry.click()
    await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mettre à jour l’application' }),
    ).toBeVisible()
    // Une application qui ne se met pas encore à jour seule : la version installée, puis le téléchargement à la main
    await expect(page.getByText('Version installée : 1.0.0')).toBeVisible()
    const button = page.getByRole('link', { name: 'Télécharger l’application' })
    await expect(button).toHaveAttribute('href', APK)
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('listitem')).toHaveCount(4)
    expect((await scan(page)).violations).toEqual([])
  })
}

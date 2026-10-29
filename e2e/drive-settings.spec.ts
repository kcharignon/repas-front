// Réglages du drive (DRV-403), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`). Jouée sur le téléphone (Pixel 7) ; le bureau
// seulement pour l'axe du thème clair (playwright.config.ts).
// Le texte, les saisies, la lecture du magasin par l'application (aussi quand elle échoue), la confirmation d'un autre magasin, la version de
// l'application et le menu de « Moi » sont dans `DriveSettings.spec.ts`, `DriveAccountLinks.spec.ts`, `storeReader.spec.ts` et
// `DriveSettingsStoreReplay.spec.ts` (jsdom, avec le vrai pont) ; le raccord liste -> réglages -> liste est dans `shopping-list-sent.spec.ts`.
// Ici, ce que seul un navigateur mesure : la place de « Ton magasin » à 360 × 640 et le contraste des deux thèmes.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, BUREAU } from './support/test'

import { fakeDriveBack } from './support/driveBack'

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

test.describe('à 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('avec un magasin : aucune note au-dessus et « Ton magasin » est visible sans défiler (DRV-626, DRV-628)', async ({
    page,
  }) => {
    await fakeDriveBack(page)
    await page.goto('/drive/reglages')

    // Aucune note de vie privée ni mise en garde sur cet écran : elles sont dans les conditions d'utilisation (DRV-628)
    await expect(page.getByRole('heading', { name: 'Ta vie privée' })).toHaveCount(0)
    await expect(page.getByText(/ne voit jamais|suspendre/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /note complète|Conditions/ })).toHaveCount(0)
    // « Ton magasin » est le premier bloc
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Ton magasin')

    // « Ton magasin » est entièrement au-dessus de la barre du bas, sans défiler
    const heading = page.getByRole('heading', { level: 2, name: 'Ton magasin' })
    await expect(heading).toBeInViewport({ ratio: 1 })
    const box = await heading.boundingBox()
    const bar = await page.getByRole('navigation').last().boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect((await scan(page)).violations).toEqual([])
  })
})

// Le contraste ne dépend que du thème, la mise en page que de la largeur : le bureau ne rejoue que le thème clair.
for (const colorScheme of ['light', 'dark'] as const) {
  test(
    `les réglages du drive sont accessibles, sans défilement horizontal, thème ${colorScheme}`,
    { tag: colorScheme === 'light' ? BUREAU : [] },
    async ({ page }) => {
      await fakeDriveBack(page)
      await page.emulateMedia({ colorScheme })

      await page.goto('/drive/reglages')
      await expect(page.getByText('Magasin …456')).toBeVisible()
      await expect(page.getByText('Articles avec des produits', { exact: true })).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)

      // L'erreur de saisie est lue par les lecteurs d'écran et lisible
      await page.getByLabel('Adresse de ton magasin').fill('pas une adresse')
      await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
      await expect(
        page.getByText('Cette adresse n’est pas celle d’un magasin Leclerc Drive'),
      ).toBeVisible()
      expect((await scan(page)).violations).toEqual([])
    },
  )
}

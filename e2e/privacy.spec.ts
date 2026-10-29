// La politique de confidentialité publique, `/confidentialite` (STORE-010), sans back ni compte : donnée à Google Play et à Amazon (skill Alexa).
// Jouée sur le téléphone (Pixel 7) ; le bureau seulement pour les tests étiquetés (playwright.config.ts) ; captures à 412 et 360 px, thèmes clair et sombre ; le lien discret de l'écran de connexion.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'
import type { Page } from '@playwright/test'

const accessibility = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()
  expect(violations).toEqual([])
}

/** Aucun appel au back : la page est publique et ne dépend d'aucune donnée. */
async function noBack(page: Page) {
  const calls: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      calls.push(route.request().url())
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    },
  )

  return calls
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [412, 360]) {
    test(`/confidentialite à ${width} px : lisible sans connexion, sans défilement de côté, thème ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const calls = await noBack(page)
      await page.setViewportSize({ width, height: 640 })
      await page.emulateMedia({ colorScheme })

      await page.goto('/confidentialite')

      // Pas de redirection : l'adresse reste celle donnée à Google et à Amazon
      await expect(page).toHaveURL(/\/confidentialite$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeVisible()
      await expect(page.getByText('Repas est édité par Kantin.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'kantin.charignon@gmail.com' })).toHaveAttribute(
        'href',
        'mailto:kantin.charignon@gmail.com',
      )
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(10)
      await expect(
        page.getByRole('heading', { name: 'La commande vocale avec Alexa' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Lire la politique d’Amazon' })).toHaveAttribute(
        'href',
        'https://www.amazon.fr/privacy',
      )
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
      // La page n'a besoin de rien du back ni d'aucune connexion
      expect(calls).toEqual([])
      await accessibility(page)
      await page.screenshot({
        path: testInfo.outputPath(`${colorScheme}-confidentialite-${width}.png`),
        fullPage: true,
      })
    })
  }
}

test('le lien discret de l’écran de connexion mène à la page, et le bouton principal reste visible à 360 × 640', async ({
  page,
}, testInfo) => {
  await noBack(page)
  await page.setViewportSize({ width: 360, height: 640 })

  await page.goto('/connexion')

  const link = page.getByRole('link', { name: 'Confidentialité' })
  await expect(link).toBeVisible()
  const button = await page.getByRole('button', { name: 'Se connecter' }).boundingBox()
  expect(button, 'le bouton se voit').not.toBeNull()
  expect(button!.y + button!.height, 'sans défiler').toBeLessThanOrEqual(640)
  await accessibility(page)
  await page.screenshot({ path: testInfo.outputPath('connexion-360.png') })

  await link.click()
  await expect(page).toHaveURL(/\/confidentialite$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeVisible()
})

test('le lien de l’écran d’inscription mène aussi à la page', async ({ page }) => {
  await noBack(page)

  await page.goto('/inscription')
  await page.getByRole('link', { name: 'Confidentialité' }).click()

  await expect(page).toHaveURL(/\/confidentialite$/)
})

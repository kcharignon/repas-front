// La politique de confidentialité publique, `/confidentialite` (STORE-010), sans back ni compte : donnée à Google Play et à Amazon (skill Alexa).
// Un seul test, à 360 × 640 (le plus étroit), accessible dans les deux thèmes de la même visite, en partant du lien discret de l'écran de connexion.
// Le texte (dix rubriques, adresse de contact, politique d'Amazon, route publique) est en jsdom : `PrivacyView.spec.ts` ; les liens des écrans de
// connexion et d'inscription : `AuthViews.spec.ts`.
import { expect, test } from './support/test'
import { axeBothThemes } from './support/screen'
import type { Page } from '@playwright/test'

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

test.describe('/confidentialite, à 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('depuis le lien discret de la connexion : lisible sans connexion, sans défilement de côté, accessible dans les deux thèmes', async ({
    page,
  }) => {
    const calls = await noBack(page)
    await page.emulateMedia({ colorScheme: 'light' })

    // Le lien est dans l'angle du bandeau et ne prend aucune hauteur : le bouton principal reste visible sans défiler
    await page.goto('/connexion')
    const link = page.getByRole('link', { name: 'Confidentialité' })
    await expect(link).toBeVisible()
    const button = await page.getByRole('button', { name: 'Se connecter' }).boundingBox()
    expect(button, 'le bouton se voit').not.toBeNull()
    expect(button!.y + button!.height, 'sans défiler').toBeLessThanOrEqual(640)
    await link.click()

    // Pas de redirection : l'adresse reste celle donnée à Google et à Amazon
    await expect(page).toHaveURL(/\/confidentialite$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeVisible()
    await expect(page.getByText('Repas est édité par Kantin.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'kantin.charignon@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:kantin.charignon@gmail.com',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(10)
    await expect(page.getByRole('heading', { name: 'La commande vocale avec Alexa' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lire la politique d’Amazon' })).toHaveAttribute(
      'href',
      'https://www.amazon.fr/privacy',
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
    await axeBothThemes(page, 'confidentialite')
    // La page n'a besoin de rien du back ni d'aucune connexion
    expect(calls).toEqual([])

    // L'écran d'inscription mène aussi à la page
    await page.goto('/inscription')
    await page.getByRole('link', { name: 'Confidentialité' }).click()
    await expect(page).toHaveURL(/\/confidentialite$/)
  })
})

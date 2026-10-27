// Les crédits de « Moi » (back #53) : Flaticon est nommé et la licence des icônes est à un clic. Sans back ni compte : l'API est simulée
// par `page.route`. Joué sur bureau et sur Pixel 7, thèmes clair et sombre.
import { expect, test } from './support/test'

import { fakeBack, scan } from './support/drive'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`« Moi » crédite Flaticon et renvoie vers la licence, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeBack(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/moi')

    const credits = page.getByTestId('account-credits')
    await credits.scrollIntoViewIfNeeded()
    await expect(credits.getByRole('heading', { level: 2, name: 'Crédits' })).toBeVisible()
    await expect(credits.getByRole('link', { name: 'Flaticon' })).toHaveAttribute(
      'href',
      'https://www.flaticon.com',
    )
    await expect(credits.getByRole('link', { name: 'Licence et auteurs' })).toHaveAttribute(
      'href',
      '/images/ingredient/license/license.html',
    )
    expect((await scan(page)).violations).toEqual([])
  })
}

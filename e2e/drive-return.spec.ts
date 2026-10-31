// Retour du drive (DRV-405), sans back ni compte : l'API est simulée par `page.route`, le pont natif par un faux qui répond au lancement
// du drive par un résultat tiré du plan. Le parcours complet (envoi, retour, choix enregistrés, récapitulatif) est dans `drive-journey.spec.ts`, le détail dans `DriveReturnView.spec.ts` : ici, le contraste de l'état « partiel ». Joué sur le téléphone (Pixel 7) seulement.
import { expect, test } from './support/test'

import { fakeApp, fakeBack, openDetails, scan } from './support/drive'
import { switchTheme } from './support/screen'

// Un passage arrêté par Leclerc : l'état « partiel » est le seul à porter les couleurs d'alerte avec un bouton principal (le texte, le code
// replié et les choix enregistrés sont dans `DriveReturnView.spec.ts`). Ici : le contraste des deux thèmes, replié puis déplié, et
// « Reprendre l'envoi », un seul clic.
test('un passage arrêté par Leclerc : accessible en clair et en sombre, replié et déplié, « Reprendre l’envoi » rouvre le drive', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page, 'partial')
  await page.goto('/drive/envoi/l1')
  await page.getByRole('button', { name: 'Remplir mon panier' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Le panier est rempli en partie' }),
  ).toBeVisible()
  // Un seul bouton principal, et « Reprendre l'envoi » en est un ; le code n'est lu que dans « Détails »
  await expect(page.locator('main a.bg-primary, main button.bg-primary')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Reprendre l’envoi' }).first()).toHaveClass(
    /bg-primary/,
  )
  await expect(page.getByText('Code : BLOCKED')).toBeHidden()
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, `replié, ${colorScheme}`).toEqual([])
  }
  await openDetails(page)
  await expect(page.getByText('Code : BLOCKED')).toBeVisible()
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect((await scan(page)).violations, `déplié, ${colorScheme}`).toEqual([])
  }

  // « Reprendre l'envoi » est l'intention : le drive se rouvre tout seul (pas de second « Remplir mon panier »), sur les seuls articles qui manquent :
  // les 9 mis au panier (6 ajoutés, 3 choisis) ont été cochés dans la liste, donc le plan n'a plus que le beurre en échec et « j'en ai toujours » (DRV-747)
  await page.getByRole('link', { name: 'Reprendre l’envoi' }).first().click()
  await expect
    .poll(() => page.evaluate(() => window.__sent.filter((m) => m.type === 'drive.start').length))
    .toBe(2)
  const [, again] = await page.evaluate(() => window.__sent.filter((m) => m.type === 'drive.start'))
  expect(again?.plan?.lines.map((line) => line.ingredientSlug).sort()).toEqual(['beurre', 'sel'])
})

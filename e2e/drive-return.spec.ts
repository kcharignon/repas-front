// Retour du drive (DRV-405), sans back ni compte : l'API est simulée par `page.route`, le pont natif par un faux qui répond au lancement
// du drive par un résultat tiré du plan. Parcours complet : envoi, retour, enregistrement des choix, récapitulatif. Bureau et Pixel 7.
import { expect, test } from '@playwright/test'

import { fakeApp, fakeBack, openArticles, openDetails, scan } from './support/drive'

test('un passage réussi : retour automatique, choix enregistrés en un appel, récapitulatif, panier dans le navigateur', async ({
  page,
}) => {
  const received = await fakeBack(page)
  await fakeApp(page)
  await page.goto('/drive/envoi/l1')
  await expect(page.getByText('Voir les articles')).toBeVisible()
  await openArticles(page)
  await page.getByRole('button', { name: 'Choisir un autre produit : Farine' }).click()
  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()

  // L'application répond : l'écran du retour s'ouvre tout seul
  await expect(page).toHaveURL(/\/drive\/retour$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Le panier est rempli' })).toBeVisible()
  await expect(
    page.getByText('Vos choix sont enregistrés pour les prochains envois.'),
  ).toBeVisible()

  // Un seul appel : 4 ajouts (3 nouvelles lignes et Farine remplacée) et les 7 prix lus des lignes ajoutées
  expect(received.calls.filter((call) => call === 'PUT /api/v1/drive/choices')).toHaveLength(1)
  const [body] = received.choices as {
    storeId: string
    choices: { ingredientSlug: string; action: string }[]
  }[]
  expect(body?.storeId).toBe('123456')
  const actions = body!.choices.map((choice) => choice.action)
  expect(actions.filter((action) => action === 'ADD_PRODUCT')).toHaveLength(4)
  expect(actions.filter((action) => action === 'REFRESH_PRICE')).toHaveLength(7)

  // Le récapitulatif : une phrase, les compteurs qui existent (jamais « Échecs » ni « Prix lus »), un seul bouton principal
  await expect(
    page.getByText('Vos produits sont dans le panier Leclerc : il reste à le finaliser.'),
  ).toBeVisible()
  await expect(page.getByLabel('Récapitulatif de l’envoi')).not.toContainText(
    /Échecs|Prix lus|\b0\b/,
  )
  await expect(page.getByRole('link', { name: /^Finaliser sur Leclerc/ })).toHaveClass(/bg-primary/)
  await expect(page.locator('main a.bg-primary, main button.bg-primary')).toHaveCount(1)

  // Les détails sont repliés : chaque article, produit de secours signalé
  await expect(page.getByText('Choisi sur Leclerc, produit habituel').first()).toBeHidden()
  await openDetails(page)
  const farine = page.getByRole('listitem').filter({ hasText: 'Farine' })
  await expect(farine).toContainText('produit habituel : Repas s’en souvient')
  await expect(page.getByRole('listitem').filter({ hasText: 'Beurre' })).toContainText('1,89')
  await expect(page.getByText('Le panier Leclerc n’est pas vidé par Repas.')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Finaliser sur Leclerc/ })).toHaveAttribute(
    'target',
    '_blank',
  )

  // Le brouillon est effacé : l'écran d'envoi ne montre plus d'attente
  expect(await page.evaluate(() => localStorage.getItem('repas.drive.run'))).toBeNull()
  expect((await scan(page)).violations).toEqual([])

  // Terminer la liste : confirmation, puis la liste
  await page.getByRole('button', { name: 'Terminer la liste' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Terminer la liste' }).click()
  await expect(page).toHaveURL(/\/listes\/l1$/)
  expect(received.calls).toContain('POST /api/v1/shopping-lists/l1/complete')
})

test('un faux résultat posté par la page de l’enseigne : seules les lignes du plan sont retenues', async ({
  page,
}) => {
  const received = await fakeBack(page)
  // Ce que la page de Leclerc pourrait fabriquer avec le bon identifiant de passage : un ingrédient hors liste, un produit hors plan,
  // un produit « choisi » pour une ligne qui n'était pas à choisir ; une seule ligne est honnête
  await fakeApp(page, {
    v: 1,
    type: 'result',
    agentVersion: '1.0.0',
    outcome: 'completed',
    store: { id: '123456' },
    lines: [
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '123456',
        quantity: 1,
        usedRank: 1,
        price: { cents: 189 },
      },
      {
        ingredientSlug: 'pirate',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555999', label: 'Produit hors liste' },
      },
      { ingredientSlug: 'beurre', outcome: 'ADDED', productId: '777000', quantity: 1, usedRank: 1 },
      {
        ingredientSlug: 'lait',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555998', label: 'Produit imposé' },
      },
    ],
  })
  await page.goto('/drive/envoi/l1')
  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()

  await expect(page).toHaveURL(/\/drive\/retour$/)
  await expect(
    page.getByText('Vos choix sont enregistrés pour les prochains envois.'),
  ).toBeVisible()
  await openDetails(page)
  await expect(
    page.getByText('3 articles ne figuraient pas dans votre liste : Repas les a laissés de côté.'),
  ).toBeVisible()
  await expect(page.locator('details li')).toHaveCount(1)
  await expect(page.getByText('Produit hors liste')).toHaveCount(0)
  await expect(page.getByText('Produit imposé')).toHaveCount(0)

  // Une seule intention part : le prix lu de la farine, la seule ligne que le plan explique
  const [body] = received.choices as { choices: { ingredientSlug: string; action: string }[] }[]
  expect(body?.choices).toEqual([
    expect.objectContaining({ ingredientSlug: 'farine', action: 'REFRESH_PRICE' }),
  ])
  expect((await scan(page)).violations).toEqual([])
})

test('un passage arrêté par Leclerc : trois phrases, un seul bouton principal « Reprendre l’envoi », le code replié', async ({
  page,
}) => {
  await fakeBack(page)
  await fakeApp(page, 'partial')
  await page.goto('/drive/envoi/l1')
  await page.getByRole('button', { name: 'Ouvrir le drive' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Le panier est rempli en partie' }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Leclerc a ralenti les demandes. Ce qui est déjà au panier y reste : il reste 1 article à ajouter. Attendez quelques minutes, puis reprenez l’envoi.',
    ),
  ).toBeVisible()
  // Ni « Échecs » ni code à l'écran ; le code n'est lu que dans « Détails »
  await expect(page.getByLabel('Récapitulatif de l’envoi')).not.toContainText('Échecs')
  await expect(page.getByText('Code : BLOCKED')).toBeHidden()
  await expect(page.locator('main a.bg-primary, main button.bg-primary')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Reprendre l’envoi' }).first()).toHaveClass(
    /bg-primary/,
  )
  expect((await scan(page)).violations).toEqual([])
  await openDetails(page)
  await expect(page.getByText('Code : BLOCKED')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  // Reprendre l'envoi ramène à l'écran de l'envoi, sur toute la liste
  await page.getByRole('link', { name: 'Reprendre l’envoi' }).first().click()
  await expect(page).toHaveURL(/\/drive\/envoi\/l1$/)
  await expect(page.getByText('Voir les articles')).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`un résultat qui n’est pas celui du dernier envoi n’enregistre rien, thème ${colorScheme}`, async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await fakeApp(page)
    await page.emulateMedia({ colorScheme })
    await page.goto('/drive/envoi/l1')
    await expect(page.getByText('Voir les articles')).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le drive' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Le panier est rempli' }),
    ).toBeVisible()

    // Un second résultat arrive pour un autre passage (brouillon effacé) : il est expliqué et ignoré
    await page.evaluate(() => {
      const bridge = (window as unknown as { repasNative: { postMessage: (text: string) => void } })
        .repasNative
      bridge.postMessage(
        JSON.stringify({
          v: 1,
          type: 'drive.start',
          plan: {
            v: 1,
            type: 'plan',
            runId: '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10',
            retailer: 'leclerc',
            store: { id: '123456', host: 'courses-test.leclercdrive.fr' },
            returnPath: '/drive/retour',
            lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'SKIP' }],
          },
        }),
      )
    })
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Ce récapitulatif ne correspond pas à votre dernier envoi',
      }),
    ).toBeVisible()
    expect(received.calls.filter((call) => call === 'PUT /api/v1/drive/choices')).toHaveLength(1)
    expect((await scan(page)).violations).toEqual([])
  })
}

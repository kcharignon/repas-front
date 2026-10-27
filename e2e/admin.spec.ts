import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext } from './support/test'

import { apiToken, email, hasSession, signIn } from './support/session'

// Administration (réservée aux administrateurs) contre le VRAI back. Les unités, rayons et types ne se suppriment pas :
// les tests modifient une unité existante (nom, symbole, dimension et facteur) puis la remettent dans son état de départ, ils n'en créent pas.
test.describe('administration', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  let token = ''
  let unit: {
    slug: string
    name: string
    symbol: string
    dimension: string | null
    baseFactor: number | null
  } = { slug: '', name: '', symbol: '', dimension: null, baseFactor: null }
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    const units = (
      (await (await request.get('/api/v1/units', { headers: bearer() })).json()) as {
        member: (typeof unit)[]
      }
    ).member
    unit = units.find((candidate) => candidate.symbol !== '') ?? units[0] ?? unit
  })

  test.afterEach(async ({ request }) => {
    await request.put(`/api/v1/units/${unit.slug}`, {
      headers: bearer(),
      // Les deux ensemble : un corps qui en mentionne un remplace la paire (`null` et `null` l'efface)
      data: {
        name: unit.name,
        symbol: unit.symbol,
        dimension: unit.dimension,
        baseFactor: unit.baseFactor,
      },
    })
  })

  test("l'administrateur ouvre l'administration depuis son compte et modifie une unité", async ({
    page,
  }) => {
    await signIn(page, '/moi')
    await page.getByRole('link', { name: 'Administration' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
    for (const section of ['Unités', 'Rayons', 'Types de recette', 'Conversions', 'Utilisateurs']) {
      await expect(
        page.getByRole('main').getByRole('link', { name: section, exact: true }),
      ).toBeVisible()
    }

    await page.getByRole('main').getByRole('link', { name: 'Unités', exact: true }).click()
    await page.getByRole('button', { name: `Modifier ${unit.name}`, exact: true }).click()
    await page.getByLabel('Symbole').fill('zz')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(
      page.getByRole('listitem').filter({ hasText: unit.name }).getByText('zz'),
    ).toBeVisible()
  })

  test("l'administrateur renseigne la dimension et le facteur d'une unité, le back refuse l'incohérence", async ({
    page,
  }) => {
    await signIn(page, '/admin/unites')
    const row = page.getByRole('listitem').filter({ hasText: unit.name })
    await page.getByRole('button', { name: `Modifier ${unit.name}`, exact: true }).click()
    await expect(page.getByText('Sert à calculer combien de produits acheter.')).toBeVisible()

    await page.getByLabel('Ce que l’unité mesure').selectOption('VOLUME')
    await page.getByLabel('Facteur de base').fill('2')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(row.getByText('Volume, × 2')).toBeVisible()

    // Une dimension sans facteur : refusée par le back, dont on lit le message en français
    await page.getByRole('button', { name: `Modifier ${unit.name}`, exact: true }).click()
    await page.getByLabel('Ce que l’unité mesure').selectOption('WEIGHT')
    await page.getByLabel('Facteur de base').fill('')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'La dimension et le facteur de base vont ensemble',
    )
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(row.getByText('Volume, × 2')).toBeVisible()
  })

  test('la liste des utilisateurs montre les comptes de démonstration', async ({ page }) => {
    await signIn(page, '/admin/utilisateurs')

    await expect(page.getByText('admin@repas.fr', { exact: true })).toBeVisible()
    await expect(page.getByText('user@repas.fr', { exact: true })).toBeVisible()
  })

  test("l'administrateur désactive puis réactive un compte, et la suppression demande confirmation", async ({
    page,
    request,
  }) => {
    const demo = 'user@repas.fr'
    const row = () => page.getByRole('listitem').filter({ hasText: demo })
    const more = () => row().getByRole('button', { name: `Plus d’actions pour ${demo}` })
    try {
      await signIn(page, '/admin/utilisateurs')
      await expect(row()).toBeVisible()
      await expect(row()).toContainText('Actif')

      await more().click()
      await page.getByRole('menuitem', { name: 'Désactiver' }).click()

      await expect(row()).toContainText('Désactivé')
      await expect(
        page.getByRole('status').filter({ hasText: `Statut de ${demo} modifié.` }),
      ).toBeVisible()

      await row()
        .getByRole('button', { name: `Réactiver ${demo}` })
        .click()

      await expect(row()).toContainText('Actif')

      // La suppression est irréversible : on voit la confirmation, on annule, rien n'est supprimé
      await more().click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await expect(page.getByRole('dialog')).toContainText('irréversible')
      await page.getByRole('button', { name: 'Annuler' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(row()).toBeVisible()
    } finally {
      // Le compte de démonstration doit rester actif pour les autres scénarios
      await activateAccount(request, token, demo)
    }
  })

  test("l'administrateur ne peut pas supprimer son propre compte", async ({ page }) => {
    await signIn(page, '/admin/utilisateurs')

    await page.getByRole('button', { name: `Plus d’actions pour ${email}` }).click()

    await expect(page.getByRole('menuitem', { name: /Supprimer/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test("un utilisateur ordinaire n'accède pas à l'administration", async ({ page }) => {
    // Compte de démonstration ordinaire (`make fixtures`)
    await page.goto('/connexion')
    await page.getByLabel('Adresse e-mail').fill(process.env.E2E_USER_EMAIL ?? 'user@repas.fr')
    await page.getByLabel('Mot de passe').fill(process.env.E2E_USER_PASSWORD ?? 'M0t 2 p@sse')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/liste$/)

    await page.goto('/admin/unites')

    await expect(page).toHaveURL(/\/liste$/)
    await page.goto('/moi')
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`l'administration est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/admin')
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
      expect((await scan()).violations).toEqual([])

      await page.goto('/admin/conversions')
      await page.getByRole('button', { name: 'Nouvelle conversion' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect((await scan()).violations).toEqual([])
    })
  }
})

/** Remet un compte au statut actif par l'API (nettoyage : le test, lui, passe par l'interface). */
async function activateAccount(request: APIRequestContext, token: string, accountEmail: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const users = (await (await request.get('/api/v1/users', { headers })).json()) as {
    member: { id: string; email: string }[]
  }
  const account = users.member.find((candidate) => candidate.email === accountEmail)
  if (account !== undefined)
    await request.put(`/api/v1/users/${account.id}/status`, {
      headers,
      data: { status: 'ACTIVE' },
    })
}

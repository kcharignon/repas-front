import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'

import { apiToken, hasSession, signIn } from './support/session'

// Rayons et ingrédients (ajouter à la liste, créer, modifier, supprimer) contre le VRAI back.
test.describe('rayons et ingrédients', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  const prefix = 'Ingrédient e2e'
  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    expect(
      (await request.put('/api/v1/shopping-lists/active', { headers: bearer() })).status(),
    ).toBe(204)
  })

  // Les ingrédients créés par le test et la quantité ajoutée à la liste sont retirés quelle que soit l'issue.
  test.afterEach(async ({ request }) => {
    const departments = (
      (await (await request.get('/api/v1/departments', { headers: bearer() })).json()) as {
        member: { slug: string }[]
      }
    ).member
    for (const department of departments) {
      const list = (
        (await (
          await request.get(`/api/v1/departments/${department.slug}/ingredients`, {
            headers: bearer(),
          })
        ).json()) as {
          member: { slug: string; name: string }[]
        }
      ).member
      for (const ingredient of list.filter((candidate) => candidate.name.startsWith(prefix))) {
        await request.delete(`/api/v1/ingredients/${ingredient.slug}`, { headers: bearer() })
      }
    }
    await request.post('/api/v1/shopping-lists/active/ingredients/sel/decrease', {
      headers: bearer(),
    })
  })

  test('ajouter un ingrédient à la liste depuis son rayon, puis le retirer', async ({ page }) => {
    await signIn(page, '/rayons')
    await expect(page.getByRole('heading', { level: 1, name: 'Rayons' })).toBeVisible()
    await page.getByRole('link', { name: 'Divers' }).click()

    await page.getByRole('button', { name: 'Un de plus : sel' }).click()
    await expect(page.getByRole('button', { name: 'Un de moins : sel' })).toBeEnabled()
    await page.goto('/liste')
    await expect(page.getByRole('checkbox', { name: /sel/i })).toBeVisible()

    await page.goto('/rayons')
    await page.getByRole('link', { name: 'Divers' }).click()
    await page.getByRole('button', { name: 'Un de moins : sel' }).click()
    await expect(page.getByRole('button', { name: 'Un de moins : sel' })).toBeDisabled()
  })

  test("chercher un ingrédient, l'ajouter depuis le résultat, puis aller à son rayon", async ({
    page,
  }) => {
    await signIn(page, '/rayons')
    await page.getByRole('searchbox', { name: 'Rechercher un ingrédient' }).fill('sel')

    const result = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Un de plus : sel' }) })
    await expect(result.getByText('Divers')).toBeVisible()
    await result.getByRole('button', { name: 'Un de plus : sel' }).click()
    await expect(page.getByRole('button', { name: 'Un de moins : sel' })).toBeEnabled()

    await result.getByRole('link', { name: 'Aller au rayon Divers' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Divers' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Un de moins : sel' })).toBeEnabled()
  })

  test('créer, modifier puis supprimer un ingrédient', async ({ page }) => {
    await signIn(page, '/rayons')
    await page.getByRole('link', { name: 'Divers' }).click()
    await page.getByRole('link', { name: 'Nouvel ingrédient' }).click()

    await page.getByLabel("Nom de l'ingrédient").fill(prefix)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('link', { name: prefix, exact: true })).toBeVisible()

    await page.getByRole('link', { name: prefix, exact: true }).click()
    await page.getByLabel("Nom de l'ingrédient").fill(`${prefix} modifié`)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('link', { name: `${prefix} modifié`, exact: true })).toBeVisible()

    await page.getByRole('link', { name: `${prefix} modifié` }).click()
    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Divers' })).toBeVisible()
    await expect(page.getByRole('link', { name: `${prefix} modifié`, exact: true })).toHaveCount(0)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`les rayons, un rayon et l'éditeur sont accessibles, thème ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/rayons')
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

      await expect(page.getByRole('link', { name: 'Divers' })).toBeVisible()
      expect((await scan()).violations).toEqual([])

      await page.getByRole('link', { name: 'Divers' }).click()
      await expect(page.getByRole('button', { name: 'Un de plus : sel' })).toBeVisible()
      expect((await scan()).violations).toEqual([])

      await page.getByRole('link', { name: 'Nouvel ingrédient' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Nouvel ingrédient' })).toBeVisible()
      expect((await scan()).violations).toEqual([])
    })
  }
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { apiToken, hasSession, signIn } from './support/session'

// Parcours de la liste de courses contre le VRAI back (`make e2e`, identifiants par l'environnement).
test.describe('liste de courses', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  const ingredients = ['sel', 'aubergine']
  let token = ''
  const bearer = () => ({ Authorization: `Bearer ${token}` })

  test.beforeEach(async ({ request }) => {
    token = await apiToken(request)
    // Une liste active avec deux lignes, préparée par l'API puis cochée par l'interface.
    expect(
      (await request.put('/api/v1/shopping-lists/active', { headers: bearer() })).status(),
    ).toBe(204)
    for (const slug of ingredients) {
      const response = await request.post(
        `/api/v1/shopping-lists/active/ingredients/${slug}/increase`,
        {
          headers: bearer(),
        },
      )
      expect(response.status()).toBe(204)
    }
  })

  test.afterEach(async ({ request }) => {
    for (const slug of ingredients) {
      await request.post(`/api/v1/shopping-lists/active/ingredients/${slug}/decrease`, {
        headers: bearer(),
      })
    }
  })

  const line = (page: Page, name: RegExp) => page.getByRole('checkbox', { name })

  test('cocher une ligne se voit tout de suite et reste après rechargement', async ({ page }) => {
    await signIn(page, '/')
    await expect(page).toHaveURL(/\/liste$/)

    const salt = line(page, /sel/i)
    await expect(salt).toBeVisible()
    const wasChecked = (await salt.getAttribute('aria-checked')) === 'true'
    await salt.click()
    await expect(salt).toHaveAttribute('aria-checked', String(!wasChecked))

    await page.reload()
    await expect(line(page, /sel/i)).toHaveAttribute('aria-checked', String(!wasChecked))

    // Retour à l'état de départ : la case se décoche aussi
    await line(page, /sel/i).click()
    await expect(line(page, /sel/i)).toHaveAttribute('aria-checked', String(wasChecked))
  })

  test('cocher la dernière ligne termine la liste sans la faire disparaître, la décocher la reprend', async ({
    page,
  }) => {
    await signIn(page, '/liste')
    for (const name of [/sel/i, /aubergine/i]) {
      await expect(line(page, name)).toBeVisible()
      await line(page, name).check()
    }

    await expect(page.getByRole('heading', { name: 'Courses terminées' })).toBeVisible()
    await expect(line(page, /sel/i)).toBeVisible()

    await line(page, /aubergine/i).click()
    await expect(page.getByRole('heading', { name: 'Courses terminées' })).toBeHidden()
    await expect(line(page, /aubergine/i)).toHaveAttribute('aria-checked', 'false')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`la liste est accessible (WCAG AA), thème ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await signIn(page, '/liste')
      await expect(line(page, /sel/i)).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.vue-devtools__anchor-btn')
        .analyze()

      expect(violations).toEqual([])
    })
  }
})

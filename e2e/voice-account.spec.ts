// « Moi », section « Assistant vocal » (VOX-402), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les liaisons.
//  - la fonction coupée (`404 VOICE_DISABLED`) : la section n'existe pas et la liste n'est demandée qu'une fois ;
//  - sans liaison, avec une liaison, « Délier Alexa » (confirmation, retour à « aucune liaison » sans recharger) ;
//  - captures à 360 × 640 et au bureau, clair et sombre, accessibilité (WCAG AA) ; une lecture contre le VRAI back (`make e2e`).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, viewportTag } from './support/test'
import type { Page } from '@playwright/test'

import { hasSession, signIn } from './support/session'

const link = (id: string) => ({
  id,
  provider: 'alexa',
  createdAt: '2026-10-25T10:00:00+00:00',
  lastUsedAt: null,
})

interface Options {
  enabled?: boolean
  links?: string[]
  /** Les `DELETE` répondent cette erreur. */
  deleteFails?: number
}

/** Simule l'API. Rend les appels reçus (`GET /api/v1/voice/links`, `DELETE …`). */
async function fakeBack(page: Page, options: Options = {}) {
  let links = options.links ?? []
  const received: string[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const key = `${request.method()} ${path}`
      if (path.startsWith('/api/v1/voice/')) received.push(key)
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (key === 'POST /api/auth/refresh') return json({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return json({
          id: 'u1',
          email: 'alexiane@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
          appUpdate: { latest: null, minimum: null, outdated: false },
        })
      if (key === 'GET /api/v1/drive/settings') return json({ enabled: false })
      if (key === 'GET /api/v1/voice/links') {
        if (options.enabled === false) return json({ error: { message: 'VOICE_DISABLED' } }, 404)

        return json({ member: links.map(link), totalItems: links.length })
      }
      if (request.method() === 'DELETE' && path.startsWith('/api/v1/voice/links/')) {
        if (options.deleteFails !== undefined)
          return json({ error: { message: 'Forbidden' } }, options.deleteFails)
        links = links.filter((id) => id !== path.split('/').pop())

        return route.fulfill({ status: 204 })
      }

      return json({ error: { message: 'Appel non prévu' } }, 404)
    },
  )

  return received
}

const section = (page: Page) => page.locator('section', { hasText: 'Assistant vocal' })
const phrase = 'Alexa est liée. Dis : « Alexa, demande à Jarvis d’ajouter du pain ».'
const toLink = 'Pour lier Alexa, ouvre l’application Alexa, Skills, Jarvis.'
const help = 'Alexa ne voit pas ta liste de courses d’Amazon : dis bien le nom du skill.'

test.describe('« Moi », assistant vocal, parcours simulé', () => {
  test('fonction coupée : aucune section, aucune erreur, une seule lecture même en revenant sur « Moi »', async ({
    page,
  }) => {
    const received = await fakeBack(page, { enabled: false })
    await page.goto('/moi')

    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Assistant vocal' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)

    // Sortir de « Moi » puis y revenir par la barre de navigation : la fonction coupée n'est pas redemandée
    await page.getByRole('link', { name: 'Recettes' }).first().click()
    await page.getByRole('link', { name: 'Moi' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    expect(received).toEqual(['GET /api/v1/voice/links'])
  })

  test('sans liaison : où lier Alexa, et la ligne d’aide', async ({ page }) => {
    await fakeBack(page)
    await page.goto('/moi')

    await expect(section(page).getByRole('heading', { name: 'Assistant vocal' })).toBeVisible()
    await expect(section(page).getByText(toLink)).toBeVisible()
    await expect(section(page).getByText(help)).toBeVisible()
    await expect(section(page).getByRole('button')).toHaveCount(0)
  })

  test('avec une liaison : « Délier Alexa », une confirmation, puis « aucune liaison » sans recharger', async ({
    page,
  }) => {
    const received = await fakeBack(page, { links: ['l1'] })
    await page.goto('/moi')
    await expect(section(page).getByText(phrase)).toBeVisible()

    await section(page).getByRole('button', { name: 'Délier Alexa' }).click()
    const dialog = page.getByRole('dialog', { name: 'Délier Alexa ?' })
    await expect(dialog).toBeVisible()
    expect(received).toEqual(['GET /api/v1/voice/links'])

    await dialog.getByRole('button', { name: 'Délier', exact: true }).click()

    await expect(section(page).getByText(toLink)).toBeVisible()
    await expect(section(page).getByText(phrase)).toHaveCount(0)
    await expect(dialog).toHaveCount(0)
    expect(received).toContain('DELETE /api/v1/voice/links/l1')
  })

  test('« Annuler » dans la confirmation ne délie rien', async ({ page }) => {
    const received = await fakeBack(page, { links: ['l1'] })
    await page.goto('/moi')

    await section(page).getByRole('button', { name: 'Délier Alexa' }).click()
    await page
      .getByRole('dialog', { name: 'Délier Alexa ?' })
      .getByRole('button', { name: 'Annuler' })
      .click()

    await expect(section(page).getByText(phrase)).toBeVisible()
    expect(received.filter((call) => call.startsWith('DELETE'))).toEqual([])
  })

  test('un refus du back est dit et la liaison reste affichée', async ({ page }) => {
    await fakeBack(page, { links: ['l1'], deleteFails: 403 })
    await page.goto('/moi')

    await section(page).getByRole('button', { name: 'Délier Alexa' }).click()
    await page
      .getByRole('dialog', { name: 'Délier Alexa ?' })
      .getByRole('button', { name: 'Délier', exact: true })
      .click()

    await expect(page.getByText("Tu n'as pas le droit de faire cela.")).toBeVisible()
    await expect(section(page).getByText(phrase)).toBeVisible()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// 360 × 640 et bureau, clair et sombre

const states: { name: string; options: Options; unlinkButton: boolean }[] = [
  { name: 'sans-liaison', options: {}, unlinkButton: false },
  { name: 'liee', options: { links: ['l1'] }, unlinkButton: true },
]

for (const { label, size } of [
  { label: '360 × 640', size: { width: 360, height: 640 } },
  { label: 'bureau 1280 × 800', size: { width: 1280, height: 800 } },
]) {
  test.describe(`« Moi », assistant vocal, ${label}`, { tag: viewportTag(size) }, () => {
    test.use({ viewport: size })

    for (const colorScheme of ['light', 'dark'] as const) {
      for (const state of states) {
        test(`${state.name} : lisible, sans débordement et accessible (WCAG AA), thème ${colorScheme}`, async ({
          page,
        }, testInfo) => {
          await page.emulateMedia({ colorScheme })
          await fakeBack(page, state.options)
          await page.goto('/moi')
          await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
          await expect(
            section(page).getByRole('heading', { name: 'Assistant vocal' }),
          ).toBeVisible()
          await expect(section(page).getByRole('button')).toHaveCount(state.unlinkButton ? 1 : 0)
          for (const button of await section(page).getByRole('button').all())
            expect(
              (await button.boundingBox())!.height,
              'cible d’au moins 44 px',
            ).toBeGreaterThanOrEqual(44)
          await section(page).scrollIntoViewIfNeeded()

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          )
          expect(overflow, 'pas de défilement horizontal').toBeLessThanOrEqual(0)
          const { violations } = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .exclude('.vue-devtools__anchor-btn')
            .analyze()
          expect(violations).toEqual([])
          await page.screenshot({
            path: testInfo.outputPath(`${colorScheme}-${state.name}-${size.width}.png`),
          })
        })
      }

      test(`coupee : « Moi » reste accessible sans la section, thème ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme })
        await fakeBack(page, { enabled: false })
        await page.goto('/moi')
        await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Assistant vocal' })).toHaveCount(0)

        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.vue-devtools__anchor-btn')
          .analyze()
        expect(violations).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath(`${colorScheme}-coupee-${size.width}.png`),
        })
      })
    }
  })
}

test('la fenêtre « Délier Alexa ? » est accessible, clair et sombre, à 360 px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 })
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await fakeBack(page, { links: ['l1'] })
    await page.goto('/moi')
    await section(page).getByRole('button', { name: 'Délier Alexa' }).click()
    await expect(page.getByRole('dialog', { name: 'Délier Alexa ?' })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.vue-devtools__anchor-btn')
      .analyze()
    expect(violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-confirmation-360.png`) })
    await page.unroute('**/*')
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Avec le VRAI back (`make e2e`)

test.describe('« Moi », assistant vocal, avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  test('la fonction est coupée par défaut : « Moi » n’a pas de section (et pas d’erreur) ; allumée, elle apparaît', async ({
    page,
  }) => {
    const voiceCalls: string[] = []
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/v1/voice/links')
        voiceCalls.push(String(response.status()))
    })
    await signIn(page, '/moi')
    await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
    await expect.poll(() => voiceCalls.length).toBeGreaterThan(0)

    // Une seule des deux réponses du back est possible : 404 (coupée) sans section, 200 (allumée) avec la section
    const visible = await page.getByRole('heading', { name: 'Assistant vocal' }).count()
    expect(voiceCalls.at(0) === '200' ? 1 : 0).toBe(visible)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

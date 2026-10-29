// « Moi », section « Assistant vocal » (VOX-402), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les liaisons.
//  - la mise en page et l'accessibilité (WCAG AA) de « Moi » avec la section, à 360 × 640 et au bureau, en clair et en sombre ;
//  - les textes, la fonction coupée (`404 VOICE_DISABLED`), « Délier Alexa » et les refus sont des tests de composant
//    (`VoiceAssistantSection.spec.ts`) ; une lecture contre le VRAI back (`make e2e`).
import { BUREAU_SEUL, expect, test } from './support/test'
import type { Page } from '@playwright/test'

import { axeBothThemes } from './support/screen'
import { hasSession, signIn } from './support/session'

const link = (id: string) => ({
  id,
  provider: 'alexa',
  createdAt: '2026-10-25T10:00:00+00:00',
  lastUsedAt: null,
})

interface Options {
  links?: string[]
}

/** Simule l'API de « Moi » avec les fonctions vocale et drive allumées : les liaisons données, rien d'autre. */
async function fakeBack(page: Page, options: Options = {}) {
  const links = options.links ?? []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
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
      // Le drive allumé : « Moi » montre aussi ses entrées, l'axe de la page les juge avec le reste
      if (key === 'GET /api/v1/drive/settings')
        return json({ enabled: true, retailer: 'leclerc', store: null })
      if (key === 'GET /api/v1/voice/links')
        return json({ member: links.map(link), totalItems: links.length })

      return json({ error: { message: 'Appel non prévu' } }, 404)
    },
  )
}

const section = (page: Page) => page.locator('section', { hasText: 'Assistant vocal' })

// Les textes, la fonction coupée (aucune section, une seule lecture), « Délier », « Annuler » et le refus du back sont des tests de
// composant (`VoiceAssistantSection.spec.ts`). Ici, ce que jsdom ne sait pas mesurer : la mise en page et l'accessibilité (WCAG AA) de
// « Moi » avec la section, en clair et en sombre dans la même visite. La page entière est analysée : la section Crédits aussi.
//  - 360 × 640 : sans liaison et avec une liaison (le bouton « Délier Alexa » : cible d'au moins 44 px) ;
//  - bureau : une fois, avec une liaison (la section peut changer de colonne) ;
//  - la fenêtre « Délier Alexa ? », modale, à 360 px.
const states: { name: string; options: Options; unlinkButton: boolean }[] = [
  { name: 'sans-liaison', options: {}, unlinkButton: false },
  { name: 'liee', options: { links: ['l1'] }, unlinkButton: true },
]

async function checkSection(
  page: Page,
  state: (typeof states)[number],
  label: string,
): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light' })
  await fakeBack(page, state.options)
  await page.goto('/moi')
  await expect(page.getByRole('heading', { level: 1, name: 'Moi' })).toBeVisible()
  await expect(section(page).getByRole('heading', { name: 'Assistant vocal' })).toBeVisible()
  await expect(section(page).getByRole('button')).toHaveCount(state.unlinkButton ? 1 : 0)
  for (const button of await section(page).getByRole('button').all())
    expect((await button.boundingBox())!.height, 'cible d’au moins 44 px').toBeGreaterThanOrEqual(
      44,
    )
  await section(page).scrollIntoViewIfNeeded()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow, 'pas de défilement horizontal').toBeLessThanOrEqual(0)
  await axeBothThemes(page, `moi-${state.name}-${label}`)
}

test.describe('« Moi », assistant vocal, 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const state of states) {
    test(`${state.name} : lisible, sans débordement et accessible (WCAG AA) en clair et en sombre`, async ({
      page,
    }) => {
      await checkSection(page, state, '360')
    })
  }

  test('la fenêtre « Délier Alexa ? » est accessible, en clair et en sombre', async ({ page }) => {
    await fakeBack(page, { links: ['l1'] })
    await page.goto('/moi')
    await section(page).getByRole('button', { name: 'Délier Alexa' }).click()
    await expect(page.getByRole('dialog', { name: 'Délier Alexa ?' })).toBeVisible()

    await axeBothThemes(page, 'moi-confirmation-360')
  })
})

test.describe('« Moi », assistant vocal, bureau 1280 × 800', { tag: BUREAU_SEUL }, () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('liee : lisible, sans débordement et accessible (WCAG AA) en clair et en sombre', async ({
    page,
  }) => {
    await checkSection(page, states[1]!, '1280')
  })
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

// L'interface superposée de l'agent du drive (DRV-304) dans Chromium : accessibilité (axe), 360×640 sans défilement horizontal, cibles
// d'au moins 44 px, isolation de la page hôte, échappement du HTML, clavier. Autonome : la page de démonstration (`drive-agent/demo/`) est
// construite ici et posée dans une page vide, sans serveur ni back. Aucune requête réseau.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { buildAgent } from '../drive-agent/scripts/build.mjs'

test.use({ viewport: { width: 360, height: 640 } })

const PAGE =
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page de l’enseigne (simulée)</title></head><body><main><h1>Page de l’enseigne (simulée)</h1><p>Contenu de la page.</p></main></body></html>'

// Une page hôte hostile : elle cache et rétrécit tout, `!important` compris (seuls `html` et `body` restent visibles).
const HOSTILE_CSS = `*{display:none!important;visibility:hidden!important;opacity:0!important;position:static!important;width:0!important;height:0!important}
html,body{display:block!important;visibility:visible!important;opacity:1!important;width:auto!important;height:auto!important}`

const ERROR_SCREENS = [
  'NOT_LOGGED_IN',
  'STORE_MISMATCH',
  'BLOCKED',
  'CONTRACT_CHANGED',
  'NETWORK',
  'CANCELLED',
  'INVALID_MESSAGE',
  'UNSUPPORTED_PAGE',
].map((code) => `error-${code}`)

const SCREENS = [
  'welcome',
  'summary',
  'resume',
  'progress',
  'quantity',
  'chooser',
  'chooser-gone',
  'placement',
  'store',
  'store-label',
  'diagnostic',
  'diagnostic-running',
  'hostile',
  'end-completed',
  'end-changes',
  'end-cart',
  'end-partial',
  'end-aborted',
  ...ERROR_SCREENS,
]

let demo = ''

test.beforeAll(async () => {
  demo = (await buildAgent({ entry: 'demo/main.ts' })).code
})

async function openPage(page: Page, css?: string): Promise<void> {
  await page.setContent(PAGE)
  if (css) await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: demo })
}

async function show(page: Page, name: string): Promise<void> {
  await page.evaluate((screen) => window.demo.show(screen), name)
  await expect(page.locator('.overlay')).toBeVisible()
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`chaque écran est accessible (WCAG AA), thème ${colorScheme} du système`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    await openPage(page)

    for (const name of SCREENS) {
      await show(page, name)
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(violations, name).toEqual([])
      await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-${name}.png`) })
    }
  })
}

test('chaque écran tient dans 360×640 sans défilement horizontal, avec des cibles d’au moins 44 px', async ({
  page,
}) => {
  await openPage(page)

  for (const name of SCREENS) {
    await show(page, name)
    const metrics = await page.evaluate(() => {
      const root = (document.documentElement.lastElementChild as HTMLElement)
        .shadowRoot as ShadowRoot
      const screen = root.querySelector('.screen') as HTMLElement
      // Un élément caché (le rapport du diagnostic, tant que les contrôles tournent) n'a pas de cible à toucher.
      const small = [...root.querySelectorAll('button, input, summary')]
        .filter((element) => !element.closest('[hidden]'))
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return box.width < 43.5 || box.height < 43.5
        })
      return {
        overflow: screen.scrollWidth - screen.clientWidth,
        page: document.documentElement.scrollWidth - window.innerWidth,
        small: small.map((element) => element.textContent),
      }
    })
    expect(metrics, name).toEqual({ overflow: 0, page: 0, small: [] })
  }
})

test('le style de la page hôte n’altère pas l’interface', async ({ page }) => {
  await openPage(page, HOSTILE_CSS)

  await show(page, 'summary')

  await expect(page.getByRole('heading', { name: 'Prêt à remplir ton panier' })).toBeVisible()
  const sizes = await page.evaluate(() => {
    const host = document.documentElement.lastElementChild as HTMLElement
    const box = host.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      w: innerWidth,
      h: innerHeight,
    }
  })
  expect(sizes).toEqual({ x: 0, y: 0, width: sizes.w, height: sizes.h, w: 360, h: 640 })
  await page.getByRole('button', { name: 'Commencer' }).click()
})

test('un libellé qui contient du HTML s’affiche tel quel, sans rien exécuter', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openPage(page)

  await show(page, 'summary')
  await show(page, 'hostile')

  await expect(page.getByText('<img src=x onerror="window.pwned=1">').first()).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  await expect(page.locator('.overlay img, .overlay script')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('le focus arrive sur le premier bouton et le clavier reste dans l’écran', async ({ page }) => {
  await openPage(page)
  await show(page, 'summary')
  const focused = () =>
    page.evaluate(() => {
      const root = (document.documentElement.lastElementChild as HTMLElement)
        .shadowRoot as ShadowRoot
      return root.activeElement?.textContent ?? null
    })

  expect(await focused()).toBe('Commencer')
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    expect(await focused(), `Tab ${i + 1}`).not.toBeNull()
  }
  await page.keyboard.press('Shift+Tab')
  expect(await focused()).not.toBeNull()
})

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
  'chooser-confirm',
  'chooser-last',
  'chooser-single',
  'chooser-gone',
  'placement',
  'placement-text',
  'store',
  'store-label',
  'diagnostic',
  'diagnostic-running',
  'hostile',
  'end-completed',
  'end-changes',
  'end-cart',
  'end-slow',
  'challenge',
  'entry-opening',
  'entry-manual',
  'end-partial',
  'end-none',
  'end-reasons',
  'end-error',
  'end-aborted',
  ...ERROR_SCREENS,
]

let demo = ''

// Les photos (DRV-633) : le test répond lui-même aux adresses de l'hôte d'images de la démonstration avec une image synthétique (jamais une vraie
// image) et note chaque requête vers l'extérieur de la page ; rien d'autre ne sort (les autres adresses sont coupées).
const PHOTO_HOST = 'photos-test.leclercdrive.fr'
const PACKET =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><rect x="26" y="14" width="68" height="96" rx="8" fill="#3a8f6b"/></svg>'
const outgoing = new WeakMap<Page, string[]>()
const requestedByPage = (page: Page): string[] => outgoing.get(page) ?? []

test.beforeAll(async () => {
  demo = (await buildAgent({ entry: 'demo/main.ts' })).code
})

async function openPage(page: Page, css?: string): Promise<void> {
  const requested: string[] = []
  outgoing.set(page, requested)
  await page.route(/^https?:/, async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.href)
    if (url.hostname !== PHOTO_HOST || url.searchParams.get('id') === '9999') {
      await route.fulfill({ status: url.hostname === PHOTO_HOST ? 404 : 502, body: 'non' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PACKET })
  })
  await page.setContent(PAGE)
  if (css) await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: demo })
}

/** Toutes les photos visibles de l'écran ont fini de charger (ou ont été retirées parce qu'elles ne chargent pas). */
async function photosSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = (document.documentElement.lastElementChild as HTMLElement)
          .shadowRoot as ShadowRoot
        // Une image cachée (la liste sous la confirmation) ou très loin sous l'écran n'est pas chargée : le chargement différé l'attend.
        return [...root.querySelectorAll('img')].every(
          (image) =>
            image.complete ||
            image.getClientRects().length === 0 ||
            image.getBoundingClientRect().top > innerHeight + 3000,
        )
      }),
    )
    .toBe(true)
}

async function show(page: Page, name: string): Promise<void> {
  await page.evaluate((screen) => window.demo.show(screen), name)
  await expect(page.locator('.overlay')).toBeVisible()
  await photosSettled(page)
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

// —— Les photos des produits (DRV-633) ——————————————————————————————————————————————————————————————————————————————————————————

/** Ce que l'écran de choix de la démonstration montre de ses fiches : photo, texte, bouton, en pixels de la fenêtre. */
async function cardsOf(page: Page) {
  return page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    return [...root.querySelectorAll<HTMLElement>('li.candidate')].map((card) => {
      const box = (element: Element | null) => {
        const rect = element?.getBoundingClientRect()
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      }
      const frame = card.querySelector('.photo')
      const image = card.querySelector('img')
      return {
        name: card.querySelector('.name')?.textContent ?? '',
        card: box(card),
        frame: box(frame),
        image: box(image),
        text: box(card.querySelector('.text')),
        button: box(card.querySelector('button')),
        background: frame ? getComputedStyle(frame).backgroundColor : null,
        fit: image ? getComputedStyle(image).objectFit : null,
        broken: image ? image.naturalWidth === 0 : false,
        alt: image?.getAttribute('alt') ?? null,
      }
    })
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`l’écran de choix montre la photo à gauche du libellé, le bouton « Choisir » en dessous (${colorScheme}, 360×640)`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    await openPage(page)

    await show(page, 'chooser')

    const cards = await cardsOf(page)
    const [first, second, refused, missing, none] = cards
    // Deux photos qui chargent : environ 80 px de côté, à gauche du texte, image entière sur fond clair (aussi en thème sombre).
    for (const card of [first, second]) {
      expect(card?.frame?.width).toBeCloseTo(80, 0)
      expect(card?.frame?.height).toBeCloseTo(80, 0)
      expect(card?.fit).toBe('contain')
      expect(card?.background).toBe('rgb(255, 255, 255)')
      expect(card?.broken).toBe(false)
      expect(card?.frame?.x).toBeLessThan(card?.text?.x ?? 0)
      // Le bouton passe sous la fiche, sur toute sa largeur, et se touche (44 px).
      expect(card?.button?.y).toBeGreaterThan((card?.text?.y ?? 0) + (card?.text?.height ?? 0) - 1)
      expect(card?.button?.width).toBeGreaterThan(280)
      expect(card?.button?.height).toBeGreaterThanOrEqual(44)
    }
    expect(first?.alt).toBe('Poivre noir moulu de test')
    // Adresse refusée (autre hôte), photo en 404, pas de photo : la fiche reste en texte, sans cadre ni icône d'image cassée.
    for (const card of [refused, missing, none]) {
      expect(card?.frame, card?.name).toBeNull()
      expect(card?.image, card?.name).toBeNull()
      expect(card?.text?.width).toBeGreaterThan(280)
    }
    await page.screenshot({ path: testInfo.outputPath(`photos-choix-${colorScheme}.png`) })
  })
}

test('seule l’adresse d’images de l’enseigne est demandée, jamais l’adresse refusée', async ({
  page,
}) => {
  await openPage(page)

  await show(page, 'chooser')
  await show(page, 'chooser-gone')
  await show(page, 'placement')

  const requested = requestedByPage(page)
  expect(requested.length).toBeGreaterThan(0)
  for (const address of requested) expect(new URL(address).hostname, address).toBe(PHOTO_HOST)
  expect(requested.some((address) => address.includes('autre-site'))).toBe(false)
  expect(new Set(requested.map((address) => new URL(address).searchParams.get('id')))).toEqual(
    new Set(['1001', '1002', '9999']),
  )
})

test('« Toujours prendre ce produit ? » montre la photo du produit choisi à côté de son libellé', async ({
  page,
}, testInfo) => {
  await openPage(page)

  await show(page, 'placement')

  const shown = await page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    const frame = root.querySelector('.media .photo')?.getBoundingClientRect()
    const text = root.querySelector('.media .text')?.getBoundingClientRect()
    return {
      alt: root.querySelector('.media img')?.getAttribute('alt') ?? null,
      width: frame?.width ?? 0,
      sideBySide: frame !== undefined && text !== undefined && frame.right <= text.left + 1,
      buttons: [...root.querySelectorAll('button')].map((button) => button.textContent),
    }
  })
  expect(shown.alt).toBe('Farine de blé T45 de test 1 kg')
  expect(shown.width).toBeCloseTo(80, 0)
  expect(shown.sideBySide).toBe(true)
  expect(shown.buttons).toEqual([
    'Toujours prendre celui-ci',
    'Cette fois seulement',
    'Revenir à la liste',
  ])
  await page.screenshot({ path: testInfo.outputPath('photos-question.png') })
})

test('sans photo, la question et la liste n’ont aucune balise img ni cadre', async ({ page }) => {
  await openPage(page)

  await show(page, 'placement-text')

  await expect(page.locator('.overlay img')).toHaveCount(0)
  expect(requestedByPage(page)).toEqual([])
})

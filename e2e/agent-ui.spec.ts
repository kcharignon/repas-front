// L'interface superposée de l'agent du drive (DRV-304) dans Chromium : accessibilité (axe), 360×640 sans défilement horizontal, cibles
// d'au moins 44 px, isolation de la page hôte, échappement du HTML, clavier. Autonome : la page de démonstration (`drive-agent/demo/`) est
// construite ici et posée dans une page vide, sans serveur ni back. Aucune requête réseau.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './support/test'

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
  'packSize',
  'packSize-count',
  'chooser',
  'chooser-confirm',
  'chooser-last',
  'chooser-single',
  'chooser-gone',
  'chooser-long',
  'chooser-aisles',
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
  'end-unreached',
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
    // Une trentaine d'écrans, chacun contrôlé par axe : de la marge quand la machine est chargée
    test.setTimeout(90 * 1000)
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
        buttons: [...card.querySelectorAll('button')].map((button) => ({
          ...box(button),
          label: button.textContent,
        })),
        background: frame ? getComputedStyle(frame).backgroundColor : null,
        fit: image ? getComputedStyle(image).objectFit : null,
        broken: image ? image.naturalWidth === 0 : false,
        alt: image?.getAttribute('alt') ?? null,
      }
    })
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`l’écran de choix montre la photo à gauche du libellé, les boutons « Choisir » et « Pas mon habituel » côte à côte en dessous (${colorScheme}, 360×640)`, async ({
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
      // Les deux boutons passent sous la fiche, côte à côte, chacun sur la moitié de sa largeur, et se touchent (44 px).
      const [choose, once] = card?.buttons ?? []
      expect(card?.buttons.map((button) => button.label)).toEqual(['Choisir', 'Pas mon habituel'])
      expect(choose?.y).toBeGreaterThan((card?.text?.y ?? 0) + (card?.text?.height ?? 0) - 1)
      expect(Math.abs((once?.y ?? 0) - (choose?.y ?? 0))).toBeLessThan(2)
      expect((once?.x ?? 0) + 1).toBeGreaterThan((choose?.x ?? 0) + (choose?.width ?? 0))
      expect((once?.x ?? 0) + (once?.width ?? 0)).toBeLessThanOrEqual(
        (card?.card?.x ?? 0) + (card?.card?.width ?? 0),
      )
      expect(choose?.width).toBeGreaterThan(130)
      expect(once?.width).toBeGreaterThan(130)
      expect(choose?.height).toBeGreaterThanOrEqual(44)
      expect(once?.height).toBeGreaterThanOrEqual(44)
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

  const requested = requestedByPage(page)
  expect(requested.length).toBeGreaterThan(0)
  for (const address of requested) expect(new URL(address).hostname, address).toBe(PHOTO_HOST)
  expect(requested.some((address) => address.includes('autre-site'))).toBe(false)
  expect(new Set(requested.map((address) => new URL(address).searchParams.get('id')))).toEqual(
    new Set(['1001', '1002', '9999']),
  )
})

// —— Tous les résultats de la recherche, en défilant (DRV-643) ————————————————————————————————————————————————————————————————————

const rowCount = (page: Page) =>
  page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    return root.querySelectorAll('li.candidate').length
  })

const photoIds = (page: Page) =>
  new Set(requestedByPage(page).map((address) => Number(new URL(address).searchParams.get('id'))))

for (const colorScheme of ['light', 'dark'] as const) {
  test(`une recherche de 60 produits : un premier lot, la suite en défilant jusqu’au bout, les photos au fil du défilement (${colorScheme}, 360×640)`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    await openPage(page)

    await show(page, 'chooser-long')

    // Un premier lot seulement, sans rien à toucher pour voir la suite ; sa sentinelle n'a pas de texte.
    expect(await rowCount(page)).toBe(8)
    await expect(page.getByText('Biscuit sablé de test n° 60')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`defilement-debut-${colorScheme}.png`) })
    // Les photos : seulement celles des fiches affichées (et de leur voisinage), jamais les 60.
    await expect.poll(() => photoIds(page).size).toBeGreaterThan(0)
    expect(photoIds(page).has(2060)).toBe(false)
    expect(photoIds(page).size).toBeLessThanOrEqual(8)

    // La personne fait défiler : chaque descente ajoute un lot, jusqu'à la soixantième fiche.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const root = (document.documentElement.lastElementChild as HTMLElement)
              .shadowRoot as ShadowRoot
            const scroll = root.querySelector('.scroll') as HTMLElement
            scroll.scrollTop = scroll.scrollHeight
            return root.querySelectorAll('li.candidate').length
          }),
        { timeout: 20_000, intervals: [100, 200] },
      )
      .toBe(60)

    // Au bout : la dernière fiche, puis « Annuler l'envoi » sous elle, atteignable ; rien ne déborde ; chaque cible se touche.
    await page.evaluate(() => {
      const root = (document.documentElement.lastElementChild as HTMLElement)
        .shadowRoot as ShadowRoot
      const scroll = root.querySelector('.scroll') as HTMLElement
      scroll.scrollTop = scroll.scrollHeight
    })
    await expect(page.getByText('Biscuit sablé de test n° 60')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Annuler l’envoi' })).toBeVisible()
    const metrics = await page.evaluate(() => {
      const root = (document.documentElement.lastElementChild as HTMLElement)
        .shadowRoot as ShadowRoot
      const screen = root.querySelector('.screen') as HTMLElement
      const small = [...root.querySelectorAll('button, input, summary')]
        .filter((element) => !element.closest('[hidden]'))
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return box.width < 43.5 || box.height < 43.5
        })
      const buttons = [...root.querySelectorAll('li.candidate button')] as HTMLButtonElement[]
      return {
        overflow: screen.scrollWidth - screen.clientWidth,
        page: document.documentElement.scrollWidth - window.innerWidth,
        small: small.length,
        // Le produit « Plus en stock » (n° 21) reste à choisir.
        outEnabled: buttons[20]?.disabled === false,
        sentinelHidden: (root.querySelector('.more') as HTMLElement).hidden,
      }
    })
    expect(metrics).toEqual({
      overflow: 0,
      page: 0,
      small: 0,
      outEnabled: true,
      sentinelHidden: true,
    })
    await expect.poll(() => photoIds(page).has(2060)).toBe(true)
    for (const address of requestedByPage(page)) {
      expect(new URL(address).hostname, address).toBe(PHOTO_HOST)
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`defilement-fin-${colorScheme}.png`) })
  })
}

// « Une décision par écran » : le contrôle commun des écrans d'authentification et du compte (inscription, mot de passe oublié, liaison
// d'Alexa, « Moi »). Un écran = un test : on prépare l'écran une seule fois, on mesure sa mise en page (elle ne dépend pas du thème), puis
// l'accessibilité (WCAG AA, contraste compris) dans les DEUX thèmes de la même visite : `page.emulateMedia` change `prefers-color-scheme`
// sans recharger la page. Seuls l'axe et la mesure de la mise en page restent ici : ce sont les deux choses que jsdom ne sait pas faire.
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import AxeBuilder from '@axe-core/playwright'
import { expect } from './test'
import type { Page } from '@playwright/test'

const shots = process.env.E2E_SHOTS

export interface Screen {
  name: string
  prepare: (page: Page) => Promise<void>
  /** Le nom du bouton (ou du lien) principal de l'écran. */
  primary: string
}

export type ColorScheme = 'light' | 'dark'

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

/** Les violations WCAG A et AA de la page telle qu'elle est affichée. */
export async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

  return result.violations
}

/**
 * Passe la page dans `colorScheme` SANS la recharger et attend que le thème soit vraiment posé (le fond a changé, plus aucune transition
 * en cours) : un axe lancé trop tôt jugerait le contraste de l'autre thème, ou d'une couleur à mi-chemin.
 */
export async function switchTheme(page: Page, colorScheme: ColorScheme) {
  const before = await background(page)
  await page.emulateMedia({ colorScheme })
  await expect
    .poll(
      () =>
        page.evaluate(
          (scheme) => window.matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
          colorScheme,
        ),
      { message: `le thème ${colorScheme} est demandé au navigateur` },
    )
    .toBe(true)
  if (colorScheme === 'dark') {
    await expect
      .poll(() => background(page), { message: 'le fond du thème sombre est posé' })
      .not.toBe(before)
  }
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  )
}

/** L'accessibilité (WCAG AA) de la page dans le thème clair puis dans le thème sombre, sans la recharger. */
export async function axeBothThemes(page: Page, name: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await switchTheme(page, colorScheme)
    expect(await violations(page), `${name} : accessibilité, thème ${colorScheme}`).toEqual([])
    if (shots !== undefined)
      await page.screenshot({ path: `${shots}/${name}-${colorScheme}.png`, fullPage: true })
  }
}

/** Le bouton principal se voit sans défiler, il fait au moins 44 px, et rien ne déborde sur le côté. */
export async function checkLayout(page: Page, screen: Screen, height: number) {
  const primary = page
    .getByRole('button', { name: screen.primary })
    .or(page.getByRole('link', { name: screen.primary }))
    .first()
  const box = await primary.boundingBox()
  expect(box, `${screen.name} : le bouton principal est affiché`).not.toBeNull()
  expect(
    box!.y + box!.height,
    `${screen.name} : le bouton principal se voit sans défiler`,
  ).toBeLessThanOrEqual(height)
  expect(box!.height, `${screen.name} : cible d’au moins 44 px`).toBeGreaterThanOrEqual(44)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow, `${screen.name} : pas de défilement horizontal`).toBeLessThanOrEqual(0)
}

/** Un écran : préparation, mise en page (clair), puis accessibilité dans les deux thèmes. */
export async function checkScreen(
  page: Page,
  screen: Screen,
  size: { width: number; height: number },
) {
  await page.emulateMedia({ colorScheme: 'light' })
  await screen.prepare(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await checkLayout(page, screen, size.height)
  await axeBothThemes(page, screen.name)
}

// Le bouton « ⋮ » de l'application ne recouvre jamais un bouton de la carte (DRV-764, recette réelle de 1.6.4 : « le bouton ⋮ monte quand la carte est dépliée »). Le bouton est natif :
// il est posé en bas à droite de la zone visible de l'écran, 48 dp, à 12 dp du bord droit et 24 dp du bas (`Views.kt`, `DriveActivity.kt`), et il MONTE avec le clavier (la racine
// garde ses marges sous les barres du système et le clavier) ; il ne réagit pas à la carte. La carte garde une marge basse de 88 px (`--clear`) pour ne pas le couvrir. PROUVÉ par la
// géométrie, dans Chromium mobile : le rectangle du bouton natif (calculé comme l'application le pose, sur la fenêtre visible) ne rencontre aucun bouton de la carte pleine ni de la
// barre, fenêtre entière puis fenêtre réduite par le clavier. Le rectangle est calculé, pas lu sur l'application : l'écart d'un vrai téléphone se vérifie à la recette.
import type { Page } from '@playwright/test'

import { openWithBridge } from './support/agent'
import { overlaps, type Box } from './support/geometry'
import { expect, test } from './support/fixtures'
import { RUN_ID } from './support/plans'
import { STORE } from '../fake-auchan/server'

const PLAN = {
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
} as const
const SIZES = [
  { width: 360, height: 740 },
  { width: 412, height: 915 },
] as const
/** Le clavier d'un téléphone prend plus de 40 % de la hauteur. */
const WITH_KEYBOARD = 0.55

/**
 * Le bouton ⋮ natif : 48 dp, 12 dp du bord droit, 24 dp du bas de la zone visible. Une page sans `viewport` (le faux Auchan) est mise en page plus large que l'écran, puis réduite : un dp vaut
 * alors plus d'un pixel CSS (largeur de la page ÷ largeur de l'écran), et la carte est agrandie du même facteur (`scale.ts`).
 */
async function nativeMenu(page: Page): Promise<Box> {
  const screen = page.viewportSize()
  const view = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  if (screen === null) throw new Error('Une fenêtre sans taille.')
  const dp = view.width / screen.width
  return {
    x: view.width - (12 + 48) * dp,
    y: view.height - (24 + 48) * dp,
    width: 48 * dp,
    height: 48 * dp,
  }
}

/** Les boutons de la carte que la personne voit, avec leur nom. */
async function cardButtons(page: Page): Promise<{ name: string; box: Box }[]> {
  const found: { name: string; box: Box }[] = []
  for (const button of await page.locator('.screen.guide button').all()) {
    const box = await button.boundingBox()
    if (box !== null) found.push({ name: (await button.innerText()).trim(), box })
  }
  return found
}

async function expectMenuFree(page: Page): Promise<void> {
  const menu = await nativeMenu(page)
  const buttons = await cardButtons(page)
  expect(buttons.length, 'la carte montre au moins un bouton').toBeGreaterThan(0)
  for (const one of buttons) {
    expect(overlaps(one.box, menu), `« ${one.name} » est libre du bouton ⋮`).toBe(false)
  }
}

for (const size of SIZES) {
  test.describe(`${size.width} × ${size.height}`, () => {
    test.use({ viewport: size })

    test('Auchan : carte pleine, barre, puis clavier ouvert : le bouton ⋮ natif ne recouvre aucun bouton de la carte', async ({
      page,
      fakeAuchan,
      agentCode,
    }) => {
      fakeAuchan.setBehavior({ store: 'none' })
      const app = await openWithBridge(page, {}, agentCode, {
        origin: fakeAuchan.site,
        path: '/courses',
      })
      app.answerHello(PLAN)
      await expect(page.locator('.screen.guide:not(.min)')).toHaveCount(1, { timeout: 15_000 })

      await expectMenuFree(page)
      // Le clavier s'ouvre : la zone visible rétrécit, le bouton natif monte avec elle
      await page.setViewportSize({
        width: size.width,
        height: Math.round(size.height * WITH_KEYBOARD),
      })
      await expectMenuFree(page)
      await page.setViewportSize(size)
      // La barre réduite
      await page.locator('.g-fold').click()
      await expect(page.locator('.screen.guide.min')).toHaveCount(1)
      await expectMenuFree(page)
    })
  })
}

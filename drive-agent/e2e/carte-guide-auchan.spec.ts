// La carte du guide chez Auchan (DRV-757, parcours « en novice » du 2026-11-01), de bout en bout contre le FAUX site d'Auchan (`fake-auchan/`, formes plausibles, données inventées) :
// - le mur de cookies d'abord : la carte dit d'y répondre (la personne choisit, jamais l'agent), le repère se retire, la carte ne couvre aucun de ses boutons ;
// - le libellé de la barre est celui de la page (« Choisir vos courses » ou « Choisir mon mode de livraison »), jamais un mot que l'écran n'a pas ;
// - le panneau « Choisir un drive ou la livraison » (un DIV aria-modal de z-index 111) : la carte et le repère RESTENT pendant la saisie du code postal, la ville proposée et la liste
//   des drives, et ne couvrent jamais le champ, la ville ni les boutons des drives (411 × 761 puis 411 × 914, clavier simulé) ;
// - un conteneur que la page retire est remis en place.
// ATTENTION : le faux site n'est pas le vrai ; la cause réelle de la disparition constatée sur le téléphone n'a pas été reproduite (voir `drive-agent/README.md`).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { openWithBridge } from './support/agent'
import { expect, test } from './support/fixtures'
import { RUN_ID } from './support/plans'
import { STORE } from '../fake-auchan/server'

const plan = () => ({
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
})

interface Box {
  x: number
  y: number
  width: number
  height: number
}
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

const card = (page: Page): Promise<Box | null> => page.locator('.screen.guide').boundingBox()

async function expectClear(page: Page, selectors: readonly string[]): Promise<void> {
  await page.waitForTimeout(900)
  const box = await card(page)
  if (box === null) return
  let checked = 0
  for (const selector of selectors) {
    for (const one of (await page.locator(selector).all()).slice(0, 3)) {
      const target = await one.boundingBox()
      if (target === null) continue
      checked += 1
      expect(overlaps(box, target), `${selector} est recouvert par la carte`).toBe(false)
    }
  }
  expect(checked, 'rien à protéger : le test ne prouverait rien').toBeGreaterThan(0)
}

/** `CARD_SHOTS=<dossier>` : une capture de chaque étape (jamais dans le dépôt). */
const shot = async (page: Page, name: string, height: number): Promise<void> => {
  const dir = process.env.CARD_SHOTS
  if (dir === undefined || dir === '') return
  const folder = join(dir, `auchan-411x${height}`)
  mkdirSync(folder, { recursive: true })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(folder, `${name}.png`) })
}

const keyboard = async (page: Page, open: boolean, height: number): Promise<void> => {
  if (open) await page.locator('#where').focus()
  else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.setViewportSize({ width: 411, height: open ? Math.round(height * 0.55) : height })
}

/** Le mur de cookies d'Auchan (mesuré le 2026-11-01 : « Paramètres des cookies », « Continuer sans accepter », plein écran), posé par la page. */
const WALL = `(() => {
  const wall = document.createElement('div')
  wall.id = 'cookie-wall'
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;flex-direction:column;justify-content:flex-end;gap:12px;padding:16px 16px 140px')
  wall.innerHTML = '<h2>Respect de votre vie privée</h2><button type="button">Paramètres des cookies</button><button type="button" id="refuse">Continuer sans accepter</button>'
  wall.querySelector('#refuse').addEventListener('click', () => wall.remove())
  document.body.appendChild(wall)
})()`

for (const height of [761, 914]) {
  test.describe(`411 × ${height}`, () => {
    test.use({ viewport: { width: 411, height } })

    test('le mur de cookies, le libellé de la barre, puis le panneau de choix du drive : la carte reste, ne couvre rien, dit chaque étape', async ({
      page,
      fakeAuchan,
      agentCode,
    }) => {
      test.setTimeout(120_000)
      fakeAuchan.setBehavior({ store: 'none' })
      const app = await openWithBridge(page, {}, agentCode, {
        origin: fakeAuchan.site,
        path: '/courses',
      })
      app.answerHello(plan())
      await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })

      // (1) Le mur de cookies est là : la carte dit d'y répondre d'abord, le repère se retire, aucun bouton du mur n'est couvert
      await page.evaluate(WALL)
      await expect(page.locator('.g-text')).toHaveText(
        'D’abord, réponds aux cookies, dans la page.',
      )
      await expectClear(page, ['#cookie-wall button'])
      await shot(page, '1-cookies', height)
      await expect(page.locator('.ring')).toBeHidden()
      // La personne y répond ; la carte revient à la barre, qui porte le libellé que la PAGE affiche
      await page.locator('#refuse').click()
      await expect(page.locator('.g-text')).toHaveText(
        'Touche « Choisir vos courses », en haut de la page.',
      )
      await page.evaluate(() => {
        const bar = document.querySelector('.store-bar')
        if (bar) bar.textContent = 'Choisir mon mode de livraison'
      })
      await expect(page.locator('.g-text')).toHaveText(
        'Touche « Choisir mon mode de livraison », en haut de la page.',
      )
      await expect(page.locator('.ring')).toBeVisible()
      await shot(page, '2-barre', height)

      // (2) La personne ouvre le panneau : la carte et le repère restent ; clavier ouvert, elle écrit son code postal ; la ville proposée est entourée
      await page.locator('.store-bar').click()
      await expect(page.locator('.g-text')).toHaveText('Écris ton code postal ou ta ville.')
      await shot(page, '3-panneau', height)
      await keyboard(page, true, height)
      await page.locator('#where').pressSequentially('69570')
      await expect(page.locator('#city')).toBeVisible()
      await expectClear(page, ['#where', '#city'])
      expect(await card(page), 'la carte ne disparaît pas pendant la saisie').not.toBeNull()
      await expect(page.locator('.g-bar-text')).toHaveText('Il reste une étape · Touche ta ville')
      await expect(page.locator('.ring')).toBeVisible()
      await shot(page, '4-ville-clavier', height)

      // (3) La ville est touchée : la liste des drives ; la carte ne couvre pas les boutons, elle dit quoi toucher
      await page.locator('#city').click()
      await keyboard(page, false, height)
      await expect(page.locator('.pick-drive').first()).toBeVisible()
      await expectClear(page, ['.pick-drive'])
      await shot(page, '5-liste-drives', height)
      expect(await card(page)).not.toBeNull()
      await expect(page.locator('.g-bar-text')).toHaveText(
        'Il reste une étape · Touche ton magasin',
      )

      // (4) Un drive est choisi : la page le sait, l'agent continue tout seul
      fakeAuchan.setBehavior({ store: 'chosen' })
      await page.locator('.pick-drive').first().click()
      await expect(page.getByRole('heading', { name: 'Ton magasin est choisi' })).toBeVisible()
      expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    })
  })
}

test('un conteneur que la page retire (le panneau qui s’ouvre se redessine) est remis en place, la carte et le repère reviennent', async ({
  page,
  fakeAuchan,
  agentCode,
}) => {
  fakeAuchan.setBehavior({ store: 'none' })
  const app = await openWithBridge(page, {}, agentCode, {
    origin: fakeAuchan.site,
    path: '/courses',
  })
  app.answerHello(plan())
  await expect(page.locator('.screen.guide')).toBeVisible({ timeout: 15_000 })

  // La page retire ce qu'elle ne connaît pas à la racine du document, et réécrit l'épinglage du conteneur
  await page.evaluate(() => {
    for (const host of document.querySelectorAll(':root > div')) host.remove()
  })
  await expect(page.locator('.screen.guide')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.ring')).toBeVisible({ timeout: 5_000 })
})

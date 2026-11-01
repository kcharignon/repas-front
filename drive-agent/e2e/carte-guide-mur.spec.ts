// Le mur de cookies (DRV-757, suite) : la carte du guide ne pose JAMAIS un bouton (surtout pas « Arrêter pour l'instant ») sur un lien ou un bouton de réponse du mur, en HAUT comme
// en bas. Mesure sur le téléphone de test : « Continuer sans accepter → » (un lien en haut du mur, flèche comprise dans son libellé) était sous la carte pleine, posée en haut ; le toucher
// de la personne est tombé sur « Arrêter pour l'instant » et l'envoi s'est arrêté. Preuve par la géométrie, à 360 et 412 px de large, clavier fermé puis ouvert (simulé : la fenêtre
// rétrécit, un champ a le focus), contre le faux site mobile de Leclerc et celui d'Auchan avec un mur de cette forme.
// ATTENTION : le faux mur reprend la FORME mesurée, pas le HTML réel du mur de l'enseigne.
import type { Page } from '@playwright/test'

import { openWithBridge } from './support/agent'
import { expectClear } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product, RUN_ID } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import { STORE } from '../fake-auchan/server'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])
const SIZES = [
  { width: 360, height: 740 },
  { width: 412, height: 915 },
] as const

/**
 * Le mur de la mesure : un lien de réponse EN HAUT (« Continuer sans accepter → », la flèche dans son libellé) et deux boutons en bas assez haut pour que la carte pleine, en bas,
 * les couvre : elle n'a alors de place qu'en haut, où se trouve le lien. Posé par la page, comme un vrai mur (jamais par l'agent).
 */
const wallWith = (topLabel: string): string => `(() => {
  const wall = document.createElement('div')
  wall.id = 'cookie-wall'
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:16px')
  wall.innerHTML = '<div><a href="#" role="button" class="wall-btn" id="refuse">${topLabel}</a><h2>Respect de votre vie privée</h2></div><div style="display:flex;flex-direction:column;gap:12px"><button type="button" class="wall-btn">Paramétrer les cookies</button><button type="button" class="wall-btn">Tout accepter</button></div>'
  wall.querySelector('#refuse').addEventListener('click', (event) => { event.preventDefault(); wall.remove() })
  document.body.appendChild(wall)
})()`
/** Le mur de la mesure, et trois murs dont le lien du haut a un libellé que l'agent ne connaît pas : une liste de libellés devinée ne suffit pas, la zone du mur entière est protégée. */
const WALLS = [
  ['libellé connu', 'Continuer sans accepter →'],
  ['libellé inconnu 1', 'Poursuivre sans consentir →'],
  ['libellé inconnu 2', 'Poursuivre sans accepter'],
  ['libellé inconnu 3', 'Refuser et continuer'],
] as const
/** Les réponses du mur : le lien du haut (flèche comprise) et les boutons du bas. */
const ANSWERS = ['.wall-btn']

/** Le clavier s'ouvre : un champ a le focus, la fenêtre rétrécit ; il se ferme : la fenêtre revient. */
async function keyboard(page: Page, open: boolean, size: { width: number; height: number }) {
  if (open) await page.locator('input').first().focus()
  else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.setViewportSize({
    width: size.width,
    height: open ? Math.round(size.height * 0.55) : size.height,
  })
}

async function provesClear(page: Page, size: { width: number; height: number }) {
  // Clavier fermé : aucune réponse du mur n'est sous la carte, et au milieu de chacune un doigt tomberait sur la réponse
  await expectClear(page, ANSWERS, 5)
  await keyboard(page, true, size)
  await expectClear(page, ANSWERS, 5)
  await keyboard(page, false, size)
  await expectClear(page, ANSWERS, 5)
}

for (const size of SIZES) {
  for (const [name, topLabel] of WALLS) {
    const WALL = wallWith(topLabel)
    test.describe(`mur de cookies (${name}), ${size.width} × ${size.height}`, () => {
      test.use({ viewport: size })

      test('Leclerc : la carte, pleine ou barre, ne couvre aucune réponse du mur, le lien du haut compris, clavier fermé puis ouvert', async ({
        page,
        agentCode,
      }) => {
        test.setTimeout(90_000)
        const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
        try {
          fake.setBehavior({ mobile: {} })
          const app = await openWithBridge(page, fake, agentCode, {
            path: '/',
            origin: fake.mobileOrigins.www,
            asApplication: true,
          })
          app.answerHello(PLAN(FARINE))
          await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
          await page.evaluate(WALL)
          await expect(page.locator('.g-text')).toHaveText(
            'D’abord, réponds aux cookies, dans la page.',
          )

          await provesClear(page, size)

          // Un toucher sur la barre ne redonne PAS la grande carte par-dessus les réponses du mur (elle reste une barre tant que le mur est là)
          await page.locator('.g-bar').click()
          await expectClear(page, ANSWERS, 5)
          await expect(page.locator('.screen.guide.min')).toHaveCount(1)

          // La personne répond avec le lien du HAUT : le mur part, l'envoi n'est pas arrêté
          await page.locator('#refuse').click()
          await expect(page.locator('#cookie-wall')).toHaveCount(0)
          expect(app.messages.filter((message) => message.type === 'result')).toEqual([])
        } finally {
          await fake.close()
        }
      })

      test('Auchan : même preuve avec un mur dont le lien de réponse est en haut', async ({
        page,
        fakeAuchan,
        agentCode,
      }) => {
        fakeAuchan.setBehavior({ store: 'none' })
        const app = await openWithBridge(page, {}, agentCode, {
          origin: fakeAuchan.site,
          path: '/courses',
        })
        app.answerHello({
          v: 1,
          type: 'plan',
          runId: RUN_ID,
          retailer: 'auchan',
          store: { id: STORE.id, host: STORE.host },
          returnPath: '/drive/retour',
          lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
        })
        await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
        await page.evaluate(WALL)
        await expect(page.locator('.g-text')).toHaveText(
          'D’abord, réponds aux cookies, dans la page.',
        )

        await provesClear(page, size)
        await page.locator('.g-bar').click()
        await expectClear(page, ANSWERS, 5)
      })
    })
  }
}

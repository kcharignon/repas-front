// La carte du guide ne clignote pas dans l'arbre d'accessibilité (DRV-768). Avant : `check()` (toutes les 500 ms) posait `card.hidden = true` « le temps de lire la page », puis
// remettait la carte ; Chromium la sortait de l'arbre d'accessibilité puis l'y remettait deux fois par seconde (TalkBack perdait sa lecture, `uiautomator dump` ne trouvait jamais l'écran
// au repos). PROUVÉ dans Chromium, page immobile, sur sept relectures : l'attribut `hidden` de la carte (et tout autre attribut : classes, style) ne change pas, carte pleine comme
// barre réduite. NON prouvé ici : l'effet sur l'arbre d'accessibilité lui-même (`Accessibility.nodesUpdated` n'annonçait déjà rien avant le correctif dans Chromium de bureau), ni ce qu'en
// fait la WebView d'Android et TalkBack (voir `drive-agent/README.md`, « Carte et lecteur d'écran »). Faux sites, pas les vrais.
import { openWithBridge } from './support/agent'
import { expect, test } from './support/fixtures'
import { RUN_ID } from './support/plans'
import { STORE } from '../fake-auchan/server'

const AUCHAN_PLAN = {
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
} as const

/** Un mur de cookies comme les vrais : un dialogue modal de la PAGE, plein écran, avec ses boutons (la carte devient une barre). */
const WALL = `(() => {
  const wall = document.createElement('div')
  wall.setAttribute('role', 'dialog')
  wall.setAttribute('aria-modal', 'true')
  wall.setAttribute('aria-label', 'Cookies')
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff;padding:16px')
  wall.innerHTML = '<h2>Respect de votre vie privée</h2><button type="button">Tout accepter</button>'
  document.body.appendChild(wall)
})()`

/** Pose un observateur sur la carte (le Shadow DOM est ouvert pour les tests) : chaque changement d'attribut est noté. */
const WATCH = `(() => {
  const host = [...document.querySelectorAll('*')].find((one) => one.shadowRoot?.querySelector('.screen.guide'))
  const card = host.shadowRoot.querySelector('.screen.guide')
  window.__cardChanges = []
  new MutationObserver((records) => {
    for (const record of records)
      window.__cardChanges.push(record.attributeName + ': ' + record.oldValue + ' -> ' + card.getAttribute(record.attributeName))
  }).observe(card, { attributes: true, attributeOldValue: true })
})()`

test.describe('la carte reste stable quand la page ne change pas', () => {
  for (const [name, wall] of [
    ['carte pleine', false],
    ['barre réduite devant un mur de cookies', true],
  ] as const) {
    test(`${name} : ni \`hidden\` ni aucun attribut ne change`, async ({
      page,
      fakeAuchan,
      agentCode,
    }) => {
      fakeAuchan.setBehavior({ store: 'none' })
      const app = await openWithBridge(page, {}, agentCode, {
        origin: fakeAuchan.site,
        path: '/courses',
      })
      app.answerHello(AUCHAN_PLAN)
      await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
      if (wall) {
        await page.evaluate(WALL)
        await expect(page.locator('.screen.guide.min')).toHaveCount(1, { timeout: 15_000 })
      }
      // La carte a eu le temps de se poser : la page ne bouge plus
      await page.waitForTimeout(1_500)
      await page.evaluate(WATCH)

      // Sept relectures de 500 ms
      await page.waitForTimeout(3_500)

      const changes = await page.evaluate<string[]>('window.__cardChanges')
      expect(changes, 'aucun changement d’attribut de la carte').toEqual([])
    })
  }
})
